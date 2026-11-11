"use strict";
/* Vendor -> machine picker (vendor on the left, its machines extend to the right). Each machine with data has Result and Run.
   MachinePicker.mount(rootEl). Machines without data are listed as COMING SOON so people see what is planned. */
window.MachinePicker = (function () {
  const T = { c: "Consumer 消費級", m: "Mini-workstation 迷你工作站", s: "Server 伺服器" }, TAG = "TTFT · TPOT · TPS";
  const V = [
    { k: "nvidia", name: "NVIDIA", models: [{ n: "H200", t: "s" }, { n: "B300", t: "s" }, { n: "RTX PRO 6000", t: "s" }] },
    { k: "amd", name: "AMD", models: [{ n: "AISO1 · AI MAX+ 395", t: "m", href: "stress-test-aiso1.html", run: "benchmark.html#aiso1" }, { n: "ROG AI MAX 395", t: "c" }, { n: "TUF AI MAX 392", t: "c" }, { n: "ASRock", t: "m" }, { n: "Instinct MI350X", t: "s" }] },
    { k: "intel", name: "INTEL", models: [{ n: "Arc Pro B60", t: "m", href: "stress-test-b60.html", run: "benchmark.html#b60" }, { n: "Arc Pro B70", t: "m", href: "stress-test-b70.html", run: "benchmark.html#b70" }, { n: "Arc B390", t: "c" }] }];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const count = v => v.models.filter(m => m.href).length;
  function mount(root) {
    root.innerHTML = `<div class="sp-cols"><div class="sp-col sp-vendors"><h3>① 廠商<small>Vendor</small></h3><div class="spv" role="tablist" aria-label="Vendor"></div></div><div class="sp-arrow" aria-hidden="true">→</div><div class="sp-col sp-models"><h3>② 機型<small>Machine</small></h3><div class="spm" aria-live="polite"></div></div></div>`;
    const vEl = root.querySelector(".spv"), mEl = root.querySelector(".spm");
    let pinned = null;
    function show(k) {
      const v = V.find(x => x.k === k);
      [...vEl.children].forEach(b => { const on = b.dataset.k === k; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
      mEl.innerHTML = v.models.map(m => {
        const body = `<span class="sp-name">${esc(m.n)}</span><span class="sp-tier">${T[m.t]}</span>`;
        return m.href ? `<div class="sp-model has"><a class="sp-open" href="${m.href}">${body}<em>Result 結果 · ${TAG} →</em></a><a class="sp-run" href="${m.run}" title="先輸入測試密碼才會開始執行">③ Run 實測</a></div>`
                      : `<div class="sp-model soon">${body}<em>COMING SOON</em></div>`;
      }).join("");
    }
    vEl.innerHTML = V.map(v => `<button type="button" role="tab" data-k="${v.k}" class="sp-vendor"><b>${v.name}</b><small>${count(v) ? count(v) + " 機型有資料" : "即將推出"}</small></button>`).join("");
    vEl.addEventListener("mouseover", e => { const b = e.target.closest && e.target.closest(".sp-vendor"); if (b && !pinned) show(b.dataset.k); });
    vEl.addEventListener("click", e => { const b = e.target.closest(".sp-vendor"); if (!b) return; pinned = b.dataset.k; show(b.dataset.k); });
    vEl.addEventListener("focusin", e => { const b = e.target.closest(".sp-vendor"); if (b) show(b.dataset.k); });
    show((V.find(count) || V[0]).k);
  }
  return { mount, vendors: V };
})();
