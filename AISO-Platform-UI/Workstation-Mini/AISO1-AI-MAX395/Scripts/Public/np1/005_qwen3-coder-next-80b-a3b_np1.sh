#!/bin/bash
# ============================================================
# 腳本編號: 005
# 機器代號: AMD-AI-MAX395 (Ubuntu, XT0395)
# 模型: qwen3-coder-next-80b-a3b
# 測試型態: np1
# 引擎: 官方 llama.cpp (Vulkan backend, 自行編譯)
# 產出時間: 由 gen_scripts.py 自動產生
# ============================================================
set -u

MODEL_DIR="$HOME/Benchmark_AMDAIMAX395/models/qwen3-coder-next-q4-gguf"
MODEL_FILE="$MODEL_DIR/Qwen3-Coder-Next-UD-Q4_K_M.gguf"
LLAMA_SERVER="$HOME/llama.cpp/build/bin/llama-server"
PORT=8080
ALIAS="qwen3-coder-next-80b-a3b"
LOG_DIR="$MODEL_DIR/logs"
RESULT_CSV="$MODEL_DIR/005_qwen3-coder-next-80b-a3b_np1_results.csv"
SERVER_LOG="$LOG_DIR/005_qwen3-coder-next-80b-a3b_np1_server.log"

mkdir -p "$LOG_DIR"

# ---- 整體執行計時開始 ----
SCRIPT_START_TS=$(date +%s)
SCRIPT_START_HUMAN=$(date "+%Y-%m-%d %H:%M:%S")
echo "[開始] 腳本 005 開始執行時間: $SCRIPT_START_HUMAN"

# 腳本一開始就先強制掃描並清除任何殘留的llama-server(不管是誰、什麼設定啟動的)，
# 確保這次測試是在乾淨的環境下開始，不會被前面測試留下的殭屍程序污染數據
pkill -f "llama-server" 2>/dev/null
sleep 2
pkill -9 -f "llama-server" 2>/dev/null
sleep 2
LEFTOVER_CHECK=$(pgrep -f "llama-server" 2>/dev/null)
if [ -n "$LEFTOVER_CHECK" ]; then
  echo "[警告] 腳本開始前仍有殘留llama-server程序(PID: $LEFTOVER_CHECK)無法清除，請人工檢查後再繼續！"
fi
free -h | awk '/^Mem:/{print "[開始前記憶體] total="$2" used="$3" free="$4" available="$7} /^Swap:/{print "[開始前Swap] used="$3"/"$2}'

if [ ! -f "$MODEL_FILE" ]; then
  echo "[錯誤] 找不到模型檔案: $MODEL_FILE"
  echo "請先用 ls \"$MODEL_DIR\" 確認實際檔名並修改本腳本 MODEL_FILE 變數。（此檔名尚未經 ls 實機確認，請務必先核對）"
  exit 1
fi

FIXED_PROMPT="請用三句話介紹一下大型語言模型的推論效能評估重點。"
MAX_TOKENS=100

# ---- 共用函式 ----

# 修正: 之前發現有殭屍llama-server從很久以前的測試殘留(有一支甚至從前一天就
# 卡在記憶體裡沒被清掉)，佔用大量記憶體導致系統嚴重swap thrashing，污染了後續
# 所有測試的效能數據。原本的kill_leftover_server只送一次SIGTERM就假設成功，
# 沒有驗證、也沒有對付卡在D狀態(磁碟/記憶體I/O等待中，SIGTERM無效)的殭屍程序。
# 現在改成: SIGTERM -> 驗證 -> 若還在則SIGKILL -> 再驗證，並印出診斷訊息。
kill_leftover_server() {
  local leftover
  leftover=$(pgrep -f "llama-server" 2>/dev/null)
  if [ -n "$leftover" ]; then
    echo "[清理] 發現殘留llama-server程序(PID: $leftover)，送出SIGTERM"
    pkill -f "llama-server" 2>/dev/null
    sleep 3
    leftover=$(pgrep -f "llama-server" 2>/dev/null)
    if [ -n "$leftover" ]; then
      echo "[清理] SIGTERM無效，殘留程序仍在(PID: $leftover)，強制SIGKILL"
      pkill -9 -f "llama-server" 2>/dev/null
      sleep 3
      leftover=$(pgrep -f "llama-server" 2>/dev/null)
      if [ -n "$leftover" ]; then
        echo "[警告] 仍有無法清除的llama-server程序(PID: $leftover)，可能卡在D狀態(磁碟/記憶體I/O等待)，請人工檢查！後續測試數據可能不可信"
      else
        echo "[清理] SIGKILL後確認乾淨"
      fi
    fi
  fi
}

print_mem_status() {
  free -h | awk '/^Mem:/{print "[記憶體] total="$2" used="$3" free="$4" available="$7} /^Swap:/{print "[Swap] used="$3"/"$2}'
}

start_server() {
  local ctx=$1
  local np=$2
  kill_leftover_server
  print_mem_status
  echo "[啟動] ctx=$ctx np=$np ..."
  nohup "$LLAMA_SERVER" -m "$MODEL_FILE" -c "$ctx" -np "$np" --port "$PORT" --alias "$ALIAS" \
    > "$SERVER_LOG.ctx${ctx}.np${np}" 2>&1 &
  SERVER_PID=$!
}

wait_for_ready() {
  local timeout=180
  local waited=0
  while true; do
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
      echo "[錯誤] server process 已提前結束 (crash 或載入失敗)，見 log: $SERVER_LOG"
      return 1
    fi
    if curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/health" | grep -q "200"; then
      # 暖機驗證：送一個 trivial chat completion
      resp=$(curl -s -X POST "http://127.0.0.1:$PORT/v1/chat/completions" \
        -H "Content-Type: application/json" \
        -d "{\"model\":\"$ALIAS\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"max_tokens\":4}")
      if echo "$resp" | grep -q '"choices"'; then
        echo "[就緒] server 已可回應推論請求"
        return 0
      fi
    fi
    sleep 3
    waited=$((waited+3))
    if [ "$waited" -ge "$timeout" ]; then
      echo "[錯誤] 等待就緒逾時 (${timeout}s)"
      return 1
    fi
  done
}

stop_server() {
  if [ -n "${SERVER_PID:-}" ]; then
    kill "$SERVER_PID" 2>/dev/null
  fi
  kill_leftover_server
  sleep 3
}

send_request() {
  local out
  out=$(curl -s -X POST "http://127.0.0.1:$PORT/v1/chat/completions" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"$ALIAS\",\"messages\":[{\"role\":\"user\",\"content\":\"$FIXED_PROMPT\"}],\"max_tokens\":$MAX_TOKENS}")
  echo "$out"
}


echo "ctx,trial,ttft_ms,prefill_tps,gen_tps,actual_ctx" > "$RESULT_CSV"

for ctx in 8000 16000 32000 64000 128000; do
  start_server "$ctx" 1
  if ! wait_for_ready; then
    stop_server
    continue
  fi
  ACTUAL_CTX=$(grep -oP 'n_ctx_slot\s*=\s*\K[0-9]+' "$SERVER_LOG.ctx${ctx}.np1" 2>/dev/null | head -1)
  [ -z "$ACTUAL_CTX" ] && ACTUAL_CTX="NA"
  # 修正: ctx跟ACTUAL_CTX不一致時，多半只是llama.cpp把ctx內部對齊到256倍數(正常現象)，
  # 不等於真正的n_ctx_train限制(那要ctx超過模型原生訓練上限才會發生，此測試範圍內的ctx
  # 都遠低於131072/262144，理論上不會踩到真正的訓練上限)。用差距大小區分兩種情況，
  # 避免像之前npmulti-advanced那次一樣把「除法/對齊」誤標成「n_ctx_train限制」。
  if [ "$ACTUAL_CTX" != "NA" ] && [ "$ACTUAL_CTX" != "$ctx" ]; then
    CTX_DIFF=$((ctx - ACTUAL_CTX))
    if [ "$CTX_DIFF" -gt 1000 ]; then
      echo "[警告] ctx=$ctx 實際生效context=$ACTUAL_CTX，差距達${CTX_DIFF}，可能是真正的n_ctx_train限制，請對照check_ctx_train.sh的探測結果確認"
    else
      echo "[確認] ctx=$ctx 實際生效context=$ACTUAL_CTX (差距僅${CTX_DIFF}，屬llama.cpp內部ctx對齊到256倍數的正常現象，非n_ctx_train限制)"
    fi
  else
    echo "[確認] ctx=$ctx 實際生效context=$ACTUAL_CTX"
  fi
  for trial in $(seq 1 3); do
    echo "[執行] ctx=$ctx trial=$trial"
    resp=$(send_request)
    if ! echo "$resp" | grep -q '"choices"'; then
      echo "[錯誤] HTTP 回應異常，內容: $resp"
      echo "$ctx,$trial,NA,NA,NA,$ACTUAL_CTX" >> "$RESULT_CSV"
      continue
    fi
    ttft=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); t=d.get('timings',{}); print(t.get('prompt_ms','NA'))" 2>/dev/null)
    prefill=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); t=d.get('timings',{}); print(t.get('prompt_per_second','NA'))" 2>/dev/null)
    gen=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); t=d.get('timings',{}); print(t.get('predicted_per_second','NA'))" 2>/dev/null)
    echo "$ctx,$trial,$ttft,$prefill,$gen,$ACTUAL_CTX" >> "$RESULT_CSV"
  done
  stop_server
done

echo ""
echo "===================== 摘要 (依 ctx 分組平均) ====================="
awk -F',' 'NR>1 {{sum_ttft[$1]+=$3; sum_prefill[$1]+=$4; sum_gen[$1]+=$5; cnt[$1]++}} END {{for (c in cnt) printf "ctx=%s  avg_ttft_ms=%.2f  avg_prefill_tps=%.2f  avg_gen_tps=%.2f  (n=%d)\n", c, sum_ttft[c]/cnt[c], sum_prefill[c]/cnt[c], sum_gen[c]/cnt[c], cnt[c]}}' "$RESULT_CSV"
echo "結果已存至: $RESULT_CSV"

# 腳本結束前再做一次強制清理+驗證，確保不會把殭屍程序留給下一支腳本
pkill -f "llama-server" 2>/dev/null
sleep 2
pkill -9 -f "llama-server" 2>/dev/null
sleep 2
FINAL_LEFTOVER=$(pgrep -f "llama-server" 2>/dev/null)
if [ -n "$FINAL_LEFTOVER" ]; then
  echo "[警告] 腳本結束時仍有殘留llama-server程序(PID: $FINAL_LEFTOVER)無法清除！下一支腳本可能會受污染，請人工介入"
else
  echo "[清理確認] 腳本結束時已無殘留llama-server程序"
fi
free -h | awk '/^Mem:/{print "[結束後記憶體] total="$2" used="$3" free="$4" available="$7} /^Swap:/{print "[結束後Swap] used="$3"/"$2}'

SCRIPT_END_TS=$(date +%s)
SCRIPT_END_HUMAN=$(date "+%Y-%m-%d %H:%M:%S")
ELAPSED_SEC=$((SCRIPT_END_TS - SCRIPT_START_TS))
ELAPSED_H=$((ELAPSED_SEC/3600))
ELAPSED_M=$(((ELAPSED_SEC%3600)/60))
ELAPSED_S=$((ELAPSED_SEC%60))
echo ""
echo "[結束] 腳本 005 結束時間: $SCRIPT_END_HUMAN"
echo "[耗時] 總執行時間: ${ELAPSED_H}時${ELAPSED_M}分${ELAPSED_S}秒 (共 ${ELAPSED_SEC} 秒)"

echo "[完成] 腳本 005 執行結束"
