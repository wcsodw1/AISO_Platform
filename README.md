# AISO Platform

AISO Platform 是 AISO 官方產品、設備文件、Benchmark 結果、執行腳本與 AI 能力的單一 repository。目前 Portal 版本為 **v1.19.0**。

Portal 採專業品牌網站資訊架構：主頁聚焦品牌主張、四個方案層級與顧問方法；`Model Guide`、`Resources`、`About AISO` 使用獨立內容頁。方案層級為 Consumer、Workstation、Server 與 Data Center。因尚無正式聯絡窗口，暫不提供空泛的 `Contact` 頁。

本機搜尋會把設備根資料夾與相對應的 Portal 產品頁視為同一項，避免同一台設備重複出現在結果中；一般文件與腳本仍可獨立搜尋及開啟。

v1.18.0 將 GB10、PRO6000 兩卡、PRO6000 八卡與 NVIDIA DGX B300 整理成透明產品素材；兩種 PRO6000 配置改用不同機箱外觀，不再以單張 GPU 代表整機。Server 產品線新增 NVIDIA DGX B300，首頁 `AI SYSTEMS` 會同時展示三台 Server 並在 hover／focus 展開完整機型清單。v1.18.4 將首頁顧問流程主標更新為 `JUST AI IT.`，保留 `SELECT → VERIFY → DEPLOY` 服務內容；`VERIFY` 呈現 vLLM、Open WebUI、llama.cpp 驗證技術組合與各自角色。v1.18.5 將 AISO1 AI MAX395 設為資料驅動的 2.5D 預覽產品：桌機支援游標跟隨旋轉與浮出，手機支援拖曳，鍵盤支援方向鍵與 Esc，並尊重 `prefers-reduced-motion`。v1.18.9 將原地翻轉改為可明確辨識的 2.5D 軌道式環繞：產品沿橢向與景深軌跡繞行，在前景放大、後方縮小變暗，並顯示 `360° ORBIT` 與掃描光環，完成後回到游標跟隨視角。

v1.18.10 新增 `assets/models/` Web 3D asset library，收錄 8 個由現有單視角產品圖生成的 GLB prototype。模型與 `assets/products/` fallback 圖片分開管理，並以 manifest 記錄來源、檔案大小與 geometry 數量。AISO1 裝置詳情頁已啟用 `<model-viewer>` 真實 GLB 檢視器，支援拖曳旋轉、縮放、自動環繞、觸控及 reduced-motion；首頁分類卡維持原有 2.5D，載入失敗時回退至 PNG 預覽。

v1.19.0 納入已驗證的 AISO Blender Agent：由 Mac Blender 5.2.1 連接 PRO6000 上的 vLLM／GPT-OSS-120B，保留 Blender Python 生成、語法驗證、執行與 traceback Auto-Repair 核心；N Panel 增加 endpoint、model、修復次數與連線錯誤狀態，並移除機器綁定的絕對路徑。Portal 新增 `Blender AI Agent` capability section，以 `Prompt → Generate → Validate → Auto-Repair` 說明本地 3D 工作流程。實際 PRO6000 LAN endpoint 僅由本機環境或 Panel 設定，不進入 Public repository 內容或 GitHub Pages 輸出。

目前本機預覽中的下一版架構，將首頁顧問流程擴充為 `Define → Select → Verify → Design → Deploy → Application`。六階段整合為單一直向互動流程；滑鼠 hover、鍵盤 focus 或手機點選任一階段時，該項會放大並展開需求、子流程及交付成果，不再另外顯示一組重複的大卡片。Data Center 以規劃入口呈現，並加入 Requirement Intake 與十階段專屬工作流。Blender AI Agent 同時加入公開安全的對話式 Application Demo；公開版只呈現經審核的 Prompt、處理階段與 GLB／Render 結果，不直接連接或揭露內網 Endpoint。

Data Center 首頁卡片使用經去背整合的 AI 機櫃與加速運算模組透明素材 `assets/products/data-center-ai-infrastructure-cutout.png`，用於呈現從單一系統提升到機櫃級基礎設施的方案層級；原始參考照片不直接發布。

首頁的 `Applications` 區塊是平台應用入口：平常只顯示 AISO APPS 入口卡，滑鼠移入時應用卡由入口向前展開。目前 `Blender AI Agent` 為 LIVE（點選後展開公開安全的錄製 Demo），`Interior Design Agent`（室內設計）與 `UI Design Agent`（UI 美感設計）標示為 UPCOMING；手機版預設全部展開。首頁不再呈現 Access Architecture 區塊，Public／Internal／Admin 的存取分級仍由 `launcher.py` 在伺服器端執行。

- GitHub：<https://github.com/wcsodw1/AISO_Platform>（Public）
- 預設分支：`main`
- 架構更新日：2026-09-13

## 完整 Repository 架構

```text
AISO_Platform/                                      ← Git repository 根目錄
├─ .git/                                            ← 本機 Git metadata
├─ .gitignore                                       ← 排除歷史、暫存、敏感及原始輸出
├─ .gitattributes                                   ← LF／CRLF 與二進位檔規則
├─ .env.example                                     ← 可選資料路徑設定範例
├─ AGENTS.md                                        ← Repository 自動維護規則
├─ Makefile                                         ← run／export／check／status 指令
├─ requirements.txt                                 ← Python 需求（目前無第三方套件）
├─ README.md                                        ← 架構、操作與版本管理說明
│
├─ AISO_Platform_Portal/                            ← Portal 程式
│  ├─ index.html                                    ← 使用者入口頁
│  ├─ app.js                                        ← 前台互動與資料呈現
│  ├─ style.css                                     ← Portal 視覺與響應式版面
│  ├─ manage.html                                   ← 本機管理頁
│  ├─ manage.js                                     ← 管理功能
│  ├─ launcher.py                                   ← 本機 HTTP Server／管理 API
│  ├─ exporter.py                                   ← 公開資料清理與靜態匯出
│  ├─ config.json                                   ← Host、Port、資料根目錄
│  ├─ VERSION                                       ← Portal 版本（1.19.0）
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
| `AISO_Platform_Portal/` | Portal 程式、metadata 與產生的靜態站 | 納管 |
| `AISO-Platform-UI/Consumer/` | Consumer Portal 正式資料 | 納管 |
| `AISO-Platform-UI/Workstation-Mini/` | Workstation 產品的現行實體資料路徑 | 納管 |
| `AISO-Platform-UI/Workstation-Server/` | Server 產品的現行實體資料路徑 | 納管 |
| `AISO-Platform-UI/blender/` | Blender AI Agent 核心、N Panel 與公開安全操作說明 | 納管；不得提交實際 LAN endpoint、憑證或客戶 prompts |
| `AISO-Platform-UI/blender/output/`、`*.local.json` | 本機場景、渲染、GLB 與 endpoint 設定 | 忽略；經人工審核後再移入正式資產路徑 |
| 各設備的 `Public/` | 可由靜態網站發布的內容 | 納管，放入前須先檢查敏感資訊 |
| `AISO_Platform_Portal/docs/` | `make export` 自動產生的公開站 | 納管，不手動修改 |
| `AISO_Platform_Portal/Previous data/` | 舊版與歸檔 | 保留本機、Git 忽略 |

原 `Equipment/AMD` 的 96 個檔案已逐檔驗證並完整合併至 Consumer／Workstation；來源資料夾於 2026-08-29 移至 macOS 垃圾桶，不再作為正式資料入口。

其他舊版資料夾、根目錄 PDF、重複的 Portal `Workstation-Server/`、原始 stdout/stderr、JSONL、ZIP 與瀏覽器另存網頁仍保留在本機，但不納入 Git。經整理的 CSV、設備腳本、正式文件及公開報告會正常納管。

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

Portal 只使用 Python 標準函式庫，因此不需安裝額外 Python 套件。為保留標準流程，仍可執行：

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
make export  # 重建 AISO_Platform_Portal/docs/
```

匯出會同時複製 `assets/cosmic/`、`assets/products/` 與 `assets/models/`，再加入各設備可公開的文件、Benchmark 與 Scripts。官方素材會保留來源紀錄；使用者提供的 AISO 產品照會註明取得方式。組裝系統若僅有 GPU 圖，介面會明確標示為 GPU platform reference、不是機箱照。

`AISO_Platform_Portal/docs/` 是 GitHub Pages 的正式靜態輸出，應與 Portal 版本一起提交。因它位於 monorepo 子目錄，連接 GitHub remote 後建議用 GitHub Actions 發布該資料夾；不直接把整個 repository 根目錄公開。

## 版本管理建議

- `main`：可使用、已驗證的版本。
- 功能與內容更新用短期分支，例如 `feature/aimax392-document`。
- Commit 依用途區分，例如 `feat:`、`fix:`、`docs:`、`data:`、`chore:`。
- Portal 發布版本使用 tag，例如 `v1.18.5`。
- 不提交密碼、Token、SSH Key、`.env` 或未整理的原始 Benchmark 輸出。
