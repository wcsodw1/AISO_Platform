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
  function stats(rows) {
    const msg = rows.map(r => r.user_text + r.user_img), hp = rows.filter(r => r.hp), sp = rows.filter(r => r.cum_new != null), part = key => avg(hp.map(r => r.hp[key]));
    return { n: rows.length, msg: span(msg), txt: avg(rows.map(r => r.user_text)), img: avg(rows.map(r => r.user_img)), har: { ...span(rows.map(r => r.harness)), avg: avg(hp.length ? hp.map(r => r.harness) : rows.map(r => r.harness)) },
      parts: Object.fromEntries(PARTS.map(p => [p[0], part(p[0])])), hpn: hp.length,
      onlyTxt: grp(rows.filter(r => !(r.user_img > 0))), withImg: grp(rows.filter(r => r.user_img > 0)),
      cum: { ...span(rows.map(r => r.cum_input)), avg: avg((sp.length ? sp : rows).map(r => r.cum_input)) }, spn: sp.length,
      reuse: span(sp.map(r => r.cum_read)), comp: span(sp.map(r => r.cum_new)), calls: avg(rows.map(r => r.calls)), out: avg(rows.map(r => r.output)), sec: avg(rows.map(r => r.seconds)) };
  }
  // Levels = the category's AVERAGE TOTAL INPUT PER TURN (row 3: the input of every API call in the turn added up), fixed bands:
  // Low < 500k tokens · Mid 500k–1.5M tokens · High >= 1.5M tokens
  const LV = [["Low", "低"], ["Mid", "中"], ["High", "高"]], BANDS = [5e5, 1.5e6], BAND_TXT = ["< 500k", "500k – 1.5M", "≥ 1.5M"];
  function levels() {
    const m = {}, a = D.categories.map(c => ({ id: c.id, f: stats(rowsOf(c.id)).cum.avg })).sort((x, y) => x.f - y.f);
    a.forEach(x => { x.lv = x.f < BANDS[0] ? 0 : x.f < BANDS[1] ? 1 : 2; m[x.id] = x.lv; });
    return { of: m, ord: a };
  }
  const T = n => `${k(n)} <i>tokens</i>`;
  const row = (en, zh, avgN, left, s) => fold("", en, zh, avgN, left, s);

  function stage(id) {
    const c = D.categories.find(x => x.id === id), s = stats(rowsOf(id)), L = LV[levels().of[id]], calls = s.calls.toFixed(s.calls < 10 ? 1 : 0), pc = v => { const t = s.reuse.avg + s.comp.avg, x = t ? v / t * 100 : 0; return x.toFixed(1); };
    return `<p class="mw-kicker">${bi("Category", "類別")} · ${bi(L[0], L[1])}${c.main ? "" : ` · ${bi("Suggested", "建議")}`}</p>
      <h2 class="mw-big">${esc(nm(c))}</h2><p class="mw-spec">${esc(c.zh)}</p>
      <div class="itc-rows">
        ${fold("itc-par", "1 · Your input", "你的輸入", s.msg.avg, bi("All turns", "全部輪次"), s.msg)}
        <div class="itc-subs">${sub("Text only", "純文字", s.onlyTxt, "", "")}${sub("Image + text", "圖片加文字", s.withImg, s.withImg.n ? `text ${k(s.withImg.t)} + image ${k(s.withImg.i)} tokens` : "", s.withImg.n ? `文字 ${k(s.withImg.t)} + 圖片 ${k(s.withImg.i)} tokens` : "")}</div>
        ${fold("itc-har", "2 · Harness", "開場上下文", s.har.avg,bi("Before your message", "訊息之前"), s.har)}
        <ul class="itc-parts">${PARTS.map(p => { const v = s.parts[p[0]], pc = s.har.avg ? v / s.har.avg * 100 : 0;
          return `<li><span class="pl">${bi(p[1], p[2])}</span><span class="pb"><u style="width:${Math.min(100, pc).toFixed(1)}%"></u></span><span class="pv">${k(v)} <i>tokens</i> <em>${pc < 1 ? "<1" : Math.round(pc)}%</em></span></li>`; }).join("")}</ul>
        ${s.spn ? `${fold("itc-tot", "3 · Computed input", "實際計算輸入", s.comp.avg, bi(`${pc(s.comp.avg)}% of total · new input actually processed`, `佔總輸入 ${pc(s.comp.avg)}% · 真正處理的新輸入`), s.comp)}
        <div class="itc-subs itc-subs-tot itc-aux">${fold("itc-sub", "Reused (cache hit)", "快取重用", s.reuse.avg, bi(`${pc(s.reuse.avg)}% of total · read from the cache`, `佔總輸入 ${pc(s.reuse.avg)}% · 讀取快取`), s.reuse)}${fold("itc-sub", "Total input", "整輪總輸入", s.cum.avg, bi(`Reused + computed · sum of ${calls} API calls`, `重用 + 計算 · ${calls} 次 API 呼叫加總`), s.cum)}</div>`
          : fold("itc-tot", "3 · Total input", "整輪總輸入", s.cum.avg, bi(`Sum of ${calls} API calls`, `${calls} 次 API 呼叫加總`), s.cum)}
      </div>
      <div class="mw-chips"><span class="mw-chip">${s.n} ${bi("samples", "筆")}</span>${s.n < 5 ? `<span class="mw-chip off">${bi("few samples", "樣本少")}</span>` : ""}<span class="mw-chip">${calls} ${bi("calls", "次呼叫")}</span><span class="mw-chip">${bi("Output", "輸出")} ${k(s.out)} <i>tokens</i></span><span class="mw-chip">${bi("Duration", "時間")} ${dur(s.sec)}</span></div>`;
  }
  function table() {
    const rows = D.rows.map((r, i) => ({ ...r, i: i + 1 })).filter(r => r.cat === sel);
    return `<div class="table-wrap"><table class="v2-table itc-table"><thead><tr><th>#</th><th>${bi("Detail", "細項")}</th><th>${bi("Text", "文字")}</th><th>${bi("Image", "圖片")}</th><th>${bi("Harness", "開場")}</th><th>${bi("API calls total (calls)", "整輪（次數）")}</th><th>${bi("Computed (new)", "實際計算")}</th><th>${bi("Output", "輸出")}</th><th>${bi("Time", "時間")}</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.i}</td><td>${bi(r.sub[0], r.sub[1])}</td><td>${k(r.user_text)}</td><td>${k(r.user_img)}${r.images ? ` (${r.images})` : ""}</td><td>${k(r.harness)}</td><td>${k(r.cum_input)} (${r.calls})</td><td>${r.cum_new != null ? k(r.cum_new) : "—"}</td><td>${k(r.output)}</td><td>${dur(r.seconds)}</td></tr>`).join("")}</tbody></table></div>
      <p class="itc-note">${bi("All numbers are tokens. Reused = read from the cache; Computed = new input actually processed (uncached + newly cached).", "表內數字單位皆為 token。快取重用 = 讀取快取；實際計算 = 真正處理的新輸入（未快取＋新寫入快取）。")} ${bi(D.note[0], D.note[1])}</p>`;
  }
  const bindFold = el => { if (window.HoverFold) window.HoverFold.init(el); };
  function render() {
    root.innerHTML =`<div class="mw itc"><div class="mw-stage">${stage(sel)}</div>
      <div class="mw-panel"><h3 class="mw-q">${bi("Choose a category", "選擇類別")}</h3>
        <div class="mw-opts" role="listbox">${[0, 1, 2].map(l => {
          const g = levels().ord.filter(x => x.lv === l); if (!g.length) return "";
          return `<p class="itc-lv"><em>${bi(LV[l][0], LV[l][1])}</em><span>${BAND_TXT[l]} <i>tokens</i></span></p>` + g.map(x => { const c = D.categories.find(y => y.id === x.id);
            return `<button type="button" class="mw-opt${c.id === sel ? " sel" : ""}${c.main ? "" : " sug"}" data-id="${c.id}"><span class="mw-l"><b>${esc(nm(c))}</b></span><span class="mw-r">${rowsOf(c.id).length} ${bi("samples", "筆")}</span></button>`; }).join("");
        }).join("")}</div>
        <p class="itc-ref">${bi("Level = category avg of Total input (reused + computed)", "分級 = 整輪總輸入（重用 + 計算）的類別平均")} · ${bi("Benchmark inputs", "Benchmark 輸入")} ${BENCH.join(" · ")}</p></div></div>
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
