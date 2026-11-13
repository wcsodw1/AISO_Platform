---
name: PF_UI
description: AISO Portal UI rules and design thinking (point first, only what matters on screen, details in a hover Notes corner, clean two-layer heroes) - minimum type sizes (headings >= 16pt, body >= 12pt), how to scan every page, and the checklist for any new or changed page. Use whenever a page, panel or component is added or restyled, or when David says "PF_UI", "字體", "太小".
---

# PF_UI - UI rules for the AISO Portal (David, 2026-11-11)

## Design thinking - KEEP THIS (David 2026-11-13: 「很好，這個設計思維請保持」)
Approved reference: `framework-compare.html` section 3 "Same or different?". Apply the same thinking to every page:
1. **Point first** - ONE Conclusion 結論 at the top of the page's main result (big, short lines). Say the answer, not the process. Not repeated in every section: parameter / "same or different" sections have no conclusion box (David 2026-11-13: 「結論是上面要有的，這邊不用」). No per-NP bullet lists under charts.
2. **Main view = only what the reader needs** - e.g. list what is the SAME, plain label | value, large type (values >= 20px).
3. **Details hidden, one hover away** - differences, reasons, file names go into a small "Notes 備註" corner (top-right) that unrolls like a curtain toward the bottom-left on mouse-over and rolls up when the mouse leaves.
   - Notes hold only real anomalies (David 2026-11-13: 「備註寫特別異常的就好」): missing results, TTFT > 180 s (queueing), reversals > 20 %. Normal small swaps are not noted; no anomalies -> no Notes button.
4. **Clean screen** - no decorative chips/badges, no duplicate eyebrows, two-layer heroes (big ivory title + small gold note), status words of 2-3 words (EN + 中文).
5. **Show only fair data** - a comparison that is not like-for-like (different precision, different settings) is not shown; the machine/option is greyed with a short status, reason on hover.

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

## Sizing / "Build Your Own System" page (`build-system.html`) - David, 2026-11-12
- **At most 3 key points per page.** Here: (1) choose a model set, (2) choose the input length, (3) result. Left = the choices, right = a display-only dashboard (sticky). One click on a model set must show the machines and counts - "no-brainer".
- **Step headings stand out:** numbered circle + a verb ("Select a model set", "Select a scenario"), >= 24 px, one colour per step (1 gold, 2 teal, 3 blue); the selected row uses that step's colour.
- **Little visible text.** Keep only the key point (name, number, GB); explanations, sources and the model list go in a hover tip (`.bs-tip`), long notes in a folded `<details>`. David said "too noisy" about static explanation text more than once.
- **Input scenarios are bars on the same 0-16K scale as the slider** (chat, support, typical, RAG, summary, agent, coding ...). The axis is proportional (0 - 4K - 8K - 16K) and the thumb snaps to the tested lengths. Every typical-input number needs a source or the word "rough"; beyond 16K gets a warning.
- **Show quantization** (Q4 pill on each model; Q8 / INT8 / INT4 as dimmed "soon" placeholders until they are tested).
- **Numbers must say what they are:** assumptions (3 of 10 ask at once, equal split over the models, no contention) are labelled "our assumption, not measured"; a cell within 7% of 15 tok/s does not count; a model that cannot hold 15 tok/s shows a cross and names the model.
- **Only calculate what was measured.** Start with ONE model per answer (every benchmark is a single-model run). Several models on one machine were never benchmarked, so it is shown as a dimmed "soon" row, not computed. Say the formula in one line: requests at once = people x 30%; machines = requests at once / NP, rounded up.
- **Lists are bullets, one item per line.** Never join items with `+`, `·` or `;` in one run-on line (hover tips, notes, legends, the calculation sheet). Several items = a bullet list, or chips; a hover tip with 2+ items is a bullet list with type / quantization / size as small chips. Nested items = nested bullets.
- **Review the WHOLE page, not only the spot David points at.** After any wording change run a text audit (leaf text > 85 characters, or 3+ ` · ` / ` + ` separators, including hover tips, folded notes and the open calculation sheet) and fix every hit. David said this twice ("請全部看過").
- **A result never shows 0 or a bare cross.** A sizing answer is always >= 1 machine; a model slower than 15 tok/s is still counted (one request at a time) and flagged with a warning that names the model and its real speed ("more machines will not make it faster").
- Wording pattern for choices: `Name (range) 中文`, e.g. `Document (3-16K) 文件`; short names, no duplicate words ("Dense Dense"), no fluff names such as "Small team".
- Calculation trail opens from a button at the top right and unfolds like a curtain (top-right to bottom-left), as wide as the content.

## Page hero (David, 2026-11-13 - final: 「標題白(大) 備註金(小)」)
- **Title = big, plain, IVORY.** The `h1`/`h2` is the short, simple name of the page or section (e.g. "Framework Comparison"), the largest text, in ivory (`var(--ivory)` / `#f3efe5`), with the Chinese name small and muted beside or under it.
- **The note = small, GOLD.** The short line under the title that says what it shows (e.g. "Same Model, Three Frameworks", `.v2-sub`; on the home page `.home-title-zh`) is small and gold (`var(--gold)` / `#c8b875`), Chinese gloss next to it also gold.
- **KEEP IT SIMPLE - two layers only** (David 2026-11-13, said many times: 「不要複雜！！」): a hero is exactly (1) the big ivory title and (2) ONE small gold note line (English, Chinese gloss beside it on the same line). No eyebrow above (e.g. "CORE PRODUCTS"), no extra tag next to the title (e.g. "HARDWARE SELECT"), no second explanation line, no letter-spaced caps. If something must stay, put it in a hover.
- **Clean screen** (David 2026-11-13 「畫面乾淨」): no decorative chips/badges, option cards show a name + 2-3 word status (EN + 中文), the reason goes in hover (`title`).
- **Never all gold** (title and note both gold) and never gold title + ivory note - David rejected both.
- **No separate all-caps eyebrow above the title** that repeats or competes with it. Title first, note second.
- Done so far: home sections (`index.html`, via `tesla.css`) and `framework-compare.html` (+ `framework-compare.css`, the "hero" block). Other pages (e.g. `build-system.html`) still use the old style; change them only when David asks.

## Comparison / parameter sections (David 2026-11-13, "講 1000 遍了")
- **Lead with the point** (「講重點即可」): one Conclusion 結論 on top of the main result only (see Design thinking 1).
- **List only what is the SAME**, as a plain two-column list (label | value), values ≥20px, labels ≥16px. No per-framework table, no "X matches" bullet lists.
- **Differences go into a small "Notes 備註" button in the top-right corner**; on mouse-over the panel unrolls like a curtain toward the bottom-left (clip-path from the top-right corner), and rolls back up as soon as the mouse leaves. No click-to-open. Never in the main view.
- Reference: `framework-compare.html` section 3 (`.fc-same`, `.fc-notes`), same idea as the benchmark pages' Notes panel.

## Phone layout (RWD, David 2026-11-13 「手機版視覺很慘」)
- One shared phone layer at the end of `tesla.css` (`@media (max-width:640px)`), loaded by every page. Add phone fixes there, not per page.
- Rules: 16px side gutters; header nav is one row that scrolls sideways; nested panels get light padding; charts (SVG) scale to 100% width; wide tables scroll inside their own box; Chinese glosses may wrap; section header rows stack; nothing may make the page wider than the screen.
- Check every changed page at 375px: `document.documentElement.scrollWidth` must equal the viewport width and no visible element may end past the right edge.

## Before saying "done"
`make export`, run the unit tests, curl every link you paste (localhost, LAN IP, live) and only paste the ones that return 200. Related skills: PF_Sync, PF_Bench.
