#!/usr/bin/env python3
"""Add per-repeat values (`repeats`) to the B60 V4 datasets from the evidence campaign.

Usage: add_repeats_b60.py <extracted campaign dir>  (the folder holding vllm/ sglang/ llamacpp/)
Reads, per case dir np{N}_input{I}/: raw.jsonl (per request: repeat, ttft_s, tpot_ms) and waves.csv
(per repeat: tps_aggregate, tps_normalized). For each dataset run it stores

    repeats: {"ttft_s": [r1, r2, r3], "tpot_ms": [...], "aggregate_tps": [...]}

(TTFT/TPOT = mean over the requests of that repeat). A run is only annotated when the mean of the
per-repeat values reproduces the already published run value (tolerance 1%); otherwise it is left
untouched and reported. Nothing is estimated or filled in.
"""
import csv, json, statistics, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "data" / "benchmark-b60"
FILES = {"vllm": "AISO_B60_vLLM_V4_20261105.json", "sglang": "AISO_B60_SGLang_V4_20261105.json",
         "llamacpp": "AISO_B60_llamacpp_V4_20261105.json"}


def per_repeat(case: Path):
    reqs = [json.loads(l) for l in (case / "raw.jsonl").read_text().splitlines() if l.strip()]
    by = {}
    for r in reqs:
        if r.get("status") != "PASS":
            return None
        by.setdefault(int(r["repeat"]), []).append(r)
    waves = {int(w["repeat"]): w for w in csv.DictReader(open(case / "waves.csv")) if w["status"] == "PASS"}
    keys = sorted(by)
    if keys != sorted(waves) or len(keys) != 3:
        return None
    return {"ttft_s": [round(statistics.mean(r["ttft_s"] for r in by[k]), 3) for k in keys],
            "tpot_ms": [round(statistics.mean(r["tpot_ms"] for r in by[k]), 3) for k in keys],
            "aggregate_tps": [round(float(waves[k]["tps_aggregate"]), 3) for k in keys]}


def close(a, b):
    return abs(a - b) <= 0.01 * max(abs(b), 1e-9)


def main(campaign: Path):
    for fw, name in FILES.items():
        path = ROOT / name
        data = json.loads(path.read_text())
        done, skipped = 0, []
        for run in data["b60_runs"]:
            case = campaign / fw / run["model"].lower() / f"np{run['np']}_input{run['input']}"
            label = f"{run['model']} NP{run['np']}/{run['input']}"
            if not (case / "raw.jsonl").exists() or not (case / "waves.csv").exists():
                skipped.append(f"{label}: case dir missing"); continue
            rep = per_repeat(case)
            if rep is None:
                skipped.append(f"{label}: incomplete or non-PASS repeats"); continue
            ok = (close(statistics.mean(rep["ttft_s"]), run["ttft_s"]) and close(statistics.mean(rep["tpot_ms"]), run["tpot_ms"])
                  and close(statistics.mean(rep["aggregate_tps"]), run["aggregate_tps"]))
            if not ok:
                skipped.append(f"{label}: per-repeat mean does not reproduce the published value"); continue
            run["repeats"] = rep
            done += 1
        path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
        print(f"{fw}: annotated {done}/{len(data['b60_runs'])}")
        for s in skipped:
            print("   skipped", s)


if __name__ == "__main__":
    main(Path(sys.argv[1]))
