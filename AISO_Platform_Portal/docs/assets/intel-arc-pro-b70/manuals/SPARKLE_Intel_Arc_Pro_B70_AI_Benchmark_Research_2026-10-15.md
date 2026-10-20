# SPARKLE Intel Arc Pro B70｜AI Benchmark 研究

> 更新日期：2026-10-15  
> 資料性質：公開研究與測試規劃  
> 證據狀態：官方規格＋第三方公開 Benchmark；**不是 AISO 內部實測結果**

## 研究目的

Intel Arc Pro B70 是面向專業工作站與 AI 推論的 32GB GPU。這份研究用來建立 AISO／SparkleBenchmark 的測試基線，回答以下問題：

1. B70 採用什麼 GPU 架構，適合哪些 AI 工作負載？
2. 公開 Benchmark 在什麼模型、精度、Backend 與機器條件下得到哪些結果？
3. AISO 後續應如何設計單卡、雙卡及多卡的可重現測試？

## Xe2／Battlemage 是什麼？

是，**Xe2 是 Intel 自家的第二代 Xe GPU 微架構**；**Battlemage 是 Intel 對這一代獨立 GPU 產品家族使用的架構代號**。Intel 官方將 Arc Pro B70 標示為：

- Microarchitecture：Xe2
- Code name：Products formerly Battlemage
- Xe2-HPG：偏向高效能圖形與運算的實作方向
- XMX：Intel Xe Matrix Extensions，負責矩陣與 AI 運算加速

因此 `Xe2` 是正式微架構名稱，`Battlemage` 是世代／產品架構代號，兩者不是不同 GPU。

## 1. 官方硬體規格

| 項目 | Intel Arc Pro B70 |
|---|---|
| GPU 架構 | Intel Xe2（Battlemage） |
| 製程 | TSMC N5 |
| VRAM | 32GB GDDR6 |
| Memory Interface | 256-bit |
| Memory Bandwidth | 608 GB/s |
| Xe Cores | 32 |
| XMX Engines | 256 |
| FP32 Compute | 22.94 TFLOPS |
| INT8 Peak | 367 TOPS（Dense） |
| PCIe | PCIe 5.0 x16 |
| ECC | 支援 |
| Intel Reference TBP | 230W |
| 上市時間 | 2026 Q1 |

### SPARKLE SKU

| SKU | 已核對資訊 | 證據狀態 |
|---|---|---|
| SPARKLE B70 Blower 32GB（SBP70W-32G） | 32GB、2-slot、Blower、TBP 330W | SPARKLE 官方產品頁／Spec Sheet已核對 |
| SPARKLE B70 Passive 32GB | 使用者研究資料記載 275W | 尚待官方產品頁或 Spec Sheet 核對 |

不同 SPARKLE SKU 的散熱、TBP 與機箱風道條件不同。AISO 正式測試必須記錄完整 Part Number，不能只寫「B70」。

## 2. 已核對的第三方公開 Benchmark

### 2.1 llama.cpp + SYCL｜單張 B70｜GGUF 4-bit

來源為 PMZFX 公開 Benchmark repository。測試工具為 `llama-bench`，Backend 為 SYCL／Intel Level Zero；主要條件為 `pp512`、`tg128`、模型 GPU offload、預設 5 次 iterations。這些是第三方工作站實測，不是 SPARKLE 或 AISO 保證值。

| Model | 類型／量化 | GPU | Prompt Processing | Generation |
|---|---|---:|---:|---:|
| Llama 3.1 8B Instruct | Dense／Q4_K_M | 1× B70 | 2,452 tok/s | 82.6 tok/s |
| Qwen 3.5 9B | Dense／Q4_K_M | 1× B70 | 2,302 tok/s | 60.2 tok/s |
| Qwen 3.6 35B-A3B | MoE／UD-Q4_K_M | 1× B70 | 615 tok/s | 54.7 tok/s |
| Qwen 3.5 27B | Dense／Q4_K_M | 1× B70 | 約 725 tok/s | 約 20.6 tok/s |

解讀限制：

- 這是單流 `llama-bench`，不是 OpenAI-compatible serving 的多人併發吞吐。
- Prompt Processing 與 Generation 必須分開比較。
- llama.cpp commit、Intel Driver、oneAPI／Level Zero 版本會明顯影響結果。
- PMZFX 明確說明 SYCL kernel 仍在演進，這些數字不應被視為最終效能上限。

### 2.2 Intel LLM Scaler／vLLM｜單張與四張 B70｜FP16

Puget Systems 使用 Intel LLM Scaler vLLM container、GenAI-Perf streaming、FP16 模型進行測試。Host 為 Intel Xeon 658X、128GB DDR5、Ubuntu 25.04；輸入與輸出各 500 tokens，Concurrency 為 1／4／8。

#### 單張 B70，Concurrency = 1

| Model | Precision | Throughput | TTFT | ITL／近似 TPOT | Avg Latency |
|---|---|---:|---:|---:|---:|
| Qwen2.5 3B Instruct | FP16 | 72.9 tok/s | 48 ms | 14 ms | 4.6 s |
| DeepSeek-R1-Distill-Llama-8B | FP16 | 35.4 tok/s | 92 ms | 28 ms | 11.8 s |
| Llama 3.1 8B Instruct | FP16 | 35.4 tok/s | 86 ms | 28 ms | 9.9 s |
| Qwen3 8B Thinking | FP16 | 34.7 tok/s | 69 ms | 29 ms | 14.4 s |

#### 四張 B70，Tensor Parallel = 4

| Model | Concurrency | Aggregate Throughput | TTFT | ITL／近似 TPOT |
|---|---:|---:|---:|---:|
| Llama 3.1 8B Instruct | 1 | 70.3 tok/s | 79 ms | 14 ms |
| Llama 3.1 8B Instruct | 8 | 472 tok/s | 34 ms | 17 ms |
| DeepSeek-R1-Distill-Llama-8B | 1 | 71.2 tok/s | 91 ms | 14 ms |
| DeepSeek-R1-Distill-Llama-8B | 8 | 473 tok/s | 36 ms | 18 ms |

解讀限制：

- 四張 GPU 的 Aggregate Throughput 不是單一使用者的生成速度。
- Puget 曾因 tokenizer 設定修正 DeepSeek 數據，證明 tokenizer、輸出 token 計算與 raw stream 驗證必須納入 QA。
- Puget 測試為 FP16；不能直接與 GGUF Q4 結果比較。

## 3. 待核對候選資料

以下資訊保留為研究線索，但在取得原始官方頁面、MLPerf submission ID 或完整測試方法前，不納入正式 AISO Benchmark Results：

- MLPerf Inference v6.1：GPT-OSS 120B、4× B70 的 Server／Offline 數字。
- B70 對 B60「最高 1.8×」的特定工作負載結論。
- B70 對 RTX PRO 4000 Blackwell／AMD Radeon AI PRO R9700「高約 7%」的摘要。
- 4× B70 與單張 RTX PRO 6000 的跨系統比較。
- SPARKLE Passive 32GB 版本的 275W TBP。
- Qwen3.8-27B 與 GPT-OSS 20B Vulkan 數字及其完整環境。

## 4. AISO Benchmark 建議矩陣

| 階段 | Model | GPU | Backend | Precision／Quant | 目的 |
|---|---|---:|---|---|---|
| Basic | Qwen3 8B | 1 | llama.cpp SYCL | Q4_K_M | 基本推論、延遲與單卡基線 |
| Dense | Qwen 27B class | 1／2 | llama.cpp SYCL | Q4_K_M | 32GB 容量、跨卡 layer split |
| MoE | GPT-OSS 20B | 1 | llama.cpp／vLLM XPU | 官方可用格式 | Generation 與 serving 效率 |
| Multi-GPU | GPT-OSS 120B | 2／4 | Intel LLM Scaler／vLLM | 依 engine 支援 | Tensor Parallel 與併發能力 |
| Long Context | Qwen 27B class | 1／2 | 同一 Backend | 同一精度 | 8K／32K／128K 記憶體與延遲 |
| Stability | 代表模型 | 1／2／4 | 同一 Backend | 同一精度 | 長時間正確性、溫度、功耗與錯誤率 |

### 必須固定及記錄

- Model repository、Exact file、Precision／Quantization、SHA256
- SPARKLE Part Number、GPU Count、VRAM、CPU、RAM、PCIe topology
- OS、Kernel、Driver、oneAPI／Level Zero、Framework version／commit
- Backend、Tensor Parallel／split mode、Context、Batch、Input／Output
- Concurrency：1／2／4／8／16（依硬體規模分階段）
- Warm-up、Repeat、Timeout、成功率與輸出正確性
- TTFT、TPOT／ITL、Prompt TPS、Decode TPS、Aggregate TPS、E2E
- GPU Memory、Power、Temperature、錯誤與重試

## 5. Framework 建議

| Framework | 適合場景 | 建議順序 |
|---|---|---|
| llama.cpp + SYCL | GGUF、單卡／雙卡、快速基線 | 第一階段 |
| llama.cpp + Vulkan | Backend 對照與相容性 | 對照組，不預設為 Intel 最佳結果 |
| Intel LLM Scaler／vLLM XPU | OpenAI API、Continuous Batching、多 GPU | 正式 Serving Benchmark |
| OpenVINO | Intel 最佳化模型與非 LLM 工作負載 | 補充驗證 |
| SGLang XPU | 高階 Serving 實驗 | 第二階段，先驗證相容性 |

## 6. AISO Evidence 分級

| 等級 | 定義 | Portal 呈現方式 |
|---|---|---|
| AISO VERIFIED | AISO 使用統一腳本與環境 manifest 重跑並保存 raw data | 可作為設備選型依據 |
| OFFICIAL | Intel／SPARKLE／MLPerf 官方規格或正式 submission | 明確標示官方來源與條件 |
| THIRD-PARTY | 可重現方法、環境與原始數據完整的第三方測試 | 僅作參考，不冒充 AISO 實測 |
| RESEARCH LEAD | 摘要或二手描述，缺原始測試條件 | 不顯示為正式結果，等待核對 |

目前 B70 尚無已確認的 **AISO VERIFIED** 結果。`SB_smoke_test.sh` 與 `SB_formal_np1.sh` 已進入設備 Scripts，但正式結果需完成環境 manifest、模型 SHA、Smoke Test 與 formal run 後才可升級為 AISO VERIFIED。

## 參考資料

- Intel Arc Pro B70 官方規格：<https://www.intel.com/content/www/us/en/products/sku/245797/intel-arc-pro-b70-graphics/specifications.html>
- Intel Arc Pro B70 Datasheet：<https://www.intel.com/content/dam/www/central-libraries/us/en/documents/2026-03/datasheet-b70-gpu.pdf>
- SPARKLE B70 Blower 官方頁：<https://www.sparkle.com.tw/en/products/view/23a450ddb59E>
- PMZFX B70 Benchmark repository：<https://github.com/PMZFX/intel-arc-pro-b70-benchmarks>
- PMZFX Methodology：<https://github.com/PMZFX/intel-arc-pro-b70-benchmarks/blob/master/methodology.md>
- PMZFX llama.cpp results：<https://github.com/PMZFX/intel-arc-pro-b70-benchmarks/blob/master/llm-benchmarks.md>
- Puget Systems Multi-GPU AI Inference：<https://www.pugetsystems.com/labs/articles/intel-arc-pro-b70-multi-gpu-ai-inference-performance/>
- Intel LLM Scaler：<https://github.com/intel/llm-scaler>
