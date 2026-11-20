# B70 Benchmark · everything measured (backup summary)

*Generated 2026-11-20 from the platform's published datasets (`data/benchmark-*`, copied to `raw_backup/dataset_json/`) and the evidence files found under Desktop/TPISoftware. Nothing is estimated; a blank means the source has no value.*

## 1. What this is
A hand-over document for **Intel Arc Pro B70 - 2 cards, 64 GB in total (32 GB x 2), as stated in the datasets**: what was tested, with which settings, the numbers, the observations, what was not run, and where the evidence is. The same data is in the sheet next to this file (`B70_benchmark_all_cases_20261120.xlsx` / `.csv`). The preflight data (manifests, runners, sha256 checks) is in `../Preflight/`.

## 2. Datasets
| Dataset file | Framework | Evidence until | Comparability | Cases PASS / rows | Models |
|---|---|---|---|---|---|
| AISO_B70_SGLang_20261022.json | SGLang XPU | 2026-10-27 | historical | 12 / 12 | Gemma31, Laguna |
| AISO_B70_llamacpp_V4B1024_20261110.json | llama.cpp | 2026-11-10 | retest_unverified | 48 / 48 | Gemma26, Gemma31, Laguna, Nemotron |
| AISO_B70_vLLM_20261019.json | vLLM XPU | 2026-10-27 | historical | 6 / 6 | Gemma31 |
| AISO_B70_vs_AISO1_20261030.json | llama.cpp | 2026-10-27 | historical | 0 / 35 | Gemma26, Gemma31, Laguna, Nemotron |

### Machine, runtime and protocol (from each dataset's profile)
- **AISO_B70_SGLang_20261022.json**: machine = 2× Intel Arc Pro B70; framework = SGLang XPU; runtime = UNVERIFIED; np = [2, 4]; input_tokens = [4096, 8192, 16384, 32768, 65536]; output_tokens = 1024; repeat = 3; vram_total_gb = 64; vram_layout = 32 GB x 2; tp = 2; format = Safetensors
  - note: Intel B70 SGLang XPU historical results. Gemma31 from the pasted original summary CSV (run 20261022_163457); Laguna rows are prior-session summaries only (TTFT/TPS, no decode). chunked-prefill 4096 is NOT equivalent to vLLM max_num_batched_tokens 4096; radix cache OFF.
  - comparability: B70 為舊版 Runner 的歷史實測（2026-10-22）；Context 69632 與 B60 V4（18432）不同；Laguna 僅有舊彙整值。
- **AISO_B70_llamacpp_V4B1024_20261110.json**: machine = 2× Intel Arc Pro B70; framework = llama.cpp; runtime = llama.cpp 0.6.0-dev (build 11561, commit e937b17a2) · SYCL (Docker image sha256:f457e95a4735…); np = [1, 2, 4, 5]; input_tokens = [4096, 8192, 16384]; output_tokens = 1024; repeat = 3; gpu_count = 2; vram_total_gb = 64; vram_layout = 32 GB x 2; context_length = 18432; slots = 10; per_slot_context = 18432; batch = 1024; ubatch = 512; kv_cache_type = f16; backend = SYCL; split = tensor (Gemma26/Gemma31/Laguna, tensor-split 1,1) · layer (Nemotron)
  - note: Intel B70 llama.cpp，B60 V4 協定 + batch 1024：4 模型 × NP1/2/4/5 × 4K/8K/16K × 3 次，48/48 PASS。TTFT／TPOT／Aggregate／Normalized 皆取自結果目錄 summary.csv（逐次重複的批次值，取 3 次算術平均）；Aggregate 與先前終端機轉錄逐筆核對一致。
  - comparability: B70 於 2026-11-10 以 batch 1024 執行，啟動參數已由各 NP 的 command_np*.json 核對（--parallel 10、--ctx-size = NP×18432、--kv-unified-per-slot 18432、--batch-size 1024、--ubatch-size 512、KV f16、--kv-unified、--no-cache-prompt、--no-context-shift、--cont-batching、-ngl 999）。與 AISO1 的差異：後端 SYCL（AISO1 為 Vulkan）、split mode tensor 1,1（Nemotron 為 layer；AISO1 為 layer）、TPOT 為 server 端回報值（AISO1 為客戶端串流計時）。Flash Attention 未出現在啟動命令中，未核實。B60 現有資料為 batch 4096。
- **AISO_B70_vLLM_20261019.json**: machine = 2× Intel Arc Pro B70; framework = vLLM XPU; runtime = UNVERIFIED; np = [2, 4]; input_tokens = [4096, 8192, 16384, 32768, 65536]; output_tokens = 1024; repeat = 3; vram_total_gb = 64; vram_layout = 32 GB x 2; batch = 4096; tp = 2; format = Safetensors
  - note: Intel B70 vLLM XPU historical results (formal-source models only). Source: AISO_Platform_B70_AISO1_20261030_B70_Verified_All_Input.csv (run 20261019_181426: NP2 4K-32K; 20261026_*: 64K). Old runner, NOT the B60 V4 protocol. decode_only_tps = decode-phase speed, not Normalized.
  - comparability: B70 為舊版 Runner 的歷史實測（2026-10-19）；Max Context 69632、Max Seqs 4，與 B60 V4（18432／10）不同；Prompt 與計時定義尚未核實一致。
- **AISO_B70_vs_AISO1_20261030.json**: framework = llama.cpp; np = [2, 4]; input_tokens = [4096, 8192, 16384, 32768, 65536]; output_tokens = 1024; repeat = 3; vram_total_gb = 64; vram_layout = 32 GB x 2; batch = 2048; ubatch = 512; kv_type = f16; format = GGUF
  - note: B70 formal llama.cpp GGUF results only. AISO1 formal results are pending, so no Intel vs AMD speedup is computed. Nemotron 3.5 llama.cpp (run 20261015_010033, SHA256 verified on the B70) added 2026-11-02.
  - comparability: B70 為舊版 Runner 的歷史實測（2026-10）；Context 69632、Batch 2048 與 B60 V4（18432／4096）不同；Prompt 生成方式不同。

## 3. Results
*Values are the source dataset's own means (repeats are in the sheet). Blank = no value in the source.*

### 3.1 AISO_B70_SGLang_20261022.json

**Aggregate TPS (tok/s)**

| Model | NP | 4096 | 8192 | 16384 | 32768 | 65536 |
|---|---|---|---|---|---|---|
| Gemma31 | 2 | 24.5 | 24.6 | 22.0 | 19.0 | 13.6 |
| Gemma31 | 4 | 49.5 | 45.6 | 40.2 | 29.8 | 17.6 |
| Laguna | 2 | — | — | — | — | 12.4 |
| Laguna | 4 | — | — | — | — | 19.2 |

**TTFT (s)**

| Model | NP | 4096 | 8192 | 16384 | 32768 | 65536 |
|---|---|---|---|---|---|---|
| Gemma31 | 2 | 2.31 | 4.56 | 9.71 | 22.34 | 56.85 |
| Gemma31 | 4 | 3.71 | 8.04 | 16.66 | 38.27 | 96.81 |
| Laguna | 2 | — | — | — | — | 34.78 |
| Laguna | 4 | — | — | — | — | 58.55 |

**TPOT (ms/token)**

| Model | NP | 4096 | 8192 | 16384 | 32768 | 65536 |
|---|---|---|---|---|---|---|
| Gemma31 | 2 | 79.5 | 77.2 | 81.6 | 83.6 | 91.8 |
| Gemma31 | 4 | 77.3 | 79.7 | 83.2 | 96.6 | 133.0 |
| Laguna | 2 | — | — | — | — | 127.1 |
| Laguna | 4 | — | — | — | — | 150.7 |

### 3.2 AISO_B70_llamacpp_V4B1024_20261110.json

**Aggregate TPS (tok/s)**

| Model | NP | 4096 | 8192 | 16384 |
|---|---|---|---|---|
| Gemma26 | 1 | 30.7 | 24.9 | 19.2 |
| Gemma26 | 2 | 32.8 | 26.6 | 19.8 |
| Gemma26 | 4 | 41.2 | 30.5 | 21.2 |
| Gemma26 | 5 | 43.0 | 30.8 | 21.5 |
| Gemma31 | 1 | 15.9 | 12.0 | 9.1 |
| Gemma31 | 2 | 23.4 | 18.3 | 12.7 |
| Gemma31 | 4 | 32.3 | 22.7 | 14.2 |
| Gemma31 | 5 | 34.6 | 23.7 | 14.7 |
| Laguna | 1 | 36.9 | 34.0 | 26.8 |
| Laguna | 2 | 35.4 | 31.7 | 26.0 |
| Laguna | 4 | 44.9 | 33.9 | 22.0 |
| Laguna | 5 | 47.0 | 35.8 | 22.8 |
| Nemotron | 1 | 60.0 | 54.6 | 43.5 |
| Nemotron | 2 | 59.0 | 52.6 | 42.2 |
| Nemotron | 4 | 73.4 | 62.2 | 44.4 |
| Nemotron | 5 | 76.3 | 60.8 | 42.3 |

**TTFT (s)**

| Model | NP | 4096 | 8192 | 16384 |
|---|---|---|---|---|
| Gemma26 | 1 | 8.36 | 12.52 | 23.24 |
| Gemma26 | 2 | 16.07 | 26.86 | 47.23 |
| Gemma26 | 4 | 30.89 | 54.56 | 95.16 |
| Gemma26 | 5 | 38.19 | 68.76 | 112.94 |
| Gemma31 | 1 | 15.20 | 23.65 | 44.26 |
| Gemma31 | 2 | 26.58 | 41.42 | 76.66 |
| Gemma31 | 4 | 42.84 | 71.89 | 130.28 |
| Gemma31 | 5 | 50.91 | 87.90 | 155.64 |
| Laguna | 1 | 7.23 | 8.61 | 15.06 |
| Laguna | 2 | 20.08 | 24.14 | 33.97 |
| Laguna | 4 | 44.36 | 62.00 | 110.76 |
| Laguna | 5 | 54.68 | 72.92 | 127.98 |
| Nemotron | 1 | 2.97 | 4.34 | 8.51 |
| Nemotron | 2 | 5.11 | 7.77 | 14.21 |
| Nemotron | 4 | 8.38 | 13.34 | 27.24 |
| Nemotron | 5 | 9.82 | 17.29 | 33.82 |

**TPOT (ms/token)**

| Model | NP | 4096 | 8192 | 16384 |
|---|---|---|---|---|
| Gemma26 | 1 | 24.5 | 27.9 | 29.4 |
| Gemma26 | 2 | 45.2 | 48.8 | 54.9 |
| Gemma26 | 4 | 67.2 | 77.5 | 95.3 |
| Gemma26 | 5 | 79.5 | 94.8 | 121.0 |
| Gemma31 | 1 | 48.1 | 60.3 | 67.0 |
| Gemma31 | 2 | 59.6 | 68.6 | 82.8 |
| Gemma31 | 4 | 81.8 | 105.1 | 151.8 |
| Gemma31 | 5 | 94.3 | 124.1 | 184.7 |
| Laguna | 1 | 20.1 | 21.0 | 22.5 |
| Laguna | 2 | 38.8 | 41.4 | 46.5 |
| Laguna | 4 | 54.6 | 61.3 | 78.1 |
| Laguna | 5 | 65.6 | 72.4 | 97.3 |
| Nemotron | 1 | 13.8 | 14.1 | 14.7 |
| Nemotron | 2 | 28.9 | 30.4 | 33.4 |
| Nemotron | 4 | 46.2 | 51.0 | 62.9 |
| Nemotron | 5 | 55.8 | 64.9 | 84.2 |

### 3.3 AISO_B70_vLLM_20261019.json

**Aggregate TPS (tok/s)**

| Model | NP | 4096 | 8192 | 16384 | 32768 | 65536 |
|---|---|---|---|---|---|---|
| Gemma31 | 2 | 20.4 | 14.9 | 7.3 | 2.3 | 0.7 |
| Gemma31 | 4 | — | — | — | — | 0.7 |

**TTFT (s)**

| Model | NP | 4096 | 8192 | 16384 | 32768 | 65536 |
|---|---|---|---|---|---|---|
| Gemma31 | 2 | 10.58 | 37.99 | 146.59 | 595.47 | 2165.89 |
| Gemma31 | 4 | — | — | — | — | 3630.01 |

**TPOT (ms/token)**

| Model | NP | 4096 | 8192 | 16384 | 32768 | 65536 |
|---|---|---|---|---|---|---|
| Gemma31 | 2 | 87.7 | 97.1 | 132.5 | 281.8 | 812.7 |
| Gemma31 | 4 | — | — | — | — | 2330.4 |

## 4. Observations (computed from the numbers above)
- **AISO_B70_SGLang_20261022.json**: highest aggregate TPS 49.5 tok/s (Gemma31, NP4, input 4096); lowest 12.4 tok/s (Laguna, NP2, input 65536); mean aggregate TPS by model: Gemma31 28.6; Laguna 15.8.
- **AISO_B70_llamacpp_V4B1024_20261110.json**: highest aggregate TPS 76.3 tok/s (Nemotron, NP5, input 4096); lowest 9.1 tok/s (Gemma31, NP1, input 16384); mean aggregate TPS by model: Nemotron 55.9; Laguna 33.1; Gemma26 28.5; Gemma31 19.5.
- **AISO_B70_vLLM_20261019.json**: highest aggregate TPS 20.4 tok/s (Gemma31, NP2, input 4096); lowest 0.7 tok/s (Gemma31, NP4, input 65536); mean aggregate TPS by model: Gemma31 7.7; 3 case(s) with TTFT over 180 s.

## 5. Runs that did not finish, partial and not run
| Dataset | Kind | Detail |
|---|---|---|
| AISO_B70_SGLang_20261022.json | not_run | model=Gemma26; reason=STARTUP_FAILED：WNA16 TP2 啟動問題，沒有成績。 |
| AISO_B70_SGLang_20261022.json | not_run | model=Nemotron; reason=STARTUP_FAILED：沒有成績。 |
| AISO_B70_vLLM_20261019.json | not_run | model=Gemma26; reason=不收：舊 vLLM 為第三方 AWQ INT4 量化（非原作者／Unsloth 來源），不列為正式比較。 |
| AISO_B70_vLLM_20261019.json | not_run | model=Nemotron; reason=不收：舊 vLLM 為第三方 Compressed Tensors W4A16 量化，不列為正式比較。 |
| AISO_B70_vLLM_20261019.json | not_run | model=Laguna; reason=NOT_VERIFIED：FP8 權重已驗證，vLLM FP8 推論尚未驗證。 |

35 case row(s) are not PASS (statuses: None); see the Cases sheet.

## 6. Gaps and cautions
- There is no runner manifest for B70 in the platform repository; hashes come from the evidence archive (see `../Preflight/`).
- The audit lists the 48 llama.cpp cases as PASS_RAW_CHECKED_SOURCE_PENDING; the TPOT definition is the server's predicted_ms / predicted_n (not the same as the client-measured TPOT of other machines).
- Every case is a single recorded value or the source's own mean; see each dataset's profile for the number of repeats.

## 7. Where the data is (this folder = `INTEL/B70/benchmark_Result/`)
| Path | Content |
|---|---|
| `B70_benchmark_summary_20261120.md` | this file |
| `B70_benchmark_all_cases_20261120.xlsx` | sheets: README, Datasets, Cases, Summary, Model_parity, Config_by_model, Not_run_partial, Evidence_files |
| `B70_benchmark_all_cases_20261120.csv` | the Cases sheet as CSV |
| `raw_backup/dataset_json/` | the platform datasets this was built from |
| `raw_backup/evidence/` | the evidence files found under TPISoftware (copies; the originals were not moved) |
| `../../../Shared/Reports/` | the combined B60 / B70 / AISO1 stress-test report (HTML and PDF, 2026-11-09), kept once for the three machines |
| `../Preflight/` | manifests, runners and the sha256 comparison |

