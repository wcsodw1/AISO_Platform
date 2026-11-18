# Benchmark workflow — the full sequence, verified step by step (2026-11-11)

Source: what was actually done on AISO1 (runner code and terminal output David pasted, handoff files, our ingest scripts). Verify one machine at a time: **AISO1 first, then PRO6000**.
Status: ✅ verified with evidence · ⚠️ partly / needs a re-check · ❌ failed or blocked · ○ not verified yet.

| # | Step | What it checks / does | Evidence | AISO1 | PRO6000 |
|---|---|---|---|---|---|
| 0 | Access | SSH key login works from the Mac (BatchMode) | `ssh … hostname` | ✅ via `AISO1-key` (verified 2026-11-11) | ✅ |
| 1 | Identity | right host + right hardware (hostname, CPU/GPU model) | `profile.json` identity: AMD RYZEN AI MAX+ 395, Radeon 8060S | ✅ verified live: AMD RYZEN AI MAX+ 395 w/ Radeon 8060S | ✅ nvidia-smi: RTX PRO 6000 Blackwell ×8 |
| 2 | Idle check | no other GPU workload, no benchmark lock | runner `idle()`, `benchmark_retest_v4.lock` | ⚠️ NOT idle: `AISO1_NP5_smoke.py gemma31` is running (started 20:12, 30-min limit); lock file present | ❌ shared host, 7 of 8 GPUs busy |
| 3 | Preflight | model files + sha256/revision, llama.cpp binary + commit, device, plan.json | `profile.json` 2026-11-10 (hashes match the B70 published parity) | ✅ verified live: version e937b17, Vulkan0 Radeon 8060S, 4 models, errors {}; `AISO1_B1024.py` sha256 fb6d5944… = `code_hash` in profile.json; `public_ranking_ready: false` | ○ |
| 4 | Smoke test | one model, NP1, 4K, one repeat must PASS before the full run | runner `smoke` mode | ✅ NP5 smoke (new, 20:08–20:34): gemma26, gemma31, laguna, nemotron all PASS (`SMOKE_ONLY_NOT_FORMAL`, NP5 4K ×1) | ○ not run (needs approval) |
| 5 | Full run | per model/NP: server with the fixed flags, exact-length prompt, NP concurrent requests × 3 repeats, atomic checkpoint after every repeat | campaign folders, `repeat_N.json`, `checkpoint_manifest.json` | ✅ 36 conditions (NP1/2/4) | ✅ 80 conditions (PDF, VIS method) |
| 6 | Liveness / timeout | a stuck round is noticed; socket timeout large enough | Laguna NP4 16K R2 timed out at 1200 s → `resume7200` fixed | ✅ | ○ |
| 7 | Audit | verified repeats per case (3/3) | `… resume7200.py audit` → 6/6 | ✅ | ○ |
| 8 | Export | per-repeat CSV (TTFT, TPOT, aggregate) + manifest + runner hashes | `np4_repeats_20261111.csv`, handoff 20261111_115737 | ✅ | ⚠️ PDF + raw vis files only |
| 9 | Validate + ingest | hard-stop checks → platform dataset (L3) | `scripts/ingest_aiso1_*.py`, `ingest_pro6000_vis_repeats.py` | ✅ | ✅ (Without TTFT per run; PDF means) |
| 10 | Platform + export | pages show it, `make export` → docs | compare / pair / aiso1 pages | ✅ | ✅ `stress-test-pro6000.html` |
| 11 | Report | conclusions + slide/PDF | slides PDF (earlier) | ⚠️ not refreshed | ○ |

## Verification order
1. **AISO1** — fix step 0 (key), then re-verify steps 1–4 live with the read-only block in the reply; steps 5–10 are already evidenced.
2. **PRO6000** — step 2 (a free GPU), step 4 (smoke test, GPU1 only, needs approval), then steps 6–7 and 11.

## Platform smoke test (2026-11-11, built)
`benchmark/executor.py` (fixed allowlist, SSH alias `AISO1-key`) + Run wizard. Read-only: models (from the newest preflight profile), busy, status/log tail. **Starting** the smoke test (`AISO1_B1024.py smoke`, every model once) is refused while the machine is busy and needs the one-time test-password ticket. Verified with a test server: models API lists the 4 models, status works, a start without the ticket answers 401, a start from the LAN address is refused. The start itself has NOT been pressed. The running server must be restarted once to load the new API (David's `make run` window).

## AISO1 platform smoke test — done 2026-11-11 21:15–21:21
Started from the Run page (password gate), executed through `AISO1-key`: NP1 · 4K · 1 request per model — gemma26 PASS, gemma31 PASS, laguna PASS, nemotron PASS (`SMOKE_STATUS` line in the runner log). Side effect to know: the runner's smoke mode writes into the 11/10 campaign folder — it regenerated `report.html`, `report.md`, `status.json` and wrote `standalone_smoke.json` and four new `load_np1/<stamp>` folders there; `profile.json`, `progress_manifest.json` (measured conditions) and the per-condition result folders were not touched. Platform datasets are built from the handoff CSVs, so they are unaffected.
