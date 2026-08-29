# AISO Platform v1.15.7

AISO Platform 是一套「Mac 本機管理＋GitHub Pages 公開展示」的設備文件入口。

首頁的 `Model List` 依 Consumer／Workstation／Server 整理目前已有 Benchmark、Scripts 或 Prepared 紀錄的適用模型與用途。

第一版資訊架構：

```text
服務類型（Consumer / Workstation / Server）
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

首次啟動會自動建立四台設備的資料夾。

## 資料夾結構

```text
AISO-Platform-Data/
├─ Consumer/
│  └─ ASUS-ROG-AI-MAX395/
│     ├─ Documents/
│     │  └─ Public/
│     ├─ Benchmark/
│     │  └─ Public/
│     └─ Scripts/
│  └─ ASUS-TUF-GAMING-AI-MAX392/
│     ├─ Documents/
│     │  └─ Public/
│     ├─ Benchmark/
│     │  └─ Public/
│     └─ Scripts/
├─ Workstation/
│  └─ AISO1-AI-MAX395/
│     ├─ Documents/
│     │  └─ Public/
│     ├─ Benchmark/
│     │  └─ Public/
│     └─ Scripts/
└─ Server/
   └─ PRO6000-HPE-2GPU/
      ├─ Documents/
      │  └─ Public/
      ├─ Benchmark/
      │  └─ Public/
      └─ Scripts/
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

- Consumer：ASUS ROG AI MAX395、ASUS TUF GAMING AI MAX392
- Workstation：AISO1 AI MAX395
- Server：PRO6000 - HPE 2 GPU（兩卡機）

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
