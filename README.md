# AISO Platform

<p align="center">
  <a href="https://wcsodw1.github.io/AISO_Platform/"><img src=".github/readme-banner.svg" alt="Open AISO Platform — https://wcsodw1.github.io/AISO_Platform/" width="100%"></a>
</p>

<p align="center"><b><a href="https://wcsodw1.github.io/AISO_Platform/">Open AISO Platform</a></b> &nbsp;·&nbsp; wcsodw1.github.io/AISO_Platform</p>

---

AISO Platform 是 AISO 官方產品、設備文件、Benchmark 結果、執行腳本與 AI 能力的單一 repository。目前 Portal 版本為 **v1.23.0**。

Portal 採專業品牌網站資訊架構：主頁聚焦品牌主張、四個方案層級與顧問方法；`Model Guide`、`Resources`、`About AISO` 使用獨立內容頁。方案層級為 Consumer、Workstation、Server 與 Data Center。因尚無正式聯絡窗口，暫不提供空泛的 `Contact` 頁。

本機搜尋會把設備根資料夾與相對應的 Portal 產品頁視為同一項，避免同一台設備重複出現在結果中；一般文件與腳本仍可獨立搜尋及開啟。

v1.18.0 將 GB10、PRO6000 兩卡、PRO6000 八卡與 NVIDIA DGX B300 整理成透明產品素材；兩種 PRO6000 配置改用不同機箱外觀，不再以單張 GPU 代表整機。Server 產品線新增 NVIDIA DGX B300，首頁 `AI SYSTEMS` 會同時展示三台 Server 並在 hover／focus 展開完整機型清單。v1.18.4 將首頁顧問流程主標更新為 `JUST AI IT.`，保留 `SELECT → VERIFY → DEPLOY` 服務內容；`VERIFY` 呈現 vLLM、Open WebUI、llama.cpp 驗證技術組合與各自角色。v1.18.5 將 AISO1 AI MAX395 設為資料驅動的 2.5D 預覽產品：桌機支援游標跟隨旋轉與浮出，手機支援拖曳，鍵盤支援方向鍵與 Esc，並尊重 `prefers-reduced-motion`。v1.18.9 將原地翻轉改為可明確辨識的 2.5D 軌道式環繞：產品沿橢向與景深軌跡繞行，在前景放大、後方縮小變暗，並顯示 `360° ORBIT` 與掃描光環，完成後回到游標跟隨視角。

移除 GLB 3D Viewer 與 `assets/models/`：原 8 個 GLB 為單視角產品圖生成的近似模型，旋轉時側面與背面不真實。AISO1 詳情頁改回既有 2.5D 預覽圖；Blender 示範改用概念示意圖，待真實 3D 模型完成後再導入。

v1.18.10 新增 `assets/models/` Web 3D asset library，收錄 8 個由現有單視角產品圖生成的 GLB prototype。模型與 `assets/products/` fallback 圖片分開管理，並以 manifest 記錄來源、檔案大小與 geometry 數量。AISO1 裝置詳情頁已啟用 `<model-viewer>` 真實 GLB 檢視器，支援拖曳旋轉、縮放、自動環繞、觸控及 reduced-motion；首頁分類卡維持原有 2.5D，載入失敗時回退至 PNG 預覽。

v1.19.0 納入已驗證的 AISO Blender Agent：由 Mac Blender 5.2.1 連接 PRO6000 上的 vLLM／GPT-OSS-120B，保留 Blender Python 生成、語法驗證、執行與 traceback Auto-Repair 核心；N Panel 增加 endpoint、model、修復次數與連線錯誤狀態，並移除機器綁定的絕對路徑。Portal 新增 `Blender AI Agent` capability section，以 `Prompt → Generate → Validate → Auto-Repair` 說明本地 3D 工作流程。實際 PRO6000 LAN endpoint 僅由本機環境或 Panel 設定，不進入 Public repository 內容或 GitHub Pages 輸出。

目前本機預覽中的下一版架構，首頁由 `Applications → Products → Benchmark → Consulting` 四個主要區塊組成。顧問流程擴充為 `Define → Select → Design → Verify → Deploy → Application`；六階段整合為單一直向互動流程，滑鼠 hover、鍵盤 focus 或手機點選任一階段時，該項會放大並展開需求、子流程及交付成果，不再另外顯示一組重複的大卡片。Data Center 以規劃入口呈現，並加入 Requirement Intake 與十階段專屬工作流。Blender AI Agent 同時加入公開安全的對話式 Application Demo；公開版只呈現經審核的 Prompt、處理階段與 GLB／Render 結果，不直接連接或揭露內網 Endpoint。

首頁新增 `SparkleBenchmark（S.B）` 獨立 Benchmark 區塊，定位為跨硬體與跨 Backend 的控制及證據層，不等同於各產品頁的結果檔案列表。每筆 Benchmark Evidence Record 必須保留 Model／Repository／Exact file／Precision or Quant／SHA、Machine／Compute／Memory／Backend／Framework version、Context／Input／Output／Concurrency／Repeat／Parameters，以及 Prompt／Decode／Aggregate TPS、TTFT、TPOT、E2E。公開區塊同時說明 Configure／Launch／Run／Validate／Export 流程與 Intel Arc Pro B70、AISO1 AI MAX+ 395 比較矩陣；實際執行 Endpoint、內網位址與下載權限不由公開 Portal 暴露。

SparkleBenchmark 現在提供統一設定面板、YAML 下載、B70／AISO1 最新重測矩陣，以及 localhost 管理版的條件檢查、開始／停止、執行進度和 JSON／CSV 結果下載。分類固定為 Hardware / Platform → Inference Framework → Backend / Runtime → Model Format。採用 `1 YAML + 1 Runner + Framework Adapters`，連接已啟動的模型服務；尚未包含遠端服務安裝／啟動。正式參數為 NP2／NP4、Input 4096～65536、Output 1024、Repeat 3、Max model length 69632、Max batched tokens 4096、GPU memory utilization 0.9、Prefix Cache OFF；production-cache 分開保存。每組 90 requests，逐筆核對實際 token 數；未通過的批次不產生正式 Aggregate TPS。Gemma26／Gemma31／Nemotron 均待重測，B70 Gemma31 的 4096 DS 驗證不等於 Full 通過；Laguna 的排除限定於指定 vLLM 集合。

首次使用請執行 `python3 -m pip install -r requirements.txt`，依 [Benchmark 操作文件](AISO_Platform_Portal/benchmark/README.md) 設定 `~/.aiso/benchmark-targets.json`、固定 Prompt 與伺服器參數，再重新啟動 `make run`。CLI：`python3 AISO_Platform_Portal/benchmark/benchmark_runner.py --config AISO_Platform_Portal/benchmark/mini_workstation_benchmark.yaml`。執行記錄預設位於 `~/.aiso/benchmark-results/`，不自動發布；公開／LAN 唯讀版只能設定和下載 YAML。Runtime、格式與啟動參數由本機操作者驗證；UI 不宣稱所有硬體／Framework 組合都已驗證。

Benchmark 的核心不是單一 GPU 跑分，而是整機服務能力的驗收證據：確認模型能在可用記憶體內完整載入，Driver／Framework／Backend／Endpoint 可以啟動，TTFT／TPOT／E2E 符合互動需求，Multi-NP／Concurrency 下仍維持 Aggregate TPS 與成功率，並通過長時間功耗、溫度、錯誤率與輸出正確性驗證。最終輸出是「這台機器能服務哪些模型、使用什麼精度、承載多少使用者，以及效能邊界在哪裡」。

Consulting 新增匿名真實 POC 案例「半導體晶圓龍頭」，以原生 HTML 呈現 aiDAPTIVE 四階段 Roadmap：Model Selection、Validation、Advanced Smoke Test、Deployment & Support。只將模型選擇標示已完成，其他階段呈現驗證與導入規劃；保留 Gemma 4 31B／Qwen3.8-27B、Q8／Q4 與 MTP／DFlash／QAT 測試範圍。客戶名稱、英文縮寫與 Logo 不加入案例文字、DOM、圖片或公開輸出，未匿名化原始圖片不納管。

首頁 Hero 的 Showreel 改為三頁介面輪播：llama.cpp Web UI、Open WebUI、SGLang + Open WebUI，以原生 HTML/CSS 製作並明確標示「介面示意」，不連線到實際模型服務。每 2 秒自動水平滑動，支援頁籤、前後按鈕與方向鍵；手動選擇會暫停自動播放，hover／focus、離開視窗或輪播不在可視範圍時不切換，並尊重 reduced-motion。llama.cpp 展示內建介面；Open WebUI 為聊天前端；SGLang 作為 OpenAI-compatible 推論後端，可串接 Open WebUI 或以 Gradio／Streamlit 自建介面。各頁附官方文件，實際功能依服務版本與模型支援驗證。

Data Center 首頁卡片使用經去背整合的 AI 機櫃與加速運算模組透明素材 `assets/products/data-center-ai-infrastructure-cutout.png`，用於呈現從單一系統提升到機櫃級基礎設施的方案層級；原始參考照片不直接發布。

首頁的 `Applications` 區塊是平台應用入口：平常只顯示 AISO APPS 入口卡，滑鼠移入時應用卡由入口向前展開。目前 `Blender AI Agent` 為 LIVE（點選後展開公開安全的錄製 Demo），`Interior Design Agent`（室內設計）與 `UI Design Agent`（UI 美感設計）標示為 UPCOMING；手機版預設全部展開。首頁不再呈現 Access Architecture 區塊，Public／Internal／Admin 的存取分級仍由 `launcher.py` 在伺服器端執行。

v1.23.0 新增獨立 `Benchmark by Machine` P0 MVP：先以 2× Intel Arc Pro B70／vLLM XPU 建立 Machine Profile、Framework-aware 參數、Mock Execution、Evidence Overview、By Model 明細與 TTFT／TPOT／Aggregate TPS 圖表。管理 API 同時要求 loopback 與 Bearer Token。P0 不連線 SSH，Mock Job 一律為 `UNVERIFIED` 且以唯一 Run ID append-only 保存。SGLang XPU 已預留 Adapter，但在取得實機 Log 前標示 `RUNTIME_UNVERIFIED`。B70 既有數值未匯入 Runner／Client／Server Logs 前不升為 PASS；Gemma31 64K 保留 `FAIL` 與原始 `missing first token/usage; root cause unconfirmed`，不推定 OOM。

- GitHub：<https://github.com/wcsodw1/AISO_Platform>（Public）
- 預設分支：`main`
- 架構更新日：2026-10-19

## 完整 Repository 架構

```text
AISO_Platform/                                      ← Git repository 根目錄
├─ .git/                                            ← 本機 Git metadata
├─ .gitignore                                       ← 排除歷史、暫存、敏感及原始輸出
├─ .gitattributes                                   ← LF／CRLF 與二進位檔規則
├─ .env.example                                     ← 可選資料路徑設定範例
├─ AGENTS.md                                        ← Repository 自動維護規則
├─ Makefile                                         ← run／export／check／status 指令
├─ requirements.txt                                 ← Python 需求（PyYAML：統一 Benchmark manifest）
├─ README.md                                        ← 架構、操作與版本管理說明
│
├─ AISO_Platform_Portal/                            ← Portal 程式
│  ├─ index.html                                    ← 使用者入口頁
│  ├─ app.js                                        ← 前台互動與資料呈現
│  ├─ style.css                                     ← Portal 視覺與響應式版面
│  ├─ aidaptiv.html                                ← aiDAPTIV Cold／Warm Benchmark 分類頁
│  ├─ lmcache.html／lmcache.js                     ← LMCache CPU／SSD 結果比較
│  ├─ benchmark.html／benchmark.css／benchmark-app.js ← Benchmark by Machine P0 UI
│  ├─ manage.html                                   ← 本機管理頁
│  ├─ manage.js                                     ← 管理功能
│  ├─ launcher.py                                   ← 本機 HTTP Server／管理 API
│  ├─ benchmark/                                  ← 統一 YAML、Runner、Framework Adapters 與設定範例
│  │  ├─ mini_workstation_benchmark.yaml            ← 正式 NP2／NP4 測試規格
│  │  ├─ live.py                                  ← 實機 HTTP 模型偵測、探索量測與私有結果
│  │  ├─ benchmark_runner.py                        ← 串流量測、條件驗證、執行紀錄與 CLI
│  │  ├─ api.py／jobs.py／reports.py                 ← P0 API、Mock Job Service 與報告核心
│  │  ├─ machines.example.json                      ← 不含憑證的 Machine Profiles
│  │  ├─ fixtures.py／fixtures/evidence/             ← UNVERIFIED B70 evidence 與 CSV fixture
│  │  ├─ targets.example.json                       ← 不含真實 Endpoint 的本機設定範例
│  │  ├─ README.md                                  ← 服務前置條件、設定與指標定義
│  │  └─ adapters/                                  ← vLLM／llama.cpp／SGLang／OpenVINO API adapters
│  ├─ tests/                                       ← Benchmark 量測與存取邊界測試
│  ├─ exporter.py                                   ← 公開資料清理與靜態匯出
│  ├─ config.json                                   ← Host、Port、資料根目錄
│  ├─ VERSION                                       ← Portal 版本（1.23.0）
│  ├─ data/
│  │  └─ products.json                              ← Portal 設備與 Benchmark metadata
│  ├─ assets/
│  │  ├─ cosmic/                                    ← Portal 宇宙視覺資產
│  │  ├─ products/                                  ← 已確認型號的官方產品圖與來源紀錄
│  │  └─ models/                                    ← GLB Web 3D prototypes 與 manifest
│  ├─ scripts/
│  │  └─ export_static.py                           ← CLI 靜態匯出入口
│  ├─ sample-data/
│  │  └─ Server/PRO6000-HPE-2GPU/               ← 首次建置用範例公開資料
│  ├─ docs/                                         ← 產生後的 GitHub Pages 靜態站
│  │  ├─ data/products.json                         ← 已去除內部欄位的公開目錄
│  │  ├─ assets/cosmic／products／models/            ← 匯出的共用 UI、產品圖與 GLB 資產
│  │  └─ assets/<product-id>/                       ← 可公開文件、結果與腳本
│  ├─ start.sh／AISO Platform.command               ← macOS 啟動入口
│  ├─ AISO Platform.bat                             ← Windows 啟動入口
│  ├─ publish.sh                                    ← 靜態匯出及選用 Git push
│
└─ AISO-Platform-UI/                                ← Portal 實際設備資料
   ├─ blender/                                      ← Blender AI Agent 核心、N Panel 與操作文件
   │  ├─ README.md                                  ← 本機設定、安全與使用流程
   │  └─ script/
   │     ├─ aiso_blender_agent.py                   ← 生成、執行與 traceback Auto-Repair 核心
   │     └─ aiso_blender_agent_panel.py             ← Blender 5.2.1 N Panel UI
   ├─ Consumer/                                     ← Portal Consumer 正式資料
   │  ├─ ASUS-ROG-AI-MAX395/
   │  │  ├─ Documents/Public/
   │  │  ├─ Benchmark_Result/Public/
   │  │  └─ Scripts/Public/
   │  └─ ASUS-TUF-GAMING-AI-MAX392/
   │     ├─ Documents/Public/
   │     ├─ Benchmark_Result/Public/
   │     └─ Scripts/Public/
   │
   ├─ Workstation-Mini/                                  ← Portal Workstation 正式資料
   │  ├─ AISO1-AI-MAX395/
   │  │  ├─ Documents/Public/
   │  │  ├─ Benchmark/Public/
   │  │  └─ Scripts/Public/
   │  │     ├─ ctx_check/
   │  │     ├─ np1/
   │  │     ├─ np1-Advance/
   │  │     └─ np_multi_stress/
   │  └─ GB10-AI-WORKSTATION/                       ← GB10 產品入口；型號與測試資料待確認
   │     └─ README.md
   │
   └─ Workstation-Server/                                       ← Server 文件與 Benchmark
      ├─ INTEL-ARC-PRO-B70/                         ← 工作站 GPU 平台；整機規格待確認
      │  ├─ README.md
      │  ├─ Documents/Public/
      │  ├─ Benchmark/Public/
      │  └─ Scripts/Public/
      ├─ PRO6000-HPE-2GPU/
      │  ├─ Documents/Public/
      │  ├─ Benchmark/Public/
      │  └─ Scripts/Public/
      ├─ PRO6000-TPI-8GPU/
      │  ├─ Documents/Public/
      │  └─ Benchmark/Public/
      └─ NVIDIA-DGX-B300/                           ← NVIDIA Blackwell Ultra 八卡 Server 入口
         ├─ Documents/Public/
         ├─ Benchmark/Public/
         └─ Scripts/Public/
```

### 資料夾角色

| 路徑 | 意義 | Git 策略 |
|---|---|---|
| `AISO_Platform_Portal/benchmark/`、`tests/` | 統一 Benchmark 設定、Runner、Framework Adapters 與測試 | 納管；不含真實服務設定與測試輸出 |
| `~/.aiso/benchmark-targets.json`、`~/.aiso/benchmark-results/` | 本機服務設定與未審核結果，位於網頁目錄外 | 不納管；repo 內同名檔案／資料夾亦忽略 |
| `AISO_Platform_Portal/` | Portal 程式、metadata 與產生的靜態站 | 納管 |
| `AISO-Platform-UI/Consumer/` | Consumer Portal 正式資料 | 納管 |
| `AISO-Platform-UI/Workstation-Mini/` | Workstation 產品的現行實體資料路徑 | 納管 |
| `AISO-Platform-UI/Workstation-Server/` | Server 與獨立 GPU 工作站平台資料；INTEL-ARC-PRO-B70 整機規格待確認 | 納管 |
| `AISO-Platform-UI/blender/` | Blender AI Agent 核心、N Panel 與公開安全操作說明 | 納管；不得提交實際 LAN endpoint、憑證或客戶 prompts |
| `AISO-Platform-UI/blender/output/`、`*.local.json` | 本機場景、渲染、GLB 與 endpoint 設定 | 忽略；經人工審核後再移入正式資產路徑 |
| 各設備的 `Public/` | 可由靜態網站發布的內容 | 納管，放入前須先檢查敏感資訊 |
| `AISO_Platform_Portal/docs/` | `make export` 自動產生的公開站 | 納管，不手動修改 |
| `AISO_Platform_Portal/Previous data/` | 舊版與歸檔 | 保留本機、Git 忽略 |

原 `Equipment/AMD` 的 96 個檔案已逐檔驗證並完整合併至 Consumer／Workstation；來源資料夾於 2026-08-29 移至 macOS 垃圾桶，不再作為正式資料入口。

其他舊版資料夾、根目錄 PDF、重複的 Portal `Workstation-Server/`、原始 stdout/stderr、JSONL、ZIP 與瀏覽器另存網頁仍保留在本機，但不納入 Git。經整理的 CSV、設備腳本、正式文件及公開報告會正常納管。

Intel Arc Pro B70 已建立獨立設備入口，Portal 分類為 Workstation，實體資料暫存於 `Workstation-Server/INTEL-ARC-PRO-B70/`。`Documents/Public/` 已加入 SPARKLE Intel Arc Pro B70 AI Benchmark 研究，說明 Intel Xe2／Battlemage、官方硬體規格、可核對的 llama.cpp SYCL 與 LLM Scaler／vLLM 第三方結果、AISO 測試矩陣及 Evidence 分級；公開研究不等同 AISO 內部實測。整機形式、SPARKLE Part Number、GPU 數量及 OS 仍待補齊。

公開站發布的 SOP、Benchmark 報告與 Scripts 一律以 AES-256-GCM 加密（`*.enc`），必須先通過存取提示，瀏覽器才會用存取碼解密開啟。這是為了避免直接用網址取得明文檔案，但存取碼很短，只能擋一般存取，不是真正的伺服器端保護。

## README 同步規則

以下任一項有變更時，必須在**同一個 commit** 更新本 README：

- 新增、移除或重新命名設備／資料夾。
- Portal 版本、啟動指令、依賴或設定方式變更。
- `products.json` 的設備分類或公開路徑變更。
- Git 忽略策略、靜態發布流程或 repository visibility 變更。
- 完成後同步更新「完整 Repository 架構」與「架構更新日」。

## 系統需求

- Python 3.10+
- 現代瀏覽器
- Node.js（僅 `make check` 的 JavaScript 語法檢查需要）
- Git（版本管理與發布時需要）

Portal 的 HTTP 服務使用 Python 標準函式庫；統一 Benchmark 的 YAML 讀取需要 PyYAML。首次啟動前請執行：

```bash
python3 -m pip install -r requirements.txt
```

## 本機啟動

在 repository 根目錄執行：

```bash
make run
```

或：

```bash
cd AISO_Platform_Portal
./start.sh
```

預設服務為 `http://127.0.0.1:8765`；目前設定監聽 `0.0.0.0`，同一區域網路的手機可用這台電腦的 LAN IP 加上 `:8765` 開啟。請勿直接將此連接埠暴露到公網。

設備資料預設位於 `AISO-Platform-UI/`。可用環境變數暫時覆寫：

```bash
AISO_DATA_ROOT=/path/to/data make run
```

## 驗證與發布

```bash
make check   # Python 與 JavaScript 語法檢查
AISO_FILE_PASSWORD=<存取碼> make export  # 重建 docs/；未設定時不會發布任何文件、報告與腳本（不發布明文）
```

匯出會同時複製 `assets/cosmic/`、`assets/products/` 與 `assets/models/`，再加入各設備可公開的文件、Benchmark 與 Scripts。官方素材會保留來源紀錄；使用者提供的 AISO 產品照會註明取得方式。組裝系統若僅有 GPU 圖，介面會明確標示為 GPU platform reference、不是機箱照。

`AISO_Platform_Portal/docs/` 是 GitHub Pages 的正式靜態輸出，應與 Portal 版本一起提交。因它位於 monorepo 子目錄，連接 GitHub remote 後建議用 GitHub Actions 發布該資料夾；不直接把整個 repository 根目錄公開。

## 版本管理建議

- `main`：可使用、已驗證的版本。
- 功能與內容更新用短期分支，例如 `feature/aimax392-document`。
- Commit 依用途區分，例如 `feat:`、`fix:`、`docs:`、`data:`、`chore:`。
- Portal 發布版本使用 tag，例如 `v1.18.5`。
- 不提交密碼、Token、SSH Key、`.env` 或未整理的原始 Benchmark 輸出。

### 實機 Benchmark：PRO6000 / AISO1

`benchmark.html` 的「實機 Benchmark」面板使用本機 `benchmark/machines.local.json` 中 `live_services` 設定，透過既有模型服務執行真實推論。PRO6000 機器範本已加入；AISO1 使用既有 `aiso1-amd` 範本。每個 Framework 可設定多個服務，先偵測模型再測試，支援 NP 1–4、輸出 1–1024 tokens、重複 1–3 次、停止與 JSON 下載。`benchmark/live.py` 負責實機工作，不更動遠端容器。

此面板是探索量測，輸入 token 數取自服務回報，未驗證的服務端配置不會宣稱為正式 4K–64K 基準。結果保存在 `~/.aiso/benchmark-live-results/`（可用 `AISO_LIVE_RESULTS` 覆寫），與 Mock／正式測試分開；不儲存 prompt 原文或生成文字，不自動發布。本機服務網址只存在 git-ignored 設定，不會出現在公開機器範本或靜態匯出。設定與 API 操作詳見 Benchmark README；新增後請重新啟動 Portal。

Benchmark 介面採三步驟獨立畫面：硬體類型（NVIDIA／AMD／Intel）→ Unit → 參數。NVIDIA RTX PRO6000 標示為 Workstation / Server；提供 NP1、Output 128、Repeat 1 快速實測預設及自訂參數，正式 Server 矩陣尚未定義，不沿用 Mini-workstation 規格。AISO1、B70 保留 Mini-workstation 分類。使用網址 hash 支援上一頁／下一頁與直接連結；未登入仍可選機型與編輯參數，實機偵測和執行維持本機 Token 保護。

Benchmark 首頁現整合並排的硬體類型、對應 Unit 與機器規模選擇；切換 NVIDIA／AMD／Intel 立即更新旁邊的機台。規模可選 Consumer、Mini-workstation、Server-Workstation，預選機台建議規模並允許調整；按「設定參數」後將所選規模帶至下一頁與網址。只有 Mini-workstation 已定義正式預設，另外兩類標示待設定；快速連線測試獨立保留。

### Benchmark — LMCache

Benchmark 頁面新增 `lmcache.html` 入口，以 `lmcache.js` 與 `data/lmcache-summary.json` 呈現 Phase 3 Extended 結果。三者納入靜態匯出；`make check` 驗證腳本語法。資料為使用者提供終端紀錄中的 48 筆 CPU 批次數值，已移除原始命令、內網位址與主機路徑；原始 stdout 不納管。CPU 的 144 requests／48 batches／0 errors 為來源回報，標示 REPORTED_PASS，非平台獨立驗證。Baseline 無數據、SSD 僅有啟動紀錄，均不推定完成。

頁面提供 no_reuse／shared_prefix 篩選、Cold／Warm TTFT 與 Output TPS 對照、命中率及整理後 JSON 下載。約 2K／4K context、C1／C5、輸出上限 32、Repeat 3 是 LMCache 專用計畫，獨立於 Consumer／Mini-workstation／Server-Workstation 通用預設。本入口展示結果，不啟停遠端容器；完整比較須補入原始 manifest、requests.csv、batches.csv 與 SSD 結果。

Benchmark 主標下方固定顯示 `Normal`、`aiDAPTIV`、`LMCache` 三個分類。`Normal` 進入機器與參數設定；`aiDAPTIV` 顯示 without／Cold／Warm 比較範圍與既有報告狀態；`LMCache` 顯示 KV cache Cold／Warm 結果。各頁使用相同分類列並標示目前所在分類。
