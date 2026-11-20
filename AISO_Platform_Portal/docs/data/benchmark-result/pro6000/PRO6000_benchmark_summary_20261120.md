# PRO6000 Benchmark · everything measured (backup summary)

*Generated 2026-11-20 from the platform's published datasets (`data/benchmark-*`, copied to `raw_backup/dataset_json/`) and the evidence files found under Desktop/TPISoftware. Nothing is estimated; a blank means the source has no value.*

## 1. What this is
A hand-over document for **NVIDIA RTX PRO 6000 Blackwell Server Edition (TPI 8-GPU system, 4 used)**: what was tested, with which settings, the numbers, the observations, what was not run, and where the evidence is. The same data is in the sheet next to this file (`PRO6000_benchmark_all_cases_20261120.xlsx` / `.csv`). The preflight data (manifests, runners, sha256 checks) is in `../Preflight/`.

## 2. Datasets
| Dataset file | Framework | Evidence until | Comparability | Cases PASS / rows | Models |
|---|---|---|---|---|---|
| AISO_PRO6000_vLLM_VIS_20260825.json | vLLM | 2026-08-25 | not_comparable | 240 / 240 | GPT-OSS-120B, Llama-3.3-70B |
| pro6000-vis.json | — | — | archive_not_comparable | 300 / 300 | GPT-OSS-120B, Llama-3.3-70B-Instruct |

### Machine, runtime and protocol (from each dataset's profile)
- **AISO_PRO6000_vLLM_VIS_20260825.json**: machine = PRO6000 · NVIDIA RTX PRO 6000 Blackwell Server Edition（TPI 8 GPU 系統）; framework = vLLM; runtime = UNVERIFIED; np = [1, 2, 4, 8, 16, 32]; input_tokens = [1024, 2048, 4096, 8192, 16384]; output_tokens = [1024, 2048]; repeat = Cold = Run1；Warm = Run2/Run3 平均
  - note: PRO6000（TPI 8 GPU 系統）vLLM VIS Benchmark：GPT-OSS-120B（NP 1–32）與 Llama-3.3-70B（NP 16 / 32），Input 1K–16K，Output 1K / 2K；每個條件含 Without aiDAPTIV、Cold（Run1）、Warm（Run2/Run3 平均）。數值取自 2026-08-25 PDF 報告表格。 Without aiDAPTIV 的 3 次逐次 TTFT 取自 PRO6000 原始 vis 結果檔，平均與 PDF 一致（差 0.6% 內）；吞吐、TPOT 與 Cold／Warm 無可核對的逐次數值。
  - comparability: 此資料為 aiDAPTIV Cold／Warm 的 VIS 測法（vLLM、GPT-OSS-120B 與 Llama-3.3-70B），與 B60 / B70 / AISO1 的 llama.cpp 壓力測試（Gemma / Laguna / Nemotron、NP 1–5）模型與條件不同，不可直接比較。Without aiDAPTIV 為無快取基準。TPOT 為 median（120B）／報告定義 (E2E−TTFT)/(output−1)（Llama）；Llama 數值由 PDF 圖片表格人工讀取。
- **pro6000-vis.json**: (no profile in the source)
  - comparability: 歷史彙整，測試條件各筆不同（見每筆的模型、量化、後端、NP、Input、Output、冷熱、Run）；機器歸屬與精度未註明者標「待核對」，不與壓力測試頁直接比較。

## 3. Results
*Values are the source dataset's own means (repeats are in the sheet). Blank = no value in the source.*

### 3.1 AISO_PRO6000_vLLM_VIS_20260825.json

**Aggregate TPS (tok/s)**

| Model | NP | 1024 | 2048 | 4096 | 8192 | 16384 |
|---|---|---|---|---|---|---|
| GPT-OSS-120B / cold | 1 | 169.6 | 170.9 | 162.8 | 144.9 | 119.2 |
| GPT-OSS-120B / cold | 2 | 275.1 | 279.6 | 255.9 | 210.6 | 194.4 |
| GPT-OSS-120B / cold | 4 | 430.6 | 442.9 | 437.9 | 412.4 | 326.4 |
| GPT-OSS-120B / cold | 8 | 865.0 | 886.3 | 766.2 | 687.8 | 487.6 |
| GPT-OSS-120B / cold | 16 | 1445.4 | 1381.9 | 1161.2 | 917.6 | 690.0 |
| GPT-OSS-120B / cold | 32 | 2200.2 | 2041.4 | 1626.9 | 1275.2 | 798.4 |
| GPT-OSS-120B / warm | 1 | 116.0 | 172.4 | 165.6 | 152.8 | 127.1 |
| GPT-OSS-120B / warm | 2 | 239.0 | 271.4 | 266.6 | 224.2 | 189.6 |
| GPT-OSS-120B / warm | 4 | 462.2 | 462.6 | 455.9 | 446.2 | 370.6 |
| GPT-OSS-120B / warm | 8 | 886.5 | 960.3 | 850.1 | 835.5 | 702.3 |
| GPT-OSS-120B / warm | 16 | 1494.4 | 1440.6 | 1311.0 | 1281.8 | 1071.8 |
| GPT-OSS-120B / warm | 32 | 2258.1 | 2220.3 | 2022.0 | 1887.8 | 1448.4 |
| GPT-OSS-120B / without | 1 | 172.8 | 179.6 | 168.5 | 147.2 | 109.3 |
| GPT-OSS-120B / without | 2 | 291.2 | 282.1 | 272.4 | 226.2 | 193.3 |
| GPT-OSS-120B / without | 4 | 497.6 | 472.0 | 458.9 | 425.9 | 334.8 |
| GPT-OSS-120B / without | 8 | 881.6 | 973.8 | 878.5 | 753.9 | 530.4 |
| GPT-OSS-120B / without | 16 | 1485.2 | 1379.1 | 1207.9 | 1060.8 | 762.2 |
| GPT-OSS-120B / without | 32 | 2308.0 | 2082.8 | 1753.7 | 1389.5 | 920.0 |
| Llama-3.3-70B / cold | 16 | 410.3 | 387.7 | 342.2 | 281.0 | 200.1 |
| Llama-3.3-70B / cold | 32 | 664.2 | 625.6 | 503.0 | 375.5 | 240.5 |
| Llama-3.3-70B / warm | 16 | 419.4 | 398.0 | 381.7 | 350.8 | 283.9 |
| Llama-3.3-70B / warm | 32 | 691.3 | 670.6 | 613.0 | 529.4 | 393.7 |
| Llama-3.3-70B / without | 16 | 414.6 | 383.8 | 349.6 | 290.0 | 209.0 |
| Llama-3.3-70B / without | 32 | 672.0 | 614.7 | 518.5 | 392.2 | 80.7 |

**TTFT (s)**

| Model | NP | 1024 | 2048 | 4096 | 8192 | 16384 |
|---|---|---|---|---|---|---|
| GPT-OSS-120B / cold | 1 | 0.16 | 0.14 | 0.26 | 0.49 | 0.95 |
| GPT-OSS-120B / cold | 2 | 0.10 | 0.14 | 0.26 | 0.63 | 1.35 |
| GPT-OSS-120B / cold | 4 | 0.10 | 0.15 | 0.28 | 1.12 | 2.10 |
| GPT-OSS-120B / cold | 8 | 0.14 | 0.27 | 0.64 | 1.92 | 3.84 |
| GPT-OSS-120B / cold | 16 | 0.19 | 0.45 | 1.25 | 3.28 | 6.97 |
| GPT-OSS-120B / cold | 32 | 0.57 | 1.04 | 2.76 | 6.48 | 13.98 |
| GPT-OSS-120B / warm | 1 | 0.06 | 0.07 | 0.08 | 0.12 | 0.19 |
| GPT-OSS-120B / warm | 2 | 0.05 | 0.06 | 0.08 | 0.12 | 0.20 |
| GPT-OSS-120B / warm | 4 | 0.05 | 0.06 | 0.08 | 0.11 | 0.24 |
| GPT-OSS-120B / warm | 8 | 0.05 | 0.06 | 0.08 | 0.15 | 0.26 |
| GPT-OSS-120B / warm | 16 | 0.05 | 0.06 | 0.09 | 0.18 | 0.46 |
| GPT-OSS-120B / warm | 32 | 0.06 | 0.09 | 0.13 | 0.56 | 1.57 |
| GPT-OSS-120B / without | 1 | 0.07 | 0.11 | 0.19 | 0.38 | 0.80 |
| GPT-OSS-120B / without | 2 | 0.07 | 0.12 | 0.21 | 0.51 | 1.06 |
| GPT-OSS-120B / without | 4 | 0.08 | 0.12 | 0.21 | 0.89 | 1.68 |
| GPT-OSS-120B / without | 8 | 0.10 | 0.22 | 0.48 | 1.51 | 3.10 |
| GPT-OSS-120B / without | 16 | 0.11 | 0.46 | 0.93 | 2.63 | 5.78 |
| GPT-OSS-120B / without | 32 | 0.35 | 1.03 | 2.23 | 5.30 | 11.73 |
| Llama-3.3-70B / cold | 16 | 2.83 | 4.34 | 10.22 | 20.76 | 41.20 |
| Llama-3.3-70B / cold | 32 | 5.18 | 7.74 | 19.18 | 38.99 | 79.68 |
| Llama-3.3-70B / warm | 16 | 0.15 | 0.31 | 0.59 | 1.68 | 3.29 |
| Llama-3.3-70B / warm | 32 | 0.28 | 0.67 | 1.32 | 3.57 | 7.28 |
| Llama-3.3-70B / without | 16 | 2.40 | 4.89 | 9.18 | 18.72 | 37.42 |
| Llama-3.3-70B / without | 32 | 4.64 | 8.86 | 17.28 | 35.18 | 72.85 |

**TPOT (ms/token)**

| Model | NP | 1024 | 2048 | 4096 | 8192 | 16384 |
|---|---|---|---|---|---|---|
| GPT-OSS-120B / cold | 1 | 5.8 | 5.8 | 6.0 | 6.5 | 7.7 |
| GPT-OSS-120B / cold | 2 | 7.1 | 7.0 | 7.6 | 8.7 | 9.1 |
| GPT-OSS-120B / cold | 4 | 8.8 | 8.0 | 8.2 | 8.7 | 10.4 |
| GPT-OSS-120B / cold | 8 | 8.2 | 8.1 | 9.0 | 9.9 | 12.5 |
| GPT-OSS-120B / cold | 16 | 10.2 | 10.8 | 11.8 | 13.7 | 17.6 |
| GPT-OSS-120B / cold | 32 | 13.1 | 14.1 | 16.8 | 19.9 | 29.6 |
| GPT-OSS-120B / warm | 1 | 5.8 | 5.8 | 6.0 | 6.5 | 7.7 |
| GPT-OSS-120B / warm | 2 | 7.1 | 7.2 | 7.4 | 8.5 | 9.0 |
| GPT-OSS-120B / warm | 4 | 7.7 | 7.8 | 7.9 | 8.6 | 9.8 |
| GPT-OSS-120B / warm | 8 | 7.9 | 7.7 | 8.4 | 9.0 | 10.6 |
| GPT-OSS-120B / warm | 16 | 9.9 | 10.4 | 10.9 | 11.7 | 13.9 |
| GPT-OSS-120B / warm | 32 | 13.0 | 13.3 | 14.7 | 15.9 | 20.4 |
| GPT-OSS-120B / without | 1 | 5.4 | 5.5 | 5.8 | 6.5 | 7.4 |
| GPT-OSS-120B / without | 2 | 6.8 | 6.9 | 7.1 | 8.1 | 9.0 |
| GPT-OSS-120B / without | 4 | 7.5 | 7.6 | 7.8 | 8.4 | 9.8 |
| GPT-OSS-120B / without | 8 | 7.8 | 7.8 | 8.4 | 9.1 | 11.4 |
| GPT-OSS-120B / without | 16 | 10.0 | 10.7 | 11.2 | 12.6 | 16.4 |
| GPT-OSS-120B / without | 32 | 12.9 | 13.7 | 15.7 | 18.5 | 26.4 |
| Llama-3.3-70B / cold | 16 | 39.0 | 41.3 | 46.8 | 57.1 | 81.4 |
| Llama-3.3-70B / cold | 32 | 48.2 | 51.2 | 63.8 | 86.0 | 134.9 |
| Llama-3.3-70B / warm | 16 | 38.2 | 40.2 | 41.9 | 45.6 | 56.4 |
| Llama-3.3-70B / warm | 32 | 46.0 | 47.7 | 52.2 | 60.5 | 81.3 |
| Llama-3.3-70B / without | 16 | 38.6 | 41.7 | 45.8 | 55.3 | 77.8 |
| Llama-3.3-70B / without | 32 | 47.6 | 52.1 | 61.9 | 82.2 | 412.0 |

### 3.2 pro6000-vis.json

**Aggregate TPS (tok/s)**

| Model | NP | 1024 | 2048 | 4096 | 8192 | 16384 |
|---|---|---|---|---|---|---|
| GPT-OSS-120B / Single-aiDAPTIV | 1 | 142.8 | 171.7 | 164.2 | 148.9 | 123.2 |
| GPT-OSS-120B / Single-aiDAPTIV | 2 | 257.1 | 275.5 | 261.3 | 217.4 | 192.0 |
| GPT-OSS-120B / Single-aiDAPTIV | 4 | 446.4 | 452.8 | 446.9 | 429.3 | 348.5 |
| GPT-OSS-120B / Single-aiDAPTIV | 8 | 875.8 | 923.3 | 808.2 | 761.7 | 595.0 |
| GPT-OSS-120B / Single-aiDAPTIV | 16 | 1469.9 | 1411.3 | 1236.0 | 1099.7 | 881.0 |
| GPT-OSS-120B / Single-aiDAPTIV | 32 | 2229.2 | 2130.9 | 1824.5 | 1581.5 | 1123.4 |
| GPT-OSS-120B / without aiDAPTIV | 1 | 172.8 | 179.6 | 168.5 | 147.2 | 109.3 |
| GPT-OSS-120B / without aiDAPTIV | 2 | 291.2 | 282.1 | 272.4 | 226.2 | 193.3 |
| GPT-OSS-120B / without aiDAPTIV | 4 | 497.6 | 472.0 | 458.9 | 425.9 | 334.8 |
| GPT-OSS-120B / without aiDAPTIV | 8 | 881.6 | 973.8 | 878.5 | 753.9 | 530.4 |
| GPT-OSS-120B / without aiDAPTIV | 16 | 1485.2 | 1379.1 | 1207.9 | 1060.8 | 762.2 |
| GPT-OSS-120B / without aiDAPTIV | 32 | 2308.0 | 2082.8 | 1753.7 | 1389.5 | 920.0 |
| Llama-3.3-70B-Instruct / Single-aiDAPTIV | 50 | 838.5 | 765.8 | 605.8 | 449.7 | 238.2 |
| Llama-3.3-70B-Instruct / Single-aiDAPTIV | 100 | 1225.1 | 1080.3 | 765.0 | 437.0 | 156.9 |
| Llama-3.3-70B-Instruct / with aiDAPTIV cold | 16 | 410.3 | 387.7 | 342.2 | 281.0 | 200.1 |
| Llama-3.3-70B-Instruct / with aiDAPTIV cold | 32 | 664.2 | 625.6 | 503.0 | 375.5 | 240.5 |
| Llama-3.3-70B-Instruct / with aiDAPTIV warm | 16 | 419.4 | 398.0 | 381.7 | 350.8 | 283.9 |
| Llama-3.3-70B-Instruct / with aiDAPTIV warm | 32 | 696.3 | 670.6 | 613.0 | 529.4 | 393.7 |
| Llama-3.3-70B-Instruct / without aiDAPTIV | 16 | 414.6 | 383.8 | 349.6 | 290.0 | 209.0 |
| Llama-3.3-70B-Instruct / without aiDAPTIV | 32 | 672.0 | 614.7 | 518.5 | 392.2 | 80.7 |
| Llama-3.3-70B-Instruct / without aiDAPTIV | 50 | 790.1 | 659.7 | 495.4 | 329.0 | 62.2 |
| Llama-3.3-70B-Instruct / without aiDAPTIV | 100 | 1122.6 | 877.8 | 581.5 | 237.0 | 48.4 |

**TTFT (s)**

| Model | NP | 1024 | 2048 | 4096 | 8192 | 16384 |
|---|---|---|---|---|---|---|
| GPT-OSS-120B / Single-aiDAPTIV | 1 | 0.11 | 0.11 | 0.17 | 0.30 | 0.57 |
| GPT-OSS-120B / Single-aiDAPTIV | 2 | 0.07 | 0.10 | 0.17 | 0.38 | 0.77 |
| GPT-OSS-120B / Single-aiDAPTIV | 4 | 0.07 | 0.10 | 0.18 | 0.61 | 1.17 |
| GPT-OSS-120B / Single-aiDAPTIV | 8 | 0.09 | 0.17 | 0.36 | 1.04 | 2.05 |
| GPT-OSS-120B / Single-aiDAPTIV | 16 | 0.12 | 0.25 | 0.67 | 1.73 | 3.71 |
| GPT-OSS-120B / Single-aiDAPTIV | 32 | 0.31 | 0.57 | 1.44 | 3.52 | 7.77 |
| GPT-OSS-120B / without aiDAPTIV | 1 | 0.07 | 0.11 | 0.19 | 0.38 | 0.80 |
| GPT-OSS-120B / without aiDAPTIV | 2 | 0.07 | 0.12 | 0.21 | 0.51 | 1.06 |
| GPT-OSS-120B / without aiDAPTIV | 4 | 0.08 | 0.12 | 0.21 | 0.89 | 1.68 |
| GPT-OSS-120B / without aiDAPTIV | 8 | 0.10 | 0.22 | 0.48 | 1.51 | 3.10 |
| GPT-OSS-120B / without aiDAPTIV | 16 | 0.11 | 0.46 | 0.93 | 2.63 | 5.78 |
| GPT-OSS-120B / without aiDAPTIV | 32 | 0.35 | 1.03 | 2.23 | 5.30 | 11.73 |
| Llama-3.3-70B-Instruct / Single-aiDAPTIV | 50 | 0.00 | 0.01 | 0.02 | 0.03 | 0.11 |
| Llama-3.3-70B-Instruct / Single-aiDAPTIV | 100 | 0.01 | 0.01 | 0.03 | 0.11 | 0.38 |
| Llama-3.3-70B-Instruct / with aiDAPTIV cold | 16 | 2.83 | 4.34 | 10.22 | 20.76 | 41.20 |
| Llama-3.3-70B-Instruct / with aiDAPTIV cold | 32 | 5.18 | 7.74 | 19.18 | 38.99 | 79.68 |
| Llama-3.3-70B-Instruct / with aiDAPTIV warm | 16 | 0.15 | 0.31 | 0.59 | 1.68 | 3.29 |
| Llama-3.3-70B-Instruct / with aiDAPTIV warm | 32 | 0.28 | 0.67 | 1.32 | 3.57 | 7.28 |
| Llama-3.3-70B-Instruct / without aiDAPTIV | 16 | 2.40 | 4.89 | 9.18 | 18.72 | 37.42 |
| Llama-3.3-70B-Instruct / without aiDAPTIV | 32 | 4.64 | 8.86 | 17.28 | 35.18 | 72.85 |
| Llama-3.3-70B-Instruct / without aiDAPTIV | 50 | 0.01 | 0.01 | 0.03 | 0.05 | 0.40 |
| Llama-3.3-70B-Instruct / without aiDAPTIV | 100 | 0.01 | 0.03 | 0.05 | 0.21 | 1.12 |

**TPOT (ms/token)**

| Model | NP | 1024 | 2048 | 4096 | 8192 | 16384 |
|---|---|---|---|---|---|---|
| GPT-OSS-120B / Single-aiDAPTIV | 1 | 5.8 | 5.8 | 6.0 | 6.5 | 7.7 |
| GPT-OSS-120B / Single-aiDAPTIV | 2 | 7.1 | 7.1 | 7.5 | 8.6 | 9.1 |
| GPT-OSS-120B / Single-aiDAPTIV | 4 | 8.3 | 7.9 | 8.1 | 8.6 | 10.1 |
| GPT-OSS-120B / Single-aiDAPTIV | 8 | 8.1 | 7.9 | 8.7 | 9.4 | 11.6 |
| GPT-OSS-120B / Single-aiDAPTIV | 16 | 10.1 | 10.6 | 11.4 | 12.7 | 15.7 |
| GPT-OSS-120B / Single-aiDAPTIV | 32 | 13.0 | 13.7 | 15.7 | 17.9 | 25.0 |
| GPT-OSS-120B / without aiDAPTIV | 1 | 5.4 | 5.5 | 5.8 | 6.5 | 7.4 |
| GPT-OSS-120B / without aiDAPTIV | 2 | 6.8 | 6.9 | 7.1 | 8.1 | 9.0 |
| GPT-OSS-120B / without aiDAPTIV | 4 | 7.5 | 7.6 | 7.8 | 8.4 | 9.8 |
| GPT-OSS-120B / without aiDAPTIV | 8 | 7.8 | 7.8 | 8.4 | 9.1 | 11.4 |
| GPT-OSS-120B / without aiDAPTIV | 16 | 10.0 | 10.7 | 11.2 | 12.6 | 16.4 |
| GPT-OSS-120B / without aiDAPTIV | 32 | 12.9 | 13.7 | 15.7 | 18.5 | 26.4 |
| Llama-3.3-70B-Instruct / Single-aiDAPTIV | 50 | 56.6 | 61.3 | 75.2 | 101.1 | 116.5 |
| Llama-3.3-70B-Instruct / Single-aiDAPTIV | 100 | 76.6 | 85.8 | 112.9 | 126.2 | 177.7 |
| Llama-3.3-70B-Instruct / with aiDAPTIV cold | 16 | 39.0 | 41.3 | 46.8 | 57.1 | 81.4 |
| Llama-3.3-70B-Instruct / with aiDAPTIV cold | 32 | 48.2 | 51.2 | 63.8 | 86.0 | 134.9 |
| Llama-3.3-70B-Instruct / with aiDAPTIV warm | 16 | 38.2 | 40.2 | 41.9 | 45.6 | 56.4 |
| Llama-3.3-70B-Instruct / with aiDAPTIV warm | 32 | 46.0 | 47.7 | 52.2 | 60.5 | 81.3 |
| Llama-3.3-70B-Instruct / without aiDAPTIV | 16 | 38.6 | 41.7 | 45.8 | 55.3 | 77.8 |
| Llama-3.3-70B-Instruct / without aiDAPTIV | 32 | 47.6 | 52.1 | 61.9 | 82.2 | 412.0 |
| Llama-3.3-70B-Instruct / without aiDAPTIV | 50 | 57.8 | 65.7 | 81.8 | 115.0 | 472.1 |
| Llama-3.3-70B-Instruct / without aiDAPTIV | 100 | 78.9 | 95.0 | 127.8 | 218.7 | 641.9 |

## 4. Observations (computed from the numbers above)
- **AISO_PRO6000_vLLM_VIS_20260825.json**: highest aggregate TPS 2410.1 tok/s (GPT-OSS-120B / without, NP32, input 1024); lowest 65.1 tok/s (Llama-3.3-70B / without, NP32, input 16384); mean aggregate TPS by model: GPT-OSS-120B / warm 826.4; GPT-OSS-120B / without 753.3; GPT-OSS-120B / cold 708.8; Llama-3.3-70B / warm 473.2; Llama-3.3-70B / cold 403.0; Llama-3.3-70B / without 392.5.
- **pro6000-vis.json**: highest aggregate TPS 2410.1 tok/s (GPT-OSS-120B / without aiDAPTIV, NP32, input 1024); lowest 48.1 tok/s (Llama-3.3-70B-Instruct / without aiDAPTIV, NP100, input 16384); mean aggregate TPS by model: GPT-OSS-120B / Single-aiDAPTIV 767.6; GPT-OSS-120B / without aiDAPTIV 753.3; Llama-3.3-70B-Instruct / Single-aiDAPTIV 656.2; Llama-3.3-70B-Instruct / with aiDAPTIV warm 473.7; Llama-3.3-70B-Instruct / without aiDAPTIV 456.4; Llama-3.3-70B-Instruct / with aiDAPTIV cold 403.0.

## 5. Runs that did not finish, partial and not run
| Dataset | Kind | Detail |
|---|---|---|
| AISO_PRO6000_vLLM_VIS_20260825.json | not_run | model=Llama-3.3-70B; reason=報告只涵蓋 NP16 / NP32（NP1–8 無資料） |

## 6. Gaps and cautions
- The data comes from the 2026-08-25 PDF report tables and three raw result text files; throughput, TPOT, Cold and Warm values have no per-repeat source except the three 'without aiDAPTIV' TTFT repeats.
- The measurements use vLLM with aiDAPTIV (Without / Cold / Warm) on 4 of 8 GPUs: **not comparable** with the llama.cpp stress tests of the other machines.
- Llama-3.3-70B has data only for NP16 and NP32.
- Every case is a single recorded value or the source's own mean; see each dataset's profile for the number of repeats.

## 7. Where the data is (this folder = `NVIDIA/PRO6000/benchmark_Result/`)
| Path | Content |
|---|---|
| `PRO6000_benchmark_summary_20261120.md` | this file |
| `PRO6000_benchmark_all_cases_20261120.xlsx` | sheets: README, Datasets, Cases, Summary, Model_parity, Config_by_model, Not_run_partial, Evidence_files |
| `PRO6000_benchmark_all_cases_20261120.csv` | the Cases sheet as CSV |
| `raw_backup/dataset_json/` | the platform datasets this was built from |
| `raw_backup/evidence/` | the three raw result text files (`PRO6000_evidence/`); the former separate folder `NVIDIA/PRO6000_evidence/` held only these same files and was removed on 2026-11-20 (Trash) |
| `reports/` | published reports, where one exists |
| `../Preflight/` | manifests, runners and the sha256 comparison |

