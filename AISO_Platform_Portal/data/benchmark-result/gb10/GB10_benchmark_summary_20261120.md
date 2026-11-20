# GB10 Benchmark · everything measured (backup summary)

*Generated 2026-11-20 from the raw result folders copied off the machine (`raw_backup/results`). Nothing is estimated; a run without results is listed with its recorded error.*

## 1. What this is
A single hand-over document for the NVIDIA GB10 test machine before it is lent out: what was tested, with which settings, the numbers, the conclusions, what failed, what was not measured, and where the backup of the raw data is. The same data is in the sheet next to this file (`GB10_benchmark_all_cases_20261120.xlsx` / `.csv`).

## 2. Test environment
- Machine: NVIDIA GB10 (mini-workstation), 128 GB unified memory (CPU and GPU share one pool); one vLLM server at a time
- Engine: vLLM, container image `lmcache/vllm-openai:nightly-2026-11-02` (vLLM 0.33.0rc1)
- Model: Gemma 4 26B-A4B-it (MoE, about 4B active); checkpoints: bf16 original, fp8 online / pre-quantized, NVFP4 (NVIDIA ModelOpt), int8 / int4 AWQ, the QAT checkpoint (kept in bf16)
- Period: 2026-11-18 10:51 to 2026-11-19 15:54 (CST)

## 3. Protocol and metrics
- Conditions: NP (concurrent requests) 1 / 3 / 5 x Input 8K / 64K / 128K x Output 256 / 512 tokens; **one run per case** (no averaging, no retry of a case)
- Prompts: random token ids with forced output length (`ignore_eos`); the MTP rows use natural-text prompts (Python documentation) so the draft acceptance is realistic; one extra MTP run on the default repeated-block prompt is kept and labelled
- TTFT = first token - request start (s), mean over the NP requests; TPOT = (done - first token) / (output - 1) (ms), client measured; Decode TPS = 1000 / TPOT (tokens per second per request, no first-token wait); Normalized TPS = one request's output / its total time; Aggregate TPS = all output tokens / (last done - first start)
- `vs bf16 %`: + is better (more TPS, lower TTFT / TPOT); the mean of the per-case gains against bf16 weights with KV fp8, over the cases both sides have

## 4. What was tested
| Configuration | Input sizes with results | Cases PASS |
|---|---|---|
| bf16 weights, KV fp8 | 8K, 64K, 128K | 18 |
| bf16 + MTP (KV fp8) | 8K | 6 |
| QAT (KV fp8) | 8K | 6 |
| QAT + MTP (KV fp8) | 8K | 6 |
| QAT + NVFP4 KV | 8K | 6 |
| bf16 weights, KV full precision (auto) | 8K, 64K, 128K | 18 |
| fp8 online-quantized weights, KV fp8 | 8K, 64K, 128K | 18 |
| fp8 pre-quantized weights, KV fp8 | 8K, 64K, 128K | 18 |
| NVFP4 weights, KV fp8 | 8K, 64K, 128K | 18 |
| NVFP4 weights + NVFP4 KV | 8K, 64K, 128K | 18 |
| NVFP4 weights + NVFP4 KV, MTP off (natural-text prompts) | 8K | 6 |
| NVFP4 weights + NVFP4 KV + MTP (natural-text prompts) | 8K | 6 |
| NVFP4 weights + NVFP4 KV + MTP (repeated-block prompts) | 8K | 6 |

In total 40 result folders and 161 recorded cases (159 PASS, 2 KV_INSUFFICIENT). Smoke and Standard test folders are listed in the sheet but not in the comparison below (different protocol).

## 5. Results at Input 8K (6 cases per configuration: NP 1/3/5 x Output 256/512)

### Difference against bf16 (KV fp8), + is better
| Configuration | TTFT | TPOT | Decode TPS | Normalized TPS | Aggregate TPS |
|---|---|---|---|---|---|
| bf16 weights, KV fp8 | baseline | baseline | baseline | baseline | baseline |
| bf16 + MTP (KV fp8) | -14.8% | +37.1% | +65.2% | +40.4% | +40.4% |
| QAT (KV fp8) | -0.1% | -6.1% | -5.4% | -4.6% | -4.6% |
| QAT + MTP (KV fp8) | -16.0% | +40.0% | +68.3% | +44.3% | +44.3% |
| QAT + NVFP4 KV | -20.9% | -3.5% | -2.6% | -4.9% | -4.9% |
| bf16 weights, KV full precision (auto) | -15.1% | -3.9% | -3.7% | -4.9% | -4.9% |
| fp8 online-quantized weights, KV fp8 | +11.0% | +35.2% | +54.5% | +47.7% | +47.7% |
| fp8 pre-quantized weights, KV fp8 | +12.9% | +35.3% | +54.7% | +48.2% | +48.2% |
| NVFP4 weights, KV fp8 | +18.8% | +30.7% | +46.9% | +42.5% | +42.5% |
| NVFP4 weights + NVFP4 KV | +10.8% | +29.4% | +45.0% | +38.2% | +38.2% |
| NVFP4 weights + NVFP4 KV, MTP off (natural-text prompts) | +9.4% | +29.9% | +46.2% | +38.8% | +38.8% |
| NVFP4 weights + NVFP4 KV + MTP (natural-text prompts) | -0.7% | +60.1% | +156.8% | +102.7% | +102.7% |
| NVFP4 weights + NVFP4 KV + MTP (repeated-block prompts) | +0.8% | +70.2% | +238.0% | +158.4% | +158.4% |

### Aggregate TPS (tok/s) per case
| Configuration | NP1 · 256 | NP1 · 512 | NP3 · 256 | NP3 · 512 | NP5 · 256 | NP5 · 512 |
|---|---|---|---|---|---|---|
| bf16 weights, KV fp8 | 19.8 | 21.4 | 38.1 | 42.2 | 54.2 | 63.1 |
| bf16 + MTP (KV fp8) | 23.7 | 27.0 | 67.1 | 68.1 | 67.0 | 85.3 |
| QAT (KV fp8) | 20.1 | 21.1 | 37.2 | 41.1 | 47.8 | 55.9 |
| QAT + MTP (KV fp8) | 33.3 | 35.9 | 52.7 | 61.0 | 61.3 | 84.5 |
| QAT + NVFP4 KV | 18.8 | 20.1 | 39.4 | 44.5 | 47.6 | 53.8 |
| bf16 weights, KV full precision (auto) | 19.7 | 20.9 | 35.7 | 39.8 | 49.8 | 59.1 |
| fp8 online-quantized weights, KV fp8 | 30.0 | 32.4 | 55.8 | 65.6 | 74.5 | 90.7 |
| fp8 pre-quantized weights, KV fp8 | 30.0 | 32.3 | 56.9 | 65.5 | 75.0 | 91.1 |
| NVFP4 weights, KV fp8 | 24.5 | 25.9 | 59.3 | 68.4 | 77.9 | 94.1 |
| NVFP4 weights + NVFP4 KV | 23.4 | 24.6 | 57.5 | 66.0 | 77.0 | 92.6 |
| NVFP4 weights + NVFP4 KV, MTP off (natural-text prompts) | 23.3 | 24.7 | 57.5 | 66.5 | 77.3 | 93.7 |
| NVFP4 weights + NVFP4 KV + MTP (natural-text prompts) | 39.1 | 42.8 | 64.1 | 104.0 | 106.1 | 131.9 |
| NVFP4 weights + NVFP4 KV + MTP (repeated-block prompts) | 51.2 | 59.3 | 95.1 | 124.6 | 114.3 | 163.6 |

### TTFT (s) per case
| Configuration | NP1 · 256 | NP1 · 512 | NP3 · 256 | NP3 · 512 | NP5 · 256 | NP5 · 512 |
|---|---|---|---|---|---|---|
| bf16 weights, KV fp8 | 1.60 | 1.39 | 3.26 | 3.26 | 5.00 | 5.01 |
| bf16 + MTP (KV fp8) | 1.87 | 1.52 | 3.80 | 3.72 | 5.91 | 5.70 |
| QAT (KV fp8) | 1.44 | 1.42 | 3.32 | 3.31 | 5.17 | 5.09 |
| QAT + MTP (KV fp8) | 1.91 | 1.56 | 3.85 | 3.69 | 5.96 | 5.69 |
| QAT + NVFP4 KV | 1.91 | 1.53 | 4.12 | 3.97 | 6.21 | 6.20 |
| bf16 weights, KV full precision (auto) | 1.65 | 1.62 | 3.87 | 3.82 | 5.87 | 5.86 |
| fp8 online-quantized weights, KV fp8 | 1.25 | 1.24 | 2.97 | 2.98 | 4.60 | 4.60 |
| fp8 pre-quantized weights, KV fp8 | 1.23 | 1.23 | 2.91 | 2.90 | 4.48 | 4.48 |
| NVFP4 weights, KV fp8 | 1.17 | 1.14 | 2.69 | 2.71 | 4.15 | 4.15 |
| NVFP4 weights + NVFP4 KV | 1.19 | 1.17 | 3.04 | 3.05 | 4.74 | 4.74 |
| NVFP4 weights + NVFP4 KV, MTP off (natural-text prompts) | 1.23 | 1.19 | 3.11 | 3.06 | 4.78 | 4.80 |
| NVFP4 weights + NVFP4 KV + MTP (natural-text prompts) | 1.42 | 1.31 | 3.40 | 3.41 | 5.29 | 5.31 |
| NVFP4 weights + NVFP4 KV + MTP (repeated-block prompts) | 1.34 | 1.30 | 3.39 | 3.38 | 5.26 | 5.26 |

## 6. Results at Input 64K

### Difference against bf16 (KV fp8), + is better
| Configuration | TTFT | TPOT | Decode TPS | Normalized TPS | Aggregate TPS |
|---|---|---|---|---|---|
| bf16 weights, KV fp8 | baseline | baseline | baseline | baseline | baseline |
| bf16 weights, KV full precision (auto) | -61.7% | -27.5% | -20.2% | -30.3% | -30.3% |
| fp8 online-quantized weights, KV fp8 | +6.8% | +24.4% | +33.4% | +19.3% | +19.3% |
| fp8 pre-quantized weights, KV fp8 | +5.6% | +27.5% | +38.4% | +16.6% | +16.6% |
| NVFP4 weights, KV fp8 | +10.7% | +20.5% | +26.2% | +19.2% | +19.2% |
| NVFP4 weights + NVFP4 KV | -8.4% | +16.4% | +20.0% | +5.2% | +5.2% |

### Aggregate TPS (tok/s) per case
| Configuration | NP1 · 256 | NP1 · 512 | NP3 · 256 | NP3 · 512 | NP5 · 256 | NP5 · 512 |
|---|---|---|---|---|---|---|
| bf16 weights, KV fp8 | 8.6 | 12.2 | 10.6 | 16.9 | 11.6 | 19.6 |
| bf16 weights, KV full precision (auto) | 6.1 | 9.3 | 7.1 | 12.0 | 7.5 | 13.2 |
| fp8 online-quantized weights, KV fp8 | 10.4 | 15.6 | 12.3 | 20.7 | 13.0 | 22.7 |
| fp8 pre-quantized weights, KV fp8 | 10.4 | 15.7 | 12.4 | 20.9 | 12.2 | 20.2 |
| NVFP4 weights, KV fp8 | 9.8 | 14.1 | 12.8 | 21.4 | 13.5 | 23.5 |
| NVFP4 weights + NVFP4 KV | 8.7 | 12.9 | 11.1 | 19.1 | 11.7 | 20.8 |

### TTFT (s) per case
| Configuration | NP1 · 256 | NP1 · 512 | NP3 · 256 | NP3 · 512 | NP5 · 256 | NP5 · 512 |
|---|---|---|---|---|---|---|
| bf16 weights, KV fp8 | 17.90 | 17.98 | 36.80 | 36.73 | 55.33 | 55.25 |
| bf16 weights, KV full precision (auto) | 29.55 | 29.24 | 59.12 | 59.00 | 88.85 | 88.74 |
| fp8 online-quantized weights, KV fp8 | 16.65 | 16.68 | 34.39 | 34.27 | 51.58 | 51.61 |
| fp8 pre-quantized weights, KV fp8 | 16.54 | 16.56 | 34.03 | 33.93 | 53.11 | 55.99 |
| NVFP4 weights, KV fp8 | 16.04 | 16.05 | 32.77 | 32.87 | 49.33 | 49.37 |
| NVFP4 weights + NVFP4 KV | 19.34 | 19.34 | 39.97 | 40.09 | 59.94 | 60.00 |

## 7. Results at Input 128K

### Difference against bf16 (KV fp8), + is better
| Configuration | TTFT | TPOT | Decode TPS | Normalized TPS | Aggregate TPS |
|---|---|---|---|---|---|
| bf16 weights, KV fp8 | baseline | baseline | baseline | baseline | baseline |
| bf16 weights, KV full precision (auto) | -83.8% | -48.6% | -30.1% | -41.9% | -41.9% |
| fp8 online-quantized weights, KV fp8 | +4.7% | +18.1% | +23.9% | +10.2% | +10.2% |
| fp8 pre-quantized weights, KV fp8 | +1.2% | +43.9% | +87.3% | +6.8% | +6.8% |
| NVFP4 weights, KV fp8 | +7.4% | +14.3% | +16.8% | +11.2% | +11.2% |
| NVFP4 weights + NVFP4 KV | -19.5% | +4.0% | +5.4% | -9.8% | -9.8% |

### Aggregate TPS (tok/s) per case
| Configuration | NP1 · 256 | NP1 · 512 | NP3 · 256 | NP3 · 512 | NP5 · 256 | NP5 · 512 |
|---|---|---|---|---|---|---|
| bf16 weights, KV fp8 | 4.0 | 6.6 | 4.3 | 7.8 | 4.5 | 8.3 |
| bf16 weights, KV full precision (auto) | 2.3 | 4.1 | 2.5 | 4.5 | 2.5 | 4.7 |
| fp8 online-quantized weights, KV fp8 | 4.4 | 7.6 | 4.7 | 8.7 | 4.8 | 8.9 |
| fp8 pre-quantized weights, KV fp8 | 4.4 | 7.6 | 4.6 | 8.2 | 4.6 | 8.3 |
| NVFP4 weights, KV fp8 | 4.3 | 7.3 | 4.8 | 8.9 | 4.9 | 9.3 |
| NVFP4 weights + NVFP4 KV | 3.5 | 6.1 | 3.9 | 7.2 | 3.9 | 7.5 |

### TTFT (s) per case
| Configuration | NP1 · 256 | NP1 · 512 | NP3 · 256 | NP3 · 512 | NP5 · 256 | NP5 · 512 |
|---|---|---|---|---|---|---|
| bf16 weights, KV fp8 | 51.99 | 52.18 | 105.41 | 105.44 | 158.29 | 158.18 |
| bf16 weights, KV full precision (auto) | 96.10 | 96.07 | 193.40 | 193.28 | 290.40 | 290.41 |
| fp8 online-quantized weights, KV fp8 | 49.46 | 49.65 | 100.37 | 100.08 | 150.66 | 151.88 |
| fp8 pre-quantized weights, KV fp8 | 49.28 | 49.39 | 102.75 | 106.39 | 157.68 | 166.33 |
| NVFP4 weights, KV fp8 | 48.24 | 48.46 | 97.80 | 97.59 | 146.28 | 145.99 |
| NVFP4 weights + NVFP4 KV | 62.16 | 62.45 | 125.99 | 126.03 | 188.76 | 188.87 |

## 8. Conclusions
*(from the tables above: 8K unless stated, bf16 with KV fp8 is the baseline, one run per case)*

1. **Fastest at 8K: NVFP4 weights + NVFP4 KV + MTP** (natural-text prompts): Decode TPS +156.8%, Aggregate TPS +102.7% against bf16, with the first token about the same (TTFT -0.7%). Its MTP-off twin is +38.8% Aggregate TPS, so MTP alone roughly doubles the speed of that setting.
2. **MTP is the largest single lever:** bf16 + MTP +65.2% Decode TPS, QAT + MTP +68.3%; the price is a slower first token (TTFT -14.8% and -16.0%). Draft acceptance was 63.7% (NVFP4 + NVFP4 KV), 67.2% (bf16), 73.5% (QAT); the repeated-block prompt gave 99.4% and over-states MTP.
3. **Weight precision:** every quantized option is faster than bf16 at 8K: fp8 online +47.7%, fp8 pre-quantized +48.2%, NVFP4 +42.5% Aggregate TPS; the advantage shrinks with longer input (NVFP4 +19.2% at 64K, +11.2% at 128K). int8 and int4 AWQ did not start (see section 9).
4. **QAT as tested equals bf16 in speed** (Aggregate TPS -4.6%, TTFT -0.1%): the checkpoint is unquantized, its value is quality, which was not measured.
5. **KV cache type:** full-precision KV (auto) is clearly slower than fp8 KV and the gap grows with input (Aggregate TPS -4.9% at 8K, -30.3% at 64K, -41.9% at 128K). NVFP4 KV is not faster than fp8 KV with NVFP4 weights (Aggregate TPS +38.2% / +5.2% / -9.8% against bf16 at 8K / 64K / 128K versus +42.5% / +19.2% / +11.2% with fp8 KV); its value is capacity (about 56% more tokens in the KV cache than fp8 for the QAT checkpoint at 8K: 344,181 vs 220,463).
6. **Read small gaps with care:** one run per case, so differences under about 5-10% may be noise (for example QAT at NP5).

## 9. Failed starts, interrupted runs and retries
| Folder | Test | Configuration | What the log says |
|---|---|---|---|
| smoke_20261118_105132 | Smoke | Smoke test (bf16, KV fp8) | no error recorded (interrupted or stopped by hand) |
| smoke_20261118_105231 | Smoke | Smoke test (bf16, KV fp8) | ValueError: Selected backend AttentionBackendEnum.FLEX_ATTENTION is not valid for this configuration. Reason: ['kv_cache_dtype not supported'] |
| ryan_wint4_20261118_140804 | Long set 64K/128K | int4 AWQ weights, KV fp8 | ValueError: No available memory for the cache blocks. The extensible KV cache already takes all device memory left after the model and its activations; decrease |
| ryan_wint8_20261118_144144 | Long set 64K/128K | int8 AWQ weights, KV fp8 | ValueError: No available memory for the cache blocks. The extensible KV cache already takes all device memory left after the model and its activations; decrease |
| ryan_wint4b_20261118_144550 | Long set 64K/128K | int4 AWQ weights, KV fp8 | ValueError: No available memory for the cache blocks. The extensible KV cache already takes all device memory left after the model and its activations; decrease |
| ryan_plat_bf16_20261118_145125 | Long set 64K/128K | bf16 weights, KV fp8 | no error recorded (interrupted or stopped by hand) |
| ryan_wint4c_20261118_145128 | Long set 64K/128K | int4 AWQ weights, KV fp8 | no error recorded (interrupted or stopped by hand) |
| nvfp4kv_in8k_20261119_125120 | Input 8K set | NVFP4 weights + NVFP4 KV | ValueError: Selected backend AttentionBackendEnum.TRITON_ATTN is not valid for this configuration. Reason: ['kv_cache_dtype not supported'] |
| nvfp4kv_ryan_20261119_125216 | Long set 64K/128K | NVFP4 weights + NVFP4 KV | ValueError: Selected backend AttentionBackendEnum.TRITON_ATTN is not valid for this configuration. Reason: ['kv_cache_dtype not supported'] |
| nvfp4kv_in8k_20261119_125356 | Input 8K set | NVFP4 weights + NVFP4 KV | ValueError: Selected backend AttentionBackendEnum.FLASHINFER is not valid for this configuration. Reason: ['partial multimodal token full attention not supporte |
| nvfp4kv_ryan_20261119_125457 | Long set 64K/128K | NVFP4 weights + NVFP4 KV | no error recorded (interrupted or stopped by hand) |
| nvfp4kv_ryan_20261119_132719 | Long set 64K/128K | NVFP4 weights + NVFP4 KV | ValueError: To serve at least one request with the model's max seq len (132096), (1.64 GiB KV cache is needed, which is larger than the available KV cache memor |
| nvfp4kv_ryan_20261119_135741 | Long set 64K/128K | NVFP4 weights + NVFP4 KV | no error recorded (interrupted or stopped by hand) |
| nvfp4kv_mtp_in8k_20261119_150610 | Input 8K set | NVFP4 weights + NVFP4 KV + MTP (repeated-block prompts) | ValueError: To serve at least one request with the model's max seq len (9216), (0.54 GiB KV cache is needed, which is larger than the available KV cache memory  |

Reading: NVFP4 KV needed `--attention-backend FLASHINFER --language-model-only` (the default backends reject it) and a higher memory share for the long inputs; int8 / int4 AWQ load but vLLM then reports no memory left for the KV cache (not a real memory shortage); the first MTP try left too little KV cache and was repeated with a higher memory share.

## 10. Not measured
- Model quality (accuracy / perplexity) of NVFP4, NVFP4 KV and QAT against bf16
- MTP at 64K / 128K and at more concurrency; MTP draft length other than 3; MTP on other task types
- A real 4-bit QAT deployment (q4_0); int8 / int4 AWQ (they did not start on this vLLM build)
- Repeats: every case is a single run

## 11. Where the data is (this folder = `NVIDIA/GB10/benchmark_Result/`)
| Path | Content |
|---|---|
| `GB10_benchmark_summary_20261120.md` | this file |
| `GB10_benchmark_all_cases_20261120.xlsx` | sheets: README, Summary_vs_bf16, Best_per_case, Cases (all 161 recorded cases), Runs (all 40 result folders) |
| `GB10_benchmark_all_cases_20261120.csv` | the Cases sheet as CSV |
| `raw_backup/results/` | the 40 result folders copied from the machine (summary.csv, parameters.json, server_command.txt, server.log, per-case json) |
| `raw_backup/logs/` | the runner and matrix logs (47 files) |
| `raw_backup/scripts/` | the benchmark scripts and queue scripts used (19 files), incl. `stopped_containers.txt` |
| `published_data/` | the datasets published on the platform (weight precision, KV type, MTP / QAT variants, standard test) |
| `reports/` | the three Benchmark Result reports (Markdown) |
| `../Preflight/` | the preflight data of the same machine: manifests, runner files (repo and machine copies), sha256 comparison, the preflight output of every run, the platform's preflight checks |

## 12. State of the machine when this was written
- No test or vLLM container is running.
- Other services that were stopped to free memory for the tests (a list is in `raw_backup/scripts/stopped_containers.txt`) are still stopped; they must be started again by their owner before the machine is used for anything else.
- The raw results on the machine total about 2.8 MB (302 files) and are fully copied here; the model weights and the Docker image were not copied (they can be downloaded again).

