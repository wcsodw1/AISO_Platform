# AISO Platform v1.18.7

AISO Platform 是 AISO 官方產品與技術資源入口，同時提供「Mac 本機管理＋GitHub Pages 公開展示」兩種模式。

首頁以 `SELECT → VERIFY → DEPLOY` 呈現 AISO 的顧問服務流程：從工作負載與需求盤點開始，提出適用方案與硬體配置；接著在 `VERIFY` 階段透過 PoC、實機 Benchmark 與應用串接驗證技術可行性、模型、Context 與效能邊界；最後在 `DEPLOY` 階段將通過驗證的配置導入正式環境，完成部署方案、SOP、Scripts 與技術移交。每個階段都明確列出工作內容與可交付成果，避免被理解為單純硬體型錄。

顧問流程區以 `JUST AI IT.` 作為品牌主標，中文副標與三階段卡片保留完整服務語意。

`VERIFY` 的 Validation Stack 會清楚呈現 `vLLM`、`Open WebUI` 與 `llama.cpp`：依硬體條件選用 vLLM 或 llama.cpp 建置推論服務，再搭配 Open WebUI 驗證瀏覽器操作、模型切換、長文本、首字等待時間、生成流暢度及錯誤中斷等使用體驗。

網站採產品優先的品牌資訊架構：主頁呈現品牌主張、Consumer／Workstation-Mini／Workstation-Server 三大產品線與 Select／Verify／Deploy 方法；`Model Guide`、`Resources`、`About AISO` 各自使用獨立內容頁。

未取得正式 email、電話、地址或表單前不提供 `Contact` 頁，避免無法執行的假入口；取得官方窗口後再建立 Sales／Support 分流。

首頁的 `Model List` 依 Consumer／Workstation-Mini／Workstation-Server 整理目前已有 Benchmark、Scripts 或 Prepared 紀錄的適用模型與用途。

本機搜尋會將已收錄設備的資料夾入口合併到正式產品結果；每台設備只顯示一次，其他文件與腳本搜尋結果不受影響。

產品卡支援產品照與 3D 投射互動：滑鼠移入後主機會抬升、傾斜並突破原媒體框，不再被圖片容器裁切。ROG Flow Z13 GZ302、TUF Gaming A14 FA401EA 使用 ASUS 官方素材；AISO1 AI MAX395、GB10 AI Workstation、PRO6000 兩卡／八卡已整理為透明產品素材。兩卡與八卡 PRO6000 使用不同機箱外觀，NVIDIA DGX B300 則使用 NVIDIA 官方整機素材與官方規格。

v1.18.5 將獨立 `AISO-3D-Product-Card-v1` 原型以增量方式整合進 AISO1 AI MAX395：`preview_3d` metadata 明確指定專用透明素材，只有設定此欄位的產品會啟用游標跟隨旋轉、浮出、投射光、動態陰影與反光。卡片文字保持固定；手機可橫向拖曳、鍵盤 focus 後可用方向鍵調整角度，`Esc` 重置；`prefers-reduced-motion` 使用者不會收到連續 3D 動畫。原型的 `index.html`、`style.css`、`app.js` 不會覆蓋 Portal 核心檔案。

首頁已將重複的 `PRODUCTS, AT A GLANCE.` 合併進 `AI SYSTEMS`：滑鼠移入 Consumer／Workstation-Mini／Workstation-Server 卡片時，卡片會向下展開該類別全部機型；鍵盤 focus 同樣可展開，手機版則預設顯示機型。Server 主視覺會同時呈現 PRO6000 兩卡、PRO6000 八卡與 NVIDIA DGX B300。產品詳情保留 Overview／Hardware／Models／SOP／Benchmark／Scripts。單一模型的 Benchmark 僅在對應產品頁與 Resources 呈現，首頁不自動挑選第一筆結果作為推薦；Model Guide 另列 Benchmarked／Script Available／Prepared 證據狀態。

第一版資訊架構：

```text
服務類型（Consumer / Workstation-Mini / Workstation-Server）
└─ 設備
   ├─ Overview
   ├─ Hardware
   ├─ Models
   ├─ 操作手冊
   ├─ Benchmark（結構化結果＋原始報告）
   └─ Scripts（Benchmark 與驗證腳本）
```

## 兩種執行模式

### 1. Mac 本機管理版

- 編輯產品資料。
- 自動掃描各設備允許公開的 Documents、Benchmark 與 Scripts 資料夾。
- 開啟本機操作手冊與 Benchmark。
- 可保存內部 Operations 資訊。
- Server 可依 `config.json` 監聽 `127.0.0.1`（僅本機）或 `0.0.0.0`（同一區域網路）；請勿將 `8765` Port Forward 到公網。

### 2. GitHub Pages 公開版

- 靜態、唯讀，不需要 Python Server。
- 不輸出 SSH、密碼、Operations 或 Mac 本機路徑。
- 只發布各設備 `Documents/Public`、`Benchmark/Public` 與 `Scripts` 內的檔案。
- 會略過檔名含 `password`、`secret`、`credential`、`private`、`internal` 的檔案，以及 `.env`、`.pem`、`.key`。
- 靜態匯出會包含 `assets/cosmic/`、`assets/products/` 以及產品 metadata 的 `image`／`image_alt`／`image_note`／`image_count`／`preview_3d` 欄位。

## Mac 快速啟動

1. 確認已安裝 Python 3。
2. 雙擊 `AISO Platform.command`，或在 Terminal 執行：

```bash
./start.sh
```

3. 瀏覽器開啟：

```text
http://127.0.0.1:8765
```

若 macOS 第一次開啟時顯示「來自未識別的開發者」，請對 `AISO Platform.command` 按右鍵選擇「打開」；或在 Terminal 對解壓後的整個資料夾執行：

```bash
xattr -dr com.apple.quarantine "/path/to/aiso-platform"
```

此 monorepo 的預設資料根目錄：

```text
../AISO-Platform-UI
```

可在 `config.json` 修改 `data_root`，或臨時指定：

```bash
python3 launcher.py --root "/Users/your-name/AISO-Platform-Data"
```

首次啟動會依目錄自動建立七台設備的資料夾。

## 資料夾結構

```text
AISO-Platform-Data/
├─ Consumer/
│  ├─ ASUS-ROG-AI-MAX395/
│  │  ├─ Documents/
│  │  │  └─ Public/
│  │  ├─ Benchmark/
│  │  │  └─ Public/
│  │  └─ Scripts/
│  └─ ASUS-TUF-GAMING-AI-MAX392/
│     ├─ Documents/
│     │  └─ Public/
│     ├─ Benchmark/
│     │  └─ Public/
│     └─ Scripts/
├─ Workstation-Mini/
│  ├─ AISO1-AI-MAX395/
│  │  ├─ Documents/
│  │  │  └─ Public/
│  │  ├─ Benchmark/
│  │  │  └─ Public/
│  │  └─ Scripts/
│  └─ GB10-AI-WORKSTATION/
│     ├─ Documents/
│     │  └─ Public/
│     ├─ Benchmark/
│     │  └─ Public/
│     └─ Scripts/
│        └─ Public/
└─ Workstation-Server/
   ├─ PRO6000-HPE-2GPU/
   │  ├─ Documents/
   │  │  └─ Public/
   │  ├─ Benchmark/
   │  │  └─ Public/
   │  └─ Scripts/
   │     └─ Public/
   ├─ PRO6000-TPI-8GPU/
   │  ├─ Documents/
   │  │  └─ Public/
   │  ├─ Benchmark/
   │  │  └─ Public/
   │  └─ Scripts/
   └─ NVIDIA-DGX-B300/
      ├─ Documents/
      │  └─ Public/
      ├─ Benchmark/
      │  └─ Public/
      └─ Scripts/
         └─ Public/
```

一般內部文件可放在 `Documents`／`Benchmark`；只有確認可公開的檔案才放進 `Public`。`Scripts` 內容會直接發布，匯出前請先確認不含敏感資訊。

## 管理設備

本機版右上角選擇「管理」，可以：

- 新增或修改設備。
- 修改硬體規格與資料夾位置。
- 填寫本機 Operations 備註。
- 掃描 Documents／Benchmark。
- 產生 GitHub Pages 靜態版。

設備 metadata 儲存在：

```text
data/products.json
```

## 產生 GitHub Pages

方法一：管理畫面按「產生 GitHub Pages」。

方法二：Terminal 執行：

```bash
./publish.sh
```

輸出會建立在：

```text
docs/
```

GitHub Repository 的 Pages 設定選擇：

```text
Deploy from a branch → main → /docs
```

## 一鍵 Export＋Git Commit／Push

先完成 Git Repository、Remote 與 SSH Key／GitHub CLI 登入，再執行：

```bash
./publish.sh --push
```

流程會依序：

1. 掃描每台設備的 Public 子資料夾。
2. 重新產生 `docs/`。
3. `git add docs data/products.json`。
4. 建立 Commit。
5. `git push`。

## SSH 遠端使用

SSH 適合用來建立 Tunnel，不是網站登入頁。

假設 Mac 的 SSH 位址為 `user@mac-host`：

```bash
ssh -L 8765:127.0.0.1:8765 user@mac-host
```

連線後，在遠端電腦瀏覽：

```text
http://127.0.0.1:8765
```

若 Mac 位於 Router 後方，建議先使用 VPN／Tailscale 連回內網，再建立 SSH Tunnel；不要直接將 `8765` Port Forward 到公網。

## 範例設備

- Consumer：ASUS ROG Flow Z13 GZ302（Ryzen AI MAX+ 395）、ASUS TUF Gaming A14 FA401EA（Ryzen AI MAX+ 392）
- Workstation-Mini：AISO1 AI MAX395、GB10 AI Workstation
- Workstation-Server：PRO6000 - HPE 2 GPU（兩卡機）、PRO6000 - TPI 8 GPU（八卡機）、NVIDIA DGX B300（Blackwell Ultra）

PRO6000 - HPE 2 GPU 已收錄：

- GPT-OSS-120B Benchmark（NP1-32、Input 1K-16K、Output 1K／2K）
- Llama-3.3-70B Benchmark（NP16／32、Input 1K-16K、Output 1K／2K）
- TTFT、TPOT、Aggregate Throughput、Normalized Throughput 關鍵結果
- 兩份原始 Benchmark PDF；首次啟動時會複製至該設備的 `Benchmark/Public`。

硬體欄位中的「待確認」是刻意保留的範例值，可在管理畫面補齊。

## 系統需求

- Python 3.10+
- 現代瀏覽器
- Git（只有自動 Commit／Push 時需要）

不需要額外 Python 套件。
