# AISO Platform

AISO Platform 是設備文件、Benchmark 結果與執行腳本的單一 repository。目前 Portal 版本為 **v1.15.7**。

## Repository 範圍

```text
AISO_Platform/
├─ AISO_Platform_Portal/   # Portal 程式、產品目錄與 GitHub Pages 輸出
├─ AISO-Platform-UI/       # 目前使用中的設備文件、結果與腳本
├─ requirements.txt       # Python 執行需求（目前無第三方套件）
├─ Makefile               # 常用啟動、匯出與檢查指令
└─ README.md
```

其他舊版資料夾、根目錄 PDF、`Previous data`、原始 stdout/stderr、JSONL 與 ZIP 仍保留在本機，但不納入 Git。經整理的 CSV、設備腳本、正式文件及公開報告會正常納管。

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

`AISO_Platform_Portal/docs/` 是 GitHub Pages 的正式靜態輸出，應與 Portal 版本一起提交。因它位於 monorepo 子目錄，連接 GitHub remote 後建議用 GitHub Actions 發布該資料夾；不直接把整個 repository 根目錄公開。

## 版本管理建議

- `main`：可使用、已驗證的版本。
- 功能與內容更新用短期分支，例如 `feature/aimax392-document`。
- Commit 依用途區分，例如 `feat:`、`fix:`、`docs:`、`data:`、`chore:`。
- Portal 發布版本使用 tag，例如 `v1.15.7`。
- 不提交密碼、Token、SSH Key、`.env` 或未整理的原始 Benchmark 輸出。
