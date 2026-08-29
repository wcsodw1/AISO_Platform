#!/bin/bash
# ============================================================
# 腳本編號: 042
# 機器代號: AMD-AI-MAX395 (Ubuntu, XT0395)
# 模型: qwen3-coder-next-80b-a3b
# 測試型態: 真實高ctx併發壓力測試 一般版(np=2/4/8, ctx=4K/8K/16K/32K 全組合)
# 組合數: 12 組 (每組3輪)
# -c = 目標ctx × np (確保每slot不被瓜分)
# ============================================================
set -u

MODEL_DIR="$HOME/Benchmark_AMDAIMAX395/models/qwen3-coder-next-q4-gguf"
MODEL_FILE="$MODEL_DIR/Qwen3-Coder-Next-UD-Q4_K_M.gguf"
LLAMA_SERVER="$HOME/llama.cpp/build/bin/llama-server"
PORT=8080
ALIAS="qwen3-coder-next-80b-a3b"
LOG_DIR="$MODEL_DIR/logs"
RESULT_CSV="$MODEL_DIR/042_qwen3-coder-next-80b-a3b_stress_results.csv"
SERVER_LOG="$LOG_DIR/042_qwen3-coder-next-80b-a3b_stress_server.log"
MAX_TOKENS=100
MARGIN=1700

mkdir -p "$LOG_DIR"

SCRIPT_START_TS=$(date +%s)
echo "[開始] 壓測腳本 042 開始執行時間: $(date '+%Y-%m-%d %H:%M:%S')"

# 修正: 之前發現有殭屍llama-server從很久以前的測試殘留(甚至跨天)，佔用大量記憶體
# 導致系統嚴重swap thrashing、污染後續所有測試數據。腳本一開始就強制清掃+驗證。
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
  echo "[錯誤] 找不到模型檔案: $MODEL_FILE （此檔名尚未經 ls 實機確認，請務必先核對）"
  exit 1
fi

# 支援續跑(resume): 若CSV已存在(上次中斷留下的)，不覆寫、直接沿用；
# 每組(target,np)是否已完整跑完由下面迴圈內用實際列數比對 np*ROUNDS 判斷。
if [ ! -f "$RESULT_CSV" ]; then
  echo "target_ctx,np,worker,success,n_ctx_slot,prompt_tokens,ttft_ms,prefill_tps,gen_tps,note" > "$RESULT_CSV"
else
  echo "[續跑] 偵測到既有CSV，將沿用並自動略過已完整跑完的組合: $RESULT_CSV"
fi
ROUNDS=3

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
  local ctotal=$1
  local np=$2
  kill_leftover_server
  print_mem_status
  echo "[啟動] 目標ctx/slot=$3 np=$np (總-c=$ctotal) ... 開始時間: $(date '+%Y-%m-%d %H:%M:%S')"
  nohup "$LLAMA_SERVER" -m "$MODEL_FILE" -c "$ctotal" -np "$np" --port "$PORT" --alias "$ALIAS" \
    > "$SERVER_LOG.tgt$3.np${np}" 2>&1 &
  SERVER_PID=$!
}

wait_for_ready() {
  local timeout=600
  local waited=0
  while true; do
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
      echo "[錯誤] server process 已提前結束 (可能OOM/crash)"
      return 1
    fi
    if curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/health" | grep -q "200"; then
      return 0
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

# 建立一個長 prompt 的 JSON payload 檔 (填到接近目標ctx)
# 關鍵修正1: 每次呼叫都用「亂數詞彙」產生全新內容，避免 llama-server 的
# LCP(最長共同前綴) prompt cache 偵測到重複前綴而跳過真正重算，
# 導致 prefill 數據失真 (之前重複"word"填充被cache命中造成數據造假的教訓)
# 關鍵修正2: 中文詞彙一個「詞」不等於一個token(實測約1.4個token/詞)，
# 若直接假設 詞數=token數 會導致實際prompt token數大幅超出n_ctx_slot，
# 造成 exceeds the available context size 400錯誤(之前8000/16000/32000/64000
# 全部0成功的根因)。改用 server 的 /tokenize endpoint 實際量測token數，
# 疊代收斂到目標token數附近，而非用猜的。
build_payload() {
  local target_tokens=$1
  local pfile=$2
  python3 - "$target_tokens" "$pfile" "$ALIAS" "$MAX_TOKENS" "$PORT" <<'PYEOF'
import sys, json, random, time, urllib.request

n_target = int(sys.argv[1])
pfile = sys.argv[2]
alias = sys.argv[3]
maxtok = int(sys.argv[4])
port = sys.argv[5]
if n_target < 1:
    n_target = 1
random.seed(time.time_ns() ^ id(pfile))
# 用大詞彙池亂數抽樣組成內容，每次呼叫產生的內容都不同、且彼此不互為前綴
vocab = ["蘋果","香蕉","電腦","雲端","運算","模型","推論","效能","記憶體","顯卡",
         "測試","分析","架構","資料","流程","系統","網路","伺服器","訓練","評估",
         "速度","延遲","併發","負載","壓力","上下文","字詞","句子","段落","文章",
         "科技","創新","研究","開發","設計","實驗","結果","數值","比較","報告"]

def make_filler(n_words):
    return "".join(random.choice(vocab) for _ in range(n_words))

def count_tokens(text):
    try:
        req = urllib.request.Request(
            "http://127.0.0.1:%s/tokenize" % port,
            data=json.dumps({"content": text}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=60) as r:
            d = json.loads(r.read().decode("utf-8"))
        return len(d.get("tokens", []))
    except Exception:
        return None

n_words = n_target
filler = make_filler(n_words)
actual = count_tokens(filler)
if actual is not None:
    # 疊代收斂：用 實際token/詞數 比例 反推需要的詞數，最多試4次
    for _ in range(4):
        if actual == 0:
            break
        tol = max(20, int(n_target * 0.03))
        if abs(actual - n_target) <= tol:
            break
        ratio = n_target / actual
        n_words = max(1, int(n_words * ratio))
        filler = make_filler(n_words)
        actual = count_tokens(filler)
# 若 /tokenize 不可用(actual is None)，退回保守估計：詞數打七折以避免超出
if actual is None:
    n_words = max(1, int(n_target * 0.7))
    filler = make_filler(n_words)

payload = {"model": alias, "messages": [{"role": "user", "content": filler}], "max_tokens": maxtok}
with open(pfile, "w") as f:
    json.dump(payload, f)
PYEOF
}

parse_field() {
  # $1=json字串 $2=timings欄位名
  echo "$1" | python3 -c "import sys,json
try:
    d=json.load(sys.stdin); t=d.get('timings',{}); print(t.get('$2','NA'))
except: print('NA')" 2>/dev/null
}

# COMBO_LIST: 每個元素是 "ctx np" 字串，取代之前的巢狀全組合迴圈，
# 讓一般版/Advanced版可以各自指定明確的組合清單(Advanced版已排除跟一般版重疊的組合)
COMBO_LIST=("4000 2" "4000 4" "4000 8" "8000 2" "8000 4" "8000 8" "16000 2" "16000 4" "16000 8" "32000 2" "32000 4" "32000 8")

for combo in "${COMBO_LIST[@]}"; do
  target=$(echo "$combo" | cut -d' ' -f1)
  np=$(echo "$combo" | cut -d' ' -f2)

  # prompt 目標 token = 目標ctx - margin (留給template+輸出)
  ptokens=$((target - MARGIN))
  if [ "$ptokens" -lt 200 ]; then ptokens=200; fi

  # 續跑檢查: 如果這組(target,np)在CSV裡已經有 np*ROUNDS 筆「非跳過」的紀錄，代表上次已完整跑完，直接略過
  expected=$((np * ROUNDS))
  existing=$(awk -F',' -v t="$target" -v n="$np" 'NR>1 && $1==t && $2==n && $3!="0"' "$RESULT_CSV" 2>/dev/null | wc -l)
  if [ "$existing" -ge "$expected" ]; then
    echo "[略過-續跑] 目標ctx=$target np=$np 已有完整資料($existing/$expected 筆)，跳過重測"
    continue
  fi
  if [ "$existing" -gt 0 ]; then
    echo "[續跑-部分] 目標ctx=$target np=$np 偵測到部分舊資料($existing/$expected 筆)，將清除這些不完整資料並重新完整跑滿3輪(避免新舊輪次混雜造成平均數失真)"
    TMP_CSV=$(mktemp)
    awk -F',' -v t="$target" -v n="$np" 'NR==1 || !($1==t && $2==n)' "$RESULT_CSV" > "$TMP_CSV"
    mv "$TMP_CSV" "$RESULT_CSV"
  fi
  COMBO_START_TS=$(date +%s)
  COMBO_START_HUMAN=$(date '+%Y-%m-%d %H:%M:%S')
  echo "[組合開始] 目標ctx=$target np=$np 開始時間: $COMBO_START_HUMAN"
  ctotal=$((target * np))
  start_server "$ctotal" "$np" "$target"
  if ! wait_for_ready; then
    echo "[跳過] 目標ctx=$target np=$np 啟動失敗(可能OOM)，記錄跳過"
    echo "$target,$np,0,0,NA,NA,NA,NA,NA,server_died_or_oom" >> "$RESULT_CSV"
    stop_server
    COMBO_END_TS=$(date +%s)
    COMBO_ELAPSED=$((COMBO_END_TS - COMBO_START_TS))
    echo "[組合結束] 目標ctx=$target np=$np 花費時間: $((COMBO_ELAPSED/60))分$((COMBO_ELAPSED%60))秒 (共 ${COMBO_ELAPSED} 秒, 啟動失敗)"
    continue
  fi

  N_CTX_SLOT=$(grep -oP 'n_ctx_slot\s*=\s*\K[0-9]+' "$SERVER_LOG.tgt$target.np${np}" 2>/dev/null | head -1)
  [ -z "$N_CTX_SLOT" ] && N_CTX_SLOT="NA"
  echo "[確認] 目標ctx=$target np=$np 每slot實際context=$N_CTX_SLOT (應接近$target)"

  for round in $(seq 1 3); do
    echo "[執行] 目標ctx=$target np=$np round=$round (併發$np個, 各帶約${ptokens}token亂數長prompt) 開始時間: $(date '+%H:%M:%S')"
    pids=()
    tmpdir=$(mktemp -d)
    for w in $(seq 1 "$np"); do
      wpayload="$tmpdir/payload_$w.json"
      build_payload "$ptokens" "$wpayload"
      (
        resp=$(curl -s --max-time 1200 -X POST "http://127.0.0.1:$PORT/v1/chat/completions" \
          -H "Content-Type: application/json" -d @"$wpayload")
        if [ -z "$resp" ]; then
          resp='{"error":"curl_timeout_20min"}'
        fi
        echo "$resp" > "$tmpdir/worker_$w.json"
      ) &
      pids+=($!)
    done
    for pid in "${pids[@]}"; do
      wait "$pid" 2>/dev/null
    done
    for w in $(seq 1 "$np"); do
      resp=$(cat "$tmpdir/worker_$w.json" 2>/dev/null)
      if echo "$resp" | grep -q '"choices"'; then
        pn=$(parse_field "$resp" "prompt_n")
        ttft=$(parse_field "$resp" "prompt_ms")
        prefill=$(parse_field "$resp" "prompt_per_second")
        gen=$(parse_field "$resp" "predicted_per_second")
        echo "$target,$np,$w,1,$N_CTX_SLOT,$pn,$ttft,$prefill,$gen,ok" >> "$RESULT_CSV"
      else
        errmsg=$(echo "$resp" | head -c 200 | tr ',\n' '; ')
        echo "$target,$np,$w,0,$N_CTX_SLOT,NA,NA,NA,NA,req_failed:$errmsg" >> "$RESULT_CSV"
      fi
    done
    rm -rf "$tmpdir"
  done
  stop_server
  COMBO_END_TS=$(date +%s)
  COMBO_ELAPSED=$((COMBO_END_TS - COMBO_START_TS))
  echo "[組合結束] 目標ctx=$target np=$np 花費時間: $((COMBO_ELAPSED/60))分$((COMBO_ELAPSED%60))秒 (共 ${COMBO_ELAPSED} 秒)"
done

echo ""
echo "===================== 壓測摘要 (依 目標ctx,np 分組，僅成功) ====================="
awk -F',' 'NR>1 {key=$1","$2; total[key]++; if($4=="1"){ok[key]++; sp+=0; sum_prefill[key]+=$8; sum_gen[key]+=$9; sum_pn[key]+=$6}} END {for (k in total) printf "目標ctx,np=%-12s 成功=%d/%d  avg_prompt_tokens=%.0f  avg_prefill_tps=%.2f  avg_gen_tps=%.2f\n", k, ok[k], total[k], (ok[k]>0?sum_pn[k]/ok[k]:0), (ok[k]>0?sum_prefill[k]/ok[k]:0), (ok[k]>0?sum_gen[k]/ok[k]:0)}' "$RESULT_CSV" | sort
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
ELAPSED_SEC=$((SCRIPT_END_TS - SCRIPT_START_TS))
echo ""
echo "[結束] 壓測腳本 042 結束時間: $(date '+%Y-%m-%d %H:%M:%S')"
echo "[耗時] 總執行時間: $((ELAPSED_SEC/3600))時$(((ELAPSED_SEC%3600)/60))分$((ELAPSED_SEC%60))秒 (共 ${ELAPSED_SEC} 秒)"
echo "[完成] 壓測腳本 042 執行結束"
