"use strict";
/* Minimum type size for people (David, 2026-11-11): headings >= 16pt (21.33px), everything else >= 12pt (16px).
   Pages keep their own design sizes; this lifts anything smaller. Skipped: svg, elements with aria-hidden="true" (decorative), and [data-keep-size]. */
(function () {
  const BODY = 16, HEAD = 21.33, SKIP = "svg,script,style,noscript,[aria-hidden='true'],[data-keep-size],[hidden]";
  let queued = false;
  function lift(root) {
    const els = root.querySelectorAll ? root.querySelectorAll("*") : [];
    for (const e of els) {
      if (e.closest(SKIP) || e.dataset.mt) continue;
      let has = false;
      for (const n of e.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { has = true; break; }
      if (!has) continue;
      const fs = parseFloat(getComputedStyle(e).fontSize), min = /^H[1-3]$/.test(e.tagName) ? HEAD : BODY;
      if (fs < min - 0.01) { e.style.fontSize = min + "px"; e.dataset.mt = "1"; }
    }
  }
  function schedule() { if (queued) return; queued = true; setTimeout(() => { queued = false; lift(document.body); }, 120); }
  function start() {
    lift(document.body);
    new MutationObserver(m => { if (m.some(x => x.addedNodes.length || x.type === "characterData" || (x.type === "attributes" && x.attributeName === "hidden"))) schedule(); }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["hidden"] });   // also when a hidden panel is opened
    window.addEventListener("resize", schedule);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  window.UiMinType = { lift: () => lift(document.body) };
})();
