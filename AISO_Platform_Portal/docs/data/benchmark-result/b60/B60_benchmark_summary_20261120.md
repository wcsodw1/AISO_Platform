# B60 Benchmark · everything measured (backup summary)

*Generated 2026-11-20 from the platform's published datasets (`data/benchmark-*`, copied to `raw_backup/dataset_json/`) and the evidence files found under Desktop/TPISoftware. Nothing is estimated; a blank means the source has no value.*

## 1. What this is
A hand-over document for **Intel Arc Pro B60 - 4 cards, 96 GB in total (48 GB x 2 layout), as stated in the datasets**: what was tested, with which settings, the numbers, the observations, what was not run, and where the evidence is. The same data is in the sheet next to this file (`B60_benchmark_all_cases_20261120.xlsx` / `.csv`). The preflight data (manifests, runners, sha256 checks) is in `../Preflight/`.

## 2. Datasets
| Dataset file | Framework | Evidence until | Comparability | Cases PASS / rows | Models |
|---|---|---|---|---|---|
| AISO_B60_SGLang_V4_20261105.json | SGLang XPU | 2026-11-05 | — | 18 / 18 | Gemma31, Laguna |
| AISO_B60_llamacpp_V4_20261105.json | llama.cpp | 2026-11-19 | — | 48 / 48 | Gemma26, Gemma31, Laguna, Nemotron |
| AISO_B60_vLLM_V4_20261105.json | vLLM XPU | 2026-11-05 | — | 18 / 18 | Gemma31, Laguna |

### Machine, runtime and protocol (from each dataset's profile)
- **AISO_B60_SGLang_V4_20261105.json**: machine = 4× Intel B60; framework = SGLang XPU; runtime = lmsysorg/sglang:v0.5.22-xpu (Docker image sha256:a66de2a4b337…); np = [1, 2, 5]; input_tokens = [4096, 8192, 16384]; output_tokens = 1024; repeat = 3; gpu_count = 4; vram_total_gb = 96; vram_layout = 48 GB x 2; context_length = 18432; tp = 2
  - note: Intel B60 SGLang XPU, V4 protocol (v4-pdf-e2e), campaign B60_matrix_v4_20261104_201559_715039. Gemma31 + Laguna 9/9 PASS each; Gemma26 SKIP_SOURCE; Nemotron STARTUP_FAIL. Values from the terminal report.md (3 decimals). Supersedes the historical 2026-11-02 run values; the older failure/retry record is kept.
- **AISO_B60_llamacpp_V4_20261105.json**: machine = 4× Intel B60; framework = llama.cpp; runtime = llama.cpp commit e937b17a2 (build 11561) · SYCL (Docker image sha256:f457e95a4735…); np = [1, 2, 4, 5]; input_tokens = [4096, 8192, 16384]; output_tokens = 1024; repeat = 3; gpu_count = 4; vram_total_gb = 96; vram_layout = 48 GB x 2; context_length = 18432; slots = 10; per_slot_context = 18432; batch = 4096; ubatch = 512; kv_cache_type = f16; backend = SYCL; split = layer (tensor-split 1,1)
  - note: Intel B60 llama.cpp, V4 protocol (v4-pdf-e2e), campaign B60_matrix_v4_20261104_201559_715039. All four models 9/9 PASS (36/36). Run was interrupted once (terminal showed ^\Quit, likely a manual Ctrl+\; not confirmed) during Gemma31 NP1/8192 and resumed from saved results. 2026-11-19 補 NP4（B60_llamacpp_B1024_NP4_REBUILD_20261118_R3）：4 模型 × 4K/8K/16K × 3 次 = 12/12 PASS，batch 1024、Flash Attention off、重建環境（NEW_ENVIRONMENT_NOT_V4_PARITY）。
- **AISO_B60_vLLM_V4_20261105.json**: machine = 4× Intel B60; framework = vLLM XPU; runtime = vLLM XPU (Docker image sha256:95ac815038c4…); np = [1, 2, 5]; input_tokens = [4096, 8192, 16384]; output_tokens = 1024; repeat = 3; gpu_count = 4; vram_total_gb = 96; vram_layout = 48 GB x 2; context_length = 18432; tp = 2
  - note: Intel B60 vLLM (XPU), V4 protocol (v4-pdf-e2e), campaign B60_matrix_v4_20261104_201559_715039. Gemma31 + Laguna 9/9 PASS each; Gemma26 SKIP_SOURCE; Nemotron STARTUP_FAIL. Values from the terminal report.md (3 decimals). Supersedes the 2026-11-04 historical values. Earlier note: a command labelled 'AISO1 AMD' ran on this B60 host, no AISO1 data is included.

## 3. Results
*Values are the source dataset's own means (repeats are in the sheet). Blank = no value in the source.*

### 3.1 AISO_B60_SGLang_V4_20261105.json

**Aggregate TPS (tok/s)**

| Model | NP | 4096 | 8192 | 16384 |
|---|---|---|---|---|
| Gemma31 | 1 | 11.9 | 11.6 | 10.6 |
| Gemma31 | 2 | 22.4 | 20.5 | 17.3 |
| Gemma31 | 5 | 49.5 | 24.4 | 15.4 |
| Laguna | 1 | 8.3 | 8.3 | 8.0 |
| Laguna | 2 | 16.4 | 15.7 | 14.6 |
| Laguna | 5 | 39.2 | 33.4 | 30.2 |

**TTFT (s)**

| Model | NP | 4096 | 8192 | 16384 |
|---|---|---|---|---|
| Gemma31 | 1 | 3.96 | 8.13 | 17.11 |
| Gemma31 | 2 | 6.04 | 12.29 | 25.80 |
| Gemma31 | 5 | 12.01 | 24.99 | 117.62 |
| Laguna | 1 | 2.40 | 4.76 | 9.56 |
| Laguna | 2 | 3.71 | 7.43 | 14.64 |
| Laguna | 5 | 7.51 | 15.59 | 29.70 |

**TPOT (ms/token)**

| Model | NP | 4096 | 8192 | 16384 |
|---|---|---|---|---|
| Gemma31 | 1 | 80.4 | 78.1 | 77.7 |
| Gemma31 | 2 | 83.5 | 85.5 | 90.2 |
| Gemma31 | 5 | 89.3 | 126.1 | 87.1 |
| Laguna | 1 | 117.6 | 116.1 | 115.7 |
| Laguna | 2 | 118.1 | 120.3 | 122.6 |
| Laguna | 5 | 120.4 | 134.4 | 136.6 |

### 3.2 AISO_B60_llamacpp_V4_20261105.json

**Aggregate TPS (tok/s)**

| Model | NP | 4096 | 8192 | 16384 |
|---|---|---|---|---|
| Gemma26 | 1 | 31.1 | 24.9 | 19.4 |
| Gemma26 | 2 | 40.5 | 33.9 | 25.2 |
| Gemma26 | 4 | 33.8 | 25.0 | 16.4 |
| Gemma26 | 5 | 50.4 | 37.2 | 23.6 |
| Gemma31 | 1 | 11.5 | 8.4 | 5.9 |
| Gemma31 | 2 | 16.5 | 11.7 | 7.4 |
| Gemma31 | 4 | 11.2 | 8.0 | 6.1 |
| Gemma31 | 5 | 17.8 | 11.5 | 6.5 |
| Laguna | 1 | 50.6 | 38.6 | 26.2 |
| Laguna | 2 | 46.1 | 38.3 | 26.3 |
| Laguna | 4 | 51.5 | 26.8 | 14.2 |
| Laguna | 5 | 52.2 | 37.1 | 21.7 |
| Nemotron | 1 | 41.7 | 35.8 | 28.1 |
| Nemotron | 2 | 41.0 | 35.1 | 26.6 |
| Nemotron | 4 | 70.8 | 58.5 | 35.4 |
| Nemotron | 5 | 52.0 | 40.7 | 27.4 |

**TTFT (s)**

| Model | NP | 4096 | 8192 | 16384 |
|---|---|---|---|---|
| Gemma26 | 1 | 4.26 | 8.26 | 16.93 |
| Gemma26 | 2 | 10.18 | 17.68 | 33.53 |
| Gemma26 | 4 | 83.65 | 103.57 | 126.81 |
| Gemma26 | 5 | 23.33 | 39.92 | 78.82 |
| Gemma31 | 1 | 20.73 | 41.28 | 84.44 |
| Gemma31 | 2 | 44.17 | 86.87 | 157.36 |
| Gemma31 | 4 | 248.72 | 348.52 | 472.93 |
| Gemma31 | 5 | 107.89 | 187.53 | 360.29 |
| Laguna | 1 | 3.19 | 6.78 | 14.62 |
| Laguna | 2 | 8.95 | 15.19 | 31.11 |
| Laguna | 4 | 32.68 | 78.21 | 158.41 |
| Laguna | 5 | 22.76 | 39.86 | 85.05 |
| Nemotron | 1 | 3.96 | 7.64 | 15.08 |
| Nemotron | 2 | 8.94 | 15.94 | 29.43 |
| Nemotron | 4 | 9.89 | 21.25 | 55.12 |
| Nemotron | 5 | 20.21 | 36.59 | 68.44 |

**TPOT (ms/token)**

| Model | NP | 4096 | 8192 | 16384 |
|---|---|---|---|---|
| Gemma26 | 1 | 28.0 | 32.1 | 35.0 |
| Gemma26 | 2 | 39.5 | 41.8 | 46.6 |
| Gemma26 | 4 | 74.7 | 93.3 | 122.8 |
| Gemma26 | 5 | 76.5 | 95.2 | 135.0 |
| Gemma31 | 1 | 66.6 | 78.7 | 88.0 |
| Gemma31 | 2 | 78.5 | 86.0 | 115.9 |
| Gemma31 | 4 | 184.8 | 238.8 | 372.7 |
| Gemma31 | 5 | 175.6 | 250.0 | 414.3 |
| Laguna | 1 | 16.6 | 19.3 | 23.9 |
| Laguna | 2 | 34.8 | 37.5 | 45.8 |
| Laguna | 4 | 46.0 | 75.6 | 129.4 |
| Laguna | 5 | 73.6 | 95.9 | 146.7 |
| Nemotron | 1 | 20.1 | 20.5 | 20.9 |
| Nemotron | 2 | 40.1 | 41.5 | 46.4 |
| Nemotron | 4 | 46.7 | 47.6 | 59.4 |
| Nemotron | 5 | 76.4 | 87.2 | 115.2 |

### 3.3 AISO_B60_vLLM_V4_20261105.json

**Aggregate TPS (tok/s)**

| Model | NP | 4096 | 8192 | 16384 |
|---|---|---|---|---|
| Gemma31 | 1 | 18.3 | 11.5 | 5.1 |
| Gemma31 | 2 | 28.6 | 15.2 | 5.7 |
| Gemma31 | 5 | 37.1 | 18.0 | 5.8 |
| Laguna | 1 | 58.0 | 54.6 | 48.5 |
| Laguna | 2 | 105.4 | 95.0 | 78.3 |
| Laguna | 5 | 200.0 | 165.4 | 120.8 |

**TTFT (s)**

| Model | NP | 4096 | 8192 | 16384 |
|---|---|---|---|---|
| Gemma31 | 1 | 11.75 | 38.53 | 140.46 |
| Gemma31 | 2 | 17.68 | 57.97 | 211.02 |
| Gemma31 | 5 | 42.44 | 118.53 | 460.49 |
| Laguna | 1 | 0.90 | 1.83 | 3.88 |
| Laguna | 2 | 1.35 | 2.77 | 5.85 |
| Laguna | 5 | 3.22 | 6.06 | 12.25 |

**TPOT (ms/token)**

| Model | NP | 4096 | 8192 | 16384 |
|---|---|---|---|---|
| Gemma31 | 1 | 43.3 | 49.6 | 59.1 |
| Gemma31 | 2 | 52.8 | 75.1 | 143.9 |
| Gemma31 | 5 | 93.2 | 161.7 | 277.4 |
| Laguna | 1 | 16.4 | 16.5 | 16.8 |
| Laguna | 2 | 17.6 | 18.3 | 19.8 |
| Laguna | 5 | 21.8 | 24.3 | 29.3 |

## 4. Observations (computed from the numbers above)
- **AISO_B60_SGLang_V4_20261105.json**: highest aggregate TPS 49.5 tok/s (Gemma31, NP5, input 4096); lowest 8.0 tok/s (Laguna, NP1, input 16384); mean aggregate TPS by model: Gemma31 20.4; Laguna 19.3.
- **AISO_B60_llamacpp_V4_20261105.json**: highest aggregate TPS 70.8 tok/s (Nemotron, NP4, input 4096); lowest 5.9 tok/s (Gemma31, NP1, input 16384); mean aggregate TPS by model: Nemotron 41.1; Laguna 35.8; Gemma26 30.1; Gemma31 10.2; 5 case(s) with TTFT over 180 s.
- **AISO_B60_vLLM_V4_20261105.json**: highest aggregate TPS 200.0 tok/s (Laguna, NP5, input 4096); lowest 5.1 tok/s (Gemma31, NP1, input 16384); mean aggregate TPS by model: Laguna 102.9; Gemma31 16.1; 2 case(s) with TTFT over 180 s.

## 5. Runs that did not finish, partial and not run
| Dataset | Kind | Detail |
|---|---|---|
| AISO_B60_SGLang_V4_20261105.json | not_run | model=Gemma26; reason=SKIP_SOURCE：Gemma26 HTTP 版本在核准的模型來源出現前跳過（不下載）。先前 SGLang 嘗試曾 STARTUP_FAILED（CUDA Marlin JIT 呼叫 nvcc）。 |
| AISO_B60_SGLang_V4_20261105.json | not_run | model=Nemotron; reason=STARTUP_FAIL：V4 啟動失敗，9 個 case 皆無成績（原因見疑難排解）。 |
| AISO_B60_SGLang_V4_20261105.json | failure | model=Gemma31; np=5; input=8192; run_id=B60_SGLang_2Models_NP125_20261102_100733_2642029; status=CLIENT_FAILED; reason=原始 Full 測試：R1 的 5/5 requests 成功，但其中一個 request 的 E2E 超過 1500 秒；R2 發生 level_zero UR_RESULT_ERROR_OUT_OF_RESOURCES（flash_attn_with_kvcache，HTTP 500），整組失敗。; retried_by=B60_Gemma31_NP5_R |
| AISO_B60_vLLM_V4_20261105.json | not_run | model=Gemma26; reason=SKIP_SOURCE：Gemma26 HTTP 版本在核准的模型來源出現前跳過（不下載）。 |
| AISO_B60_vLLM_V4_20261105.json | not_run | model=Nemotron; reason=STARTUP_FAIL：V4 啟動失敗，9 個 case 皆無成績（原因見疑難排解）。 |

## 6. Gaps and cautions
- The original V4 environment is no longer on the machine; NP4 and later were re-measured in a rebuilt environment (marked not V4-parity in the platform).
- There is no runner manifest for B60 in the platform repository; the hashes come from the evidence archive (see `../Preflight/`).
- The audit in the evidence folder reports 36 cases NOT_FOUND_ON_HOST and 72 PASS for the V4 campaign.
- Every case is a single recorded value or the source's own mean; see each dataset's profile for the number of repeats.

## 7. Where the data is (this folder = `INTEL/B60/benchmark_Result/`)
| Path | Content |
|---|---|
| `B60_benchmark_summary_20261120.md` | this file |
| `B60_benchmark_all_cases_20261120.xlsx` | sheets: README, Datasets, Cases, Summary, Model_parity, Config_by_model, Not_run_partial, Evidence_files |
| `B60_benchmark_all_cases_20261120.csv` | the Cases sheet as CSV |
| `raw_backup/dataset_json/` | the platform datasets this was built from |
| `raw_backup/evidence/` | the evidence files found under TPISoftware (copies; the originals were not moved) |
| `../../../Shared/Reports/` | the combined B60 / B70 / AISO1 stress-test report (HTML and PDF, 2026-11-09), kept once for the three machines |
| `../Preflight/` | manifests, runners and the sha256 comparison |

