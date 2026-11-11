"use strict";
/* Vendor -> machine picker (vendor on the left, its machines extend to the right). Each machine with data has Result and Run.
   MachinePicker.mount(rootEl). Machines without data are listed as COMING SOON so people see what is planned. */
window.MachinePicker = (function () {
  const T = { c: ["Consumer", "消費級"], m: ["Mini-workstation", "迷你工作站"], s: ["Server", "伺服器"] }, TAG = "TTFT · TPOT · TPS";
  const bi = (en, zh) => `${en}<small class="zhs">${zh}</small>`;
  /* online = the platform can reach it and run benchmarks (David, 2026-11-11: only NVIDIA RTX PRO 6000 and AMD AISO1; Intel B60 / B70 are returned or about to be shut down: results stay, Run is off)
     result = a results page exists, run = the Run page. note = status text shown on the row. */
  const V = [
    { k: "nvidia", name: "NVIDIA", models: [{ n: "RTX PRO 6000", t: "s", online: true, run: "benchmark.html#/pick/nvidia/pro6000-tpi" }, { n: "H200", t: "s" }, { n: "B300", t: "s" }] },
    { k: "amd", name: "AMD", models: [{ n: "AISO1 · AI MAX+ 395", t: "m", online: true, result: "stress-test-aiso1.html", run: "benchmark.html#/pick/amd/aiso1-amd" }, { n: "ROG AI MAX 395", t: "c" }, { n: "TUF AI MAX 392", t: "c" }, { n: "ASRock", t: "m" }, { n: "Instinct MI350X", t: "s" }] },
    { k: "intel", name: "INTEL", models: [{ n: "Arc Pro B70", t: "m", online: false, result: "stress-test-b70.html", note: "即將關閉" }, { n: "Arc Pro B60", t: "m", online: false, result: "stress-test-b60.html", note: "已歸還" }, { n: "Arc B390", t: "c" }] }];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const online = v => v.models.filter(m => m.online).length, withResult = v => v.models.filter(m => m.result).length;
  function mount(root) {
    root.innerHTML = `<div class="sp-cols"><div class="sp-col sp-vendors"><h3>${bi("① Vendor","廠商")}</h3><div class="spv" role="tablist" aria-label="Vendor"></div></div><div class="sp-arrow" aria-hidden="true">→</div><div class="sp-col sp-models"><h3>${bi("② Machine","機型")}</h3><div class="spm" aria-live="polite"></div></div></div>`;
    const vEl = root.querySelector(".spv"), mEl = root.querySelector(".spm");
    let pinned = null;
    function show(k) {
      const v = V.find(x => x.k === k);
      [...vEl.children].forEach(b => { const on = b.dataset.k === k; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
      mEl.innerHTML = v.models.map(m => {
        const known = m.online !== undefined || m.result;
        const badge = m.online ? `<span class="sp-on">${bi("● Online", "可連線")}</span>` : (known ? `<span class="sp-off">${bi("○ Offline", "離線" + (m.note ? " · " + esc(m.note) : "") + " · 僅看結果")}</span>` : "");
        const body = `<span class="sp-name">${esc(m.n)}</span><span class="sp-tier">${bi(T[m.t][0], T[m.t][1])}</span>${badge}`;
        if (!known) return `<div class="sp-model soon">${body}<em>COMING SOON</em></div>`;
        const res = m.result ? `<a class="sp-open" href="${m.result}">${body}<em>${bi("Result", "結果")} · ${TAG} →</em></a>` : `<div class="sp-open">${body}<em class="sp-noresult">${bi("No result yet", "尚無結果 · 先 Run 實測")}</em></div>`;
        const run = m.online && m.run ? `<a class="sp-run" href="${m.run}" title="Opens the parameter setup for this machine; the password is asked before every run / 每次執行前先輸入測試密碼">${bi("③ Run", "實測 · 紀錄")}</a>` : "";
        return `<div class="sp-model has${m.online ? "" : " off"}">${res}${run}</div>`;
      }).join("");
    }
    vEl.innerHTML = V.map(v => `<button type="button" role="tab" data-k="${v.k}" class="sp-vendor"><b>${v.name}</b><span class="spv-sub">${online(v) ? bi("Online " + online(v), "可連線") : bi("None online", "尚無可連線")}${withResult(v) ? " · " + bi("Results " + withResult(v), "有結果") : ""}</span></button>`).join("");
    vEl.addEventListener("mouseover", e => { const b = e.target.closest && e.target.closest(".sp-vendor"); if (b && !pinned) show(b.dataset.k); });
    vEl.addEventListener("click", e => { const b = e.target.closest(".sp-vendor"); if (!b) return; pinned = b.dataset.k; show(b.dataset.k); });
    vEl.addEventListener("focusin", e => { const b = e.target.closest(".sp-vendor"); if (b) show(b.dataset.k); });
    show((V.find(online) || V[0]).k);
  }
  return { mount, vendors: V };
})();
