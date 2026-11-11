#!/usr/bin/env python3
"""L0 -> L3: add per-repeat TTFT / TPOT / Aggregate to the AISO1 llama.cpp B1024 dataset (for the Repeat stability chart).

Usage: ingest_aiso1_repeats.py <aiso1_repeats.csv>   (produced on AISO1 by the exporter from waves.csv / raw.jsonl; sha256 recorded below)
Hard stops: a condition without exactly 3 PASS repeats, or a repeat mean that differs from the published value by > 0.002.
Only metric values are read; no paths or host data are in the CSV.
"""
import csv, hashlib, json, statistics as st, sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "benchmark-aiso1" / "AISO_AISO1_llamacpp_B1024_20261111.json"
NAMES = {"gemma26": "Gemma26", "gemma31": "Gemma31", "laguna": "Laguna", "nemotron": "Nemotron"}


def main(csv_path):
    rows = list(csv.DictReader(open(csv_path)))
    groups = {}
    for r in rows:
        groups.setdefault((NAMES[r["model"]], int(r["np"]), int(r["input"])), []).append(r)
    ds = json.loads(OUT.read_text())
    runs = {(r["model"], r["np"], r["input"]): r for r in ds["aiso1_runs"]}
    done = 0
    for key, rs in sorted(groups.items()):
        run = runs.get(key)
        if run is None:
            continue                       # incomplete conditions (NP5 partial) are not in the dataset as PASS rows
        rs = sorted(rs, key=lambda r: int(r["repeat"]))
        assert len(rs) == 3 and all(r["status"] == "PASS" for r in rs) and [int(r["repeat"]) for r in rs] == [1, 2, 3], f"{key}: expected 3 PASS repeats"
        for col, f in (("ttft_s", "ttft_s"), ("tpot_ms", "tpot_ms"), ("aggregate_tps", "aggregate_tps")):
            vals = [float(r[col]) for r in rs]
            assert abs(st.mean(vals) - run[f]) < 0.002, f"{key}: {f} mean {st.mean(vals):.4f} != published {run[f]}"
        run["repeats"] = {"ttft_s": [round(float(r["ttft_s"]), 3) for r in rs], "tpot_ms": [round(float(r["tpot_ms"]), 3) for r in rs], "aggregate_tps": [round(float(r["aggregate_tps"]), 3) for r in rs],
                          "norm_tps": [round(float(r["normalized_tps"]), 3) for r in rs]}
        done += 1
    ds.setdefault("provenance", {})["repeats_csv_sha256"] = hashlib.sha256(Path(csv_path).read_bytes()).hexdigest()
    OUT.write_text(json.dumps(ds, ensure_ascii=False, indent=1) + "\n")
    print(f"repeats added to {done} / {len(ds['aiso1_runs'])} conditions (means cross-checked against the published values)")


main(sys.argv[1])
