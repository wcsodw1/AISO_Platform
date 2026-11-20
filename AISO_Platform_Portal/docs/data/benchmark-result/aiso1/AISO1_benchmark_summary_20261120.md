# AISO1 Benchmark · everything measured (backup summary)

*Generated 2026-11-20 from the platform's published datasets (`data/benchmark-*`, copied to `raw_backup/dataset_json/`) and the evidence files found under Desktop/TPISoftware. Nothing is estimated; a blank means the source has no value.*

## 1. What this is
A hand-over document for **AISO1 - AMD Ryzen AI Max+ 395, Radeon 8060S iGPU, 128 GB unified memory (GPU 64 GB / system about 64 GB)**: what was tested, with which settings, the numbers, the observations, what was not run, and where the evidence is. The same data is in the sheet next to this file (`AISO1_benchmark_all_cases_20261120.xlsx` / `.csv`). The preflight data (manifests, runners, sha256 checks) is in `../Preflight/`.

## 2. Datasets
| Dataset file | Framework | Evidence until | Comparability | Cases PASS / rows | Models |
|---|---|---|---|---|---|
| AISO_AISO1_llamacpp_B1024_20261111.json | llama.cpp | 2026-11-11 | retest_unverified | 37 / 40 | Gemma26, Gemma31, Laguna, Nemotron |
| AISO_AISO1_llamacpp_KVcache_B1024.json | llama.cpp (Vulkan) | — | — | 39 / 39 | gemma26, gemma31, laguna, nemotron |
| AISO_AISO1_llamacpp_V4retest_20261109.json | llama.cpp | 2026-11-09 | retest_unverified | 48 / 48 | Gemma26, Gemma31, Laguna, Nemotron |
| AISO_AISO1_vLLM_20261015.json | vLLM ROCm | 2026-10-15 | historical_unverified | 0 / 4 | Gemma31 |
| aiso1_optimization_plan.json | — | — | — | 0 / 0 | — |

### Machine, runtime and protocol (from each dataset's profile)
- **AISO_AISO1_llamacpp_B1024_20261111.json**: machine = AISO1 AMD (Radeon 8060S · 128 GB UMA: GPU 64 GB / system ~64 GB); framework = llama.cpp; runtime = llama.cpp 0.6.0-dev (build 1, commit e937b17) · Vulkan0 · Radeon 8060S (RADV GFX1151, 97499 MiB); np = [1, 2, 4, 5]; input_tokens = [4096, 8192, 16384]; output_tokens = 1024; repeat = 3; gpu_count = 1; slots = 10; per_slot_context = 18432; batch = 1024; ubatch = 512; kv_cache_type = f16; backend = Vulkan; split = layer
  - note: AISO1 llama.cpp B1024（batch 1024 統一參數）：36 / 48 條件有數值（TTFT／TPOT／Aggregate／Normalized 皆有），交接包 20261111_115737；Runner 仍在執行，Laguna、Nemotron 尚未全部完成；NP5 跑不動，已省略（不列為缺口）。 NP4（Laguna、Nemotron 各 3 個 Input × 3 次）取自 AISO1 的逐次結果檔，含 TTFT／TPOT。
  - comparability: Partial data; not equivalent to V4；驗證：CSV/raw/repeat/basic KPI checks; provenance pending。參數：Batch 1024 / Ubatch 512 / Context 18432 每 slot / KV f16 / Flash Attention off。數值明顯低於 2026-11-09 重測，原因未查明（Gemma31 NP4 在原 log 標為 very slow／outlier，保留原值）。
- **AISO_AISO1_llamacpp_KVcache_B1024.json**: (no profile in the source)
- **AISO_AISO1_llamacpp_V4retest_20261109.json**: machine = AISO1 AMD (Radeon 8060S · 128 GB UMA: GPU 64 GB / system ~64 GB); framework = llama.cpp; runtime = llama.cpp b11561 e937b17 Vulkan; np = [1, 2, 4, 5]; input_tokens = [4096, 8192, 16384]; output_tokens = 1024; repeat = 3
  - note: AISO1 llama.cpp 重測：4 模型 × NP1/2/5 × 4K/8K/16K × 3 次重複，36/36 PASS（288 個請求，原始資料重新驗證 PASS）；另補測 NP4 共 12 組 12/12 PASS（144 個請求）。NP1/2/5 有完整 TTFT／TPOT／Aggregate；NP4 目前只有終端機輸出的 Aggregate（3 次平均），TTFT／TPOT 待該次 summary。
  - comparability: AISO1 llama.cpp 為 2026-11-09 重測（b11561，與 B60 V4 同版本，4 個 GGUF 皆 SHA 驗證通過）。輸出格式、驗證函式與案例矩陣和 B60 V4 腳本一致，且每個 NP 重啟伺服器、36 組原始資料已重新驗證（ORIGINAL_36_RAW_VERIFIED=PASS）；但測試程式原始碼與伺服器啟動參數（Context／Slots／Batch）尚未逐項比對，NP4 的 TTFT／TPOT 尚缺，因此仍標為待核實。
- **AISO_AISO1_vLLM_20261015.json**: machine = AMD Ryzen AI MAX+ 395 (Radeon 8060S iGPU); framework = vLLM ROCm; runtime = UNVERIFIED; np = [2]; input_tokens = [4096, 8192, 16384]; output_tokens = 1024; repeat = 3
  - note: AISO1 (AMD Ryzen AI MAX+ 395) vLLM ROCm HISTORICAL DIAGNOSTIC run 20261015_160128, Gemma31 NP2 only. 4K/8K/16K each 3/3 repeats, 6/6 requests. Source: AISO_Platform_B70_AISO1_20261030_Handoff.xlsx sheet AISO1_ROCm_History. Model repo/SHA, TP, batch, memory and cache settings are UNVERIFIED. The 32K case has only 1 repeat (GPU reset) and is kept in partial_runs, not in aiso1_runs.
  - comparability: AISO1 為 ROCm 歷史診斷（2026-10-15）；模型 Repo／SHA、TP、Context、Batch、Memory、Cache 皆未核實；32K 只有 1 次重複（GPU reset），64K 無完整 PASS。僅供參考，不能下排名。
- **aiso1_optimization_plan.json**: (no profile in the source)

## 3. Results
*Values are the source dataset's own means (repeats are in the sheet). Blank = no value in the source.*

### 3.1 AISO_AISO1_llamacpp_B1024_20261111.json

**Aggregate TPS (tok/s)**

| Model | NP | 4096 | 8192 | 16384 |
|---|---|---|---|---|
| Gemma26 | 1 | 25.7 | 15.2 | 10.6 |
| Gemma26 | 2 | 14.3 | 11.9 | 9.1 |
| Gemma26 | 4 | 9.4 | 5.9 | 7.5 |
| Gemma26 | 5 | 8.7 | — | — |
| Gemma31 | 1 | 5.4 | 3.0 | 2.4 |
| Gemma31 | 2 | 3.8 | 3.0 | 2.2 |
| Gemma31 | 4 | 2.3 | 1.7 | 1.1 |
| Laguna | 1 | 29.4 | 20.9 | 13.2 |
| Laguna | 2 | 20.8 | 14.2 | 8.3 |
| Laguna | 4 | 18.9 | 6.5 | 3.3 |
| Nemotron | 1 | 49.0 | 40.8 | 30.0 |
| Nemotron | 2 | 56.5 | 40.6 | 21.0 |
| Nemotron | 4 | 60.2 | 34.7 | 10.5 |

**TTFT (s)**

| Model | NP | 4096 | 8192 | 16384 |
|---|---|---|---|---|
| Gemma26 | 1 | 6.79 | 11.86 | 24.74 |
| Gemma26 | 2 | 17.99 | 31.21 | 55.85 |
| Gemma26 | 4 | 598.38 | 986.75 | 217.12 |
| Gemma26 | 5 | 1144.30 | — | — |
| Gemma31 | 1 | 29.67 | 53.72 | 111.40 |
| Gemma31 | 2 | 78.41 | 129.56 | 260.38 |
| Gemma31 | 4 | 2608.49 | 3225.45 | 3099.33 |
| Laguna | 1 | 7.29 | 15.37 | 34.24 |
| Laguna | 2 | 16.52 | 37.20 | 83.71 |
| Laguna | 4 | 129.01 | 509.91 | 993.06 |
| Nemotron | 1 | 2.69 | 5.73 | 12.74 |
| Nemotron | 2 | 5.75 | 12.63 | 39.76 |
| Nemotron | 4 | 13.91 | 37.65 | 255.04 |

**TPOT (ms/token)**

| Model | NP | 4096 | 8192 | 16384 |
|---|---|---|---|---|
| Gemma26 | 1 | 32.3 | 54.2 | 69.9 |
| Gemma26 | 2 | 122.0 | 137.9 | 164.5 |
| Gemma26 | 4 | 382.9 | 551.1 | 357.5 |
| Gemma26 | 5 | 787.8 | — | — |
| Gemma31 | 1 | 157.1 | 277.0 | 307.0 |
| Gemma31 | 2 | 459.4 | 538.9 | 643.5 |
| Gemma31 | 4 | 1473.7 | 1696.5 | 2459.9 |
| Laguna | 1 | 26.9 | 32.8 | 42.4 |
| Laguna | 2 | 79.9 | 104.1 | 159.1 |
| Laguna | 4 | 105.9 | 135.6 | 572.7 |
| Nemotron | 1 | 17.8 | 19.0 | 21.0 |
| Nemotron | 2 | 29.8 | 36.9 | 56.5 |
| Nemotron | 4 | 52.8 | 78.4 | 188.5 |

### 3.2 AISO_AISO1_llamacpp_KVcache_B1024.json

**Aggregate TPS (tok/s)**

| Model | NP | 4096 | 8192 | 16384 |
|---|---|---|---|---|
| gemma26 / bf16 | 1 | 20.3 | 11.6 | 9.5 |
| gemma26 / f16 | 1 | 25.7 | 15.0 | 10.7 |
| gemma26 / f16 | 8 | 71.8 | 49.2 | 29.2 |
| gemma26 / f32 | 1 | 15.5 | 9.4 | 7.8 |
| gemma31 / bf16 | 1 | 4.2 | 2.7 | 2.2 |
| gemma31 / f16 | 1 | 5.4 | 3.1 | 2.5 |
| gemma31 / f32 | 1 | 2.7 | 2.0 | 1.8 |
| laguna / bf16 | 1 | 22.1 | 16.4 | 10.2 |
| laguna / f16 | 1 | 29.5 | 21.0 | 13.2 |
| laguna / f32 | 1 | 15.5 | 11.6 | 7.9 |
| nemotron / bf16 | 1 | 49.6 | 41.2 | 29.3 |
| nemotron / f16 | 1 | 50.0 | 40.7 | 30.1 |
| nemotron / f32 | 1 | 47.3 | 39.3 | 28.1 |

**TTFT (s)**

| Model | NP | 4096 | 8192 | 16384 |
|---|---|---|---|---|
| gemma26 / bf16 | 1 | 7.31 | 13.30 | 29.95 |
| gemma26 / f16 | 1 | 6.76 | 12.00 | 24.56 |
| gemma26 / f16 | 8 | 20.03 | 42.89 | 98.41 |
| gemma26 / f32 | 1 | 7.02 | 12.10 | 25.23 |
| gemma31 / bf16 | 1 | 31.20 | 57.86 | 129.58 |
| gemma31 / f16 | 1 | 30.22 | 54.04 | 108.28 |
| gemma31 / f32 | 1 | 33.65 | 58.64 | 117.31 |
| laguna / bf16 | 1 | 8.33 | 18.84 | 44.19 |
| laguna / f16 | 1 | 7.32 | 15.40 | 34.35 |
| laguna / f32 | 1 | 7.44 | 15.60 | 34.86 |
| nemotron / bf16 | 1 | 2.81 | 6.02 | 14.02 |
| nemotron / f16 | 1 | 2.68 | 5.71 | 12.71 |
| nemotron / f32 | 1 | 2.77 | 5.73 | 12.70 |

**TPOT (ms/token)**

| Model | NP | 4096 | 8192 | 16384 |
|---|---|---|---|---|
| gemma26 / bf16 | 1 | 42.0 | 73.1 | 76.5 |
| gemma26 / f16 | 1 | 32.4 | 54.9 | 69.7 |
| gemma26 / f16 | 8 | 91.8 | 119.5 | 175.1 |
| gemma26 / f32 | 1 | 57.7 | 95.2 | 104.2 |
| gemma31 / bf16 | 1 | 207.1 | 313.9 | 335.5 |
| gemma31 / f16 | 1 | 157.0 | 274.8 | 291.8 |
| gemma31 / f32 | 1 | 334.7 | 445.2 | 445.2 |
| laguna / bf16 | 1 | 37.1 | 42.7 | 54.9 |
| laguna / f16 | 1 | 26.8 | 32.7 | 42.1 |
| laguna / f32 | 1 | 57.3 | 70.7 | 92.4 |
| nemotron / bf16 | 1 | 17.4 | 18.4 | 20.4 |
| nemotron / f16 | 1 | 17.4 | 19.0 | 20.8 |
| nemotron / f32 | 1 | 18.5 | 19.9 | 23.2 |

### 3.3 AISO_AISO1_llamacpp_V4retest_20261109.json

**Aggregate TPS (tok/s)**

| Model | NP | 4096 | 8192 | 16384 |
|---|---|---|---|---|
| Gemma26 | 1 | 51.0 | 41.6 | 30.6 |
| Gemma26 | 2 | 63.2 | 52.0 | 36.5 |
| Gemma26 | 4 | 75.9 | 57.0 | 37.9 |
| Gemma26 | 5 | 72.9 | 55.3 | 36.4 |
| Gemma31 | 1 | 9.3 | 7.9 | 5.9 |
| Gemma31 | 2 | 14.5 | 11.4 | 7.5 |
| Gemma31 | 4 | 19.2 | 13.3 | 7.4 |
| Gemma31 | 5 | 19.6 | 13.2 | 7.5 |
| Laguna | 1 | 63.9 | 47.3 | 24.5 |
| Laguna | 2 | 80.9 | 54.8 | 25.1 |
| Laguna | 4 | 89.4 | 55.9 | 23.5 |
| Laguna | 5 | 93.0 | 53.6 | 21.2 |
| Nemotron | 1 | 51.4 | 44.7 | 35.4 |
| Nemotron | 2 | 69.0 | 57.6 | 42.2 |
| Nemotron | 4 | 84.8 | 66.8 | 45.9 |
| Nemotron | 5 | 88.4 | 68.4 | 46.4 |

**TTFT (s)**

| Model | NP | 4096 | 8192 | 16384 |
|---|---|---|---|---|
| Gemma26 | 1 | 2.78 | 5.82 | 13.17 |
| Gemma26 | 2 | 5.79 | 12.12 | 24.59 |
| Gemma26 | 4 | — | — | — |
| Gemma26 | 5 | 15.30 | 27.74 | 50.87 |
| Gemma31 | 1 | 13.70 | 29.12 | 66.79 |
| Gemma31 | 2 | 27.75 | 57.89 | 123.76 |
| Gemma31 | 4 | — | — | — |
| Gemma31 | 5 | 65.47 | 125.31 | 272.54 |
| Laguna | 1 | 3.31 | 7.97 | 26.78 |
| Laguna | 2 | 6.83 | 16.46 | 49.74 |
| Laguna | 4 | — | — | — |
| Laguna | 5 | 17.14 | 42.51 | 122.58 |
| Nemotron | 1 | 2.59 | 5.30 | 11.10 |
| Nemotron | 2 | 5.37 | 10.84 | 20.15 |
| Nemotron | 4 | — | — | — |
| Nemotron | 5 | 12.38 | 22.42 | 43.27 |

**TPOT (ms/token)**

| Model | NP | 4096 | 8192 | 16384 |
|---|---|---|---|---|
| Gemma26 | 1 | 16.9 | 18.4 | 19.8 |
| Gemma26 | 2 | 26.0 | 26.6 | 30.8 |
| Gemma26 | 4 | — | — | — |
| Gemma26 | 5 | 53.7 | 63.2 | 87.4 |
| Gemma31 | 1 | 93.8 | 98.8 | 103.2 |
| Gemma31 | 2 | 110.8 | 118.4 | 147.3 |
| Gemma31 | 4 | — | — | — |
| Gemma31 | 5 | 191.1 | 255.3 | 401.5 |
| Laguna | 1 | 12.4 | 13.4 | 14.7 |
| Laguna | 2 | 18.1 | 20.5 | 31.3 |
| Laguna | 4 | — | — | — |
| Laguna | 5 | 37.0 | 51.7 | 116.6 |
| Nemotron | 1 | 17.0 | 17.2 | 17.4 |
| Nemotron | 2 | 23.8 | 24.1 | 27.7 |
| Nemotron | 4 | — | — | — |
| Nemotron | 5 | 44.5 | 51.2 | 65.3 |

## 4. Observations (computed from the numbers above)
- **AISO_AISO1_llamacpp_B1024_20261111.json**: highest aggregate TPS 60.2 tok/s (Nemotron, NP4, input 4096); lowest 1.1 tok/s (Gemma31, NP4, input 16384); mean aggregate TPS by model: Nemotron 38.1; Laguna 15.1; Gemma26 11.8; Gemma31 2.8; 11 case(s) with TTFT over 180 s.
- **AISO_AISO1_llamacpp_KVcache_B1024.json**: highest aggregate TPS 71.8 tok/s (gemma26 / f16, NP8, input 4096); lowest 1.8 tok/s (gemma31 / f32, NP1, input 16384); mean aggregate TPS by model: nemotron / f16 40.3; nemotron / bf16 40.1; nemotron / f32 38.2; gemma26 / f16 33.6; laguna / f16 21.2; laguna / bf16 16.2; gemma26 / bf16 13.8; laguna / f32 11.7; gemma26 / f32 10.9; gemma31 / f16 3.6; gemma31 / bf16 3.0; gemma31 / f32 2.2.
- **AISO_AISO1_llamacpp_V4retest_20261109.json**: highest aggregate TPS 93.0 tok/s (Laguna, NP5, input 4096); lowest 5.9 tok/s (Gemma31, NP1, input 16384); mean aggregate TPS by model: Nemotron 58.4; Laguna 52.8; Gemma26 50.9; Gemma31 11.4; 1 case(s) with TTFT over 180 s.

## 5. Runs that did not finish, partial and not run
| Dataset | Kind | Detail |
|---|---|---|
| AISO_AISO1_llamacpp_B1024_20261111.json | partial | model=Gemma26; np=5; input=8192; valid_repeats=1; status=DEFERRED |
| AISO_AISO1_llamacpp_B1024_20261111.json | partial | model=Gemma26; np=5; input=16384; valid_repeats=0; status=DEFERRED |
| AISO_AISO1_llamacpp_B1024_20261111.json | partial | model=Gemma31; np=5; input=4096; valid_repeats=2; status=PARTIAL_PASS |
| AISO_AISO1_llamacpp_B1024_20261111.json | not_run | model=Gemma31; reason=待測（Runner 執行中）; conditions=2 |
| AISO_AISO1_vLLM_20261015.json | partial | model=Gemma31; np=2; input=32768; repeat_observed=1; repeat_target=3; ttft_s=791.167378; tpot_ms=478.964708; aggregate_tps=1.598073; status=PARTIAL_ONLY_1_REPEAT; note=GPU reset / 中斷，不能標 PASS |
| AISO_AISO1_vLLM_20261015.json | not_run | model=Gemma26; reason=無資料 |
| AISO_AISO1_vLLM_20261015.json | not_run | model=Laguna; reason=無資料 |
| AISO_AISO1_vLLM_20261015.json | not_run | model=Nemotron; reason=無資料 |

7 case row(s) are not PASS (statuses: DEFERRED, HISTORICAL_PASS, PARTIAL_ONLY_1_REPEAT, PARTIAL_PASS); see the Cases sheet.

## 6. Gaps and cautions
- Some KV-cache cases are partial or deferred (see section 5); the hand-over zips record 31 complete of 48 expected cases at that time.
- The AISO1 KV cache dataset is a separate campaign (KV types, NP 1/2/4/8).
- Every case is a single recorded value or the source's own mean; see each dataset's profile for the number of repeats.

## 7. Where the data is (this folder = `AMD/AISO1/benchmark_Result/`)
| Path | Content |
|---|---|
| `AISO1_benchmark_summary_20261120.md` | this file |
| `AISO1_benchmark_all_cases_20261120.xlsx` | sheets: README, Datasets, Cases, Summary, Model_parity, Config_by_model, Not_run_partial, Evidence_files |
| `AISO1_benchmark_all_cases_20261120.csv` | the Cases sheet as CSV |
| `raw_backup/dataset_json/` | the platform datasets this was built from |
| `raw_backup/evidence/` | the evidence files found under TPISoftware (copies; the originals were not moved) |
| `reports/` | published reports, where one exists |
| `../Preflight/` | manifests, runners and the sha256 comparison |

