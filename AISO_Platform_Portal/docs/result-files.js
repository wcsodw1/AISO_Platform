"use strict";
/* "Result files" block at the end of every machine result page: the organised results of this machine (summary, sheet, all cases, preflight notes, hash check).
   Normally folded to ONE sentence; pointing at it opens the list, a click pins it. Data: data/benchmark-result/index.json (scripts/export_benchmark_result.py). */
(function () {
  const el = document.getElementById("resultFiles"); if (!el) return;
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const kb = n => (n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
  const ICON = { summary: "📄", sheet: "📊", cases: "🗒", preflight: "🧾", hashes: "🔐" };
  const st = document.createElement("style");
  st.textContent = "#resultFiles .rf-list{display:none;gap:8px;margin-top:14px}#resultFiles.rf-open .rf-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}"
    + "#resultFiles .rf-f{display:flex;align-items:center;flex-wrap:wrap;gap:10px;min-height:48px;padding:8px 14px;border:1px solid rgba(244,239,228,.22);border-radius:10px;color:var(--ivory,#f3efe5);font-size:18px;text-decoration:none}"
    + "#resultFiles .rf-f:hover{border-color:rgba(200,184,117,.8);background:rgba(200,184,117,.08)}#resultFiles .rf-f small{font-size:16px}#resultFiles .rf-f em{margin-left:auto;font-style:normal;font-size:16px;color:var(--muted,#98a0ad)}"
    + "#resultFiles>header{cursor:pointer}#resultFiles .rf-one{margin:6px 0 0}";
  document.head.appendChild(st);
  fetch("data/benchmark-result/index.json", { cache: "no-store" }).then(r => (r.ok ? r.json() : null)).then(d => {
    const e = d && d.machines && d.machines[el.dataset.machine]; if (!e || !e.files || !e.files.length) return;
    const one = e.cases != null ? `<b>${e.cases}</b> cases · <b>${e.pass}</b> PASS · ${e.sources} ${esc(e.sources_kind)} (${esc(e.as_of)}): summary, sheet, all cases, preflight notes.<small class="zhs" style="display:block">${e.cases} 個案例、${e.pass} 個通過（${esc(e.as_of)}）：摘要、試算表、全部案例、Preflight 說明。</small>` : "Summary, sheet, all cases, preflight notes.";
    el.innerHTML = `<header><h2>Result files<span class="zh">結果檔案</span></h2><p class="v2-fine rf-one">${one}</p></header><div class="rf-list">${e.files.map(f => `<a class="rf-f" href="${esc(f.path)}" ${/\.(xlsx|csv)$/.test(f.path) ? "download" : 'target="_blank" rel="noopener"'}><span aria-hidden="true">${ICON[f.kind] || "📁"}</span><b>${esc(f.en)}</b><small class="zhs">${esc(f.zh)}</small><em>${kb(f.bytes)}</em></a>`).join("")}</div>`;
    el.hidden = false; let pinned = false, t;
    const open = () => { clearTimeout(t); el.classList.add("rf-open"); }, close = () => { if (!pinned) el.classList.remove("rf-open"); };
    el.addEventListener("pointerenter", ev => { if (ev.pointerType === "mouse") open(); });
    el.addEventListener("pointerleave", ev => { if (ev.pointerType === "mouse") { t = setTimeout(close, 350); } });
    el.querySelector("header").addEventListener("click", () => { pinned = !pinned; pinned ? open() : el.classList.remove("rf-open"); });
  }).catch(() => {});
})();
