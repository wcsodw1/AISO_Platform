#!/bin/bash
# ============================================================
# check_ctx_train.sh - 快速查詢模型的 n_ctx_train（原生訓練context上限）
# 用法: ./check_ctx_train.sh <模型目錄> <模型檔名或pattern> <alias>
# 原理: 故意用超大ctx(2000000)啟動server，llama.cpp會在log印出
#       "n_ctx_train (XXXXX)"這行警告，抓到後立刻關閉server，不用真的推論測試
# ============================================================
set -u

MODEL_DIR="$1"
MODEL_FILE_PATTERN="$2"
ALIAS="${3:-ctx-check}"
LLAMA_SERVER="$HOME/llama.cpp/build/bin/llama-server"
PORT=8099
PROBE_CTX=2000000

if [ -z "$MODEL_DIR" ] || [ -z "$MODEL_FILE_PATTERN" ]; then
  echo "用法: $0 <模型目錄> <模型檔名或pattern> [alias]"
  exit 1
fi

MODEL_FILE=$(find "$MODEL_DIR" -maxdepth 2 -iname "$MODEL_FILE_PATTERN" | head -1)
if [ -z "$MODEL_FILE" ] || [ ! -f "$MODEL_FILE" ]; then
  echo "[錯誤] 找不到模型檔案: $MODEL_DIR/$MODEL_FILE_PATTERN"
  exit 1
fi

echo "[模型檔案] $MODEL_FILE"

pkill -f "llama-server.*--port $PORT" 2>/dev/null
sleep 2

LOGFILE=$(mktemp)
echo "[啟動] 用探測ctx=$PROBE_CTX 啟動 server (僅為讀取n_ctx_train，不做推論)..."
"$LLAMA_SERVER" -m "$MODEL_FILE" -c "$PROBE_CTX" -np 1 --port "$PORT" --alias "$ALIAS" \
  > "$LOGFILE" 2>&1 &
SERVER_PID=$!

FOUND=""
elapsed=0
timeout=180
while [ $elapsed -lt $timeout ]; do
  if grep -q "n_ctx_train" "$LOGFILE" 2>/dev/null; then
    FOUND="yes"
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[警告] server提前結束（可能是模型載入失敗，非ctx問題），請檢查log: $LOGFILE"
    break
  fi
  sleep 2
  elapsed=$((elapsed+2))
done

if [ -n "$FOUND" ]; then
  NCTX_TRAIN=$(grep -oP 'n_ctx_train\s*=?\s*\(?\K[0-9]+' "$LOGFILE" | head -1)
  echo ""
  echo "===================== 結果 ====================="
  echo "模型: $MODEL_FILE"
  echo "n_ctx_train (原生訓練context上限) = $NCTX_TRAIN"
  echo "=================================================="
else
  echo "[結果] 未在log中找到 n_ctx_train 訊息，可能此模型原生上限 >= 探測值 $PROBE_CTX，或載入失敗"
  echo "完整log保留在: $LOGFILE"
fi

kill "$SERVER_PID" 2>/dev/null
wait "$SERVER_PID" 2>/dev/null
pkill -f "llama-server.*--port $PORT" 2>/dev/null
sleep 2
