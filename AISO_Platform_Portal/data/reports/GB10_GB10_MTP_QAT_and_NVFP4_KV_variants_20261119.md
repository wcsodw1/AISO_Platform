# Benchmark Result · GB10 MTP QAT and NVFP4 KV variants

*Generated 2026-11-19 from measured data in the platform (nothing estimated).*

## Test setup
- Machine: NVIDIA GB10, 128 GB unified memory (CPU and GPU share one pool)
- Engine: vLLM (image `lmcache/vllm-openai:nightly-2026-11-02`), model Gemma 4 26B-A4B-it
- Conditions: NP 1 / 3 / 5 × Input 8K / 64K / 128K × Output 256 / 512; 1 run per case; prompts are random token ids with forced output length (`ignore_eos`)
- TTFT = first token − request start; TPOT = (done − first token) / (output − 1), measured by the client; Decode TPS = 1000 ÷ TPOT; aggregate TPS = all output tokens ÷ (last done − first start)

## Summary against baseline

| Variant | Group | Cases PASS | KV capacity (tokens) | TTFT vs baseline | TPOT vs baseline | Aggregate TPS vs baseline |
|---|---|---|---|---|---|---|
| bf16 weights · MTP on ◀ new | MTP (bf16 / QAT) | 6/6 | in8k: 262,288 | +14.8% | -37.1% | +40.4% |
| QAT checkpoint · KV fp8 ◀ new | QAT | 6/6 | in8k: 220,463 | +0.1% | +6.1% | -4.6% |
| QAT checkpoint · NVFP4 KV ◀ new | QAT | 6/6 | in8k: 344,181 | +21.0% | -2.4% | -0.3% |
| QAT checkpoint · MTP on (QAT assistant) ◀ new | MTP (bf16 / QAT) | 6/6 | in8k: 265,820 | +16.2% | -43.5% | +50.7% |
| NVFP4 weights + NVFP4 KV · MTP on ◀ new | MTP (natural-text prompts) | 6/6 | in8k: 344,181 | +11.3% | -42.6% | +47.8% |
| bf16 | Weight precision (KV fp8) | 18/18 | — | baseline | baseline | baseline |
| bf16 · KV auto | Weight precision (KV fp8) | 18/18 | — | +53.5% | +26.7% | -25.7% |
| NVFP4 | Weight precision (KV fp8) | 18/18 | — | -12.3% | -21.9% | +24.3% |
| fp8 online | Weight precision (KV fp8) | 18/18 | — | -7.5% | -25.9% | +25.7% |
| fp8 pre-quantized | Weight precision (KV fp8) | 18/18 | — | -6.6% | -35.6% | +23.9% |
| int8 AWQ | Weight precision (KV fp8) | failed to start | — | — | — | — |
| int4 AWQ | Weight precision (KV fp8) | failed to start | — | — | — | — |
| KV fp8 | KV cache type, bf16 weights | 18/18 | ryan: 966,137 | baseline | baseline | baseline |
| KV full precision (auto) | KV cache type, bf16 weights | 18/18 | in8k: 42,336, ryan: 455,250 | +53.5% | +26.7% | -25.7% |
| NVFP4 weights · KV fp8 | KV cache type, NVFP4 weights | 18/18 | ryan: 1,147,177 | baseline | baseline | baseline |
| NVFP4 weights · NVFP4 KV cache | KV cache type, NVFP4 weights | 18/18 | in8k: 117,315, ryan: 1,047,964 | +20.0% | +6.2% | -11.2% |
| NVFP4 weights + NVFP4 KV · MTP off | MTP (natural-text prompts) | 6/6 | in8k: 359,548 | baseline | baseline | baseline |
| NVFP4 weights + NVFP4 KV · MTP on (repeated-block prompts) | MTP (natural-text prompts) | 6/6 | in8k: 325,014 | +9.5% | -56.9% | +89.1% |

*Differences are means over the cases both sides have (negative TTFT / TPOT is better, positive TPS is better).*

## bf16 weights · MTP on
*MTP (bf16 / QAT)* · Baseline = bf16, KV fp8 (speed does not depend on the prompt without MTP).

**MTP acceptance** (vLLM `SpecDecoding metrics`, 12 samples): mean acceptance length **2.85** of max 4.0, draft tokens accepted **67.2%**.

| Input | NP | Output | Status | TTFT s | TPOT ms | Decode TPS | Agg TPS | vs baseline (TTFT / agg TPS) |
|---|---|---|---|---|---|---|---|---|
| 8K | 1 | 256 | PASS | 1.9 | 35.0 | 28.6 | 23.7 | +17% / +20% |
| 8K | 1 | 512 | PASS | 1.5 | 34.1 | 29.3 | 27.0 | +9% / +26% |
| 8K | 3 | 256 | PASS | 3.8 | 29.4 | 34.0 | 67.1 | +17% / +76% |
| 8K | 3 | 512 | PASS | 3.7 | 35.0 | 28.5 | 68.1 | +14% / +61% |
| 8K | 5 | 256 | PASS | 5.9 | 46.3 | 21.6 | 67.0 | +18% / +24% |
| 8K | 5 | 512 | PASS | 5.7 | 40.9 | 24.4 | 85.3 | +14% / +35% |

## QAT checkpoint · KV fp8
*QAT* · google/gemma-4-26B-A4B-it-qat-q4_0-unquantized: unquantized weights, expected speed ~ bf16.

| Input | NP | Output | Status | TTFT s | TPOT ms | Decode TPS | Agg TPS | vs baseline (TTFT / agg TPS) |
|---|---|---|---|---|---|---|---|---|
| 8K | 1 | 256 | PASS | 1.4 | 44.2 | 22.6 | 20.1 | -10% / +2% |
| 8K | 1 | 512 | PASS | 1.4 | 44.6 | 22.4 | 21.1 | +2% / -1% |
| 8K | 3 | 256 | PASS | 3.3 | 67.6 | 14.8 | 37.2 | +2% / -2% |
| 8K | 3 | 512 | PASS | 3.3 | 66.6 | 15.0 | 41.1 | +2% / -3% |
| 8K | 5 | 256 | PASS | 5.2 | 84.2 | 11.9 | 47.8 | +3% / -12% |
| 8K | 5 | 512 | PASS | 5.1 | 79.4 | 12.6 | 55.9 | +2% / -11% |

## QAT checkpoint · NVFP4 KV
*QAT* · QAT weights with the NVFP4 KV cache (FlashInfer, text only).

| Input | NP | Output | Status | TTFT s | TPOT ms | Decode TPS | Agg TPS | vs baseline (TTFT / agg TPS) |
|---|---|---|---|---|---|---|---|---|
| 8K | 1 | 256 | PASS | 1.9 | 45.8 | 21.8 | 18.8 | +32% / -6% |
| 8K | 1 | 512 | PASS | 1.5 | 46.9 | 21.3 | 20.1 | +8% / -5% |
| 8K | 3 | 256 | PASS | 4.1 | 60.2 | 16.6 | 39.4 | +24% / +6% |
| 8K | 3 | 512 | PASS | 4.0 | 59.8 | 16.7 | 44.5 | +20% / +8% |
| 8K | 5 | 256 | PASS | 6.2 | 80.8 | 12.4 | 47.6 | +20% / -1% |
| 8K | 5 | 512 | PASS | 6.2 | 80.9 | 12.4 | 53.8 | +22% / -4% |

## QAT checkpoint · MTP on (QAT assistant)
*MTP (bf16 / QAT)* · google/gemma-4-26B-A4B-it-qat-q4_0-unquantized-assistant, 3 draft tokens.

**MTP acceptance** (vLLM `SpecDecoding metrics`, 12 samples): mean acceptance length **3.08** of max 4.0, draft tokens accepted **73.5%**.

| Input | NP | Output | Status | TTFT s | TPOT ms | Decode TPS | Agg TPS | vs baseline (TTFT / agg TPS) |
|---|---|---|---|---|---|---|---|---|
| 8K | 1 | 256 | PASS | 1.9 | 22.7 | 44.1 | 33.3 | +33% / +65% |
| 8K | 1 | 512 | PASS | 1.6 | 24.9 | 40.2 | 35.9 | +10% / +70% |
| 8K | 3 | 256 | PASS | 3.8 | 40.3 | 24.8 | 52.7 | +16% / +42% |
| 8K | 3 | 512 | PASS | 3.7 | 37.6 | 26.6 | 61.0 | +11% / +49% |
| 8K | 5 | 256 | PASS | 6.0 | 51.1 | 19.6 | 61.3 | +15% / +28% |
| 8K | 5 | 512 | PASS | 5.7 | 43.8 | 22.9 | 84.5 | +12% / +51% |

## NVFP4 weights + NVFP4 KV · MTP on
*MTP (natural-text prompts)* · gemma-4-26B-A4B-it-assistant, 3 draft tokens, same natural-text prompts as the baseline.

**MTP acceptance** (vLLM `SpecDecoding metrics`, 7 samples): mean acceptance length **2.86** of max 4.0, draft tokens accepted **63.7%**.

| Input | NP | Output | Status | TTFT s | TPOT ms | Decode TPS | Agg TPS | vs baseline (TTFT / agg TPS) |
|---|---|---|---|---|---|---|---|---|
| 8K | 1 | 256 | PASS | 1.4 | 20.1 | 49.7 | 39.1 | +16% / +67% |
| 8K | 1 | 512 | PASS | 1.3 | 20.9 | 47.9 | 42.8 | +10% / +73% |
| 8K | 3 | 256 | PASS | 3.4 | 30.0 | 33.3 | 64.1 | +9% / +12% |
| 8K | 3 | 512 | PASS | 3.4 | 20.7 | 48.4 | 104.0 | +11% / +56% |
| 8K | 5 | 256 | PASS | 5.3 | 25.2 | 39.7 | 106.1 | +11% / +37% |
| 8K | 5 | 512 | PASS | 5.3 | 24.0 | 41.6 | 131.9 | +11% / +41% |

## bf16
*Weight precision (KV fp8)*

| Input | NP | Output | Status | TTFT s | TPOT ms | Decode TPS | Agg TPS | vs baseline (TTFT / agg TPS) |
|---|---|---|---|---|---|---|---|---|
| 8K | 1 | 256 | PASS | 1.6 | 44.3 | 22.6 | 19.8 | — |
| 8K | 1 | 512 | PASS | 1.4 | 44.2 | 22.6 | 21.4 | — |
| 8K | 3 | 256 | PASS | 3.3 | 66.1 | 15.1 | 38.1 | — |
| 8K | 3 | 512 | PASS | 3.3 | 64.7 | 15.5 | 42.2 | — |
| 8K | 5 | 256 | PASS | 5.0 | 72.5 | 13.8 | 54.2 | — |
| 8K | 5 | 512 | PASS | 5.0 | 69.3 | 14.4 | 63.1 | — |
| 64K | 1 | 256 | PASS | 17.9 | 47.0 | 21.3 | 8.6 | — |
| 64K | 1 | 512 | PASS | 18.0 | 47.2 | 21.2 | 12.2 | — |
| 64K | 3 | 256 | PASS | 36.8 | 138.6 | 7.2 | 10.6 | — |
| 64K | 3 | 512 | PASS | 36.7 | 104.7 | 9.6 | 16.9 | — |
| 64K | 5 | 256 | PASS | 55.3 | 213.8 | 4.7 | 11.6 | — |
| 64K | 5 | 512 | PASS | 55.2 | 145.2 | 6.9 | 19.6 | — |
| 128K | 1 | 256 | PASS | 52.0 | 50.0 | 20.0 | 4.0 | — |
| 128K | 1 | 512 | PASS | 52.2 | 50.2 | 19.9 | 6.6 | — |
| 128K | 3 | 256 | PASS | 105.4 | 277.8 | 3.6 | 4.3 | — |
| 128K | 3 | 512 | PASS | 105.4 | 178.4 | 5.6 | 7.8 | — |
| 128K | 5 | 256 | PASS | 158.3 | 488.9 | 2.0 | 4.5 | — |
| 128K | 5 | 512 | PASS | 158.2 | 289.8 | 3.5 | 8.3 | — |

## bf16 · KV auto
*Weight precision (KV fp8)*

| Input | NP | Output | Status | TTFT s | TPOT ms | Decode TPS | Agg TPS | vs baseline (TTFT / agg TPS) |
|---|---|---|---|---|---|---|---|---|
| 8K | 1 | 256 | PASS | 1.7 | 44.6 | 22.4 | 19.7 | +3% / -1% |
| 8K | 1 | 512 | PASS | 1.6 | 44.7 | 22.4 | 20.9 | +17% / -2% |
| 8K | 3 | 256 | PASS | 3.9 | 68.9 | 14.5 | 35.7 | +19% / -6% |
| 8K | 3 | 512 | PASS | 3.8 | 67.8 | 14.7 | 39.8 | +17% / -6% |
| 8K | 5 | 256 | PASS | 5.9 | 77.3 | 12.9 | 49.8 | +17% / -8% |
| 8K | 5 | 512 | PASS ⚠ KV tight | 5.9 | 73.0 | 13.7 | 59.1 | +17% / -6% |
| 64K | 1 | 256 | PASS | 29.5 | 49.8 | 20.1 | 6.1 | +65% / -29% |
| 64K | 1 | 512 | PASS | 29.2 | 50.0 | 20.0 | 9.3 | +63% / -23% |
| 64K | 3 | 256 | PASS | 59.1 | 190.3 | 5.3 | 7.1 | +61% / -33% |
| 64K | 3 | 512 | PASS | 59.0 | 134.6 | 7.4 | 12.0 | +61% / -29% |
| 64K | 5 | 256 | PASS | 88.8 | 314.5 | 3.2 | 7.5 | +61% / -35% |
| 64K | 5 | 512 | PASS | 88.7 | 203.1 | 4.9 | 13.2 | +61% / -33% |
| 128K | 1 | 256 | PASS | 96.1 | 55.6 | 18.0 | 2.3 | +85% / -41% |
| 128K | 1 | 512 | PASS | 96.1 | 55.7 | 18.0 | 4.1 | +84% / -37% |
| 128K | 3 | 256 | PASS | 193.4 | 466.6 | 2.1 | 2.5 | +83% / -43% |
| 128K | 3 | 512 | PASS | 193.3 | 280.7 | 3.6 | 4.5 | +83% / -42% |
| 128K | 5 | 256 | PASS ⚠ KV tight | 290.4 | 859.0 | 1.2 | 2.5 | +83% / -44% |
| 128K | 5 | 512 | PASS ⚠ KV tight | 290.4 | 488.7 | 2.0 | 4.7 | +84% / -43% |

## NVFP4
*Weight precision (KV fp8)*

| Input | NP | Output | Status | TTFT s | TPOT ms | Decode TPS | Agg TPS | vs baseline (TTFT / agg TPS) |
|---|---|---|---|---|---|---|---|---|
| 8K | 1 | 256 | PASS | 1.2 | 36.4 | 27.4 | 24.5 | -27% / +23% |
| 8K | 1 | 512 | PASS | 1.1 | 36.5 | 27.4 | 25.9 | -18% / +21% |
| 8K | 3 | 256 | PASS | 2.7 | 40.0 | 25.0 | 59.3 | -17% / +56% |
| 8K | 3 | 512 | PASS | 2.7 | 38.6 | 25.9 | 68.4 | -17% / +62% |
| 8K | 5 | 256 | PASS | 4.2 | 47.8 | 20.9 | 77.9 | -17% / +44% |
| 8K | 5 | 512 | PASS | 4.2 | 45.0 | 22.2 | 94.1 | -17% / +49% |
| 64K | 1 | 256 | PASS | 16.0 | 39.4 | 25.4 | 9.8 | -10% / +15% |
| 64K | 1 | 512 | PASS | 16.0 | 39.7 | 25.2 | 14.1 | -11% / +16% |
| 64K | 3 | 256 | PASS | 32.8 | 105.3 | 9.5 | 12.8 | -11% / +21% |
| 64K | 3 | 512 | PASS | 32.9 | 75.4 | 13.3 | 21.4 | -11% / +26% |
| 64K | 5 | 256 | PASS | 49.3 | 175.1 | 5.7 | 13.5 | -11% / +17% |
| 64K | 5 | 512 | PASS | 49.4 | 114.8 | 8.7 | 23.5 | -11% / +20% |
| 128K | 1 | 256 | PASS | 48.2 | 42.4 | 23.6 | 4.3 | -7% / +10% |
| 128K | 1 | 512 | PASS | 48.5 | 42.7 | 23.4 | 7.3 | -7% / +11% |
| 128K | 3 | 256 | PASS | 97.8 | 239.1 | 4.2 | 4.8 | -7% / +11% |
| 128K | 3 | 512 | PASS | 97.6 | 146.2 | 6.8 | 8.9 | -7% / +14% |
| 128K | 5 | 256 | PASS | 146.3 | 436.0 | 2.3 | 4.9 | -8% / +10% |
| 128K | 5 | 512 | PASS | 146.0 | 252.0 | 4.0 | 9.3 | -8% / +12% |

## fp8 online
*Weight precision (KV fp8)*

| Input | NP | Output | Status | TTFT s | TPOT ms | Decode TPS | Agg TPS | vs baseline (TTFT / agg TPS) |
|---|---|---|---|---|---|---|---|---|
| 8K | 1 | 256 | PASS | 1.3 | 28.5 | 35.1 | 30.0 | -22% / +51% |
| 8K | 1 | 512 | PASS | 1.2 | 28.5 | 35.1 | 32.4 | -11% / +52% |
| 8K | 3 | 256 | PASS | 3.0 | 42.1 | 23.7 | 55.8 | -9% / +47% |
| 8K | 3 | 512 | PASS | 3.0 | 40.0 | 25.0 | 65.6 | -9% / +55% |
| 8K | 5 | 256 | PASS | 4.6 | 49.0 | 20.4 | 74.5 | -8% / +37% |
| 8K | 5 | 512 | PASS | 4.6 | 46.1 | 21.7 | 90.7 | -8% / +44% |
| 64K | 1 | 256 | PASS | 16.7 | 31.5 | 31.7 | 10.4 | -7% / +21% |
| 64K | 1 | 512 | PASS | 16.7 | 31.6 | 31.6 | 15.6 | -7% / +28% |
| 64K | 3 | 256 | PASS | 34.4 | 109.2 | 9.2 | 12.3 | -7% / +16% |
| 64K | 3 | 512 | PASS | 34.3 | 77.6 | 12.9 | 20.7 | -7% / +22% |
| 64K | 5 | 256 | PASS | 51.6 | 181.6 | 5.5 | 13.0 | -7% / +12% |
| 64K | 5 | 512 | PASS | 51.6 | 118.2 | 8.5 | 22.7 | -7% / +16% |
| 128K | 1 | 256 | PASS | 49.5 | 34.4 | 29.1 | 4.4 | -5% / +11% |
| 128K | 1 | 512 | PASS | 49.6 | 34.6 | 28.9 | 7.6 | -5% / +16% |
| 128K | 3 | 256 | PASS | 100.4 | 244.8 | 4.1 | 4.7 | -5% / +8% |
| 128K | 3 | 512 | PASS | 100.1 | 149.1 | 6.7 | 8.7 | -5% / +12% |
| 128K | 5 | 256 | PASS | 150.7 | 448.4 | 2.2 | 4.8 | -5% / +7% |
| 128K | 5 | 512 | PASS | 151.9 | 262.0 | 3.8 | 8.9 | -4% / +7% |

## fp8 pre-quantized
*Weight precision (KV fp8)*

| Input | NP | Output | Status | TTFT s | TPOT ms | Decode TPS | Agg TPS | vs baseline (TTFT / agg TPS) |
|---|---|---|---|---|---|---|---|---|
| 8K | 1 | 256 | PASS | 1.2 | 28.6 | 34.9 | 30.0 | -23% / +51% |
| 8K | 1 | 512 | PASS | 1.2 | 28.6 | 34.9 | 32.3 | -12% / +51% |
| 8K | 3 | 256 | PASS | 2.9 | 41.4 | 24.2 | 56.9 | -11% / +49% |
| 8K | 3 | 512 | PASS | 2.9 | 40.1 | 24.9 | 65.5 | -11% / +55% |
| 8K | 5 | 256 | PASS | 4.5 | 49.1 | 20.4 | 75.0 | -10% / +38% |
| 8K | 5 | 512 | PASS | 4.5 | 46.1 | 21.7 | 91.1 | -11% / +44% |
| 64K | 1 | 256 | PASS | 16.5 | 31.3 | 31.9 | 10.4 | -8% / +22% |
| 64K | 1 | 512 | PASS | 16.6 | 31.5 | 31.7 | 15.7 | -8% / +29% |
| 64K | 3 | 256 | PASS | 34.0 | 108.7 | 9.2 | 12.4 | -8% / +17% |
| 64K | 3 | 512 | PASS | 33.9 | 77.1 | 13.0 | 20.9 | -8% / +23% |
| 64K | 5 | 256 | PASS ⚠ KV tight | 53.1 | 163.5 | 6.1 | 12.2 | -4% / +6% |
| 64K | 5 | 512 | PASS ⚠ KV tight | 56.0 | 106.5 | 9.4 | 20.2 | +1% / +3% |
| 128K | 1 | 256 | PASS | 49.3 | 34.0 | 29.4 | 4.4 | -5% / +12% |
| 128K | 1 | 512 | PASS | 49.4 | 34.4 | 29.1 | 7.6 | -5% / +16% |
| 128K | 3 | 256 | PASS ⚠ KV tight | 102.8 | 168.3 | 5.9 | 4.6 | -3% / +5% |
| 128K | 3 | 512 | PASS ⚠ KV tight | 106.4 | 104.3 | 9.6 | 8.2 | +1% / +5% |
| 128K | 5 | 256 | PASS ⚠ KV tight | 157.7 | 195.4 | 5.1 | 4.6 | -0% / +2% |
| 128K | 5 | 512 | PASS ⚠ KV tight | 166.3 | 118.5 | 8.4 | 8.3 | +5% / -0% |

## int8 AWQ
*Weight precision (KV fp8)*

**No results.** Failed to start (1 attempt(s)): `ValueError: No available memory for the cache blocks. The extensible KV cache already takes all device memory left after the model and its activations; decrease `max_model_len` or `max_num_seqs`, or t`

## int4 AWQ
*Weight precision (KV fp8)*

**No results.** Failed to start (3 attempt(s)): `ValueError: No available memory for the cache blocks. The extensible KV cache already takes all device memory left after the model and its activations; decrease `max_model_len` or `max_num_seqs`, or t`

## KV fp8
*KV cache type, bf16 weights*

| Input | NP | Output | Status | TTFT s | TPOT ms | Decode TPS | Agg TPS | vs baseline (TTFT / agg TPS) |
|---|---|---|---|---|---|---|---|---|
| 8K | 1 | 256 | PASS | 1.6 | 44.3 | 22.6 | 19.8 | — |
| 8K | 1 | 512 | PASS | 1.4 | 44.2 | 22.6 | 21.4 | — |
| 8K | 3 | 256 | PASS | 3.3 | 66.1 | 15.1 | 38.1 | — |
| 8K | 3 | 512 | PASS | 3.3 | 64.7 | 15.5 | 42.2 | — |
| 8K | 5 | 256 | PASS | 5.0 | 72.5 | 13.8 | 54.2 | — |
| 8K | 5 | 512 | PASS | 5.0 | 69.3 | 14.4 | 63.1 | — |
| 64K | 1 | 256 | PASS | 17.9 | 47.0 | 21.3 | 8.6 | — |
| 64K | 1 | 512 | PASS | 18.0 | 47.2 | 21.2 | 12.2 | — |
| 64K | 3 | 256 | PASS | 36.8 | 138.6 | 7.2 | 10.6 | — |
| 64K | 3 | 512 | PASS | 36.7 | 104.7 | 9.6 | 16.9 | — |
| 64K | 5 | 256 | PASS | 55.3 | 213.8 | 4.7 | 11.6 | — |
| 64K | 5 | 512 | PASS | 55.2 | 145.2 | 6.9 | 19.6 | — |
| 128K | 1 | 256 | PASS | 52.0 | 50.0 | 20.0 | 4.0 | — |
| 128K | 1 | 512 | PASS | 52.2 | 50.2 | 19.9 | 6.6 | — |
| 128K | 3 | 256 | PASS | 105.4 | 277.8 | 3.6 | 4.3 | — |
| 128K | 3 | 512 | PASS | 105.4 | 178.4 | 5.6 | 7.8 | — |
| 128K | 5 | 256 | PASS | 158.3 | 488.9 | 2.0 | 4.5 | — |
| 128K | 5 | 512 | PASS | 158.2 | 289.8 | 3.5 | 8.3 | — |

## KV full precision (auto)
*KV cache type, bf16 weights*

| Input | NP | Output | Status | TTFT s | TPOT ms | Decode TPS | Agg TPS | vs baseline (TTFT / agg TPS) |
|---|---|---|---|---|---|---|---|---|
| 8K | 1 | 256 | PASS | 1.7 | 44.6 | 22.4 | 19.7 | +3% / -1% |
| 8K | 1 | 512 | PASS | 1.6 | 44.7 | 22.4 | 20.9 | +17% / -2% |
| 8K | 3 | 256 | PASS | 3.9 | 68.9 | 14.5 | 35.7 | +19% / -6% |
| 8K | 3 | 512 | PASS | 3.8 | 67.8 | 14.7 | 39.8 | +17% / -6% |
| 8K | 5 | 256 | PASS | 5.9 | 77.3 | 12.9 | 49.8 | +17% / -8% |
| 8K | 5 | 512 | PASS ⚠ KV tight | 5.9 | 73.0 | 13.7 | 59.1 | +17% / -6% |
| 64K | 1 | 256 | PASS | 29.5 | 49.8 | 20.1 | 6.1 | +65% / -29% |
| 64K | 1 | 512 | PASS | 29.2 | 50.0 | 20.0 | 9.3 | +63% / -23% |
| 64K | 3 | 256 | PASS | 59.1 | 190.3 | 5.3 | 7.1 | +61% / -33% |
| 64K | 3 | 512 | PASS | 59.0 | 134.6 | 7.4 | 12.0 | +61% / -29% |
| 64K | 5 | 256 | PASS | 88.8 | 314.5 | 3.2 | 7.5 | +61% / -35% |
| 64K | 5 | 512 | PASS | 88.7 | 203.1 | 4.9 | 13.2 | +61% / -33% |
| 128K | 1 | 256 | PASS | 96.1 | 55.6 | 18.0 | 2.3 | +85% / -41% |
| 128K | 1 | 512 | PASS | 96.1 | 55.7 | 18.0 | 4.1 | +84% / -37% |
| 128K | 3 | 256 | PASS | 193.4 | 466.6 | 2.1 | 2.5 | +83% / -43% |
| 128K | 3 | 512 | PASS | 193.3 | 280.7 | 3.6 | 4.5 | +83% / -42% |
| 128K | 5 | 256 | PASS ⚠ KV tight | 290.4 | 859.0 | 1.2 | 2.5 | +83% / -44% |
| 128K | 5 | 512 | PASS ⚠ KV tight | 290.4 | 488.7 | 2.0 | 4.7 | +84% / -43% |

## NVFP4 weights · KV fp8
*KV cache type, NVFP4 weights*

| Input | NP | Output | Status | TTFT s | TPOT ms | Decode TPS | Agg TPS | vs baseline (TTFT / agg TPS) |
|---|---|---|---|---|---|---|---|---|
| 8K | 1 | 256 | PASS | 1.2 | 36.4 | 27.4 | 24.5 | — |
| 8K | 1 | 512 | PASS | 1.1 | 36.5 | 27.4 | 25.9 | — |
| 8K | 3 | 256 | PASS | 2.7 | 40.0 | 25.0 | 59.3 | — |
| 8K | 3 | 512 | PASS | 2.7 | 38.6 | 25.9 | 68.4 | — |
| 8K | 5 | 256 | PASS | 4.2 | 47.8 | 20.9 | 77.9 | — |
| 8K | 5 | 512 | PASS | 4.2 | 45.0 | 22.2 | 94.1 | — |
| 64K | 1 | 256 | PASS | 16.0 | 39.4 | 25.4 | 9.8 | — |
| 64K | 1 | 512 | PASS | 16.0 | 39.7 | 25.2 | 14.1 | — |
| 64K | 3 | 256 | PASS | 32.8 | 105.3 | 9.5 | 12.8 | — |
| 64K | 3 | 512 | PASS | 32.9 | 75.4 | 13.3 | 21.4 | — |
| 64K | 5 | 256 | PASS | 49.3 | 175.1 | 5.7 | 13.5 | — |
| 64K | 5 | 512 | PASS | 49.4 | 114.8 | 8.7 | 23.5 | — |
| 128K | 1 | 256 | PASS | 48.2 | 42.4 | 23.6 | 4.3 | — |
| 128K | 1 | 512 | PASS | 48.5 | 42.7 | 23.4 | 7.3 | — |
| 128K | 3 | 256 | PASS | 97.8 | 239.1 | 4.2 | 4.8 | — |
| 128K | 3 | 512 | PASS | 97.6 | 146.2 | 6.8 | 8.9 | — |
| 128K | 5 | 256 | PASS | 146.3 | 436.0 | 2.3 | 4.9 | — |
| 128K | 5 | 512 | PASS | 146.0 | 252.0 | 4.0 | 9.3 | — |

## NVFP4 weights · NVFP4 KV cache
*KV cache type, NVFP4 weights*

| Input | NP | Output | Status | TTFT s | TPOT ms | Decode TPS | Agg TPS | vs baseline (TTFT / agg TPS) |
|---|---|---|---|---|---|---|---|---|
| 8K | 1 | 256 | PASS | 1.2 | 38.2 | 26.2 | 23.4 | +2% / -4% |
| 8K | 1 | 512 | PASS | 1.2 | 38.4 | 26.0 | 24.6 | +2% / -5% |
| 8K | 3 | 256 | PASS | 3.0 | 40.3 | 24.8 | 57.5 | +13% / -3% |
| 8K | 3 | 512 | PASS | 3.0 | 39.5 | 25.3 | 66.0 | +13% / -4% |
| 8K | 5 | 256 | PASS | 4.7 | 46.3 | 21.6 | 77.0 | +14% / -1% |
| 8K | 5 | 512 | PASS | 4.7 | 44.7 | 22.4 | 92.6 | +14% / -2% |
| 64K | 1 | 256 | PASS | 19.3 | 39.8 | 25.1 | 8.7 | +21% / -12% |
| 64K | 1 | 512 | PASS | 19.3 | 40.1 | 24.9 | 12.9 | +20% / -9% |
| 64K | 3 | 256 | PASS | 40.0 | 113.8 | 8.8 | 11.1 | +22% / -13% |
| 64K | 3 | 512 | PASS | 40.1 | 78.7 | 12.7 | 19.1 | +22% / -11% |
| 64K | 5 | 256 | PASS | 59.9 | 193.3 | 5.2 | 11.7 | +22% / -14% |
| 64K | 5 | 512 | PASS | 60.0 | 122.0 | 8.2 | 20.8 | +22% / -12% |
| 128K | 1 | 256 | PASS | 62.2 | 41.9 | 23.9 | 3.5 | +29% / -19% |
| 128K | 1 | 512 | PASS | 62.5 | 41.9 | 23.9 | 6.1 | +29% / -16% |
| 128K | 3 | 256 | PASS | 126.0 | 285.6 | 3.5 | 3.9 | +29% / -20% |
| 128K | 3 | 512 | PASS | 126.0 | 167.5 | 6.0 | 7.2 | +29% / -18% |
| 128K | 5 | 256 | PASS | 188.8 | 534.7 | 1.9 | 3.9 | +29% / -21% |
| 128K | 5 | 512 | PASS | 188.9 | 297.2 | 3.4 | 7.5 | +29% / -19% |

## NVFP4 weights + NVFP4 KV · MTP off
*MTP (natural-text prompts)* · Natural-text prompts (Python docs); the baseline of the MTP comparison.

| Input | NP | Output | Status | TTFT s | TPOT ms | Decode TPS | Agg TPS | vs baseline (TTFT / agg TPS) |
|---|---|---|---|---|---|---|---|---|
| 8K | 1 | 256 | PASS | 1.2 | 38.2 | 26.2 | 23.3 | — |
| 8K | 1 | 512 | PASS | 1.2 | 38.2 | 26.1 | 24.7 | — |
| 8K | 3 | 256 | PASS | 3.1 | 40.1 | 24.9 | 57.5 | — |
| 8K | 3 | 512 | PASS | 3.1 | 39.1 | 25.5 | 66.5 | — |
| 8K | 5 | 256 | PASS | 4.8 | 46.0 | 21.8 | 77.3 | — |
| 8K | 5 | 512 | PASS | 4.8 | 44.0 | 22.7 | 93.7 | — |

## NVFP4 weights + NVFP4 KV · MTP on (repeated-block prompts)
*MTP (natural-text prompts)* · OVER-STATES MTP: the prompt repeats one block, the output is repetitive and ~100% of draft tokens are accepted. Shown only to document the mistake.

**MTP acceptance** (vLLM `SpecDecoding metrics`, 6 samples): mean acceptance length **3.99** of max 4.0, draft tokens accepted **99.4%**.

| Input | NP | Output | Status | TTFT s | TPOT ms | Decode TPS | Agg TPS | vs baseline (TTFT / agg TPS) |
|---|---|---|---|---|---|---|---|---|
| 8K | 1 | 256 | PASS | 1.3 | 14.4 | 69.6 | 51.2 | +9% / +119% |
| 8K | 1 | 512 | PASS | 1.3 | 14.4 | 69.6 | 59.3 | +9% / +140% |
| 8K | 3 | 256 | PASS | 3.4 | 18.1 | 55.3 | 95.1 | +9% / +65% |
| 8K | 3 | 512 | PASS | 3.4 | 17.3 | 57.7 | 124.6 | +10% / +87% |
| 8K | 5 | 256 | PASS | 5.3 | 22.2 | 45.1 | 114.3 | +10% / +48% |
| 8K | 5 | 512 | PASS | 5.3 | 20.1 | 49.9 | 163.6 | +10% / +75% |

## Observations

- **bf16 weights · MTP on**: best aggregate TPS 85.3 tok/s at NP5 · 8K · out 512; lowest 23.7 tok/s at NP1 · 8K · out 256.
- **QAT checkpoint · KV fp8**: best aggregate TPS 55.9 tok/s at NP5 · 8K · out 512; lowest 20.1 tok/s at NP1 · 8K · out 256.
- **QAT checkpoint · NVFP4 KV**: best aggregate TPS 53.8 tok/s at NP5 · 8K · out 512; lowest 18.8 tok/s at NP1 · 8K · out 256.
- **QAT checkpoint · MTP on (QAT assistant)**: best aggregate TPS 84.5 tok/s at NP5 · 8K · out 512; lowest 33.3 tok/s at NP1 · 8K · out 256.
- **NVFP4 weights + NVFP4 KV · MTP on**: best aggregate TPS 131.9 tok/s at NP5 · 8K · out 512; lowest 39.1 tok/s at NP1 · 8K · out 256.

## Caveats
- One run per case, not averaged. TPOT is client-measured; short outputs under concurrency are dominated by other requests' prefill, so read TTFT for input cost and Decode TPS for steady generation.
- Speculative decoding (MTP) gain depends on how predictable the generated text is. The default benchmark prompt repeats one block of text, so the model's output is repetitive and the draft model is accepted ~100% of the time: that OVER-states MTP. Only MTP numbers measured on natural-text prompts (PROMPT_MODE=natural) with MTP off and on on the SAME prompts are a fair comparison; always quote the mean acceptance length.
- Results are for this machine, this vLLM build and these settings only; not comparable with other machines' tests.
