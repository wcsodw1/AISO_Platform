"use strict";
/* Benchmark > Input token category: one compact card like "Choose a vendor" (left = the category, right = pick one).
   Data: data/input-token-category.json (token numbers and a short label only, never message text). */
(function () {
  const root = document.getElementById("itcRoot");
  if (!root) return;
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const bi = (en, zh) => `${esc(en)}<small class="zhs">${esc(zh)}</small>`;
  const k = n => n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + "k" : String(Math.round(n));
  const dur = s => s >= 60 ? Math.floor(s / 60) + "m" + String(Math.round(s % 60)).padStart(2, "0") + "s" : Math.round(s) + "s";
  const med = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
  const first = r => r.harness + r.user_text + r.user_img;
  const nm = c => c.en.replace(/ Prompt$/, "");
  const BENCH = ["4K", "8K", "16K", "64K", "128K"];
  let D = null, sel = "coding", open = false;

  const rowsOf = id => D.rows.filter(r => r.cat === id);
  function stats(rows) {
    const f = med(rows.map(first)), you = med(rows.map(r => r.user_text + r.user_img));
    return { n: rows.length, first: f, you, pct: f ? you / f * 100 : 0, cum: med(rows.map(r => r.cum_input)), calls: med(rows.map(r => r.calls)), out: med(rows.map(r => r.output)), sec: med(rows.map(r => r.seconds)) };
  }
  const stat = (v, en, zh) => `<div><b>${v}</b><span>${esc(en)}<small class="zhs">${esc(zh)}</small></span></div>`;

  function stage(id) {
    const c = D.categories.find(x => x.id === id), s = stats(rowsOf(id));
    return `<p class="mw-kicker">${bi("Category", "類別")}${c.main ? "" : ` · ${bi("Suggested", "建議")}`}</p>
      <h2 class="mw-big">${esc(nm(c))}</h2><p class="mw-spec">${esc(c.zh)}</p>
      <div class="itc-grid">${stat(k(s.first), "First call", "首次輸入")}${stat(k(s.cum), "Whole turn", "整輪輸入")}${stat(k(s.out), "Output", "輸出")}
        ${stat(k(s.you), "Your message", "你的訊息")}${stat(String(s.calls), "API calls", "次數")}${stat(dur(s.sec), "Duration", "時間")}</div>
      <div class="mw-chips"><span class="mw-chip">${s.n} ${bi("samples", "筆")}</span>${s.n < 5 ? `<span class="mw-chip off">${bi("few samples", "樣本少")}</span>` : ""}<span class="mw-chip">${bi("Your message", "你的訊息")} ${s.pct < 1 ? "<1" : s.pct.toFixed(1)}%</span></div>`;
  }
  function table() {
    const rows = D.rows.map((r, i) => ({ ...r, i: i + 1 })).filter(r => r.cat === sel);
    return `<div class="table-wrap"><table class="v2-table itc-table"><thead><tr><th>#</th><th>${bi("Detail", "細項")}</th><th>${bi("Your message", "你的訊息")}</th><th>${bi("Harness", "Harness")}</th><th>${bi("Whole turn (calls)", "整輪（次數）")}</th><th>${bi("Output", "輸出")}</th><th>${bi("Time", "時間")}</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.i}</td><td>${bi(r.sub[0], r.sub[1])}</td><td>${k(r.user_text + r.user_img)}</td><td>${k(r.harness)}</td><td>${k(r.cum_input)} (${r.calls})</td><td>${k(r.output)}</td><td>${dur(r.seconds)}</td></tr>`).join("")}</tbody></table></div>
      <p class="itc-note">${bi(D.note[0], D.note[1])}</p>`;
  }
  function render() {
    root.innerHTML = `<div class="mw itc"><div class="mw-stage">${stage(sel)}</div>
      <div class="mw-panel"><h3 class="mw-q">${bi("Choose a category", "選擇類別")}</h3>
        <div class="mw-opts" role="listbox">${D.categories.map(c => `<button type="button" class="mw-opt${c.id === sel ? " sel" : ""}${c.main ? "" : " sug"}" data-id="${c.id}"><span class="mw-l"><b>${esc(nm(c))}</b></span><span class="mw-r">${rowsOf(c.id).length} ${bi("samples", "筆")}</span></button>`).join("")}</div>
        <p class="itc-ref">${bi("Benchmark inputs", "Benchmark 輸入")} ${BENCH.join(" · ")}</p></div></div>
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
