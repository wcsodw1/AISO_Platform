#!/usr/bin/env bash
# Run ON AISO1 (xyzx@XT0395). Starts ONE llama-server for the Portal's V4 sweep (Benchmark > AISO1 > llama.cpp > V4 sweep).
# Usage: aiso1_llama_server.sh gemma26|gemma31|laguna|nemotron
# These are the B60 V4 settings, NOT verified against the 2026-11-09 AISO1 retest: compare with that run's command.json / server.log.
set -euo pipefail
BIN="${AISO1_LLAMA_SERVER:-$HOME/aiso1_benchmark/runtime/llama_b11561_e937b17a2/build-vulkan/bin/llama-server}"
M="$HOME/aiso1_benchmark/models/gguf/official"
case "${1:-}" in
  gemma26)  MODEL="$M/Gemma26/gemma-4-26B_q4_0-it.gguf" ;;
  gemma31)  MODEL="$M/Gemma31/gemma-4-31B_q4_0-it.gguf" ;;
  laguna)   MODEL="$M/Laguna/Laguna-XS-2.1-Q4_K_M.gguf" ;;
  nemotron) MODEL="$M/Nemotron/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-UD-Q4_K_M.gguf" ;;
  *) echo "usage: $0 gemma26|gemma31|laguna|nemotron" >&2; exit 2 ;;
esac
# Mirrors the llama-server flags of Buffer/Benchmark/B60_Benchmark_matrix_v4_261104.py (minus docker/device/tensor-split,
# AISO1 has one iGPU). The B60 run restarted the server per NP with --ctx-size NP x 18432; here one server uses the largest NP.
# If this llama.cpp build rejects a flag (e.g. --kv-unified-per-slot), remove it and note it in the results.
PORT="${PORT:-18100}"
pkill -f "llama-server.*--port ${PORT}" 2>/dev/null || true
exec "$BIN" -m "$MODEL" --alias "$1" --host 0.0.0.0 --port "$PORT" \
  --n-gpu-layers 999 --parallel 10 --ctx-size "$((${MAX_NP:-5} * 18432))" --kv-unified --kv-unified-per-slot 18432 \
  --batch-size 4096 --ubatch-size 512 --cache-ram 0 --cache-type-k f16 --cache-type-v f16 \
  --no-context-shift --cont-batching --fit off --slots
