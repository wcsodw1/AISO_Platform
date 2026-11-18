#!/bin/bash
# AISO1 KV cache: ONE click = every step in order (David 2026-11-18: "一鍵按下去就要能用").  Usage: AISO1_KVCache_chain.sh np1|np24|np8fa
# Owned by the platform (benchmark/runners/aiso1_kvcache_chain.sh, sha256 in the manifest). It only calls David's two scripts with their own modes:
#   np1 : preflight -> smoke -> run            np24: preflight -> smoke -> run --np 2 -> run --np 4
#   np8fa: preflight -> smoke -> run (NP8, Flash Attention on, f16/q8_0/q4_0; the wrapper fixes NP=8 itself)
# A step whose result already exists is skipped (campaign exists = preflight done; smoke table without PENDING = smoke done; npN_stage.json = that run done).
# If one of the scripts is already running (e.g. a smoke started by hand) the chain waits for it, never runs two at once (the scripts also hold a lock).
# Marker lines for the platform: STEP_BEGIN <step> | STEP_END <step> rc=<n> | STEP_SKIP <step> | WAITING | ALL_DONE | STEP_STOPPED
set -u
STAGE="${1:-np1}"
B="$HOME/aiso1_benchmark"
if [ "$STAGE" = np1 ]; then
  S="$B/kv_cache_B1024_np1/AISO1_KVCache_Matrix_B1024.py"; STATE="$B/kv_cache_B1024_np1/campaign.json"; RUNS="1"
elif [ "$STAGE" = np24 ]; then
  S="$B/kv_cache_B1024_np24/AISO1_KVCache_NP24_later.py"; STATE="$B/kv_cache_B1024_np24/campaign.json"; RUNS="2 4"
elif [ "$STAGE" = np8fa ]; then
  S="$B/kv_cache_B1024_np8fa/AISO1_KVCache_NP8_FA.py"; STATE="$B/kv_cache_B1024_np8fa/campaign.json"; RUNS="8"
else
  echo "unknown stage $STAGE"; exit 2
fi
trap 'echo "STEP_STOPPED"; exit 130' INT TERM

if pgrep -f 'AISO1_KVCache_(Matrix_B1024|NP24_later|NP8_FA)\.py' >/dev/null; then
  echo "WAITING"
  while pgrep -f 'AISO1_KVCache_(Matrix_B1024|NP24_later|NP8_FA)\.py' >/dev/null; do sleep 20; done
fi

camp() { python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["folder"])' "$STATE" 2>/dev/null; }
step() { local name="$1"; shift; echo "STEP_BEGIN $name"; python3 -u "$S" "$@"; local rc=$?; echo "STEP_END $name rc=$rc"; return $rc; }

C="$(camp)"
if [ -n "$C" ] && [ -f "$C/profile.json" ]; then echo "STEP_SKIP preflight"; else step preflight preflight || exit 1; C="$(camp)"; fi
if [ -f "$C/kv_smoke_matrix.csv" ] && ! grep -q ',PENDING,' "$C/kv_smoke_matrix.csv"; then echo "STEP_SKIP smoke"; else step smoke smoke || exit 1; fi
for n in $RUNS; do
  name="run"; [ "$STAGE" = np24 ] && name="run_np$n"
  if [ -f "$C/np${n}_stage.json" ] && grep -q '"COMPLETE"' "$C/np${n}_stage.json"; then echo "STEP_SKIP $name"; continue; fi
  if [ "$STAGE" = np24 ]; then step "$name" run --np "$n" || exit 1; else step "$name" run || exit 1; fi
done
echo "ALL_DONE"
