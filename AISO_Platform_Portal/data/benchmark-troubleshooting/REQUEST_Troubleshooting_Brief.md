# 請求：各推論框架的疑難排解（Debugging）與解法

給執行 benchmark 的 session。請依本文件格式回覆，我會放進 AISO Platform 的 Stress Test 機器頁。

## 1. AISO Platform Benchmark 是什麼

- 網站：https://wcsodw1.github.io/AISO_Platform/ ，Stress Test 頁依機型層級（Consumer / Mini-Workstation / Server）展示**同標準參數**下各硬體、各推論框架的效能。
- 指標：**TTFT**（首字延遲，秒）、**TPOT**（每個字的間隔，ms）、**TPS**（每秒輸出 token）。
  - Aggregate TPS = NP × Output tokens ÷ E2E（含首字等待）。
  - TPS (Normalized) = Aggregate ÷ NP，每個請求自己的速度。
- 固定負載：NP 1 / 2 / 5 × Input 4096 / 8192 / 16384 × Output 1024 × Repeat 3。
- 已有資料：
  - Intel B60（96 GB = 48 GB × 2，TP2）：SGLang XPU（Gemma 4 31B、Laguna XS 2.1 各 9/9 PASS）、vLLM XPU（Gemma 4 31B 9/9 PASS）。
  - Intel B70（64 GB = 32 GB × 2）：llama.cpp GGUF。
  - AISO1（AMD AI MAX+ 395）：尚無正式資料。
- 原則：**證據優先**。不混合硬體／框架／量化；沒核實的標 `UNVERIFIED`；失敗紀錄保留，不被重跑覆蓋。

## 2. 要放在哪裡、長什麼樣

- 位置：每個機型頁（例如 `stress-test-b60.html`）現有「失敗與重跑紀錄」區塊的下方，新增「疑難排解 Troubleshooting」區塊。
- 呈現：**三個按鈕 = 三個框架**（SGLang / vLLM / llama.cpp），切換後顯示該框架在**這台機型**遇到的問題與解法。
- 範圍：**同一台機型一組**。請按機型分開提供：
  1. Intel B60
  2. AISO1（AMD Ryzen AI MAX+ 395）
  （之後可能加 Intel B70 及其他機型）

## 3. 每則問題請用這個格式（每台機型 × 每個框架一組清單）

```json
{
  "machine": "Intel B60",
  "framework": "SGLang",
  "runtime": "lmsysorg/sglang:v0.5.22-xpu",
  "issues": [
    {
      "id": "B60-SGL-01",
      "title": "一句話標題",
      "stage": "startup | model-load | inference | benchmark-runner | network | other",
      "models": ["Gemma 4 26B"],
      "symptom": "看到什麼現象",
      "error": "原文錯誤訊息（逐字貼，1–5 行）",
      "root_cause": "原因",
      "cause_status": "VERIFIED | HYPOTHESIS",
      "solution": ["步驟 1（含指令）", "步驟 2"],
      "outcome": "RESOLVED | WORKAROUND | OPEN",
      "evidence": "run_id / 日誌檔名 / 哪個指令跑過確認有效",
      "notes": "限制、副作用、尚未驗證處"
    }
  ]
}
```

## 4. 回覆規則（請嚴格遵守）

1. **只寫實際發生、有日誌或輸出佐證的問題。** 沒親眼見過的不要補；不確定的原因標 `HYPOTHESIS`，不確定的解法標 `OPEN` 或寫「未驗證」。
2. **錯誤訊息逐字貼**，不要改寫。
3. 解法要有**可直接執行的指令**，並說明是在哪台機器、哪個容器內執行。
4. **不要放**密碼、金鑰、token、內部 IP／帳號。主機名稱只寫機型（B60／AISO1）。
5. 若指令標了「AISO1」但實際在 B60 跑（hostname 不同），請明確指出，**不要把 B60 的問題算到 AISO1**。
6. 一個問題一則，標題要能讓人一眼看出症狀。
7. 沒有問題的框架／機型寫「無已知問題」，不要空白也不要湊數。

## 5. 目前已知、請你補完整或確認的項目

### Intel B60
| 框架 | 已知線索（待你補原因／解法／證據） |
|---|---|
| SGLang | Gemma 4 26B 啟動失敗：`CompressedTensorsWNA16MarlinMoEMethod` → `gptq_marlin_moe_repack` 呼叫 CUDA JIT，`nvcc: not found`（XPU 上走到 CUDA 路徑）。 |
| SGLang | Nemotron 3.5 啟動失敗：`ParallelLMHead → torch.empty` OOM，需 672 MiB，剩 233.42 MiB（TP1，GPU0）；尚無證據證明調 KV 記憶體比例可解。 |
| SGLang | Gemma 4 31B NP5 / 8K 原始 Full 失敗：`level_zero UR_RESULT_ERROR_OUT_OF_RESOURCES`（`flash_attn_with_kvcache`，HTTP 500）；僅重跑 NP5 8K / 16K 後通過，不可推論已永久解決。 |
| vLLM | NP5 時 `Running: 2 / Waiting: 3` 排隊；有無搶占（preemption）待確認；NP5 / 16K Aggregate 與 TTFT／TPOT 推算差 17.7%，原因待查。 |
| llama.cpp | GGUF 檔案存在，官方／Unsloth 來源與模型設定尚待逐一核驗。 |

### AISO1（AMD AI MAX+ 395）
- 目前**沒有真正的 AISO1 主機輸出**（先前標 AISO1 的指令實際在 B60 跑）。請先在真正的 AISO1 上跑，再提供三個框架（建議 llama.cpp Vulkan／ROCm、vLLM、SGLang 以實際可用為準）的問題與解法；做不起來的框架請直接寫「無法啟動」與原因。

## 6. 交付

直接回貼 JSON（可分機型、分框架多段）加一段 3–5 行的總結（哪些已解、哪些仍 OPEN）。我收到後會寫進 `data/benchmark-troubleshooting/` 並做出三顆按鈕的區塊。
