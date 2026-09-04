#!/bin/bash
# ============================================================
# 腳本編號: 045
# 機器代號: AMD-AI-MAX395 (Ubuntu, XT0395)
# 模型: Laguna-XS-2.1
#
# 測試型態:
#   真實 High-Context Concurrent Stress Test
#
# 每 Request Context:
#   4K / 8K / 16K / 32K
#
# Concurrent:
#   np=2 / 4 / 8
#
# 組合:
#   4 ctx × 3 np = 12 組
#   每組 3 rounds
#   每 round 同時送出 np 個真正長 Context request
#
# 核心規則:
#
#   target_ctx = 每一個 request 的目標 Context
#
#   server_ctx = target_ctx × np
#
#   -c = server_ctx
#   -np = np
#
# 例如:
#
#   target_ctx=32000
#   np=8
#
#   -c 256000
#   -np 8
#
#   => 每個 slot 約 32K
#   => 8 個 request 各自帶約 32K prompt
#
# 注意:
#   target_ctx != server total context
#   server_ctx 是所有 concurrent slots 的總 KV budget
#
# 引擎:
#   官方 llama.cpp (Vulkan backend, 自行編譯)
# ============================================================

set -u

# ============================================================
# 基本設定
# ============================================================

MODEL_DIR="$HOME/Benchmark_AMDAIMAX395/models/laguna-xs-2.1-q4-gguf"

MODEL_FILE="$MODEL_DIR/Laguna-XS-2.1-Q4_K_M.gguf"

LLAMA_SERVER="$HOME/llama.cpp/build/bin/llama-server"

PORT=8080

ALIAS="laguna-xs-2.1"

LOG_DIR="$MODEL_DIR/logs"

RESULT_CSV="$MODEL_DIR/045_laguna-xs-2.1_highctx_stress_results.csv"

SERVER_LOG_PREFIX="$LOG_DIR/045_laguna-xs-2.1"

MAX_TOKENS=100

# ------------------------------------------------------------
# Prompt margin
#
# 目標 slot context 不可以被 prompt + output 撐爆。
#
# 這裡保留 1700 token 安全空間。
#
# 例如:
# target_ctx=32000
#
# prompt target ≈ 30300
# output max = 100
#
# 留有 template / special token / rounding 空間
# ------------------------------------------------------------

MARGIN=1700

ROUNDS=3

# Server ready timeout
READY_TIMEOUT=600

# 單一 request 最長 20 分鐘
REQUEST_TIMEOUT=1200

# ============================================================
# Benchmark Matrix
#
# 第一欄 = 每 Request Context
# 第二欄 = Concurrent requests / slots
#
# 不是 total ctx。
# ============================================================

COMBO_LIST=(
  "4000 2"
  "4000 4"
  "4000 8"

  "8000 2"
  "8000 4"
  "8000 8"

  "16000 2"
  "16000 4"
  "16000 8"

  "32000 2"
  "32000 4"
  "32000 8"
)

# ============================================================
# 初始化
# ============================================================

mkdir -p "$LOG_DIR"

SCRIPT_START_TS=$(date +%s)

echo ""
echo "============================================================"
echo "045 Laguna-XS-2.1 High-Context Concurrent Stress Test"
echo "============================================================"
echo "[開始] $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# ============================================================
# 檢查模型
# ============================================================

if [ ! -f "$MODEL_FILE" ]; then
  echo "[錯誤] 找不到模型檔案:"
  echo "       $MODEL_FILE"
  echo ""
  echo "[提示] 請先執行:"
  echo "       ls -lh \"$MODEL_DIR\""
  exit 1
fi

echo "[模型] $MODEL_FILE"

MODEL_SIZE=$(stat -c%s "$MODEL_FILE" 2>/dev/null || echo 0)

if [ "$MODEL_SIZE" -gt 0 ]; then
  MODEL_GB=$(python3 - "$MODEL_SIZE" <<'PY'
import sys
size=int(sys.argv[1])
print(f"{size/1024/1024/1024:.2f}")
PY
)
  echo "[模型大小] ${MODEL_GB} GiB"
fi

# ============================================================
# 檢查 llama-server
# ============================================================

if [ ! -x "$LLAMA_SERVER" ]; then
  echo "[錯誤] 找不到可執行 llama-server:"
  echo "       $LLAMA_SERVER"
  exit 1
fi

echo "[llama-server] $LLAMA_SERVER"

# ============================================================
# 清理所有舊 llama-server
#
# 特別避免前一次 OOM / crash / 中斷留下 zombie server
# 污染後續 benchmark。
# ============================================================

kill_leftover_server() {

  local leftover

  leftover=$(pgrep -f "llama-server" 2>/dev/null || true)

  if [ -n "$leftover" ]; then

    echo "[清理] 發現殘留 llama-server:"
    echo "$leftover"

    pkill -f "llama-server" 2>/dev/null || true

    sleep 3

    leftover=$(pgrep -f "llama-server" 2>/dev/null || true)

    if [ -n "$leftover" ]; then

      echo "[清理] SIGTERM 無效，執行 SIGKILL"

      pkill -9 -f "llama-server" 2>/dev/null || true

      sleep 3

      leftover=$(pgrep -f "llama-server" 2>/dev/null || true)

      if [ -n "$leftover" ]; then
        echo "[警告] 仍有 llama-server 無法清除:"
        echo "$leftover"
      else
        echo "[清理] SIGKILL 後確認乾淨"
      fi

    else

      echo "[清理] SIGTERM 後確認乾淨"

    fi

  else

    echo "[清理] 沒有殘留 llama-server"

  fi
}

# ============================================================
# 記憶體狀態
# ============================================================

print_mem_status() {

  free -h | awk '
  /^Mem:/ {
    print "[記憶體] total="$2 \
          " used="$3 \
          " free="$4 \
          " available="$7
  }

  /^Swap:/ {
    print "[Swap] used="$3"/"$2
  }'
}

# ============================================================
# 開始前清理
# ============================================================

kill_leftover_server

print_mem_status

# ============================================================
# CSV 初始化
#
# 特別加入:
#
# target_ctx
# server_ctx
# np
# worker
# round
# slot_ctx
# prompt_target_tokens
# prompt_tokens
# ttft_ms
# prefill_tps
# gen_tps
# success
# note
#
# 讓結果能明確證明：
# 「每 request 到底用了多少 Context」
# ============================================================

if [ ! -f "$RESULT_CSV" ]; then

  echo "target_ctx,server_ctx,np,round,worker,success,n_ctx_slot,prompt_target_tokens,prompt_tokens,ttft_ms,prefill_tps,gen_tps,note" \
    > "$RESULT_CSV"

else

  echo "[續跑] 偵測到既有 CSV:"
  echo "       $RESULT_CSV"
  echo "[續跑] 已完成的組合將自動跳過"

fi

# ============================================================
# Server PID
# ============================================================

SERVER_PID=""

# ============================================================
# Start server
# ============================================================

start_server() {

  local server_ctx=$1
  local np=$2
  local target=$3

  kill_leftover_server

  print_mem_status

  SERVER_LOG="${SERVER_LOG_PREFIX}.tgt${target}.np${np}.server.log"

  echo ""
  echo "------------------------------------------------------------"
  echo "[啟動 Server]"
  echo "target_ctx  = $target"
  echo "np          = $np"
  echo "server -c   = $server_ctx"
  echo "server log  = $SERVER_LOG"
  echo "------------------------------------------------------------"

  nohup "$LLAMA_SERVER" \
    -m "$MODEL_FILE" \
    -c "$server_ctx" \
    -np "$np" \
    --port "$PORT" \
    --alias "$ALIAS" \
    > "$SERVER_LOG" 2>&1 &

  SERVER_PID=$!

  echo "[Server PID] $SERVER_PID"
}

# ============================================================
# Wait server ready
# ============================================================

wait_for_ready() {

  local timeout="$READY_TIMEOUT"
  local waited=0

  while true; do

    if ! kill -0 "$SERVER_PID" 2>/dev/null; then

      echo "[錯誤] llama-server 已提前結束"
      echo "[可能原因] OOM / Vulkan error / model load failure / crash"
      echo "[Log] $SERVER_LOG"

      return 1
    fi

    local status

    status=$(curl \
      -s \
      -o /dev/null \
      -w "%{http_code}" \
      "http://127.0.0.1:$PORT/health" \
      2>/dev/null || true)

    if [ "$status" = "200" ]; then

      echo "[就緒] llama-server health = 200"

      return 0

    fi

    sleep 3

    waited=$((waited + 3))

    if [ "$waited" -ge "$timeout" ]; then

      echo "[錯誤] Server 等待就緒逾時 (${timeout}s)"
      echo "[Log] $SERVER_LOG"

      return 1

    fi

  done
}

# ============================================================
# Stop server
# ============================================================

stop_server() {

  if [ -n "${SERVER_PID:-}" ]; then

    kill "$SERVER_PID" 2>/dev/null || true

    sleep 3

  fi

  kill_leftover_server

  SERVER_PID=""

  sleep 3
}

# ============================================================
# 從 server log 取得 n_ctx_slot
# ============================================================

get_n_ctx_slot() {

  local logfile="$1"

  local result

  result=$(
    grep -oP 'n_ctx_slot\s*=\s*\K[0-9]+' \
      "$logfile" \
      2>/dev/null |
    head -1
  )

  if [ -z "$result" ]; then
    echo "NA"
  else
    echo "$result"
  fi
}

# ============================================================
# 驗證 slot context
#
# 非常重要：
#
# 以前：
#
# actual != target
# ↓
# 說「模型裁切」
#
# 現在：
#
# actual != target
# ↓
# Slot Allocation Mismatch
#
# 不允許進入 benchmark。
# ============================================================

verify_slot_context() {

  local target="$1"
  local actual="$2"

  if [ "$actual" = "NA" ]; then

    echo "[錯誤] 無法從 server log 取得 n_ctx_slot"
    return 1

  fi

  if [ "$actual" -lt "$target" ]; then

    echo ""
    echo "============================================================"
    echo "[FAIL] Slot Context Allocation Mismatch"
    echo "============================================================"
    echo "Target Request Context : $target"
    echo "Actual n_ctx_slot      : $actual"
    echo ""
    echo "這不是自動判定為模型 n_ctx_train 裁切。"
    echo "代表實際 slot allocation 沒有達到本次實驗要求。"
    echo ""
    echo "Benchmark 不應在這種狀態下繼續。"
    echo "============================================================"

    return 1

  fi

  echo "[確認] target_ctx=$target"
  echo "[確認] actual n_ctx_slot=$actual"
  echo "[確認] Slot Context >= Target Context"

  return 0
}

# ============================================================
# Prompt Builder
#
# 目的：
#
# 產生真正接近 target_ctx 的 input。
#
# 不使用固定 prompt。
#
# 每個 worker 都會產生不同內容。
#
# 避免：
#   LCP cache / prompt cache
#   讓 prefill 被跳過。
#
# 使用 server /tokenize 實際計算 token。
# ============================================================

build_payload() {

  local target_tokens="$1"
  local pfile="$2"

  python3 - \
    "$target_tokens" \
    "$pfile" \
    "$ALIAS" \
    "$MAX_TOKENS" \
    "$PORT" <<'PYEOF'

import sys
import json
import random
import time
import urllib.request

target = int(sys.argv[1])
pfile = sys.argv[2]
alias = sys.argv[3]
max_tokens = int(sys.argv[4])
port = sys.argv[5]

random.seed(
    time.time_ns() ^
    id(pfile) ^
    random.getrandbits(64)
)

# ------------------------------------------------------------
# 大詞彙池
#
# 每次隨機排列 / 抽樣
# 避免所有 worker 使用相同 prefix。
# ------------------------------------------------------------

vocab = [
    "蘋果","香蕉","電腦","雲端","運算","模型","推論",
    "效能","記憶體","顯卡","測試","分析","架構","資料",
    "流程","系統","網路","伺服器","訓練","評估","速度",
    "延遲","併發","負載","壓力","上下文","字詞","句子",
    "段落","文章","科技","創新","研究","開發","設計",
    "實驗","結果","數值","比較","報告","工程","演算法",
    "服務","平台","程序","核心","資源","容量","吞吐量",
    "請求","工作","任務","使用者","文件","內容","資料庫",
    "索引","搜尋","快取","記錄","分析","模型推理","長文本"
]

def make_text(n_words):

    words = []

    for _ in range(n_words):
        words.append(random.choice(vocab))

    return "".join(words)


def tokenize(text):

    url = "http://127.0.0.1:%s/tokenize" % port

    req = urllib.request.Request(
        url,
        data=json.dumps({
            "content": text
        }).encode("utf-8"),
        headers={
            "Content-Type": "application/json"
        }
    )

    try:

        with urllib.request.urlopen(req, timeout=120) as response:

            data = json.loads(
                response.read().decode("utf-8")
            )

        return len(data.get("tokens", []))

    except Exception:

        return None


# ------------------------------------------------------------
# 初始估算
# 中文詞彙 ≠ token
#
# 先從約 0.7 token/word 的保守比例開始。
# ------------------------------------------------------------

n_words = max(
    1,
    int(target * 0.70)
)

best_text = None
best_tokens = None

# ------------------------------------------------------------
# 反覆用 /tokenize 收斂
# ------------------------------------------------------------

for attempt in range(8):

    text = make_text(n_words)

    actual = tokenize(text)

    if actual is None:

        # fallback
        best_text = text
        best_tokens = None
        break

    best_text = text
    best_tokens = actual

    diff = abs(actual - target)

    tolerance = max(
        20,
        int(target * 0.005)
    )

    if diff <= tolerance:

        break

    if actual <= 0:

        break

    ratio = target / actual

    n_words = max(
        1,
        int(n_words * ratio)
    )


# ------------------------------------------------------------
# 最終 payload
# ------------------------------------------------------------

payload = {
    "model": alias,
    "messages": [
        {
            "role": "user",
            "content": best_text
        }
    ],
    "max_tokens": max_tokens
}

with open(
    pfile,
    "w",
    encoding="utf-8"
) as f:

    json.dump(
        payload,
        f,
        ensure_ascii=False
    )

# 將實際 token 數另外寫出
# runner 可讀取。
meta_file = pfile + ".meta"

with open(
    meta_file,
    "w"
) as f:

    f.write(
        "NA" if best_tokens is None
        else str(best_tokens)
    )

PYEOF
}

# ============================================================
# Parse llama.cpp timing field
# ============================================================

parse_field() {

  local json="$1"
  local field="$2"

  echo "$json" |
    python3 -c "
import sys
import json

try:
    d=json.load(sys.stdin)
    t=d.get('timings',{})
    v=t.get('$field','NA')
    print(v)
except Exception:
    print('NA')
" 2>/dev/null
}

# ============================================================
# 續跑判斷
#
# 每組：
#
# np workers × ROUNDS
#
# 例如 np=8:
#
# 8 × 3 = 24 rows
# ============================================================

combo_is_complete() {

  local target="$1"
  local np="$2"

  local expected
  local existing

  expected=$((np * ROUNDS))

  existing=$(
    awk \
      -F',' \
      -v t="$target" \
      -v n="$np" \
      'NR>1 &&
       $1==t &&
       $3==n &&
       $6=="1" {
         count++
       }
       END {
         print count+0
       }' \
      "$RESULT_CSV" 2>/dev/null
  )

  if [ "$existing" -ge "$expected" ]; then
    return 0
  fi

  return 1
}

# ============================================================
# 主 Benchmark Loop
# ============================================================

for combo in "${COMBO_LIST[@]}"; do

  target=$(echo "$combo" | cut -d' ' -f1)
  np=$(echo "$combo" | cut -d' ' -f2)

  # ----------------------------------------------------------
  # 核心：
  #
  # 每 request target_ctx
  #
  # np concurrent
  #
  # total server context:
  #
  # target_ctx × np
  # ----------------------------------------------------------

  server_ctx=$((target * np))

  # ----------------------------------------------------------
  # Prompt target
  #
  # 保留 margin 避免：
  #
  # prompt + template + output
  #
  # 超過 slot context。
  # ----------------------------------------------------------

  prompt_target=$((target - MARGIN))

  if [ "$prompt_target" -lt 200 ]; then
    prompt_target=200
  fi

  echo ""
  echo "============================================================"
  echo "[組合]"
  echo "Request Context : $target"
  echo "NP              : $np"
  echo "Server -c       : $server_ctx"
  echo "Prompt Target   : $prompt_target"
  echo "============================================================"

  # ----------------------------------------------------------
  # Resume
  # ----------------------------------------------------------

  if combo_is_complete "$target" "$np"; then

    echo "[略過-續跑] target=$target np=$np 已完整完成"
    continue

  fi

  # ----------------------------------------------------------
  # 如果有部分資料，清除該 combo
  # 避免混合舊 round。
  # ----------------------------------------------------------

  partial=$(
    awk \
      -F',' \
      -v t="$target" \
      -v n="$np" \
      'NR>1 && $1==t && $3==n {count++}
       END {print count+0}' \
      "$RESULT_CSV" 2>/dev/null
  )

  if [ "$partial" -gt 0 ]; then

    echo "[續跑-部分] 找到舊資料 ${partial} 筆"
    echo "[續跑-部分] 清除 target=$target np=$np 舊資料後重新完整測試"

    TMP_CSV=$(mktemp)

    awk \
      -F',' \
      -v t="$target" \
      -v n="$np" \
      'NR==1 || !($1==t && $3==n)' \
      "$RESULT_CSV" \
      > "$TMP_CSV"

    mv "$TMP_CSV" "$RESULT_CSV"

  fi

  COMBO_START_TS=$(date +%s)

  echo ""
  echo "[組合開始] $(date '+%Y-%m-%d %H:%M:%S')"

  # ----------------------------------------------------------
  # Start Server
  # ----------------------------------------------------------

  start_server \
    "$server_ctx" \
    "$np" \
    "$target"

  if ! wait_for_ready; then

    echo "[FAIL] Server 啟動失敗"
    echo "[FAIL] 可能原因：OOM / Vulkan / model load"

    echo "$target,$server_ctx,$np,0,0,0,NA,$prompt_target,NA,NA,NA,NA,server_died_or_oom" \
      >> "$RESULT_CSV"

    stop_server

    continue

  fi

  # ----------------------------------------------------------
  # 取得 actual slot context
  # ----------------------------------------------------------

  N_CTX_SLOT=$(get_n_ctx_slot "$SERVER_LOG")

  echo "[Server] n_ctx_slot=$N_CTX_SLOT"

  # ----------------------------------------------------------
  # 嚴格驗證：
  #
  # 如果 slot 沒有達到 target_ctx
  #
  # 不跑壓測。
  # ----------------------------------------------------------

  if ! verify_slot_context "$target" "$N_CTX_SLOT"; then

    echo "[跳過] target=$target np=$np"

    echo "$target,$server_ctx,$np,0,0,0,$N_CTX_SLOT,$prompt_target,NA,NA,NA,NA,slot_allocation_mismatch" \
      >> "$RESULT_CSV"

    stop_server

    continue

  fi

  # ==========================================================
  # ROUNDS
  # ==========================================================

  for round in $(seq 1 "$ROUNDS"); do

    echo ""
    echo "------------------------------------------------------------"
    echo "[Round $round/$ROUNDS]"
    echo "target_ctx=$target"
    echo "np=$np"
    echo "server_ctx=$server_ctx"
    echo "每個 worker 約 ${prompt_target} input tokens"
    echo "------------------------------------------------------------"

    tmpdir=$(mktemp -d)

    pids=()

    # --------------------------------------------------------
    # 建立所有 worker payload
    #
    # 每個 worker 使用不同亂數內容。
    # --------------------------------------------------------

    for w in $(seq 1 "$np"); do

      wpayload="$tmpdir/payload_${w}.json"

      build_payload \
        "$prompt_target" \
        "$wpayload"

      if [ -f "$wpayload.meta" ]; then

        actual_payload_tokens=$(
          cat "$wpayload.meta"
        )

      else

        actual_payload_tokens="NA"

      fi

      echo "[Payload] worker=$w target=$prompt_target actual=$actual_payload_tokens"

    done

    # --------------------------------------------------------
    # 所有 request 同時送出
    # --------------------------------------------------------

    ROUND_START_TS=$(date +%s)

    for w in $(seq 1 "$np"); do

      wpayload="$tmpdir/payload_${w}.json"

      (
        resp=$(
          curl \
            -s \
            --max-time "$REQUEST_TIMEOUT" \
            -X POST \
            "http://127.0.0.1:$PORT/v1/chat/completions" \
            -H "Content-Type: application/json" \
            -d @"$wpayload" \
            2>/dev/null
        )

        if [ -z "$resp" ]; then

          resp='{"error":"curl_timeout_or_empty_response"}'

        fi

        echo "$resp" \
          > "$tmpdir/worker_${w}.json"

      ) &

      pids+=($!)

    done

    # --------------------------------------------------------
    # Wait all workers
    # --------------------------------------------------------

    for pid in "${pids[@]}"; do

      wait "$pid" 2>/dev/null || true

    done

    ROUND_END_TS=$(date +%s)

    ROUND_ELAPSED=$(
      ((ROUND_END_TS - ROUND_START_TS))
    )

    echo "[Round 完成] elapsed=${ROUND_ELAPSED}s"

    # --------------------------------------------------------
    # Parse worker result
    # --------------------------------------------------------

    for w in $(seq 1 "$np"); do

      resp=$(
        cat "$tmpdir/worker_${w}.json" \
        2>/dev/null || true
      )

      if echo "$resp" | grep -q '"choices"'; then

        pn=$(parse_field "$resp" "prompt_n")

        ttft=$(parse_field "$resp" "prompt_ms")

        prefill=$(parse_field "$resp" "prompt_per_second")

        gen=$(parse_field "$resp" "predicted_per_second")

        if [ -f "$tmpdir/payload_${w}.json.meta" ]; then

          payload_tokens=$(
            cat "$tmpdir/payload_${w}.json.meta"
          )

        else

          payload_tokens="NA"

        fi

        echo \
          "$target,$server_ctx,$np,$round,$w,1,$N_CTX_SLOT,$prompt_target,$pn,$ttft,$prefill,$gen,ok" \
          >> "$RESULT_CSV"

        echo ""
        echo "[SUCCESS]"
        echo "  target_ctx      = $target"
        echo "  server_ctx      = $server_ctx"
        echo "  np              = $np"
        echo "  round           = $round"
        echo "  worker          = $w"
        echo "  prompt_tokens   = $pn"
        echo "  n_ctx_slot      = $N_CTX_SLOT"
        echo "  TTFT            = $ttft ms"
        echo "  Prefill         = $prefill tok/s"
        echo "  Decode          = $gen tok/s"

      else

        errmsg=$(
          echo "$resp" |
          head -c 300 |
          tr ',\n' '; '
        )

        echo \
          "$target,$server_ctx,$np,$round,$w,0,$N_CTX_SLOT,$prompt_target,NA,NA,NA,NA,req_failed:$errmsg" \
          >> "$RESULT_CSV"

        echo ""
        echo "[FAILED]"
        echo "  target_ctx=$target"
        echo "  np=$np"
        echo "  round=$round"
        echo "  worker=$w"
        echo "  error=$errmsg"

      fi

    done

    rm -rf "$tmpdir"

    # --------------------------------------------------------
    # 每 round 後檢查 server 是否還活著
    # --------------------------------------------------------

    if ! kill -0 "$SERVER_PID" 2>/dev/null; then

      echo ""
      echo "[嚴重] Server 在 round=$round 後已死亡"
      echo "[可能] OOM / Vulkan crash / memory pressure"
      echo "[Log] $SERVER_LOG"

      break

    fi

  done

  # ----------------------------------------------------------
  # Stop Server
  # ----------------------------------------------------------

  stop_server

  COMBO_END_TS=$(date +%s)

  COMBO_ELAPSED=$(
    COMBO_END_TS - COMBO_START_TS
  )

  echo ""
  echo "[組合結束]"
  echo "target_ctx=$target"
  echo "np=$np"
  echo "server_ctx=$server_ctx"
  echo "耗時=$((COMBO_ELAPSED/60))分$((COMBO_ELAPSED%60))秒"

  print_mem_status

done

# ============================================================
# Summary
# ============================================================

echo ""
echo "============================================================"
echo "Laguna-XS-2.1 High-Context Concurrent Stress Test Summary"
echo "============================================================"

awk -F',' '
NR > 1 {

    key=$1","$3

    total[key]++

    if ($6 == "1") {

        ok[key]++

        if ($9 != "NA")
            sum_prompt[key] += $9

        if ($10 != "NA")
            sum_ttft[key] += $10

        if ($11 != "NA")
            sum_prefill[key] += $11

        if ($12 != "NA")
            sum_gen[key] += $12
    }
}

END {

    for (k in total) {

        printf \
        "target_ctx,np=%-12s success=%d/%d avg_prompt=%.0f avg_TTFT=%.2fms avg_prefill=%.2f tok/s avg_decode=%.2f tok/s\n",

        k,

        ok[k]+0,

        total[k]+0,

        (ok[k] > 0 ? sum_prompt[k]/ok[k] : 0),

        (ok[k] > 0 ? sum_ttft[k]/ok[k] : 0),

        (ok[k] > 0 ? sum_prefill[k]/ok[k] : 0),

        (ok[k] > 0 ? sum_gen[k]/ok[k] : 0)
    }
}
' "$RESULT_CSV" | sort

echo ""
echo "[CSV] $RESULT_CSV"

# ============================================================
# 最終清理
# ============================================================

echo ""
echo "============================================================"
echo "[最終清理]"
echo "============================================================"

kill_leftover_server

FINAL_LEFTOVER=$(
  pgrep -f "llama-server" 2>/dev/null || true
)

if [ -n "$FINAL_LEFTOVER" ]; then

  echo "[警告] 仍有 llama-server:"
  echo "$FINAL_LEFTOVER"

else

  echo "[清理確認] 沒有殘留 llama-server"

fi

print_mem_status

# ============================================================
# 結束
# ============================================================

SCRIPT_END_TS=$(date +%s)

ELAPSED_SEC=$(
  SCRIPT_END_TS - SCRIPT_START_TS
)

echo ""
echo "============================================================"
echo "[結束] Laguna-XS-2.1 High-Context Stress Test"
echo "============================================================"
echo "[時間] $(date '+%Y-%m-%d %H:%M:%S')"
echo "[耗時] $((ELAPSED_SEC/3600))時$(((ELAPSED_SEC%3600)/60))分$((ELAPSED_SEC%60))秒"
echo "[CSV] $RESULT_CSV"
echo "[完成] 腳本 045 執行結束"
echo "============================================================"
