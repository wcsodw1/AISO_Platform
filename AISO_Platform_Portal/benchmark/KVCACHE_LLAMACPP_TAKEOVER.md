# AISO1 KV cache 精度矩陣（llama.cpp only）— 接手說明

更新：2026-11-18。範圍：**只測 AISO1 的 llama.cpp（Vulkan）**；vLLM / SGLang / Ollama 不在這份工作內。
來源：David 的 ChatGPT 工作階段產生的兩支腳本 + `AISO1_KVCache_llamacpp_HANDOFF.md`（原檔在 `~/Downloads/`）。

## 現在的狀態

| 項目 | 狀態 |
|---|---|
| 兩支腳本 | 已原封不動放進 repo：`benchmark/runners/aiso1_kvcache_matrix.py`（NP1 主腳本）、`aiso1_kvcache_np24_later.py`（NP2/NP4 後續）。sha256 記在 `benchmark/manifests/aiso1_kvcache.manifest.json`，**不要改腳本內容** |
| 平台後端 | `benchmark/kvcache.py`：部署腳本（sha256 核對）→ 在 AISO1 背景啟動腳本的模式 → 讀取狀態與表格。路由：`GET /api/benchmark/kvcache/status`、`POST /api/benchmark/kvcache/start`、`POST /api/benchmark/kvcache/stop`（start / stop 需要一次性測試密碼） |
| 平台介面 | Benchmark → AMD → AISO1 → llama.cpp → 左側第三種測試「KV cache Test」（`kvcache-panel.js`，掛在 `run-wizard.js`） |
| 測試 | `tests/test_kvcache.py`（假機器，不碰 AISO1）；全部 162 個測試通過 |
| **AISO1 實機** | **還沒跑過任何一步。** 截至本檔更新，AISO1 上有別人的 llama-server 在跑，平台依規則拒絕啟動（只讀狀態可用） |

## 一鍵執行（David 2026-11-18）

KV cache 面板只有**一個 Start**：平台部署 `benchmark/runners/aiso1_kvcache_chain.sh`（平台自有，sha256 在 manifest），它在 AISO1 上依序跑完所有步驟，已完成的自動略過、正在跑的步驟會等它結束；每步完成自動打勾，日誌（白話）顯示在下方 Run log。
密碼：一次輸入，2 小時內 KV cache 的 start / stop 不用再輸入（`run_auth.py` 的 `kvcache` scope，只對 `/api/benchmark/kvcache/*` 有效）。
本機伺服器由 launchd 管理（`com.aiso.platform`，環境變數在 `~/.config/aiso/launcher.env`），改後端後用 `launchctl kickstart -k gui/$(id -u)/com.aiso.platform` 重啟，密碼不會遺失。
2026-11-18 08:35：NP1 一鍵執行已在 AISO1 啟動（Preflight 完成：支援 f16 / bf16 / f32 / q8_0 / q5_0 / q5_1 / q4_0 / q4_1 / iq4_nl；Smoke 進行中，之後自動接 Run）。

## 步驟與順序（平台強制，腳本自己也會再檢查）

NP1：**Preflight → Smoke → Run**，審閱 `np1_results.csv`、`np1_vs_original.csv` 後，才開 NP2 / NP4：
NP2·NP4：**Preflight → Smoke → Run NP2 → (審閱 np2) → Run NP4**。**不測 NP5**（AISO1 NP5 超負載，已定案）。

- 每步在 AISO1 上是 `python3 -u <腳本> preflight|smoke|run [--np 2|4]`，日誌在 `~/aiso1_benchmark/debug/platform_kvcache_<stage>_<step>_<時間>.log`。
- 腳本把結果放在自己的 campaign：`~/aiso1_benchmark/campaigns/AISO1_llamacpp_KV_B1024_NP*_<時間>/`（`kv_smoke_matrix.csv`、`np1_results.csv`、`np1_stage.json`、`np1_vs_original.csv`…），**不寫進原本的 AISO1 正式 F16 成績**。
- 停止：平台送 **SIGINT**（不是 SIGTERM）。腳本沒有 SIGTERM 處理，SIGINT 會讓它的 `finally` 關掉 llama-server。
- 預檢會對四個 GGUF 算 SHA256（大檔，要幾分鐘）；Smoke 對每個「精度 × 模型」各起一次 server。

## 固定規格（腳本內建，來自 HANDOFF）

四模型 Gemma 4 26B / 31B、Laguna XS 2.1、Nemotron 3.5；K＝V；候選型別 f16 / bf16 / f32 / f8_e4m3 / q8_0 / q5_0 / q5_1 / q4_0 / q4_1 / iq4_nl（以本機 `llama-server --help` 偵測，**候選不代表可跑**）；
Input 4096 / 8192 / 16384、Output 1024、3 次 Repeat（3/3 PASS 才算完成）；slots 10、每請求 context 18432、Batch 1024、Ubatch 512、threads 20/20、Flash Attention off、prompt cache off、Vulkan、layer split；
單個 wave 硬上限 1800 秒（逾時記 TIMEOUT，不算 PASS）；每個成功 Repeat 寫 checkpoint，可中斷續跑；KPI：TTFT、TPOT、TPS Aggregate、TPS Normalized。

## 還沒做 / 下一個 AI 要做

1. **機器空了之後**（別人用 AISO1 時一律只讀）：在平台依序按 Preflight → Smoke → Run（NP1），看 `kv_smoke_matrix.csv` 確認 F16 / BF16 / F32 / FP8 / Q8 / Q5 / Q4 / IQ4 各型別到底能不能跑；失敗精度保留證據，不要改其他參數偷跑。
2. **重啟本機伺服器**（`make run` 的視窗 Ctrl+C 再開）才會載入新的後端路由與 `executor.py` 的修正。
3. 測完：**封存 Runner、Manifest（版本、參數、模型來源與 SHA256）**；只有收到實機證據並核對後才可標完成（HANDOFF「待完成 1」）。
4. 結果進平台資料（`data/benchmark-aiso1/`）與比較頁：KV 精度是新維度，用獨立資料檔，不覆蓋 F16 資料；可參考 `scripts/ingest_aiso1_*.py`。**尚未做，David 沒要求前不要做。**

## 規則提醒

- 機器有別人在用（GPU / llama-server）→ 只讀，不啟停；平台的 busy 檢查不可繞過。
- 公開資料不放 IP、密碼、金鑰、內部路徑；測試密碼不寫死。
- 連線用 `AISO1-key`（別名 `AISO1` 目前被拒絕）。
- 卡住時不要只說卡住：給 David 一條指令（說明在 Mac 或 AISO1 跑），或一個可貼給前一個 AI 的問題。

## 順手修的既有問題

`benchmark/executor.py` 的模型清單原本取「最新的 campaign profile」，但 11/15 的 `AISO1_UX_latency_*` 的 profile 裡 `models` 是 list，導致 AISO1 的 Run 頁顯示「無法載入這台機器」。現在改成取最新且 `models` 是字典的 profile（`tests/test_executor_models_profile.py`）。

## 2026-11-18 實測發現與優化測試清單

- **量化 KV 全部無法啟動的原因已核實**：24 組（q8_0 / q5_0 / q5_1 / q4_0 / q4_1 / iq4_nl × 4 模型）的 server.log 全是 `quantized V cache requires flash_attn to be enabled`。這是設定（本輪 Flash Attention = off，與原 AISO1 F16 成績同條件），不是硬體不支援。此版本 llama.cpp 沒有 FP8（f8_e4m3）。
- FA off 時 Gemma 的 V cache 會被補到 2048（server.log 警告 `padding V cache to 2048`），FA A/B 值得測。
- GPU 卸載：指令有 `--device Vulkan0 --n-gpu-layers 999`，但目前日誌層級沒有印出各層卸載情形，尚未逐模型核實。
- 優化測試清單（10 項，ChatGPT 工作階段整理，測試順序不是速度排名）放在 `data/benchmark-aiso1/aiso1_optimization_plan.json`，AISO1 頁 KV cache 區塊底下可展開。建議順序：GPU 卸載與失敗日誌 → F16 測 Flash Attention on/off → 同一 FA 設定下比各 KV 精度；一次只改一個變數。
- 待 David 決定：本輪（FA off：f16 / bf16 / f32）跑完後，是否開第二輪「FA on」（f16 + 全部量化精度），f16 那組同時就是 FA on/off 的 A/B。

## 2026-11-18 新增：NP8 · Flash Attention on（f16 / q8_0 / q4_0）

- David 指示：改測 NP8，比 int8（q8_0）、int4（q4_0），基準 f16。量化 V cache 必須開 FA，所以**三種型別全部 FA on**，彼此同條件；這組數字**不能直接和 FA off 的 NP1 / 原 F16 成績比**。
- 平台自有包裝 `benchmark/runners/aiso1_kvcache_np8_fa.py`（manifest 鍵 `np8fa`）：載入未修改的 NP1 腳本，只覆寫 NPS=(8,)、候選型別、`--flash-attn on`、單 wave 上限 3600 秒（31B × 8 人 × 16384 可能超過 1800 秒），profile 記錄 `flash_attention: on` 與包裝的 sha256。
- 獨立 campaign：`~/aiso1_benchmark/kv_cache_B1024_np8fa/` → `campaigns/AISO1_llamacpp_KV_B1024_NP8_<時間>/`，結果 `np8_results.csv`；不需先完成 NP1。
- 介面：KV cache 面板第三個分頁「NP8 · FA on」。測試：`tests/test_kvcache_np8_fa.py`、`test_kvcache.py`、`test_kvcache_chain.py`。
- 注意：Smoke 只用 NP1 啟動，NP8 的記憶體（8 × 18432 context）要到 Run 才會驗證。
