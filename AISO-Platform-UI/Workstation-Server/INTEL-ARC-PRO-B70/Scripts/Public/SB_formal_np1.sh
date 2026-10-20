#!/usr/bin/env bash
set -u

# SparkleBenchmark (S.B) - llama.cpp / Intel SYCL Formal NP1 Benchmark
# Target: 2 x Intel Arc Pro B70
# NP=1; Inputs=4096/8192/16384/32768/65536; Output=512; Repeat=3
# Gemma/Laguna use tensor split; Nemotron uses layer split.

ROOT="${HOME}/b70_benchmark"
IMG="ghcr.io/ggml-org/llama.cpp:server-intel"
CONTAINER="sb-formal-np1"
PORT=18081
INPUTS=(4096 8192 16384 32768 65536)
OUTPUT=512
REPEAT=3
CTX=69632

TS="$(date +%Y%m%d_%H%M%S)"
OUT="${ROOT}/results/sb_formal_np1_${TS}"
RAW="${OUT}/raw_results.csv"
SUMMARY="${OUT}/summary.csv"
RESOURCE="${OUT}/resources"
mkdir -p "${OUT}" "${RESOURCE}" "${ROOT}/logs"

echo "model,split_mode,status,input_tokens,output_tokens,run,ttft_ms,tpot_ms,e2e_s,decode_tps,prompt_tps,server_decode_tps,truncated,stop_type" > "${RAW}"

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

record_resources() {
  local file="$1"
  {
    echo "===== TIME ====="
    date
    echo
    echo "===== GPU ====="
    docker run --rm \
      --device /dev/dri/renderD128:/dev/dri/renderD128 \
      --device /dev/dri/renderD129:/dev/dri/renderD129 \
      --device /dev/dri/card0:/dev/dri/card0 \
      --device /dev/dri/card2:/dev/dri/card2 \
      "${IMG}" --list-devices
    echo
    echo "===== DRAM ====="
    free -h
    echo
    echo "===== SSD ====="
    df -hT "${ROOT}/models"
  } > "${file}" 2>&1
}

echo
echo "=================================================="
echo "       SparkleBenchmark - S.B Formal NP1"
echo "=================================================="
echo
echo "Framework : llama.cpp"
echo "Backend   : Intel SYCL / Level Zero"
echo "GPU       : 2 x Intel Arc Pro B70"
echo "NP        : 1"
echo "Inputs    : ${INPUTS[*]}"
echo "Output    : ${OUTPUT}"
echo "Repeat    : ${REPEAT}"
echo "Context   : ${CTX}"
echo "KV        : F16"
echo "Cache     : OFF"
echo "Results   : ${OUT}"
echo

record_resources "${RESOURCE}/pre_benchmark.txt"

for ITEM in "${MODELS[@]}"; do
  IFS='|' read -r LABEL RELPATH SPLIT <<< "${ITEM}"
  MODEL="/models/${RELPATH}"
  SERVER_LOG="${OUT}/server_${LABEL}.log"

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
    --batch-size 2048 \
    --ubatch-size 512 \
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
    echo "[LOAD_FAIL] ${LABEL}"
    docker logs "${CONTAINER}" > "${SERVER_LOG}" 2>&1 || true
    echo "${LABEL},${SPLIT},LOAD_FAIL,,,,,,,,,,,," >> "${RAW}"
    cleanup
    continue
  fi

  echo "[READY] ${LABEL}"
  echo "[WARMUP] ${LABEL}"
  curl -fsS "http://127.0.0.1:${PORT}/completion" \
    -H "Content-Type: application/json" \
    -d '{"prompt":"SparkleBenchmark warmup request.","n_predict":16,"temperature":0,"cache_prompt":false}' \
    >/dev/null 2>&1 || true

  sleep 3
  record_resources "${RESOURCE}/${LABEL}_loaded.txt"

  for INPUT in "${INPUTS[@]}"; do
    for RUN in $(seq 1 "${REPEAT}"); do
      echo
      echo "--------------------------------------------------"
      echo "MODEL  = ${LABEL}"
      echo "SPLIT  = ${SPLIT}"
      echo "INPUT  = ${INPUT}"
      echo "OUTPUT = ${OUTPUT}"
      echo "RUN    = ${RUN}/${REPEAT}"
      echo "--------------------------------------------------"

      python3 - "${LABEL}" "${SPLIT}" "${PORT}" "${INPUT}" "${OUTPUT}" "${RUN}" "${RAW}" <<'PYINNER'
import csv, json, sys, time, urllib.request

label = sys.argv[1]
split_mode = sys.argv[2]
port = int(sys.argv[3])
target_input = int(sys.argv[4])
target_output = int(sys.argv[5])
run = int(sys.argv[6])
raw_csv = sys.argv[7]
base = f"http://127.0.0.1:{port}"

def post_json(path, payload, timeout=7200):
    req = urllib.request.Request(base + path, data=json.dumps(payload).encode('utf-8'), headers={'Content-Type':'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8'))

prefix = f"SparkleBenchmark S.B NP1 formal benchmark. Model {label}. Input {target_input}. Run {run}. Unique marker {time.time_ns()}. "
unit = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau inference long context performance benchmark measurement "
text = prefix + unit * 512
while True:
    obj = post_json('/tokenize', {'content': text, 'add_special': True, 'parse_special': True})
    tokens = obj['tokens']
    if len(tokens) >= target_input:
        break
    text += text
prompt_tokens = tokens[:target_input]
assert len(prompt_tokens) == target_input

payload = {
    'prompt': prompt_tokens,
    'n_predict': target_output,
    'stream': True,
    'cache_prompt': False,
    'ignore_eos': True,
    'return_tokens': True,
    'temperature': 0.0,
    'seed': 100000 + target_input + run,
}
req = urllib.request.Request(base + '/completion', data=json.dumps(payload).encode('utf-8'), headers={'Content-Type':'application/json'}, method='POST')

t0 = time.perf_counter()
first = None
final = {}
with urllib.request.urlopen(req, timeout=7200) as r:
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

with open(raw_csv, 'a', newline='', encoding='utf-8') as f:
    csv.writer(f).writerow([
        label, split_mode, status, input_n, output_n, run,
        f'{ttft_s*1000:.2f}', f'{tpot_s*1000:.2f}', f'{e2e_s:.3f}',
        f'{decode_tps:.2f}', f'{prompt_tps:.2f}', f'{server_decode_tps:.2f}',
        truncated, stop_type,
    ])

print(f'[{status}] Model={label} Split={split_mode} Input={input_n} Output={output_n} TTFT={ttft_s*1000:.2f}ms TPOT={tpot_s*1000:.2f}ms/token PP={prompt_tps:.2f}tok/s Decode={decode_tps:.2f}tok/s E2E={e2e_s:.3f}s')
PYINNER

      RC=$?
      if [ "${RC}" -ne 0 ]; then
        echo "[REQUEST_FAIL] model=${LABEL} input=${INPUT} run=${RUN}"
        echo "${LABEL},${SPLIT},REQUEST_FAIL,${INPUT},${OUTPUT},${RUN},,,,,,,," >> "${RAW}"
      fi
      sleep 5
    done
  done

  docker logs "${CONTAINER}" > "${SERVER_LOG}" 2>&1 || true
  cleanup
  echo "[MODEL COMPLETE] ${LABEL}"
  sleep 5
done

python3 - "${RAW}" "${SUMMARY}" <<'PYINNER'
import csv, statistics, sys
from collections import defaultdict

raw_path = sys.argv[1]
out_path = sys.argv[2]
groups = defaultdict(list)

with open(raw_path, newline='', encoding='utf-8') as f:
    for row in csv.DictReader(f):
        if row['status'] != 'PASS':
            continue
        key = (row['model'], row['split_mode'], int(row['input_tokens']), int(row['output_tokens']))
        groups[key].append(row)

headers = [
    'model','split_mode','input_tokens','output_tokens','successful_runs',
    'ttft_mean_ms','ttft_median_ms','tpot_mean_ms','tpot_median_ms',
    'e2e_mean_s','decode_tps_mean','prompt_tps_mean','server_decode_tps_mean'
]

with open(out_path, 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(headers)
    for key in sorted(groups):
        rows = groups[key]
        def vals(name):
            return [float(r[name]) for r in rows]
        w.writerow([
            key[0], key[1], key[2], key[3], len(rows),
            f"{statistics.mean(vals('ttft_ms')):.2f}",
            f"{statistics.median(vals('ttft_ms')):.2f}",
            f"{statistics.mean(vals('tpot_ms')):.2f}",
            f"{statistics.median(vals('tpot_ms')):.2f}",
            f"{statistics.mean(vals('e2e_s')):.3f}",
            f"{statistics.mean(vals('decode_tps')):.2f}",
            f"{statistics.mean(vals('prompt_tps')):.2f}",
            f"{statistics.mean(vals('server_decode_tps')):.2f}",
        ])

print('\n==================================================')
print('S.B FORMAL SUMMARY')
print('==================================================')
with open(out_path, encoding='utf-8') as f:
    print(f.read())
PYINNER

record_resources "${RESOURCE}/post_benchmark.txt"

echo
echo "=================================================="
echo "          S.B FORMAL NP1 COMPLETE"
echo "=================================================="
echo
echo "RAW RESULTS:"
echo "${RAW}"
echo
echo "SUMMARY:"
echo "${SUMMARY}"
echo
echo "SERVER LOGS:"
echo "${OUT}"
echo
