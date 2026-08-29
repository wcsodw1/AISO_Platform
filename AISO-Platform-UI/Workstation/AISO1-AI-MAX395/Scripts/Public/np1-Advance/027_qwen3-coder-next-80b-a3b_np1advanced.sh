#!/bin/bash
# ============================================
# AMD AI Max+ 395 - Qwen3-Coder-Next 80B-A3B (Q4_K_M) Advanced ctx 測試
# ctx矩陣：256000 / 512000 / 1024000 (np=1)
#
# 目的：驗證128GB統一記憶體在極大context下的表現，
# 挑選5個MoE模型測試(001/004/007/010/019)，
# 失敗/crash自動記錄並跳過，不中斷整支腳本
#
# 沿用SKILL.md規範：
# - Wait-ServerReadyOrDie等效機制(輪詢+偵測process是否提前結束)
# - 暖機驗證(先送trivial請求確認slot真的可用)
# - 走 /v1/chat/completions 端點
# - 增量存檔，每組結束就寫入CSV
# - 逾時設定拉長為600秒(大ctx載入需要更久時間)
# ============================================
set -uo pipefail

LLAMA_SERVER="$HOME/llama.cpp/build/bin/llama-server"
MODEL_DIR="$HOME/Benchmark_AMDAIMAX395/models/qwen3-coder-next-q4-gguf"
MODEL_FILE="$MODEL_DIR/Qwen3-Coder-Next-UD-Q4_K_M.gguf"
LOG_DIR="$MODEL_DIR/logs"
RESULT_CSV="$MODEL_DIR/027_qwen3-coder-next-80b-a3b_np1advanced_results.csv"
PORT=8080
ALIAS="qwen3-coder-next-advanced"

CTX_LIST=(256000 512000 1024000)
TRIALS=3
WAIT_TIMEOUT=600
MAX_TOKENS=100
PROMPT="Explain artificial intelligence in one sentence."

mkdir -p "$LOG_DIR"

if [ ! -f "$MODEL_FILE" ]; then
  echo "[錯誤] 找不到模型檔案: $MODEL_FILE"
  echo "請先用 ls \"$MODEL_DIR\" 確認實際檔名並修改本腳本 MODEL_FILE 變數。"
  exit 1
fi

# 若CSV不存在，寫入header
if [ ! -f "$RESULT_CSV" ]; then
  echo "ctx,trial,success,ttft_ms,prefill_tps,gen_tps,note,actual_ctx" > "$RESULT_CSV"
fi

clear_stale_server() {
  pkill -f "llama-server.*--port $PORT" 2>/dev/null
  sleep 2
}

wait_server_ready_or_die() {
  local pid=$1
  local elapsed=0
  while [ $elapsed -lt $WAIT_TIMEOUT ]; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "DEAD"
      return
    fi
    if curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/health" 2>/dev/null | grep -q "200"; then
      echo "READY"
      return
    fi
    sleep 3
    elapsed=$((elapsed+3))
  done
  echo "TIMEOUT"
}

wait_for_warm_ready() {
  local elapsed=0
  local warm_timeout=120
  while [ $elapsed -lt $warm_timeout ]; do
    resp=$(curl -s -X POST "http://127.0.0.1:$PORT/v1/chat/completions" \
      -H "Content-Type: application/json" \
      -d '{"messages":[{"role":"user","content":"hi"}],"max_tokens":1}' 2>/dev/null)
    if echo "$resp" | grep -q "choices"; then
      echo "WARM"
      return
    fi
    sleep 2
    elapsed=$((elapsed+2))
  done
  echo "COLD_TIMEOUT"
}

send_request() {
  local start_ts=$(date +%s.%N)
  resp=$(curl -s -X POST "http://127.0.0.1:$PORT/v1/chat/completions" \
    -H "Content-Type: application/json" \
    -d "{\"messages\":[{\"role\":\"user\",\"content\":\"$PROMPT\"}],\"max_tokens\":$MAX_TOKENS}" 2>/dev/null)
  local end_ts=$(date +%s.%N)

  if echo "$resp" | grep -q "choices"; then
    ttft_ms=$(echo "$resp" | grep -o '"prompt_ms":[0-9.]*' | head -1 | cut -d: -f2)
    prefill_tps=$(echo "$resp" | grep -o '"prompt_per_second":[0-9.]*' | head -1 | cut -d: -f2)
    gen_tps=$(echo "$resp" | grep -o '"predicted_per_second":[0-9.]*' | head -1 | cut -d: -f2)
    [ -z "$ttft_ms" ] && ttft_ms="NA"
    [ -z "$prefill_tps" ] && prefill_tps="NA"
    [ -z "$gen_tps" ] && gen_tps="NA"
    echo "1,$ttft_ms,$prefill_tps,$gen_tps,ok"
  else
    echo "0,NA,NA,NA,http_request_failed"
  fi
}

echo "[開始] 腳本 027 (Advanced ctx) 開始執行時間: $(date '+%Y-%m-%d %H:%M:%S')"

for ctx in "${CTX_LIST[@]}"; do
  clear_stale_server

  echo "[啟動] ctx=$ctx np=1 (Advanced) ..."
  ACTUAL_CTX="NA"
  LOGFILE="$LOG_DIR/027_ctx${ctx}_$(date +%H%M%S).log"
  "$LLAMA_SERVER" -m "$MODEL_FILE" -c "$ctx" -np 1 --port "$PORT" --alias "$ALIAS" \
    > "$LOGFILE" 2>&1 &
  SERVER_PID=$!

  status=$(wait_server_ready_or_die "$SERVER_PID")

  if [ "$status" == "DEAD" ]; then
    echo "[錯誤] ctx=$ctx server process提前結束(可能OOM/crash)，記錄並跳過"
    echo "$ctx,NA,0,NA,NA,NA,server_died_on_start,$ACTUAL_CTX" >> "$RESULT_CSV"
    continue
  elif [ "$status" == "TIMEOUT" ]; then
    echo "[錯誤] ctx=$ctx 等待就緒逾時(${WAIT_TIMEOUT}s)，記錄並跳過"
    echo "$ctx,NA,0,NA,NA,NA,wait_ready_timeout,$ACTUAL_CTX" >> "$RESULT_CSV"
    kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null
    continue
  fi

  echo "[就緒] server 已可回應 health check，進行暖機驗證..."
  ACTUAL_CTX=$(grep -oP 'n_ctx_slot\s*=\s*\K[0-9]+' "$LOGFILE" 2>/dev/null | head -1)
  [ -z "$ACTUAL_CTX" ] && ACTUAL_CTX="NA"
  if [ "$ACTUAL_CTX" != "NA" ] && [ "$ACTUAL_CTX" != "$ctx" ]; then
    echo "[警告] ctx=$ctx 被裁切為實際context=$ACTUAL_CTX (模型n_ctx_train限制)"
  else
    echo "[確認] ctx=$ctx 實際生效context=$ACTUAL_CTX"
  fi
  warm_status=$(wait_for_warm_ready)
  if [ "$warm_status" == "COLD_TIMEOUT" ]; then
    echo "[錯誤] ctx=$ctx 暖機驗證逾時，記錄並跳過"
    echo "$ctx,NA,0,NA,NA,NA,warmup_timeout,$ACTUAL_CTX" >> "$RESULT_CSV"
    kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null
    continue
  fi

  echo "[就緒] server 已可回應推論請求"

  for trial in $(seq 1 $TRIALS); do
    echo "[執行] ctx=$ctx trial=$trial"
    result=$(send_request)
    echo "$ctx,$trial,$result,$ACTUAL_CTX" >> "$RESULT_CSV"
  done

  kill "$SERVER_PID" 2>/dev/null
  wait "$SERVER_PID" 2>/dev/null
  sleep 3
done

echo "===================== 摘要 (依 ctx 分組平均，僅成功) ====================="
awk -F',' 'NR>1 {key=$1; total[key]++; if($3=="1"){ok[key]++; sum_ttft[key]+=$4; sum_prefill[key]+=$5; sum_gen[key]+=$6}} END {for (k in total) printf "ctx=%s  成功=%d/%d  avg_ttft_ms=%.2f  avg_prefill_tps=%.2f  avg_gen_tps=%.2f\n", k, ok[k], total[k], (ok[k]>0?sum_ttft[k]/ok[k]:0), (ok[k]>0?sum_prefill[k]/ok[k]:0), (ok[k]>0?sum_gen[k]/ok[k]:0)}' "$RESULT_CSV"

echo "結果已存至: $RESULT_CSV"
echo "[完成] 腳本 027 執行結束"
