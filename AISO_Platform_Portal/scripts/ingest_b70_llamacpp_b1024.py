#!/usr/bin/env python3
"""Build the B70 llama.cpp V4 (batch 1024) dataset from the per-round Aggregate TPS printed on the B70 terminal.

Source: terminal output of B70_V4_B1024_llamacpp.py (RESULT_DIR sb_full_20261110_151623_117599).
Only Aggregate TPS per round is available (no TTFT/TPOT yet) -> ttft_s / tpot_ms stay null, never estimated.
"""
import json, re, statistics
from pathlib import Path

RAW = """
gemma26 1 4096 28.679 31.662 31.832
gemma26 1 8192 25.229 24.552 25.063
gemma26 1 16384 19.178 19.223 19.144
gemma26 2 4096 33.373 32.638 32.429
gemma26 2 8192 27.175 26.120 26.590
gemma26 2 16384 20.533 19.363 19.378
gemma26 4 4096 45.140 39.170 39.199
gemma26 4 8192 31.406 30.186 29.835
gemma26 4 16384 22.202 20.572 20.723
gemma26 5 4096 47.857 40.731 40.282
gemma26 5 8192 31.727 30.050 30.478
gemma26 5 16384 22.146 21.046 21.279
gemma31 1 4096 15.233 16.259 16.225
gemma31 1 8192 11.996 11.990 11.990
gemma31 1 16384 9.083 9.081 9.057
gemma31 2 4096 23.273 22.749 24.044
gemma31 2 8192 18.729 17.568 18.662
gemma31 2 16384 13.088 12.061 12.807
gemma31 4 4096 32.520 31.671 32.574
gemma31 4 8192 23.383 21.983 22.818
gemma31 4 16384 14.326 14.156 14.253
gemma31 5 4096 34.921 34.102 34.751
gemma31 5 8192 24.230 23.167 23.677
gemma31 5 16384 15.007 14.216 15.016
laguna 1 4096 33.646 38.703 38.408
laguna 1 8192 34.203 34.005 33.784
laguna 1 16384 26.790 26.786 26.945
laguna 2 4096 38.417 33.841 34.075
laguna 2 8192 30.404 28.568 36.259
laguna 2 16384 28.570 21.095 28.371
laguna 4 4096 54.072 37.871 42.623
laguna 4 8192 40.598 30.599 30.369
laguna 4 16384 26.237 20.176 19.559
laguna 5 4096 56.241 37.708 46.978
laguna 5 8192 36.294 29.721 41.446
laguna 5 16384 25.054 19.767 23.643
nemotron 1 4096 55.286 62.446 62.388
nemotron 1 8192 54.557 54.551 54.572
nemotron 1 16384 43.435 43.533 43.491
nemotron 2 4096 57.174 59.655 60.297
nemotron 2 8192 52.794 52.248 52.627
nemotron 2 16384 42.219 42.038 42.211
nemotron 4 4096 71.692 73.995 74.403
nemotron 4 8192 62.388 62.223 61.910
nemotron 4 16384 45.299 44.268 43.544
nemotron 5 4096 75.071 76.992 76.760
nemotron 5 8192 61.377 60.459 60.582
nemotron 5 16384 42.225 42.317 42.352
"""
RUN_ID = "sb_full_20261110_151623_117599"
MODELS = {"gemma26": ("Gemma26", "GGUF Q4_0"), "gemma31": ("Gemma31", "GGUF Q4_0"),
          "laguna": ("Laguna", "GGUF Q4_K_M"), "nemotron": ("Nemotron", "GGUF UD-Q4_K_M")}
OUT = Path(__file__).resolve().parent.parent / "data" / "benchmark-b70" / "AISO_B70_llamacpp_V4B1024_20261110.json"


def main():
    runs = []
    for line in RAW.strip().splitlines():
        m, np_, inp, *rs = line.split()
        assert len(rs) == 3
        rs = [float(x) for x in rs]
        name, fmt = MODELS[m]
        agg = round(statistics.mean(rs), 3)
        runs.append({"model": name, "format": fmt, "np": int(np_), "input": int(inp), "ttft_s": None, "tpot_ms": None,
                     "aggregate_tps": agg, "decode_tps": None, "repeats_aggregate_tps": rs, "status": "PASS",
                     "run_id": RUN_ID, "ttft_over_180s": False})
    assert len(runs) == 48
    ref = json.loads((OUT.parent.parent / "benchmark-b60" / "AISO_B60_llamacpp_V4_20261105.json").read_text())
    data = {
        "dataset": "AISO_B70_llamacpp_V4B1024_20261110", "evidence_until": "2026-11-10", "generated_on": "2026-11-10",
        "note": "Intel B70 llama.cpp，B60 V4 協定 + batch 1024（David 決定統一）：4 模型 × NP1/2/4/5 × 4K/8K/16K × 3 次，48/48 PASS（含 Smoke 設定核對 SMOKE CONFIG VERIFIED）。目前只有終端機輸出的每輪 Aggregate TPS；TTFT／TPOT 待 sb_full 結果目錄的 summary.csv／raw.jsonl，不估算。",
        "comparability": {"level": "retest_unverified", "text": "B70 於 2026-11-10 以 batch 1024 執行（--parallel 10、--ctx-size 18432、--kv-unified-per-slot 18432、--batch-size 1024、--ubatch-size 512、KV f16、--kv-unified、--no-cache-prompt、--no-context-shift 已由 Smoke 的 command_np1.json 逐項核對）。尚未核對：image sha256／build（B60 為 SYCL build 11561）、GGUF SHA256、device／split 設定、TTFT／TPOT。B60 現有資料為 batch 4096、AISO1 batch 未記錄，因此與 B60／AISO1 的比較不能宣稱『只差硬體』。"},
        "profile": {"machine": "2× Intel Arc Pro B70", "framework": "llama.cpp", "np": [1, 2, 4, 5], "input_tokens": [4096, 8192, 16384],
                    "output_tokens": 1024, "repeat": 3, "gpu_count": 2, "runtime": "UNVERIFIED", "vram_total_gb": 64, "vram_layout": "32 GB x 2",
                    "context_length": 18432, "slots": 10, "per_slot_context": 18432, "batch": 1024, "ubatch": 512, "kv_cache_type": "f16", "prefix_cache": "OFF", "split": "UNVERIFIED"},
        "b70_runs": runs, "model_parity": ref["model_parity"], "failures": [], "not_run": [], "retry": None,
        "protocol_notes": ["V4 協定：Input 4096/8192/16384、Output 1024、Repeat 3、每個 NP 重啟伺服器；Aggregate 以終端機輸出的每輪值取算術平均（3 位小數）。",
                           "本資料由終端機貼出的每輪 Aggregate 轉錄，原始 CSV／raw.jsonl 尚未收回（RESULT_DIR: ~/b70_benchmark/B70_V4_B1024/frameworks/llamacpp/results/" + RUN_ID + "）。",
                           "腳本 B70_V4_B1024_llamacpp.py，--model-workers 1；模型 GGUF 檔名／SHA 假設與 B60 相同，B70 端尚未核對（UNVERIFIED）。"],
        "source_file": "B70 terminal output (B70_Full_48.log); " + RUN_ID, "metrics_version": "v4-pdf-e2e",
        "config_by_model": {n: {"repo": next((p["repo"] for p in ref["model_parity"] if p["model"] == n), None), "format": f, "backend": "llama.cpp（image／build 未核實）",
                                "tp": "UNVERIFIED", "max_context": "18432 / slot", "batch": "batch 1024 / ubatch 512", "max_seqs": 10, "mem_fraction": None,
                                "cache": "Prefix Cache OFF · KV f16", "run_id": RUN_ID, "date": "2026-11-10"} for n, f in MODELS.values()},
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
    print("wrote", OUT, len(runs))


main()
