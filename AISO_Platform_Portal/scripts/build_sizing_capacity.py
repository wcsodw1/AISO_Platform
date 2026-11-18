#!/usr/bin/env python3
"""Build data/sizing-capacity.json from the benchmark datasets already on the platform: for each machine x framework x model x input length, the highest TESTED NP at which
the per-user speed is still >= a threshold (default 15 tok/s), with that speed. Nothing is invented and NP between tested values is not interpolated.

Metric (default "e2e", the website's current TPS Normalized): aggregate_tps / NP - includes the wait for the first token, it is the average per request, not a guarantee for every request.
Metric "decode": 1000 / TPOT - speed while the answer streams.
Run from AISO_Platform_Portal:  python3 scripts/build_sizing_capacity.py [threshold] [e2e|decode]"""
import json
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
D = BASE / "data"
THRESHOLD = float(sys.argv[1]) if len(sys.argv) > 1 else 15.0
METRIC = sys.argv[2] if len(sys.argv) > 2 else "e2e"
SOURCES = [   # (machine, framework, dataset, runs key, role)
    ("B60", "vLLM", "benchmark-b60/AISO_B60_vLLM_V4_20261105.json", "b60_runs", "main"),
    ("B60", "SGLang", "benchmark-b60/AISO_B60_SGLang_V4_20261105.json", "b60_runs", "main"),
    ("B60", "llama.cpp", "benchmark-b60/AISO_B60_llamacpp_V4_20261105.json", "b60_runs", "main"),
    ("B70", "llama.cpp", "benchmark-b70/AISO_B70_llamacpp_V4B1024_20261110.json", "b70_runs", "main"),
    ("B70", "vLLM", "benchmark-b70/AISO_B70_vLLM_20261019.json", "b70_runs", "historical"),            # October runs, other parameters: shown as history, not counted in team size
    ("B70", "SGLang", "benchmark-b70/AISO_B70_SGLang_20261022.json", "b70_runs", "historical"),
    ("AISO1", "llama.cpp", "benchmark-aiso1/AISO_AISO1_llamacpp_B1024_20261111.json", "aiso1_runs", "main"),
    ("AISO1", "vLLM", "benchmark-aiso1/AISO_AISO1_vLLM_20261015.json", "aiso1_runs", "historical"),
    ("AISO1", "llama.cpp (11/09 retest, parameters not matched)", "benchmark-aiso1/AISO_AISO1_llamacpp_V4retest_20261109.json", "aiso1_runs", "reference"),
]
# architecture only where the model's own name or card says it; Laguna XS 2.1 is labelled MoE in the platform's own table, kept as given there
ARCH = {"Gemma26": "MoE", "Gemma31": "Dense", "Nemotron": "MoE (hybrid)", "Laguna": "MoE"}
ORDER = ["Gemma26", "Gemma31", "Laguna", "Nemotron"]


def framework_is_llamacpp(fw):
    return fw.startswith("llama.cpp")


def speed(r):
    if METRIC == "decode":
        return round(1000 / r["tpot_ms"], 2) if r.get("tpot_ms") else None
    return round(r["aggregate_tps"] / r["np"], 2) if r.get("aggregate_tps") else None


def file_gb():
    """GGUF file size in GB per model, from the AISO1 dataset (sha256-verified files; B60 / B70 use the same files, see model_parity). vLLM checkpoints (FP8, W4A16) are other files: no size here."""
    d = json.loads((D / "benchmark-aiso1/AISO_AISO1_llamacpp_B1024_20261111.json").read_text())
    return {m: round(v["bytes"] / 1e9, 1) for m, v in d["config_by_model"].items() if v.get("bytes")}


def main():
    sizes = file_gb()
    out = {"per_slot_context": 18432, "weights_gb_source": "AISO1 dataset config_by_model.bytes (GGUF files, llama.cpp rows only)", "threshold_tps": THRESHOLD, "metric": METRIC, "rule": "highest tested NP whose per-user speed >= threshold; '-' when even the smallest tested NP is below it", "rows": []}
    for machine, fw, f, key, role in SOURCES:
        d = json.loads((D / f).read_text())
        rows = [r for r in d[key] if str(r.get("status", "")).endswith("PASS") and r.get("aggregate_tps")]
        for model in sorted({r["model"] for r in rows}, key=lambda m: ORDER.index(m) if m in ORDER else 99):
            mr = [r for r in rows if r["model"] == model]
            fmt = next((r.get("quant") or r.get("format") for r in mr), None)
            by_input = {}
            for inp in (4096, 8192, 16384):
                ok = [(r["np"], speed(r)) for r in mr if r["input"] == inp and speed(r) is not None and speed(r) >= THRESHOLD]
                ttft = {r["np"]: r.get("ttft_s") for r in mr if r["input"] == inp}
                best = max(ok) if ok else None
                tested_nps = sorted(r["np"] for r in mr if r["input"] == inp)
                cells = sorted(({"np": r["np"], "tps": speed(r), "ttft_s": round(r["ttft_s"], 1) if r.get("ttft_s") is not None else None} for r in mr if r["input"] == inp and speed(r) is not None), key=lambda c: c["np"])
                by_input[str(inp)] = {"cells": cells, "np": best[0] if best else None, "tps": best[1] if best else None, "ttft_s": round(ttft[best[0]], 1) if best and ttft.get(best[0]) is not None else None, "tested_nps": tested_nps, "reached_top": bool(best) and best[0] == tested_nps[-1]}
            if not any(v["cells"] for v in by_input.values()):      # e.g. B70 SGLang Laguna was run at 64K input only: not comparable with the 4K / 8K / 16K protocol
                continue
            out["rows"].append({"machine": machine, "framework": fw, "role": role, "model": model, "arch": ARCH.get(model), "format": fmt, "weights_gb": sizes.get(model) if framework_is_llamacpp(fw) else None, "dataset": f, "comparability": (d.get("comparability") or {}).get("level") if isinstance(d.get("comparability"), dict) else None, "by_input": by_input})
    (D / "sizing-capacity.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
    print("wrote data/sizing-capacity.json, threshold", THRESHOLD, "metric", METRIC)


if __name__ == "__main__":
    main()
