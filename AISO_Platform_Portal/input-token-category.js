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

  const rowsOf = id => D.rows.filter(r => r.cat === id);
  function stats(rows) {
    const msg = rows.map(r => r.user_text + r.user_img);
    return { n: rows.length, msg: span(msg), txt: avg(rows.map(r => r.user_text)), img: avg(rows.map(r => r.user_img)), har: span(rows.map(r => r.harness)),
      cum: span(rows.map(r => r.cum_input)), calls: avg(rows.map(r => r.calls)), out: avg(rows.map(r => r.output)), sec: avg(rows.map(r => r.seconds)) };
  }
  // three levels by average whole-turn input, split into equal thirds (the groups follow the data, so a new category lands in the right level by itself)
  const LV = [["Low", "低"], ["Mid", "中"], ["High", "高"]];
  function levels() {
    const m = {}, a = D.categories.map(c => ({ id: c.id, f: stats(rowsOf(c.id)).cum.avg })).sort((x, y) => x.f - y.f);
    a.forEach((x, i) => { x.lv = Math.min(2, Math.floor(i * 3 / a.length)); m[x.id] = x.lv; });
    return { of: m, ord: a };
  }
  const T = n => `${k(n)} <i>tokens</i>`;
  const row = (en, zh, avgN, sub, s) => `<div class="itc-r"><div class="itc-rl"><h4>${bi(en, zh)}</h4><p>${sub}</p></div>
    <div class="itc-rv"><b>${T(avgN)}</b><span>${bi("Avg", "平均")}</span><p>${bi("Min", "最低")} ${k(s.min)} – ${bi("Max", "最高")} ${k(s.max)} <i>tokens</i></p></div></div>`;

  function stage(id) {
    const c = D.categories.find(x => x.id === id), s = stats(rowsOf(id)), L = LV[levels().of[id]], first = s.har.avg + s.msg.avg;
    return `<p class="mw-kicker">${bi("Category", "類別")} · ${bi(L[0], L[1])}${c.main ? "" : ` · ${bi("Suggested", "建議")}`}</p>
      <h2 class="mw-big">${esc(nm(c))}</h2><p class="mw-spec">${esc(c.zh)}</p>
      <div class="itc-rows">
        ${row("Your message", "你的訊息", s.msg.avg, `${bi("Text", "文字")} ${k(s.txt)} + ${bi("Image", "圖片")} ${k(s.img)} <i>tokens</i>`, s.msg)}
        ${row("Harness", "開場上下文", s.har.avg, bi("System prompt, tools, history", "系統提示、工具、歷史"), s.har)}
        ${row("API calls", "整輪（所有呼叫）", s.cum.avg, `${s.calls.toFixed(s.calls < 10 ? 1 : 0)} ${bi("calls", "次")} · ${bi("Harness re-sent each call", "Harness 每次呼叫重送")}<br>${bi("First call", "首次")} ${k(first)} + ${bi("re-sent", "重送")} ${k(Math.max(0, s.cum.avg - first))} <i>tokens</i>`, s.cum)}
      </div>
      <div class="mw-chips"><span class="mw-chip">${s.n} ${bi("samples", "筆")}</span>${s.n < 5 ? `<span class="mw-chip off">${bi("few samples", "樣本少")}</span>` : ""}<span class="mw-chip">${bi("Output", "輸出")} ${k(s.out)} <i>tokens</i></span><span class="mw-chip">${bi("Duration", "時間")} ${dur(s.sec)}</span></div>`;
  }
  function table() {
    const rows = D.rows.map((r, i) => ({ ...r, i: i + 1 })).filter(r => r.cat === sel);
    return `<div class="table-wrap"><table class="v2-table itc-table"><thead><tr><th>#</th><th>${bi("Detail", "細項")}</th><th>${bi("Text", "文字")}</th><th>${bi("Image", "圖片")}</th><th>${bi("Harness", "開場")}</th><th>${bi("API calls total (calls)", "整輪（次數）")}</th><th>${bi("Output", "輸出")}</th><th>${bi("Time", "時間")}</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.i}</td><td>${bi(r.sub[0], r.sub[1])}</td><td>${k(r.user_text)}</td><td>${k(r.user_img)}${r.images ? ` (${r.images})` : ""}</td><td>${k(r.harness)}</td><td>${k(r.cum_input)} (${r.calls})</td><td>${k(r.output)}</td><td>${dur(r.seconds)}</td></tr>`).join("")}</tbody></table></div>
      <p class="itc-note">${bi("All numbers are tokens.", "表內數字單位皆為 token。")} ${bi(D.note[0], D.note[1])}</p>`;
  }
  function render() {
    root.innerHTML = `<div class="mw itc"><div class="mw-stage">${stage(sel)}</div>
      <div class="mw-panel"><h3 class="mw-q">${bi("Choose a category", "選擇類別")}</h3>
        <div class="mw-opts" role="listbox">${[0, 1, 2].map(l => {
          const g = levels().ord.filter(x => x.lv === l); if (!g.length) return "";
          return `<p class="itc-lv"><em>${bi(LV[l][0], LV[l][1])}</em><span>${k(g[0].f)}${g.length > 1 ? "–" + k(g[g.length - 1].f) : ""} <i>tokens</i></span></p>` + g.map(x => { const c = D.categories.find(y => y.id === x.id);
            return `<button type="button" class="mw-opt${c.id === sel ? " sel" : ""}${c.main ? "" : " sug"}" data-id="${c.id}"><span class="mw-l"><b>${esc(nm(c))}</b></span><span class="mw-r">${rowsOf(c.id).length} ${bi("samples", "筆")}</span></button>`; }).join("");
        }).join("")}</div>
        <p class="itc-ref">${bi("Level = avg whole-turn input", "分級依整輪平均輸入")} · ${bi("Benchmark inputs", "Benchmark 輸入")} ${BENCH.join(" · ")}</p></div></div>
      <div class="itc-tokref"><b>${bi("Rule of thumb", "換算參考")}</b>
        <span>${bi("Chinese", "中文")} ≈ 1–2 <i>tokens</i> / ${bi("char", "字")}</span>
        <span>${bi("English", "英文")} ≈ 0.25–0.33 <i>tokens</i> / ${bi("char", "字元")} (≈ 1.3 / ${bi("word", "單字")})</span>
        <span>${bi("Image", "圖片")} ≈ 100–1,600 <i>tokens</i> / ${bi("image", "張")}</span></div>
      <details class="itc-more"${open ? " open" : ""}><summary>${bi("Samples", "樣本表")} · ${esc(nm(D.categories.find(c => c.id === sel)))}</summary>${table()}</details>`;
  }
  root.addEventListener("click", e => { const o = e.target.closest(".mw-opt"); if (!o) return; sel = o.dataset.id; render(); });
  root.addEventListener("toggle", e => { if (e.target.classList && e.target.classList.contains("itc-more")) open = e.target.open; }, true);
  root.addEventListener("mouseover", e => {       // hover previews a category on the left without changing the choice
    const o = e.target.closest(".mw-opt"), st = root.querySelector(".mw-stage");
    if (o && st) st.innerHTML = stage(o.dataset.id);
  });
  root.addEventListener("mouseout", e => { const st = root.querySelector(".mw-stage"); if (st && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(".mw-opt"))) st.innerHTML = stage(sel); });
  fetch("data/input-token-category.json", { cache: "no-store" }).then(r => r.json()).then(d => { D = d; render(); }).catch(() => { root.innerHTML = `<p class="itc-ref">${bi("Could not load the data file.", "無法載入資料檔。")}</p>`; });
})();
