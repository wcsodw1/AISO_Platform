#!/usr/bin/env bash
set -u

# SparkleBenchmark (S.B) - llama.cpp / Intel SYCL Smoke Test
# Target: 2 x Intel Arc Pro B70
# NP=1, Input=4096, Output=128, Repeat=1
# Gemma/Laguna use tensor split; Nemotron uses layer split.

ROOT="${HOME}/b70_benchmark"
IMG="ghcr.io/ggml-org/llama.cpp:server-intel"
CONTAINER="sb-llama-smoke"
PORT=18080
INPUT=4096
OUTPUT=128
CTX=8192

TS="$(date +%Y%m%d_%H%M%S)"
OUT="${ROOT}/results/sb_smoke_4k_${TS}"
SUMMARY="${OUT}/summary.csv"
mkdir -p "${OUT}" "${ROOT}/logs"

echo "model,split_mode,status,input_tokens,output_tokens,ttft_ms,tpot_ms,e2e_s,decode_tps,server_prompt_tps,server_decode_tps,truncated,stop_type" > "${SUMMARY}"

MODELS=(
  "Gemma4-26B-Q4|Gemma-4-26B-Q4_K_M/google_gemma-4-26B-A4B-it-Q4_K_M.gguf|tensor"
  "Gemma4-31B-Q4|Gemma-4-31B-Q4_K_M/google_gemma-4-31B-it-Q4_K_M.gguf|tensor"
  "Laguna-XS-2.1-Q4|Laguna-XS-2.1-Q4_K_M/Laguna-XS-2.1-Q4_K_M.gguf|tensor"
  "Nemotron-3.5-Lightning-Q4|Nemotron-3.5-Lightning-Q4_K_M/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-Q4_K_M.gguf|layer"
)

cleanup() {
  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

echo "=================================================="
echo "S.B SMOKE TEST"
echo "=================================================="
echo "Framework    : llama.cpp"
echo "Backend      : Intel SYCL / Level Zero"
echo "GPU          : 2 x Intel Arc Pro B70"
echo "NP           : 1"
echo "Input        : ${INPUT}"
echo "Output       : ${OUTPUT}"
echo "Context      : ${CTX}"
echo "Prompt cache : OFF"
echo "Results      : ${OUT}"
echo

{
  date
  echo
  free -h
  echo
  df -hT "${ROOT}/models"
} > "${OUT}/pre_resources.txt" 2>&1

for ITEM in "${MODELS[@]}"; do
  IFS='|' read -r LABEL RELPATH SPLIT <<< "${ITEM}"
  MODEL="/models/${RELPATH}"
  SERVER_LOG="${OUT}/server_${LABEL}.log"
  RESULT_JSON="${OUT}/${LABEL}.json"

  echo
  echo "=================================================="
  echo "MODEL : ${LABEL}"
  echo "SPLIT : ${SPLIT}"
  echo "FILE  : ${RELPATH}"
  echo "=================================================="

  cleanup

  docker run -d \
    --name "${CONTAINER}" \
    --device /dev/dri/renderD128:/dev/dri/renderD128 \
    --device /dev/dri/renderD129:/dev/dri/renderD129 \
    --device /dev/dri/card0:/dev/dri/card0 \
    --device /dev/dri/card2:/dev/dri/card2 \
    -p "127.0.0.1:${PORT}:8080" \
    -v "${ROOT}/models:/models:ro" \
    "${IMG}" \
    --model "${MODEL}" \
    --host 0.0.0.0 \
    --port 8080 \
    --ctx-size "${CTX}" \
    --parallel 1 \
    --device SYCL0,SYCL1 \
    --split-mode "${SPLIT}" \
    --tensor-split 1,1 \
    --n-gpu-layers all \
    --cache-type-k f16 \
    --cache-type-v f16 \
    --no-cache-prompt \
    --fit off \
    >/dev/null

  echo "[WAIT] Loading ${LABEL} ..."
  READY=0
  for _ in $(seq 1 450); do
    if curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
      READY=1
      break
    fi
    if ! docker ps --format '{{.Names}}' | grep -qx "${CONTAINER}"; then
      break
    fi
    sleep 2
  done

  if [ "${READY}" -ne 1 ]; then
    echo "[FAIL] Server load failed: ${LABEL}"
    docker logs "${CONTAINER}" > "${SERVER_LOG}" 2>&1 || true
    echo "${LABEL},${SPLIT},LOAD_FAIL,,,,,,,,,," >> "${SUMMARY}"
    cleanup
    continue
  fi

  echo "[READY] ${LABEL}"

  python3 - "${LABEL}" "${SPLIT}" "${PORT}" "${INPUT}" "${OUTPUT}" "${SUMMARY}" "${RESULT_JSON}" <<'PYINNER'
import csv, json, sys, time, urllib.request

label = sys.argv[1]
split_mode = sys.argv[2]
port = int(sys.argv[3])
target_input = int(sys.argv[4])
target_output = int(sys.argv[5])
summary_csv = sys.argv[6]
result_json = sys.argv[7]
base = f"http://127.0.0.1:{port}"

def post_json(path, payload, timeout=3600):
    req = urllib.request.Request(base + path, data=json.dumps(payload).encode('utf-8'), headers={'Content-Type':'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8'))

prefix = f"SparkleBenchmark smoke test. Model {label}. Input target {target_input}. Unique marker {time.time_ns()}. "
unit = "alpha beta gamma delta epsilon zeta eta theta inference benchmark long context performance measurement "
text = prefix + unit * 512
while True:
    obj = post_json('/tokenize', {'content': text, 'add_special': True, 'parse_special': True})
    tokens = obj['tokens']
    if len(tokens) >= target_input:
        break
    text += text
prompt_tokens = tokens[:target_input]

payload = {
    'prompt': prompt_tokens,
    'n_predict': target_output,
    'stream': True,
    'cache_prompt': False,
    'ignore_eos': True,
    'return_tokens': True,
    'temperature': 0.0,
    'seed': 12345,
}
req = urllib.request.Request(base + '/completion', data=json.dumps(payload).encode('utf-8'), headers={'Content-Type':'application/json'}, method='POST')

t0 = time.perf_counter()
first = None
final = {}
with urllib.request.urlopen(req, timeout=3600) as r:
    for raw in r:
        if not raw.startswith(b'data: '):
            continue
        body = raw[6:].strip()
        if not body or body == b'[DONE]':
            continue
        event = json.loads(body)
        if first is None and ((event.get('tokens') or []) or (event.get('content') or '')):
            first = time.perf_counter()
        if event.get('stop') is True:
            final = event

t1 = time.perf_counter()
if first is None:
    raise RuntimeError('No generated token received')
if not final:
    raise RuntimeError('No final completion event')

input_n = int(final.get('tokens_evaluated') or 0)
output_n = int(final.get('tokens_predicted') or 0)
truncated = bool(final.get('truncated', False))
stop_type = str(final.get('stop_type', ''))
ttft_s = first - t0
e2e_s = t1 - t0
if output_n > 1 and e2e_s > ttft_s:
    tpot_s = (e2e_s - ttft_s) / (output_n - 1)
    decode_tps = (output_n - 1) / (e2e_s - ttft_s)
else:
    tpot_s = 0.0
    decode_tps = 0.0

timings = final.get('timings') or {}
prompt_tps = float(timings.get('prompt_per_second') or 0.0)
server_decode_tps = float(timings.get('predicted_per_second') or 0.0)
status = 'PASS'
if input_n != target_input:
    status = 'WARN_INPUT'
elif output_n != target_output:
    status = 'WARN_OUTPUT'
elif truncated:
    status = 'TRUNCATED'

row = [label, split_mode, status, input_n, output_n, f'{ttft_s*1000:.2f}', f'{tpot_s*1000:.2f}', f'{e2e_s:.3f}', f'{decode_tps:.2f}', f'{prompt_tps:.2f}', f'{server_decode_tps:.2f}', truncated, stop_type]
with open(summary_csv, 'a', newline='', encoding='utf-8') as f:
    csv.writer(f).writerow(row)

result = {
    'model': label,
    'split_mode': split_mode,
    'status': status,
    'input_tokens': input_n,
    'output_tokens': output_n,
    'ttft_ms': round(ttft_s*1000, 2),
    'tpot_ms': round(tpot_s*1000, 2),
    'e2e_s': round(e2e_s, 3),
    'decode_tps': round(decode_tps, 2),
    'server_prompt_tps': round(prompt_tps, 2),
    'server_decode_tps': round(server_decode_tps, 2),
    'truncated': truncated,
    'stop_type': stop_type,
}
with open(result_json, 'w', encoding='utf-8') as f:
    json.dump(result, f, indent=2)

print('\n===== RESULT =====')
print(f'Model          : {label}')
print(f'Split mode     : {split_mode}')
print(f'Status         : {status}')
print(f'Input tokens   : {input_n}')
print(f'Output tokens  : {output_n}')
print(f'TTFT           : {ttft_s*1000:.2f} ms')
print(f'TPOT           : {tpot_s*1000:.2f} ms/token')
print(f'E2E            : {e2e_s:.3f} s')
print(f'Decode TPS     : {decode_tps:.2f} tok/s')
print(f'Server PP TPS  : {prompt_tps:.2f} tok/s')
print(f'Server Dec TPS : {server_decode_tps:.2f} tok/s')
print(f'Stop type      : {stop_type}')
print(f'Truncated      : {truncated}')
PYINNER

  RC=$?
  docker logs "${CONTAINER}" > "${SERVER_LOG}" 2>&1 || true
  if [ "${RC}" -ne 0 ]; then
    echo "[FAIL] Request failed: ${LABEL}"
    tail -n 120 "${SERVER_LOG}" || true
  else
    echo "[DONE] ${LABEL}"
  fi

  cleanup
  sleep 5
done

{
  date
  echo
  free -h
  echo
  df -hT "${ROOT}/models"
} > "${OUT}/post_resources.txt" 2>&1

echo
echo "=================================================="
echo "S.B SMOKE FINISHED"
echo "=================================================="
echo
cat "${SUMMARY}"
echo
echo "Results: ${OUT}"
