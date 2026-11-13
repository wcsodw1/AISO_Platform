/* "Download SLIDE PDF" for every benchmark report page (David 2026-11-13).
   Adds one button at the top right of the page hero. On click it captures the hero and each report section
   (one 16:9 landscape slide each; a very tall section continues on the next slide) and downloads <page>-slides.pdf.
   Libraries load only on click, from cdnjs (exact versions). Optional: data-slides="selector,selector" on the
   <script> tag picks the blocks to put on slides instead of the default top-level .report-section blocks. */
(function () {
  "use strict";
  const me = document.currentScript;
  const PICK = (me && me.dataset.slides) || "";
  const LIBS = [
    "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"
  ];
  const BG = "#0b0d12", W = 1280, H = 720, PAD = 36, FOOT = 26;

  const css = document.createElement("style");
  css.textContent =
    ".sp-pdf-host{position:relative}" +
    ".sp-pdf{position:absolute;top:0;right:0;z-index:5;display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border:1px solid var(--gold,#d8c779);border-radius:999px;background:rgba(216,199,121,.08);color:var(--gold,#d8c779);font:inherit;font-size:16px;font-weight:700;cursor:pointer;white-space:nowrap}" +
    ".sp-pdf small{font-weight:500;color:var(--muted,#9aa6b8)}.sp-pdf:hover{background:rgba(216,199,121,.18)}.sp-pdf[disabled]{opacity:.6;cursor:progress}" +
    "@media(max-width:640px){.sp-pdf{position:static;margin:0 0 12px}}";
  document.head.appendChild(css);

  const load = src => new Promise((ok, bad) => {
    if ([...document.scripts].some(s => s.src === src)) return ok();
    const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => bad(new Error("load " + src)); document.head.appendChild(s);
  });
  const ascii = t => String(t || "").replace(/[—–]/g, "-").replace(/[^\x20-\x7e]/g, "").replace(/\s+/g, " ").trim();
  const visible = el => el && el.offsetParent !== null && el.getBoundingClientRect().height > 8;

  function blocks() {
    const main = document.querySelector("main") || document.body;
    const hero = document.querySelector(".v2-hero, .bm-hero");
    let list = PICK ? [...document.querySelectorAll(PICK)] : [...main.querySelectorAll(".report-section")].filter(s => !s.parentElement.closest(".report-section"));
    list = list.filter(visible);
    return (hero && visible(hero) ? [hero] : []).concat(list.filter(x => x !== hero));
  }

  async function make(btn) {
    const label = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = 'Making PDF…<small>產生中</small>';
    try {
      await Promise.all(LIBS.map(load));
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [W, H], hotfixes: ["px_scaling"] });
      const name = ascii(document.title).replace(/^AISO\s*-\s*/, "") || "AISO report", day = new Date().toISOString().slice(0, 10);
      const pages = [];
      for (const el of blocks()) {
        const c = await window.html2canvas(el, {
          backgroundColor: BG, scale: 2, useCORS: true, logging: false, windowWidth: 1440,
          ignoreElements: n => n.classList && (n.classList.contains("sp-pdf") || n.classList.contains("fc-nf") || n.classList.contains("nav-dropdown"))
        });
        const boxW = W - PAD * 2, boxH = H - PAD * 2 - FOOT;
        const fit = Math.min(boxW / c.width, 1);           // fill the slide width (never blow up a narrow block)
        if (c.height * fit <= boxH * 1.7) {               // up to ~1.7 slides tall: shrink the whole block onto ONE slide
          const k = Math.min(fit, boxH / c.height);
          pages.push({ img: c.toDataURL("image/jpeg", 0.92), w: c.width * k, h: c.height * k });
          continue;
        }
        const sliceH = Math.floor(boxH / fit);             // source pixels per slide
        for (let y = 0; y < c.height; y += sliceH) {      // a really tall block continues on the next slide
          const h = Math.min(sliceH, c.height - y), part = document.createElement("canvas");
          part.width = c.width; part.height = h; part.getContext("2d").drawImage(c, 0, y, c.width, h, 0, 0, c.width, h);
          const k = Math.min(fit, boxH / h);
          pages.push({ img: part.toDataURL("image/jpeg", 0.92), w: c.width * k, h: h * k });
        }
      }
      pages.forEach((p, i) => {
        if (i) pdf.addPage([W, H], "landscape");
        pdf.setFillColor(BG); pdf.rect(0, 0, W, H, "F");
        pdf.addImage(p.img, "JPEG", (W - p.w) / 2, PAD + (H - PAD * 2 - FOOT - p.h) / 2, p.w, p.h);
        pdf.setTextColor(150, 158, 172); pdf.setFontSize(13);
        pdf.text("AISO Platform  |  " + name + "  |  " + day, PAD, H - PAD / 2 - 4);
        pdf.text((i + 1) + " / " + pages.length, W - PAD, H - PAD / 2 - 4, { align: "right" });
      });
      const file = (location.pathname.split("/").pop() || "report").replace(/\.html?$/, "") + (location.search ? "-" + location.search.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") : "") + "-slides.pdf";
      pdf.save(file);
    } catch (e) {
      alert("Could not make the PDF 無法產生 PDF: " + e.message);
    } finally {
      btn.disabled = false; btn.innerHTML = label;
    }
  }

  function mount() {
    const host = document.querySelector(".v2-hero, .bm-hero") || (document.querySelector("main") || document.body);
    if (!host || host.querySelector(".sp-pdf")) return;
    host.classList.add("sp-pdf-host");
    const b = document.createElement("button");
    b.type = "button"; b.className = "sp-pdf";
    b.innerHTML = 'Download SLIDE PDF<small>下載簡報</small>';
    b.addEventListener("click", () => make(b));
    host.insertBefore(b, host.firstChild);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
