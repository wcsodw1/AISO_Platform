---
name: PF_UI
description: AISO Portal UI rules - minimum type sizes (headings >= 16pt, body >= 12pt), how to scan every page, and the checklist for any new or changed page. Use whenever a page, panel or component is added or restyled, or when David says "PF_UI", "字體", "太小".
---

# PF_UI - UI rules for the AISO Portal (David, 2026-11-11)

## Bilingual labels - EVERY page (David, 2026-11-11, said again)
- **English is the large text, Chinese is small, right beside it.** Titles, section headings, tab / button labels, field labels, card names, status badges, table headers.
- Shared pattern: `English<small class="zhs">中文</small>` (class `.zhs` in `gptoss-v2.css`; `<h2>English<span class="zh">中文</span></h2>` on the report pages; `.bz` on Sizing). Chinese stays >= 16 px.
- Never make Chinese the main text with English as the small one. Long explanations belong in hover bubbles, not on the page.
- When scanning a page for type size (below), also read every heading and button: Chinese-first ones are bugs.

## Type sizes (people must be able to read it)
- **Headings: at least 16 pt = 21.33 px.** (h1-h3 and anything that acts as a title)
- **Everything else: at least 12 pt = 16 px.** Labels, captions, table cells, buttons, badges, footnotes, English and Chinese alike.
- Only purely decorative text (inside `aria-hidden="true"`, svg art, or `[data-keep-size]`) may be smaller.
- Bilingual labels: English large, Chinese small beside it - but the small one is still >= 16 px.

## How it is enforced
- `ui-min-type.js` is loaded on every page (last script before `</body>`, also in the exporter asset list) and lifts anything smaller at load and on DOM changes. It is a safety net: still write the right size in the CSS.
- New standalone pages: copy the shell of `stress-test.html` (header, back-nav.js, hover-fold.js, debug-notes) and keep `ui-min-type.js`.

## Scan every page (do this after any UI change)
1. Make a gate-free copy of the portal (strip `access-gate.js` from the HTML) and serve it; NEVER enter the site access code.
2. On each page run in the browser console and expect an empty result:
```js
const out={};for(const e of document.body.querySelectorAll('*')){if(e.closest('[hidden],script,style,noscript,svg,[aria-hidden="true"]'))continue;let t='';for(const n of e.childNodes)if(n.nodeType===3)t+=n.textContent;t=t.trim();if(!t)continue;const r=e.getBoundingClientRect();if(!r.width||!r.height)continue;const fs=parseFloat(getComputedStyle(e).fontSize);const h=/^H[1-3]$/.test(e.tagName);if(fs<(h?21.33:16)-0.01){const k=e.tagName.toLowerCase()+'.'+(typeof e.className==='string'?e.className.split(' ')[0]:'')+' '+fs;out[k]=(out[k]||0)+1}}out
```
3. Look at a screenshot of the busiest sections (home, sizing, compare) - a lifted size must not break the layout.

## Page patterns that were agreed
- Benchmark has its own page (`benchmark-hub.html`); the home page shows only the top half and ONE button "TRY & Benchmark IT !" into it. `stress-test.html` only redirects there.
- Benchmark menu (tabs + header dropdown): **Benchmarking** (guided flow: vendor → machine → Run → Result; vendor on the left, its machines extend to the right via `machine-picker.js`; each machine has Result + Run; Run always asks for the test password first) and **SOTA R&D** (LMCache v.s aiDAPTIV … each with its own Result).
- Long detail goes behind hover-to-expand panels (`hover-fold.js`), not a long page.
- "返回" goes to the previous page (`back-nav.js`).
- One short summary sentence per chart; no duplicated explanatory text.

## Selection flows = configurator style (David, 2026-11-11: "參考 Tesla 官網")
- Preview stage on the left (big name, spec, status chips), ONE question at a time on the right: segmented progress bars, `‹ Back`, big question title, **equal-size option cards** (same width and height, 68 px+), selected = gold outline, one full-width primary Next / Go button.
- Never let option cards differ in size. Disabled options are dimmed, not removed. See `machine-picker.js` (Benchmark page).

## Before saying "done"
`make export`, run the unit tests, curl every link you paste (localhost, LAN IP, live) and only paste the ones that return 200. Related skills: PF_Sync, PF_Bench.
