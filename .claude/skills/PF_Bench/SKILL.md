---
name: PF_Bench
description: When David pastes complete benchmark results (TTFT/TPOT/TPS table for a machine + framework + model), validate them and add them to that machine's Stress Test benchmark data and page. Use when David pastes a results table, says "PF_Bench", "加入 benchmark", "把這組數據加進機器", or gives e.g. "Intel B60 壓力測試 Gemma4 31 ...".
---

# PF_Bench — ingest complete benchmark data into a machine's benchmark

Trigger: a paste that has **machine + framework + model + NP × Input rows with TTFT / TPOT / TPS**. Partial or smoke-test data → do not ingest; say what is missing.

## 1. Identify (never guess)
- **Machine** (B60 / B70 / AISO1 / ...): from the paste. Hostnames, container and image names beat `# Machine:` comments — a comment does not move the run to another host (the 2026-11 "AISO1 AMD" vLLM command actually ran on B60).
- **Framework** (SGLang / vLLM / llama.cpp), **model**, **fixed load** (NP / Input / Output / Repeat), **launch params** (TP, Context, Max seqs, Prefill, Memory fraction, Prefix/Radix cache). Mark anything not stated `UNVERIFIED`; never fill defaults (e.g. never label memory 0.90 unless stated).

## 2. Validate
- Check `NP × Output ÷ (TTFT + (Output-1) × TPOT)` against the reported Aggregate TPS. Match within ~2% → fine. Larger gap → keep the reported value, add `consistency_note` on that row, and tell David.
- `decode_tps` field = `aggregate_tps ÷ NP` (Normalized, per request). Do not mix with decode-only values.
- `ttft_over_180s = ttft_s >= 180` (shown red, still Technical PASS).
- Failures: keep the original failed run in `failures`, retries separate (`retry`). Never overwrite, never claim a permanent fix.
- Do not compute cross-machine multipliers unless hardware/framework/quant parity is stated.

## 3. Write data
`AISO_Platform_Portal/data/benchmark-<machine>/AISO_<MACHINE>_<Framework>_<YYYYMMDD>.json`, same schema as `AISO_B60_vLLM_20261103.json` / `AISO_B60_SGLang_20261102.json`: `dataset, evidence_until, note, profile, b60_runs (rename per machine), model_parity, failures, not_run, retry`. Same machine + framework, new model → add rows to the existing file and update `model_parity` / `not_run`.

## 4. Wire into the page
- B60: register the file in `FRAMEWORKS` in `stress-test-b60.js` (framework tab), add model to `ALL_MODELS` if new, bump `?v=` in the html, update the landing label in `stress-test.html` if needed.
- Other machines: add the same pattern (page + js + json + exporter.py asset/copytree).
- The compare page (`stress-test-compare.js`) uses only same-framework parity data; ask David before adding a different framework to it.

## 5. Ship (David's process)
Branch from main → `make export` → `make check` (54 tests) → commit (`Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`) → push → PR. If commit/push is denied, give David the exact command. Show working links and get UI confirmation **before** any merge; David merges.

## 6. Reply format
Every reply ends with: live HOME https://wcsodw1.github.io/AISO_Platform/ + changed pages (curl 200 first; "未上線" before merge), localhost + LAN link (`ipconfig getifaddr en0`, preview `portal` on 8765), PR link, next step. Report what was ingested, what is UNVERIFIED, and any consistency warnings.
