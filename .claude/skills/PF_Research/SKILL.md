---
name: PF_Research
description: The one layout every Research item page must follow (Architecture Without/With diagram, two-term headline, 2 phases x 3 steps, plain words). Read before creating or editing any research page (LiteLLM, Ray Serve, next ones). Use when David says "PF_Research", "research 頁", or asks for a new research/evaluation page.
---

# PF_Research - layout for every Research page (David, 2026-11-26)

Reference pages: `litellm-report.html` (original) and `rayserve-report.html` (+ `.js`, `.css`, `data/rayserve-phase2.json`). Copy the Ray Serve page for a new item. Read PF_UI first.

## Page order (top to bottom, nothing else)
1. **Hero**: big ivory title (English + small Chinese) and one small gold line.
2. **Headline box**: TWO short terms, not a sentence. Example: "Auto-scaling request handling · Lower resource consumption" / 「自動增減處理請求・減少資源消耗」.
3. **1 Architecture 架構**: two panels side by side, **Without X** (orange) and **With X** (green), drawn as SVG like the LiteLLM page (clients -> LiteLLM -> machine). One bold-keyword caption under each (EN + 中文). Same machine and same boxes in both; only the new part differs. Classes `lr-vs lr-side lr-no lr-yes lr-svg lr-pt`.
4. **Phase 1 / Phase 2 tabs** (`lr-ptabs`). Each phase opens with ONE sentence: what was verified + what it means.
5. **3 steps per phase**, stacked top to bottom, full width (not side by side). Each step: numbered circle + name (EN large, 中文 small), **Meaning 意義** (one line), ONE big number with a caption, one line **The price 代價 / The benefit 效益**, status pill, then a **Data 數據** button that folds the test details. Colours: step 1 gold, 2 teal, 3 blue.
6. "Later" list folded at the bottom.

## Writing rules (David was angry about these)
- **Plain words, no AI jargon.** A manager must understand it. Never "worth it with 2 GPUs"; say what happens ("a 2nd GPU is added when many people use it").
- **Short.** One line per point. No paragraphs on the main view; long notes go in the folded Data.
- **The big number must be the benefit**, not a pass flag. "0 failed" is not a benefit; "-41% GPU hours per week" is. A drop in speed is a price, not a benefit (label it "The price").
- **Show the benefit in the reader's units** (GPU-hours per day/week/month, users served, seconds). If it needs an assumed usage pattern, show it as a table (day / week / month) and label it "Our assumption, not measured"; keep the measured part separate.
- **Number colours = good / bad, same idea as the benchmark pages** (David 2026-11-26): green (`var(--green)`) for a benefit, red (`var(--red)`) for a cost or downside. Set `tone: "good"|"bad"` on each step in the JSON (class `rs-big t-good` / `t-bad`). Whenever a research item has both pros and cons, colour every big number this way and put benefits before costs (a cost like "-1.3% speed" is red and goes last).
- **A scenario or calculation = exactly THREE lines, never more** (David 2026-11-26: attention drifts after three): line 1 method (and what is assumed), line 2 the calculation, line 3 the benefit. Put it in the JSON as `proof.notes` (3 items).
- Data folded: "What we tested" in 5 plain lines (start, load, result up, result down, check). Never only a test code with criteria.
- **English first; the Chinese appears on mouse-over** of its block (David 2026-11-26: less crowded). Done in the page CSS (`small.zhs` / `.zh-i` hidden under `@media (hover:hover)`, shown on `:hover` of the block; phones show both). This replaces "Chinese always beside it" on research pages.
- English large, Chinese small beside it; type >= 16 px; flat square frames; no decorative chips.

## Data and registration
- All text lives in `data/<name>-phase2.json` (`headline`, `phases.1/2.meaning_*`, `steps[]` with `mean_*`, `big`, `big_*`, `sum_*`, `label_*`, `tests`, optional `proof` (+`proof_open`) and `story`). Edit the JSON after every run; nothing is hard-coded in the JS.
- Register the item in `data/rd-list.json` with `href`, `owner` (David) and `status`; the Research list row is then clickable.
- Add the html/js/css and the json copy to `exporter.py` (asset tuple + data copy) and run `make export`.
- Every result goes onto the page in the same round it is produced.

## Publishing
- "推" / "合併" = do it, do not ask again. Never publish from the stale working checkout (it can be hundreds of commits behind): `git worktree add` a `release/<date>-<topic>` branch from `origin/main`, copy only the changed page files + their `docs/` copies, PR, merge, then curl the live URL.
- Ship only web files; never backend `benchmark/*.py`, tests, skills, secrets.
- Every reply ends with the verified AISO home links (local, LAN, live) + the page link, Terminal status, two workstreams, NT notes (see CLAUDE.md and `reply-links`).
