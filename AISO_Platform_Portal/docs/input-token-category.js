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
  const DPARTS = [["read", "Files & code read", "讀檔／程式碼"], ["cmd", "Command output", "指令輸出"], ["web", "Web & search", "網頁／搜尋"], ["other", "Other tool output", "其他工具輸出"], ["call", "Tool calls written by the model", "模型寫出的工具呼叫"], ["out", "Model replies", "模型回覆文字"]];
  const OPARTS = [["think", "Thinking (inferred)", "思考（推算）"], ["text", "Reply text", "回覆文字"], ["cmd", "Commands written", "寫出的指令"], ["write", "Files written (edit / write)", "寫入的檔案內容"], ["web", "Web & search calls", "網頁／搜尋呼叫"], ["other", "Other tool calls", "其他工具呼叫"]];
  const PARTS = [["sys", "System prompt & tools", "系統提示、工具定義"], ["mem", "Memory & skills", "記憶、技能、提醒"], ["conv", "Conversation history", "對話歷史"],
    ["web", "Web crawl / browser", "網頁瀏覽、爬取"], ["api", "API / MCP tools", "API、MCP 工具"], ["code", "Shell & files", "指令與檔案"]];
  const grp = rs => ({ n: rs.length, ...span(rs.map(r => r.user_text + r.user_img)), t: avg(rs.map(r => r.user_text)), i: avg(rs.map(r => r.user_img)) });
  // every row is a hover-fold panel (hover-fold.js): the header shows name + average, the detail line (turns, min, max) opens on hover / click
  const fold = (cls, en, zh, avgN, left, s, hdr) => `<section class="itc-r ${cls} hv-fold hv-closed"><header><h4>${bi(en, zh)}</h4>${hdr ? hdr : `<span class="itc-hv">${s ? `<b>${T(avgN)}</b><span>${bi("Avg", "平均")}</span>` : `<b>—</b>`}</span>`}</header>
    <div class="itc-d"><span>${left}</span><span>${s ? `${bi("Min", "最低")} ${k(s.min)} – ${bi("Max", "最高")} ${k(s.max)} <i>tokens</i>` : ""}</span></div></section>`;
  const sub = (en, zh, g, nEn, nZh) => fold("itc-sub", en, zh, g.avg, bi(`${g.n} turns${nEn ? " · " + nEn : ""}`, `${g.n} 輪${nZh ? " · " + nZh : ""}`), g.n ? g : null);
  const rowsOf = id => D.rows.filter(r => r.cat === id);
  // rows without cache data (first_new / cum_new) are left out of the averages, so rows 1-4 are all averaged over the SAME turns
  const usable = rs => rs.some(r => r.first_new != null) ? rs.filter(r => r.first_new != null && r.cum_new != null) : rs;
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
      dpn: rows.filter(r => r.du_parts).length, dp: Object.fromEntries(DPARTS.map(p => [p[0], avg(rows.filter(r => r.du_parts).map(r => r.du_parts[p[0]]))])),
      cnv: sp.map(r => r.cum_new).sort((a, b) => a - b),
      opn: rows.filter(r => r.out_parts).length, op: Object.fromEntries(OPARTS.map(p => [p[0], avg(rows.filter(r => r.out_parts).map(r => (r.out_parts[p[0]] || 0) + (p[0] === "other" ? (r.out_parts.read || 0) : 0)))])),
      pnew: Object.fromEntries(PARTS.map(p => [p[0], avg(frh.map(r => notCached(r)[p[0]]))])),
      reuse: span(sp.map(r => r.cum_read)), comp: span(sp.map(r => r.cum_new)), calls: avg(rows.map(r => r.calls)), out: span(rows.map(r => r.output)), sec: avg(rows.map(r => r.seconds)) };
  }
  const T = n => `${k(n)} <i>tokens</i>`;
  const row = (en, zh, avgN, left, s) => fold("", en, zh, avgN, left, s);

  // Recommended benchmark input = the level nearest (in ratio) to the average NEW input of a turn; the range is one level below and one above.
  const REC_LV = [4096, 8192, 16384, 32768, 65536, 131072], pct = (a, p) => { if (!a.length) return 0; const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.min(lo + 1, a.length - 1); return a[lo] + (a[hi] - a[lo]) * (i - lo); };
  const recOf = avgN => { let b = 0; REC_LV.forEach((v, i) => { if (Math.abs(Math.log(avgN / v)) < Math.abs(Math.log(avgN / REC_LV[b]))) b = i; }); return b; };
  const lvNm = (i, v) => REC_LV[i] / 1024 + "K" + (v > REC_LV[REC_LV.length - 1] * 1.5 ? "+" : "");
  // main = level of `mainV`; range = from level of `loV` to level of `hiV` (the main level is always inside the range)
  const recSpan = (mainV, loV, hiV, top) => { const m = recOf(mainV), l = Math.min(recOf(loV), m), h = Math.max(recOf(hiV), m); return { main: lvNm(m, mainV), also: [l !== m ? lvNm(l, loV) : "", h !== m ? lvNm(h, top == null ? hiV : top) : ""].filter(Boolean) }; };
  const recText = (vals) => { const a = vals.slice().sort((x, y) => x - y), m = pct(a, .5), h = pct(a, .9), lm = lvNm(recOf(m), m), lh = lvNm(recOf(h), h); return { main: lm, also: lh !== lm ? [lh] : [] }; };   // files: two values = typical (median) and heavy (90th percentile)
  function recLine(s) {
    if (!s.spn) return "";
    const med = pct(s.cnv, .5), p90 = pct(s.cnv, .9), mi = recOf(s.comp.avg), r = recSpan(s.comp.avg, REC_LV[Math.max(0, mi - 1)], REC_LV[Math.min(REC_LV.length - 1, mi + 1)]);
    const tip = `Recommended = level of the average new input ${k(s.comp.avg)} tokens. Also test = one level below and one above. For reference: median ${k(med)} (a typical turn), 90th percentile ${k(p90)} (a heavy turn); the average is pulled up by cold-start turns. / 推薦＝平均新輸入 ${k(s.comp.avg)} tokens 所在檔位；可加測＝往下、往上各一個檔位。參考：中位數 ${k(med)}（一般輪次）、第 90 百分位 ${k(p90)}（較重輪次）；平均被冷啟動輪次拉高。`;
    return `<p class="itc-rec" title="${esc(tip)}"><span>${bi("Recommended input", "推薦測試輸入")}</span><b>${r.main}</b>${r.also.length ? `<span class="itc-alt">${bi("Also test", "建議可加測")} ${r.also.join(" · ")}</span>` : ""}</p>`;
  }
  function stage(id) {
    const c0 = D.categories.find(x => x.id === id); if (c0.kind === "document") return docStage(c0);
    const c = c0, s = stats(usable(rowsOf(id))), calls = s.calls.toFixed(s.calls < 10 ? 1 : 0), pc = v => { const t = s.reuse.avg + s.comp.avg, x = t ? v / t * 100 : 0; return x.toFixed(1); };
    return `<p class="mw-kicker">${bi("Category", "類別")}${c.main ? "" : ` · ${bi("Suggested", "建議")}`}</p>
      <h2 class="mw-big">${esc(nm(c))}</h2><p class="mw-spec">${esc(c.zh)}</p>
      ${recLine(s)}
      <div class="itc-rows">
        <section class="itc-g itc-gin hv-fold hv-closed"><header><h3>${bi("Input", "輸入")}</h3><span class="itc-hv"><b>${k(s.spn ? s.comp.avg : s.cum.avg)}</b><span>tokens ${s.spn ? bi("new", "新") : bi("total", "總共")}</span></span></header><div class="itc-gb">
        ${fold("itc-par", "1 · Your input", "你的輸入", s.msg.avg, bi("All turns", "全部輪次"), s.msg)}
        <div class="itc-subs">${sub("Text only", "純文字", s.onlyTxt, "", "")}${sub("Image + text", "圖片加文字", s.withImg, s.withImg.n ? `text ${k(s.withImg.t)} + image ${k(s.withImg.i)} tokens` : "", s.withImg.n ? `文字 ${k(s.withImg.t)} + 圖片 ${k(s.withImg.i)} tokens` : "")}</div>
        ${fold("itc-har", "2 · Harness", "開場上下文", s.har.avg, bi("Before your message", "訊息之前"), s.har, s.spn ? `<span class="itc-hv3"><span class="nw"><b>${k(s.hc.avg)}</b><em>${bi("New", "新")}</em></span><span class="re"><b>${k(s.hr)}</b><em>${bi("Reused", "快取重用")}</em></span><span class="tt"><b>${k(s.har.avg)}</b><em>${bi("Total", "總共")}</em></span></span>` : "")}
        ${s.spn ? `<p class="itc-leg"><span><i class="re"></i>${bi("Reused", "快取重用")} ${k(s.hr)}</span><span><i class="nw"></i>${bi("Not cached", "未快取")} ${k(s.hc.avg)}</span><span class="u">tokens</span></p>` : ""}
        <ul class="itc-parts">${PARTS.map(p => { const v = s.parts[p[0]], pc = s.har.avg ? v / s.har.avg * 100 : 0, nw = Math.min(v, s.pnew[p[0]] || 0), nwp = v ? nw / v * 100 : 0;
          return `<li title="${s.spn ? `${k(v - nw)} reused / 快取重用 · ${k(nw)} not cached / 未快取 (tokens)` : ""}"><span class="pl">${bi(p[1], p[2])}</span><span class="pb"><u style="width:${Math.min(100, pc).toFixed(1)}%">${s.spn && nw >= 1 ? `<s style="width:${Math.max(nwp, 6).toFixed(1)}%"></s>` : ""}</u></span><span class="pv">${k(v)} <i>tokens</i> <em>${pc < 1 ? "<1" : Math.round(pc)}%</em></span><span class="pn">${s.spn && nw >= 1 ? k(nw) : ""}</span></li>`; }).join("")}</ul>
        ${s.spn ? `${fold("itc-par", "3 · Built during the turn", "本輪新增", s.du.avg, bi("Tool results & replies added after the first call", "第一次呼叫之後才產生的工具輸出與回覆"), s.du)}
        ${s.dpn ? `<ul class="itc-parts itc-dparts">${DPARTS.map(p => { const t = DPARTS.reduce((a, q) => a + s.dp[q[0]], 0), v = s.dp[p[0]], pc = t ? v / t * 100 : 0; return `<li><span class="pl">${bi(p[1], p[2])}</span><span class="pb"><u style="width:${Math.min(100, pc).toFixed(1)}%"></u></span><span class="pv">${k(v)} <i>tokens</i> <em>${pc < 1 ? "<1" : Math.round(pc)}%</em></span><span class="pn"></span></li>`; }).join("")}</ul>` : ""}
        ${fold("itc-tot", "4 · Computed input", "實際計算輸入", s.comp.avg, bi(`${pc(s.comp.avg)}% of total · new input actually processed`, `佔總輸入 ${pc(s.comp.avg)}% · 真正處理的新輸入`), s.comp)}
        <div class="itc-subs itc-subs-tot">${fold("itc-sub", "Your input", "你的輸入", s.mi.avg, bi("this turn's message (row 1)", "本輪的訊息（第 1 項）"), s.mi)}${fold("itc-sub", "+ Harness not cached", "＋ Harness 未快取", s.hc.avg, bi("uncached tail at the first call (row 2)", "第一次呼叫未快取的尾段（第 2 項）"), s.hc)}${fold("itc-sub", "+ Built during the turn", "＋ 本輪新增", s.du.avg, bi("same as row 3", "同第 3 項"), s.du)}</div>
        <div class="itc-subs itc-subs-tot itc-aux">${fold("itc-sub", "Reused (cache hit)", "快取重用", s.reuse.avg, bi(`${pc(s.reuse.avg)}% of total · read from the cache`, `佔總輸入 ${pc(s.reuse.avg)}% · 讀取快取`), s.reuse)}${fold("itc-sub", "Total input", "整輪總輸入", s.cum.avg, bi(`Reused + computed · sum of ${calls} API calls`, `重用 + 計算 · ${calls} 次 API 呼叫加總`), s.cum)}</div>`
          : fold("itc-tot", "3 · Total input", "整輪總輸入", s.cum.avg, bi(`Sum of ${calls} API calls`, `${calls} 次 API 呼叫加總`), s.cum)}
        </div></section>
        <section class="itc-g hv-fold hv-closed"><header><h3>${bi("Output", "輸出")}</h3><span class="itc-hv"><b>${k(s.out.avg)}</b><span>tokens</span></span></header><div class="itc-gb">
        ${fold("itc-out", "Total output", "輸出總量", s.out.avg, bi(`Written by the model, not input · ${s.n} samples${s.n < 5 ? " (few)" : ""} · ${calls} calls · ${dur(s.sec)}`, `模型寫出，不是輸入 · ${s.n} 筆${s.n < 5 ? "（樣本少）" : ""} · ${calls} 次呼叫 · ${dur(s.sec)}`), s.out)}
        ${s.opn ? `<ul class="itc-parts itc-dparts">${OPARTS.map(p => { const t = OPARTS.reduce((a, q) => a + s.op[q[0]], 0), v = s.op[p[0]], pc = t ? v / t * 100 : 0; return `<li><span class="pl">${bi(p[1], p[2])}</span><span class="pb"><u style="width:${Math.min(100, pc).toFixed(1)}%"></u></span><span class="pv">${k(v)} <i>tokens</i> <em>${pc < 1 ? "<1" : Math.round(pc)}%</em></span><span class="pn"></span></li>`; }).join("")}</ul>` : ""}
        </div></section>
      </div>
      `;
  }
  // Document: Low / Mid / High by FILE SIZE (what you can see in a file manager). Each level shows the tokens actually measured for the example files.
  // Caveat shown on the card: images inflate file size, so pages (~330 tokens per page) predict tokens better.
  // headline = a rounded, easy number (nearest 1k below 10k, 5k below 100k, 50k above); the exact reference range shows on hover
  const nice = n => { const st = n < 1e4 ? 1e3 : n < 1e5 ? 5e3 : 5e4; return Math.max(st, Math.round(n / st) * st); }, kk = n => n % 1000 === 0 ? n / 1000 + "k" : k(n);
  // Document: rows = the benchmark input levels; each real file is placed under its NEAREST level, so the architect sees what real files back each level.
  // Every figure is a range (min–max of the files in that level); n = 1 is flagged, n = 0 is a gap. Images are not measured yet and say so.
  const DOC_LV = [4096, 8192, 16384, 32768, Infinity], lvName = v => v === Infinity ? "64K+" : v / 1024 + "K";
  const docLv = t => DOC_LV.reduce((best, v) => Math.abs(t - Math.min(v, 65536)) < Math.abs(t - Math.min(best, 65536)) ? v : best);
  const rng = (a, f) => { const x = a.filter(v => v != null); if (!x.length) return "—"; const lo = Math.min(...x), hi = Math.max(...x); return lo === hi ? f(lo) : f(lo) + "–" + f(hi); };
  const unitOf = (d, x) => (d.types.find(t => t.id === x.type) || d.types[0]).unit, qty = (d, x) => unitOf(d, x) === "page" ? (x.pages || x.pages_est || null) : x.lines;
  function docRec(d) {
    const a = d.samples.map(x => x.tokens).sort((x, y) => x - y), r = recText(a);
    const tip = `Two values: the typical file (median ${k(pct(a, .5))} tokens) and a heavy file (90th percentile ${k(pct(a, .9))} tokens). / 兩個值：一般檔案（中位數 ${k(pct(a, .5))} tokens）與較大檔案（第 90 百分位 ${k(pct(a, .9))} tokens）。`;
    return `<p class="itc-rec" title="${esc(tip)}"><span>${bi("Recommended input", "推薦測試輸入")}</span><b>${r.main}</b>${r.also.map(x => `<b>${x}</b>`).join("")}</p>`;
  }
  function docStage(c) {
    const d = D.document, mix = ex => d.types.map(t => { const m = ex.filter(x => x.type === t.id).length; return m ? `${t.zh.split("（")[0].split("／")[0]} ${m}` : ""; }).filter(Boolean).join(" · ");
    const row = (title, state, tok, line, gap) => `<section class="itc-r itc-doc${gap ? " itc-gap" : ""}"><header><h4>${title} <span class="itc-pg">${state}</span></h4><span class="itc-hv"><b>${tok}</b></span><p class="itc-ex itc-mets">${line}</p></header></section>`;
    const lv = DOC_LV.map(v => {
      const ex = d.samples.filter(x => docLv(x.tokens) === v), n = ex.length; if (!n) return "";
      return row(lvName(v), !n ? bi("Gap", "缺口") : bi(`${n} ${n === 1 ? "file" : "files"}`, `${n} 份`), n ? rng(ex.map(x => x.tokens), k) + " <i>tokens</i>" : "—", n ? `<span>${mix(ex)}</span>` : bi("No real file", "尚無真實檔案"), !n); }).join("");
    const ty = d.types.map(t => {
      const ex = d.samples.filter(x => x.type === t.id), n = ex.length; if (!n) return "";
      const unit = t.unit === "page" ? bi("page", "頁") : bi("line", "行"), fm = [...new Set(ex.map(x => x.format).filter(Boolean))].map(f => f.toUpperCase()).join(" · ");
      const per = rng(ex.map(x => { const q = qty(d, x); return q ? x.tokens / q : null; }), v => v < 10 ? v.toFixed(1) : String(Math.round(v))), r = recText(ex.map(x => x.tokens));
      const rec = `<span class="itc-recl">${bi("Recommended", "推薦")}</span> ${[r.main, ...r.also].map(x => `<span class="itc-recb">${x}</span>`).join(" ")}`;
      return row(bi(t.en, t.zh), bi(`${n} ${n === 1 ? "file" : "files"}`, `${n} 份`), rec, `<span>${fm}</span><span>${rng(ex.map(x => x.tokens), k)} <i>tokens</i></span><span>${bi("Tokens per", "每")}${unit} <b>${per}</b></span>`, false); }).join("");
    return `<p class="mw-kicker">${bi("Category", "類別")}</p>
      <h2 class="mw-big">${esc(nm(c))}</h2><p class="mw-spec">${esc(c.zh)}</p>
      ${docRec(d)}
      <div class="itc-seg" role="tablist"><button type="button" role="tab" class="on" data-p="lv">${bi("By token count", "依 token 數")}</button><button type="button" role="tab" data-p="ty">${bi("By file type", "依檔案類型")}</button></div>
      <div class="itc-pane itc-rows" data-p="lv">${lv}</div><div class="itc-pane itc-rows" data-p="ty" hidden>${ty}</div>`;
  }
  function docTable() {
    const d = D.document;
    return `<div class="table-wrap"><table class="v2-table itc-table"><thead><tr><th>${bi("File", "檔案")}</th><th>${bi("Type", "類型")}</th><th>${bi("Pages / lines", "頁數／行數")}</th><th>${bi("File size", "檔案大小")}</th><th>${bi("Characters", "字元")}</th><th>${bi("Tokens", "tokens")}</th><th>${bi("Tokens / page or line", "每頁／每行 tokens")}</th><th>${bi("Level", "等級")}</th></tr></thead><tbody>${d.samples.map(x => `<tr><td>${esc(x.name)}</td><td>${bi(d.types.find(t => t.id === x.type).en.split(" (")[0], d.types.find(t => t.id === x.type).zh.split("（")[0])}</td><td>${x.pages ? x.pages + " p" : x.pages_est ? "≈" + x.pages_est + " p" : x.lines + " lines"}</td><td>${x.file_mb} MB</td><td>${x.chars.toLocaleString()}</td><td>${x.tokens.toLocaleString()}</td><td>${(() => { const q = qty(d, x); return q ? (x.tokens / q < 10 ? (x.tokens / q).toFixed(1) : Math.round(x.tokens / q)) : "—"; })()}</td><td>${lvName(docLv(x.tokens))}</td></tr>`).join("")}</tbody></table></div>
      <p class="itc-note">${bi(d.size_note[0], d.size_note[1])} ${bi(d.method[0], d.method[1])}</p>`;
  }
  function table() {
    const cs = D.categories.find(x => x.id === sel); if (cs && cs.kind === "document") return docTable();
    const rows = D.rows.map((r, i) => ({ ...r, i: i + 1 })).filter(r => r.cat === sel);
    return `<div class="table-wrap"><table class="v2-table itc-table"><thead><tr><th>#</th><th>${bi("Detail", "細項")}</th><th>${bi("Text", "文字")}</th><th>${bi("Image", "圖片")}</th><th>${bi("Harness", "開場")}</th><th>${bi("API calls total (calls)", "整輪（次數）")}</th><th>${bi("Computed (new)", "實際計算")}</th><th>${bi("Output", "輸出")}</th><th>${bi("Time", "時間")}</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.i}</td><td>${bi(r.sub[0], r.sub[1])}</td><td>${k(r.user_text)}</td><td>${k(r.user_img)}${r.images ? ` (${r.images})` : ""}</td><td>${k(r.harness)}</td><td>${k(r.cum_input)} (${r.calls})</td><td>${r.cum_new != null ? k(r.cum_new) : "—"}</td><td>${k(r.output)}</td><td>${dur(r.seconds)}</td></tr>`).join("")}</tbody></table></div>
      <p class="itc-note">${bi("All numbers are tokens. Reused = read from the cache; Computed = new input actually processed (uncached + newly cached).", "表內數字單位皆為 token。快取重用 = 讀取快取；實際計算 = 真正處理的新輸入（未快取＋新寫入快取）。")} ${bi(D.note[0], D.note[1])}</p>`;
  }
  // touch screens have no hover: a group opens when it scrolls into the middle band of the screen and closes when it leaves
  const touch = window.matchMedia && matchMedia("(hover: none)").matches, io = touch && "IntersectionObserver" in window ? new IntersectionObserver(es => es.forEach(e => { e.target.classList.toggle("hv-closed", !e.isIntersecting); const h = e.target.querySelector(":scope > header"); if (h) h.setAttribute("aria-expanded", String(e.isIntersecting)); }), { rootMargin: "-30% 0px -30% 0px" }) : null;
  const bindFold = el => { if (window.HoverFold) window.HoverFold.init(el); if (io) el.querySelectorAll(".itc-g").forEach(g => io.observe(g)); };
  function render() {
    root.innerHTML =`<div class="mw itc"><div class="mw-stage">${stage(sel)}</div>
      <div class="mw-panel"><h3 class="mw-q">${bi("Choose a category", "選擇類別")}</h3>
        <div class="mw-opts" role="listbox">${D.categories.map(c => `<button type="button" class="mw-opt${c.id === sel ? " sel" : ""}${c.main ? "" : " sug"}" data-id="${c.id}"><span class="mw-l"><b>${esc(nm(c))}</b></span><span class="mw-r">${c.kind === "document" ? `${D.document.samples.length} ${bi("files", "份檔案")}` : `${usable(rowsOf(c.id)).length} ${bi("samples", "筆")}`}</span></button>`).join("")}</div>
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
  root.addEventListener("click", e => { const b = e.target.closest(".itc-seg button"); if (!b) return; const st = b.closest(".mw-stage"); st.querySelectorAll(".itc-seg button").forEach(x => { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-selected", String(on)); }); st.querySelectorAll(".itc-pane").forEach(x => { x.hidden = x.dataset.p !== b.dataset.p; }); });
  root.addEventListener("mouseout", e => { const st = root.querySelector(".mw-stage"); if (st && e.target.closest(".mw-opt") && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(".mw-opt"))) { st.innerHTML = stage(sel); bindFold(st); } });
  fetch("data/input-token-category.json", { cache: "no-store" }).then(r => r.json()).then(d => { D = d; render(); }).catch(() => { root.innerHTML = `<p class="itc-ref">${bi("Could not load the data file.", "無法載入資料檔。")}</p>`; });
})();
