# Benchmark data gaps — what is still missing (tracking list)

Kept up to date by Claude every session. David's standing request (2026-11-11): the "只缺 AISO1" panel is removed from the pages; gaps are tracked here instead, and Claude asks **"AISO1 補測到哪？"** at the start of every task.

_Last updated: 2026-11-13 (David answered "AISO1 補測到哪？")_

## AISO1 retest status (David's answer, 2026-11-13)
- **NP5 on AISO1 does not run — and there are no numeric values for it.** The earlier note "AISO1 is busy with the NP5 retest" is superseded: nothing is running on AISO1 for NP5, and no result exists or is expected.
- Platform consequence: AISO1 NP5 stays **omitted** (no value, no estimate). The only NP5 points on the platform are the two partial ones already recorded (Gemma26 NP5 4K PASS, Gemma31 NP5 4K partial), kept as-is. In the Build Your Own System page an AISO1 NP5 cell with no data is shown as "—" (not tested) and is never estimated; the page only uses measured cells.
- AISO1 gap list now: **none open for NP 1/2/4** (Gemma26, Gemma31, Laguna, Nemotron × 4K/8K/16K); NP5 = cannot run / no data (closed by decision, not "pending").
- Display rule (David 2026-11-13: "aiso1 np5 確定測過沒數字的補上"): **Overload 超負載** (red) only where an NP5 run was really attempted and gave no numbers; checked against the 2026-11-11 handoff CSV (`Buffer/Benchmark/AISO1_evidence/.../aiso1_platform_cases.csv`): Gemma26 NP5 8K (1/3 valid repeats, DEFERRED) and 16K (0/3, DEFERRED). Gemma26 NP5 4K = PASS (kept) and Gemma31 NP5 4K = PARTIAL_PASS (2/3, kept as partial). The other NP5 cases (Gemma31 8K/16K, Laguna ×3, Nemotron ×3) are PENDING in the CSV = never run, so they show **未測 Not tested**, not overload. Done on `stress-test-aiso1.html` and in the Build Your Own System Speed overlay (const `AISO1_NP5_OVERLOAD`). Still to do: the compare pages (`stress-test-compare.js` still omits AISO1 NP5 silently via `OMIT`).
- Other AISO1 gaps unchanged: vLLM only Gemma31 NP2 (2026-10-15, unverified); SGLang none run.

## AISO1 llama.cpp B1024 (campaign still running)
- On the platform: Gemma26 NP1/2/4, Gemma31 NP1/2/4, Laguna NP1/2, Nemotron NP1/2 (all with TTFT/TPOT/Aggregate). Laguna and Nemotron NP1/2 came in with handoff 20261111_115737 (the "fastlane" run).
- **Still missing:** Laguna NP4 (4K/8K/16K), Nemotron NP4 (4K/8K/16K).
- **IN PROGRESS (2026-11-11 14:44):** `AISO1_NP4_only.py` (Laguna then Nemotron, NP4 × 4K/8K/16K) running, campaign `AISO1_llamacpp_B1024_NP4_20261111_144405`; first result Laguna NP4 4K R1 PASS agg 26.71. Log lines look like `RUN: laguna NP4 4096 R 1` / `RESULT: PASS AGG: …` (a new format for the progress parser).
- **RESUMED (2026-11-11 ~17:18, per David's pasted AISO1 terminal; platform data not changed yet):** `AISO1_NP4_resume7200.py` (socket timeout raised to 7200 s; the earlier timeout-001 R2 is superseded). `audit`: Laguna NP4 4K R1–3 and 8K R1–3 verified; 16K R1 (legacy 1200 s timeout) and R2 (7200 s) both PASS 4/4, **R3 still running** (prompt processing at ~16 tok/s, 16K); Nemotron NP4 4K/8K/16K not started (NP4_VERIFIED_COMPLETE_CASES 2/6). Needs a new handoff after Laguna 16K R3 and again after Nemotron. NP5 stays on hold (closed 2026-11-13: cannot run, no data).
- **DONE (2026-11-11 evening, per-repeat CSV from AISO1, L0 `Buffer/Benchmark/AISO1_evidence/np4_repeats_20261111.csv`):** AISO1 NP4 complete for Laguna and Nemotron (4K/8K/16K × 3 repeats, with TTFT/TPOT) — all 6 cases on the platform via `scripts/ingest_aiso1_np4_repeats.py`. NP4 appears in AISO1 v.s B70 only (B60 has no NP4). NP5 stays omitted. Remaining AISO1 gap: none in the NP 1/2/4 matrix except Gemma31 NP5 partial; new handoff only needed if more runs are added. Audit 2026-11-11: `NP4_VERIFIED_COMPLETE_CASES 6/6`. AISO1 launch profile verified and recorded (model repo/revision/sha256 match the B70 published parity; llama.cpp commit e937b17, Vulkan0 Radeon 8060S RADV GFX1151) via `scripts/annotate_aiso1_profile.py`.
- (history) STOPPED / UNSOLVED 2026-11-11 17:01, AISO1-NP4-TIMEOUT-001: Laguna NP4 Input16384 R2 had only 3/4 requests succeed at the 1200 s client timeout; debug copy saved on AISO1.
- **Omitted by decision (2026-11-11):** NP5 cannot run on AISO1 (Gemma26 NP5 4K PASS and Gemma31 NP5 4K partial exist and are kept as-is).
- Per-repeat values: `scripts/ingest_aiso1_repeats.py <aiso1_repeats.csv>` (run it AFTER `ingest_aiso1_handoff.py`, which rewrites the dataset). Received 2026-11-11 13:5x (sha256 ccaee0b8…), 31/31 conditions, means match the platform within 0.001.
- Status 13:44: handoff 20261111_134440 still 31/48 (no new conditions). NP4 TTFT is huge (Gemma26 600–990 s, Gemma31 2600–3200 s: queueing) — real values, flagged red >180 s.
- Needs from David: new handoff (aiso1_platform_cases.csv with TTFT/TPOT) after each batch; final runner + manifest when the campaign ends.

## PRO6000 (added 2026-11-11)
- On the platform: `data/benchmark-pro6000/AISO_PRO6000_vLLM_VIS_20260825.json` — GPT-OSS-120B (NP 1/2/4/8/16/32) and Llama-3.3-70B (NP 16/32), Input 1K–16K, Output 1K/2K, each with Without aiDAPTIV / Cold / Warm. Page: `stress-test-pro6000.html` (single machine; NOT in the 3-machine compare, different models and method). Registry key `single_machines`.
- Source: the two 2026-08-25 PDF reports (120B tables are PDF text, cross-checked normalized x NP = aggregate on all 60 cells; Llama tables were read from chart images, cross-checked against the printed normalized values).
- **Added 2026-11-11:** per-run Without TTFT (3 runs per condition, 80 conditions) from the PRO6000 raw `vis_*.txt` files (L0 `Buffer/Benchmark/PRO6000_evidence/`, `scripts/ingest_pro6000_vis_repeats.py`); the mean of the 3 runs reproduces the PDF within 0.6 %. Throughput in those files is a different metric (per-request decode rate) and is NOT used. Also on the host: Llama `vis_20260812_041214.txt` is a different scenario (NP50 / NP100, Input 1K–16K) — not imported.
- **Host state (2026-11-11 read-only):** GPU1 idle (96 GB free), GPU0 62 GB used / 0 % util, GPU2–7 busy with other services (vLLM Laguna-S-2.1 NVFP4, trinity-large-thinking, llama-server, ollama, orientai) → a 4-GPU run is not possible now; a 1-GPU run on GPU1 is.
- **Found 2026-11-11 (read-only, container image check):** the PRO6000 aiDAPTIV image `aidaptiv:vNXUN_3_03_AA` runs **vLLM 0.12.0**; server flags are in `general/configs/models.yaml` + `modes.yaml` (Without aiDAPTIV = `--disable-kv-cache-offload`; max-model-len 20000, gpu-memory-utilization 0.85, TP 1 for GPT-OSS-20B, TP 4 for 70B/120B). Still not stored on the platform dataset (needs a handoff from the formal runs).
- **PRO6000 smoke runner built (2026-11-11, not run yet):** `benchmark/runners/pro6000_platform_smoke.py` + manifest; GPU 1 only, refuses when GPU 1 is not free; starts only from the Run page after the test password.
- **Missing:** Llama-3.3-70B NP1–8; per-request raw values (PDF has means only); runtime/version, model files, launch flags (max-model-len, TP, batch) not in the PDFs; no llama.cpp run in the AISO1 protocol (NP 1/2/4 x 4K/8K/16K x Output 1024 x 3 repeats, Gemma/Laguna/Nemotron) — host is shared and busy (GPUs 4-7 in use).
- **Decision (David 2026-11-11):** NVIDIA is the reference machine; once PRO6000 has comparable data it becomes the baseline instead of AISO1.

## AISO1 other frameworks
- **AISO1 DID run vLLM (ROCm, Docker) — corrected 2026-11-13** (an earlier answer wrongly said "no vLLM"). Evidence found by searching other sessions (not yet re-read from the raw CSVs; NOT imported as numbers):
  - 2026-10-15, David's pasted terminal: **Gemma26** `Gemma26/summary_np2.csv` — NP2, Input 4096/8192, Output 1024, 3 repeats each (formal result, not a smoke test). Platform dataset still says Gemma26 "no data" → needs the CSV.
  - 2026-11-09 inventory: **Gemma31**, campaign `aiso1_safetensors_q4_3models_np24_20261015_160128`, NP2, Input 4096/8192/16384, 3 repeats (9 results; 32K only 1/3). This is what the platform already holds (`AISO_AISO1_vLLM_20261015.json`, historical_unverified).
  - 2026-10-16 launch log: Gemma31 loaded `/models/Gemma-4-31B-Google-W4A16` (compressed-tensors W4A16) — a weight clue, but not proven to be the same launch as the results above.
  - Old records mention context 69632 and batched tokens 8192; a later request set a 4096 baseline → these versions must be separated before comparing.
  - Status: "has historical vLLM results; qualification for the cross-framework compare still to verify" — not "no vLLM", and not "all four models done" (Laguna / Nemotron: no evidence). Do not conclude "fair" just because both are ≈4-bit.
  - Needed from David / the AISO1 session: `Gemma26/summary_np2.csv`, the 10/15 launch command (model path, max-model-len, batched tokens, TP) for each run.
- SGLang on AISO1: none run.

## B70
- Flash Attention not in the launch command → unverified.
- vLLM / SGLang were run at context 69632 (before 10/27, B70 inferred from dates); not re-run at 18432 → not comparable with B60 / AISO1.
- TPOT is the server-reported value (AISO1 / B60: client-side) → different definition.
- Intel RunnerManifest B70 (tar in Buffer/Benchmark/B60_evidence) not yet imported.
- 2026-11-11 14:00: host stopped for a card swap + RAM to 256 GB → record RAM as a parameter for any later run.

## B60
- Legacy campaign batch 4096 (cannot be re-run, hardware returned) → never "identical" to the B1024 machines.
- Flash Attention unknown; vLLM image tag unknown (sha only).

## Platform / data hygiene
- B60 SGLang public JSON line ~622 contains an internal path (`/home/sparkle/b60_benchmark/...log`) — remove? (asked David, no answer yet)
- Questions drafted for the ChatGPT session (vLLM/SGLang details for B70 and AISO1) — answers pending.
- Branch `feat/benchmark-terminal` not merged to main (live site lacks Terminal, Debugging panel, B1024 data, parameter tables, collapsible sections).

## PRO6000 llama.cpp (found 2026-11-12, read-only look at the host)
- A llama.cpp **CUDA** docker image is on the host (`ghcr.io/ggml-org/llama.cpp:server-cuda`, built 2026-06-30; `local/llama.cpp:server-cuda-pinned`, 2026-08-14). The `~/orientai/.../llama/` build is CPU + Vulkan only (0.4.0-dev), not usable for a fair CUDA run.
- Comparison models are **not** on the host as GGUF: Gemma26 Q4_0, Gemma31 Q4_0, Laguna Q4_K_M, Nemotron UD-Q4_K_M. Present: Gemma-4-26B-A4B **BF16** GGUF (48 GB), Mistral, GLM, Step, Devstral. BF16 HF folders for Gemma31 / Laguna / Nemotron exist but are not GGUF.
- Version differs from AISO1 (0.6.0-dev e937b17): the image is not pinned to that commit.
- Platform: smoke test only, with the Gemma26 BF16 GGUF already on the host (GPU 1 only, own folder `~/aiso_platform_runs_llamacpp`, nothing downloaded). Not comparable with AISO1 / B70 / B60 results.
- Needed for a formal, comparable run: (1) download the four GGUFs (about 14 + 18 + 20 + 25 GB at the AISO1 sizes) onto `/mnt/nvme0` (4.4 TB free) - **David decides**; (2) pin the llama.cpp commit used on AISO1.
