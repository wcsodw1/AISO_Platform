"use strict";
/* The Run page no longer has its own machine picker: the Benchmark page (benchmark-hub.html) is the single place to choose a machine.
   - arriving without a machine in the URL goes back to the hub
   - "01 / machine" in the step bar goes to the hub
   - ?view=result opens the Result tab of the machine (Run history and recorded results stay on this page) */
(function () {
  const hub = "benchmark-hub.html#benchmarking";
  const noMachine = () => !/^#\/pick\/[a-z]+\/[a-z0-9-]+/.test(location.hash);
  if (noMachine()) { location.replace(hub); return; }
  window.addEventListener("DOMContentLoaded", () => {
    const step = document.getElementById("stepVendors");
    if (step) { step.textContent = "01 / Machine 機器"; step.onclick = e => { e.preventDefault(); e.stopImmediatePropagation(); location.href = hub; }; }
    const v = new URLSearchParams(location.search).get("view");
    if (v === "result") setTimeout(() => { const b = document.querySelector('[data-view="result"]'); if (b) b.click(); }, 400);
  });
})();
