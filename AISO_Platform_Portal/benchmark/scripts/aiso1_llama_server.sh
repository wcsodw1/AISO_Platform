#!/usr/bin/env bash
# Run ON AISO1 (xyzx@XT0395). Starts ONE llama-server for the Portal's V4 sweep (Benchmark > AISO1 > llama.cpp > V4 sweep).
# Usage: aiso1_llama_server.sh gemma26|gemma31|laguna|nemotron
# The defaults below are NOT verified against the 2026-11-09 retest. Compare with that run's server command
# (campaign dir: command.json / server.log) and override via env vars so both use identical settings.
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
PARALLEL="${PARALLEL:-5}"        # slots: must be >= the largest NP in the sweep
SLOT_CTX="${SLOT_CTX:-17408}"    # 16384 input + 1024 output per slot; llama-server splits --ctx-size across slots
pkill -f "llama-server.*--port ${PORT:-18100}" 2>/dev/null || true
exec "$BIN" -m "$MODEL" --alias "$1" --host 0.0.0.0 --port "${PORT:-18100}" \
  --parallel "$PARALLEL" --ctx-size "$((PARALLEL * SLOT_CTX))" \
  --batch-size "${BATCH:-4096}" --ubatch-size "${UBATCH:-512}" -ngl 999
