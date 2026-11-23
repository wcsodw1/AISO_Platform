"use strict";
/* Benchmark > Input token category: one compact card like "Choose a vendor" (left = the category, right = pick one).
   Data: data/input-token-category.json (token numbers and a short label only, never message text). Every number is tokens. */
(function () {
  const root = document.getElementById("itcRoot");
  if (!root) return;
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const bi = (en, zh) => `${esc(en)}<small class="zhs">${esc(zh)}</small>`;
  const k = n => n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + "k" : String(Math.round(n));
  const dur = s => s >= 60 ? Math.floor(s / 60) + "m" + String(Math.round(s % 60)).padStart(2, "0") + "s" : Math.round(s) + "s";
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const span = a => ({ avg: avg(a), min: a.length ? Math.min(...a) : 0, max: a.length ? Math.max(...a) : 0 });
  const nm = c => c.en.replace(/ Prompt$/, "");
  const BENCH = ["4K", "8K", "16K", "64K", "128K"];
  let D = null, sel = "coding", open = false;

  // what the harness is made of (estimated from the session log, scaled to the measured harness total)
  const PARTS = [["sys", "System prompt & tools", "系統提示、工具定義"], ["mem", "Memory & skills", "記憶、技能、提醒"], ["conv", "Conversation history", "對話歷史"],
    ["web", "Web crawl / browser", "網頁瀏覽、爬取"], ["api", "API / MCP tools", "API、MCP 工具"], ["code", "Shell & files", "指令與檔案"]];
  const grp = rs => ({ n: rs.length, ...span(rs.map(r => r.user_text + r.user_img)), t: avg(rs.map(r => r.user_text)), i: avg(rs.map(r => r.user_img)) });
  // every row is a hover-fold panel (hover-fold.js): the header shows name + average, the detail line (turns, min, max) opens on hover / click
  const fold = (cls, en, zh, avgN, left, s) => `<section class="itc-r ${cls} hv-fold hv-closed"><header><h4>${bi(en, zh)}</h4><span class="itc-hv">${s ? `<b>${T(avgN)}</b><span>${bi("Avg", "平均")}</span>` : `<b>—</b>`}</span></header>
    <div class="itc-d"><span>${left}</span><span>${s ? `${bi("Min", "最低")} ${k(s.min)} – ${bi("Max", "最高")} ${k(s.max)} <i>tokens</i>` : ""}</span></div></section>`;
  const sub = (en, zh, g, nEn, nZh) => fold("itc-sub", en, zh, g.avg, bi(`${g.n} turns${nEn ? " · " + nEn : ""}`, `${g.n} 輪${nZh ? " · " + nZh : ""}`), g.n ? g : null);
  const rowsOf = id => D.rows.filter(r => r.cat === id);
  // The first call of a turn = harness + your message. Its not-cached part (first_new) = your message + the uncached tail of the harness.
  // The uncached tail is the NEWEST content, so it is taken from the history parts first, then memory, then system+tools.
  function notCached(r) {
    let rem = Math.max(0, r.first_new - r.user_text - r.user_img); const o = { sys: 0, mem: 0, conv: 0, web: 0, api: 0, code: 0 }, h = ["conv", "web", "api", "code"], H = h.reduce((a, x) => a + r.hp[x], 0);
    const t = Math.min(rem, H); h.forEach(x => { o[x] = H ? r.hp[x] * t / H : 0; }); rem -= t;
    o.mem = Math.min(rem, r.hp.mem); rem -= o.mem; o.sys = Math.min(rem, r.hp.sys); return o;
  }
  function stats(rows) {
    const msg = rows.map(r => r.user_text + r.user_img), hp = rows.filter(r => r.hp), sp = rows.filter(r => r.cum_new != null), fr = rows.filter(r => r.first_new != null), frh = fr.filter(r => r.hp), part = key => avg(hp.map(r => r.hp[key]));
    return { n: rows.length, msg: span(msg), txt: avg(rows.map(r => r.user_text)), img: avg(rows.map(r => r.user_img)), har: { ...span(rows.map(r => r.harness)), avg: avg(hp.length ? hp.map(r => r.harness) : rows.map(r => r.harness)) },
      parts: Object.fromEntries(PARTS.map(p => [p[0], part(p[0])])), hpn: hp.length,
      onlyTxt: grp(rows.filter(r => !(r.user_img > 0))), withImg: grp(rows.filter(r => r.user_img > 0)),
      cum: { ...span(rows.map(r => r.cum_input)), avg: avg((sp.length ? sp : rows).map(r => r.cum_input)) }, spn: sp.length,
      mi: span(fr.map(r => Math.min(r.user_text + r.user_img, r.first_new))), hc: span(fr.map(r => Math.max(0, r.first_new - r.user_text - r.user_img))), du: span(fr.map(r => r.cum_new - r.first_new)), hr: avg(fr.map(r => r.first_read)),
      pnew: Object.fromEntries(PARTS.map(p => [p[0], avg(frh.map(r => notCached(r)[p[0]]))])),
      reuse: span(sp.map(r => r.cum_read)), comp: span(sp.map(r => r.cum_new)), calls: avg(rows.map(r => r.calls)), out: avg(rows.map(r => r.output)), sec: avg(rows.map(r => r.seconds)) };
  }
  const T = n => `${k(n)} <i>tokens</i>`;
  const row = (en, zh, avgN, left, s) => fold("", en, zh, avgN, left, s);

  function stage(id) {
    const c0 = D.categories.find(x => x.id === id); if (c0.kind === "document") return docStage(c0);
    const c = c0, s = stats(rowsOf(id)), calls = s.calls.toFixed(s.calls < 10 ? 1 : 0), pc = v => { const t = s.reuse.avg + s.comp.avg, x = t ? v / t * 100 : 0; return x.toFixed(1); };
    return `<p class="mw-kicker">${bi("Category", "類別")}${c.main ? "" : ` · ${bi("Suggested", "建議")}`}</p>
      <h2 class="mw-big">${esc(nm(c))}</h2><p class="mw-spec">${esc(c.zh)}</p>
      <div class="itc-rows">
        ${fold("itc-par", "1 · Your input", "你的輸入", s.msg.avg, bi("All turns", "全部輪次"), s.msg)}
        <div class="itc-subs">${sub("Text only", "純文字", s.onlyTxt, "", "")}${sub("Image + text", "圖片加文字", s.withImg, s.withImg.n ? `text ${k(s.withImg.t)} + image ${k(s.withImg.i)} tokens` : "", s.withImg.n ? `文字 ${k(s.withImg.t)} + 圖片 ${k(s.withImg.i)} tokens` : "")}</div>
        ${fold("itc-har", "2 · Harness", "開場上下文", s.har.avg, bi("Before your message", "訊息之前"), s.har)}
        ${s.spn ? `<p class="itc-leg"><span><i class="re"></i>${bi("Reused", "快取重用")} ${k(s.hr)}</span><span><i class="nw"></i>${bi("Not cached", "未快取")} ${k(s.hc.avg)}</span><span class="u">tokens</span></p>` : ""}
        <ul class="itc-parts">${PARTS.map(p => { const v = s.parts[p[0]], pc = s.har.avg ? v / s.har.avg * 100 : 0, nw = Math.min(v, s.pnew[p[0]] || 0), nwp = v ? nw / v * 100 : 0;
          return `<li title="${s.spn ? `${k(v - nw)} reused / 快取重用 · ${k(nw)} not cached / 未快取 (tokens)` : ""}"><span class="pl">${bi(p[1], p[2])}</span><span class="pb"><u style="width:${Math.min(100, pc).toFixed(1)}%">${s.spn && nw >= 1 ? `<s style="width:${Math.max(nwp, 6).toFixed(1)}%"></s>` : ""}</u></span><span class="pv">${k(v)} <i>tokens</i> <em>${pc < 1 ? "<1" : Math.round(pc)}%</em></span><span class="pn">${s.spn && nw >= 1 ? k(nw) : ""}</span></li>`; }).join("")}</ul>
        ${s.spn ? `${fold("itc-tot", "3 · Computed input", "實際計算輸入", s.comp.avg, bi(`${pc(s.comp.avg)}% of total · new input actually processed`, `佔總輸入 ${pc(s.comp.avg)}% · 真正處理的新輸入`), s.comp)}
        <div class="itc-subs itc-subs-tot">${fold("itc-sub", "Your input", "你的輸入", s.mi.avg, bi("this turn's message (row 1)", "本輪的訊息（第 1 項）"), s.mi)}${fold("itc-sub", "+ Harness not cached", "＋ Harness 未快取", s.hc.avg, bi("uncached tail at the first call (row 2)", "第一次呼叫未快取的尾段（第 2 項）"), s.hc)}${fold("itc-sub", "+ Built during the turn", "＋ 本輪中途新增", s.du.avg, bi("tool results & replies in later calls", "後續呼叫中的工具輸出與回覆"), s.du)}</div>
        <div class="itc-subs itc-subs-tot itc-aux">${fold("itc-sub", "Reused (cache hit)", "快取重用", s.reuse.avg, bi(`${pc(s.reuse.avg)}% of total · read from the cache`, `佔總輸入 ${pc(s.reuse.avg)}% · 讀取快取`), s.reuse)}${fold("itc-sub", "Total input", "整輪總輸入", s.cum.avg, bi(`Reused + computed · sum of ${calls} API calls`, `重用 + 計算 · ${calls} 次 API 呼叫加總`), s.cum)}</div>`
          : fold("itc-tot", "3 · Total input", "整輪總輸入", s.cum.avg, bi(`Sum of ${calls} API calls`, `${calls} 次 API 呼叫加總`), s.cum)}
      </div>
      <div class="mw-chips"><span class="mw-chip">${s.n} ${bi("samples", "筆")}</span>${s.n < 5 ? `<span class="mw-chip off">${bi("few samples", "樣本少")}</span>` : ""}<span class="mw-chip">${calls} ${bi("calls", "次呼叫")}</span><span class="mw-chip">${bi("Output", "輸出")} ${k(s.out)} <i>tokens</i></span><span class="mw-chip">${bi("Duration", "時間")} ${dur(s.sec)}</span></div>`;
  }
  // Document: Low / Mid / High by FILE SIZE (what you can see in a file manager). Each level shows the tokens actually measured for the example files.
  // Caveat shown on the card: images inflate file size, so pages (~330 tokens per page) predict tokens better.
  function docStage(c) {
    const d = D.document, tpp = d.tokens_per_page, lv = d.levels.map(l => {
      const ex = d.samples.filter(x => x.level === l.id), tks = ex.map(x => x.tokens), tk = !ex.length ? "—" : tks.length > 1 ? `${k(Math.min(...tks))} – ${k(Math.max(...tks))}` : k(tks[0]);
      return `<section class="itc-r itc-doc hv-fold hv-closed"><header><h4>${bi(l.name[0], l.name[1])} <span class="itc-pg">${bi(l.label[0], l.label[1])}</span></h4><span class="itc-hv"><b>${tk} <i>tokens</i></b></span><p class="itc-ex">${ex.length ? ex.map(x => esc(x.name)).join(" · ") : bi("no sample yet", "尚無樣本")}</p></header>
        <div class="itc-d"><span>${bi("Test input " + l.bench, "測試輸入 " + l.bench)}</span><span>${ex.map(x => `${x.file_mb} MB · ${x.pages ? x.pages : "≈" + x.pages_est} ${"pages"} · ${k(x.tokens)}`).join("  |  ")}${ex.length ? " <i>tokens</i>" : ""}</span></div></section>`; }).join("");
    return `<p class="mw-kicker">${bi("Category", "類別")} · ${bi("scenarios by file size", "情境：依檔案大小")}</p>
      <h2 class="mw-big">${esc(nm(c))}</h2><p class="mw-spec">${esc(c.zh)} · ${esc(c.hint[1])}</p>
      <div class="itc-rows">${lv}</div>
      <p class="itc-docnote">${bi(d.size_note[0] + ` (10 pages ≈ ${k(10 * tpp)} · 100 ≈ ${k(100 * tpp)} · 500 ≈ ${k(500 * tpp)} tokens). Add ≈ 20–50 tokens for your question; output ≈ 500.`, d.size_note[1] + `（10 頁 ≈ ${k(10 * tpp)}、100 頁 ≈ ${k(100 * tpp)}、500 頁 ≈ ${k(500 * tpp)} tokens）。再加問題約 20–50 tokens，輸出約 500。`)}</p>
      <div class="mw-chips"><span class="mw-chip">${d.samples.length} ${bi("documents", "份文件")}</span><span class="mw-chip">${bi("1st ask: whole document computed", "第一次：整份都要計算")}</span><span class="mw-chip">${bi("Follow-up: cache hit (expected)", "追問：預期命中快取")}</span></div>`;
  }
  function docTable() {
    const d = D.document;
    return `<div class="table-wrap"><table class="v2-table itc-table"><thead><tr><th>${bi("Document", "文件")}</th><th>${bi("Pages", "頁數")}</th><th>${bi("File size", "檔案大小")}</th><th>${bi("Characters", "字元")}</th><th>${bi("Tokens", "tokens")}</th><th>${bi("Tokens / page", "每頁 tokens")}</th><th>${bi("Level", "等級")}</th></tr></thead><tbody>${d.samples.map(x => `<tr><td>${esc(x.name)}</td><td>${x.pages ? x.pages : "≈" + x.pages_est}</td><td>${x.file_mb} MB</td><td>${x.chars.toLocaleString()}</td><td>${x.tokens.toLocaleString()}</td><td>${x.pages ? Math.round(x.tokens / x.pages) : "—"}</td><td>${d.levels.find(l => l.id === x.level).name[0]}</td></tr>`).join("")}</tbody></table></div>
      <p class="itc-note">${bi(d.size_note[0], d.size_note[1])} ${bi(d.method[0], d.method[1])}</p>`;
  }
  function table() {
    const cs = D.categories.find(x => x.id === sel); if (cs && cs.kind === "document") return docTable();
    const rows = D.rows.map((r, i) => ({ ...r, i: i + 1 })).filter(r => r.cat === sel);
    return `<div class="table-wrap"><table class="v2-table itc-table"><thead><tr><th>#</th><th>${bi("Detail", "細項")}</th><th>${bi("Text", "文字")}</th><th>${bi("Image", "圖片")}</th><th>${bi("Harness", "開場")}</th><th>${bi("API calls total (calls)", "整輪（次數）")}</th><th>${bi("Computed (new)", "實際計算")}</th><th>${bi("Output", "輸出")}</th><th>${bi("Time", "時間")}</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.i}</td><td>${bi(r.sub[0], r.sub[1])}</td><td>${k(r.user_text)}</td><td>${k(r.user_img)}${r.images ? ` (${r.images})` : ""}</td><td>${k(r.harness)}</td><td>${k(r.cum_input)} (${r.calls})</td><td>${r.cum_new != null ? k(r.cum_new) : "—"}</td><td>${k(r.output)}</td><td>${dur(r.seconds)}</td></tr>`).join("")}</tbody></table></div>
      <p class="itc-note">${bi("All numbers are tokens. Reused = read from the cache; Computed = new input actually processed (uncached + newly cached).", "表內數字單位皆為 token。快取重用 = 讀取快取；實際計算 = 真正處理的新輸入（未快取＋新寫入快取）。")} ${bi(D.note[0], D.note[1])}</p>`;
  }
  const bindFold = el => { if (window.HoverFold) window.HoverFold.init(el); };
  function render() {
    root.innerHTML =`<div class="mw itc"><div class="mw-stage">${stage(sel)}</div>
      <div class="mw-panel"><h3 class="mw-q">${bi("Choose a category", "選擇類別")}</h3>
        <div class="mw-opts" role="listbox">${D.categories.map(c => `<button type="button" class="mw-opt${c.id === sel ? " sel" : ""}${c.main ? "" : " sug"}" data-id="${c.id}"><span class="mw-l"><b>${esc(nm(c))}</b></span><span class="mw-r">${c.kind === "document" ? `${D.document.samples.length} ${bi("documents", "份文件")}` : `${rowsOf(c.id).length} ${bi("samples", "筆")}`}</span></button>`).join("")}</div>
        <p class="itc-ref">${bi("Benchmark inputs", "Benchmark 輸入")} ${BENCH.join(" · ")}</p></div></div>
      <div class="itc-tokref"><b>${bi("Rule of thumb", "換算參考")}</b>
        <span>${bi("Chinese", "中文")} ≈ 1–2 <i>tokens</i> / ${bi("char", "字")}</span>
        <span>${bi("English", "英文")} ≈ 0.25–0.33 <i>tokens</i> / ${bi("char", "字元")} (≈ 1.3 / ${bi("word", "單字")})</span>
        <span>${bi("Image", "圖片")} ≈ 100–1,600 <i>tokens</i> / ${bi("image", "張")}</span></div>
      <details class="itc-more"${open ? " open" : ""}><summary>${bi("Samples", "樣本表")} · ${esc(nm(D.categories.find(c => c.id === sel)))}</summary>${table()}</details>`;
    bindFold(root);
  }
  root.addEventListener("click", e => { const o = e.target.closest(".mw-opt"); if (!o) return; sel = o.dataset.id; render(); });
  root.addEventListener("toggle", e => { if (e.target.classList && e.target.classList.contains("itc-more")) open = e.target.open; }, true);
  root.addEventListener("mouseover", e => {       // hover previews a category on the left without changing the choice
    const o = e.target.closest(".mw-opt"), st = root.querySelector(".mw-stage");
    if (o && st) { st.innerHTML = stage(o.dataset.id); bindFold(st); }
  });
  root.addEventListener("mouseout", e => { const st = root.querySelector(".mw-stage"); if (st && e.target.closest(".mw-opt") && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(".mw-opt"))) { st.innerHTML = stage(sel); bindFold(st); } });
  fetch("data/input-token-category.json", { cache: "no-store" }).then(r => r.json()).then(d => { D = d; render(); }).catch(() => { root.innerHTML = `<p class="itc-ref">${bi("Could not load the data file.", "無法載入資料檔。")}</p>`; });
})();
