#!/usr/bin/env python3
"""Add the Llama-3.3-70B NP50 / NP100 conditions from the benchmark archive (data/benchmark-archive/pro6000-vis.json) to the PRO6000 dataset.

Only these 20 conditions (2 NP x 5 inputs x 2 outputs) are new: every other archive record carries the same values as a row already in the dataset
(archive 'Single-aiDAPTIV Run1' = Cold, 'mean(Run2,Run3)' = Warm; 239 of 240 compared records are identical, see the note in the dataset).
Unit note: in the archive the NP50 / NP100 field `ttft_mean_ms` holds SECONDS (6.79 for NP50 / 1K, against 2254 ms for NP16 / 1K and 4668 ms for NP32 / 1K in the dataset; it doubles with the input).
It is converted x1000 here and the conversion is written into the dataset's provenance. Normalized TPS = aggregate / NP (the dataset's own definition). Run again: it is idempotent.
"""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
DS = ROOT / "data/benchmark-pro6000/AISO_PRO6000_vLLM_VIS_20260825.json"
AR = ROOT / "data/benchmark-archive/pro6000-vis.json"
d = json.loads(DS.read_text()); arch = json.loads(AR.read_text())["runs"]
d["pro6000_runs"] = [r for r in d["pro6000_runs"] if not (r["model"].startswith("Llama") and r["np"] in (50, 100))]      # idempotent
MODE = {"without aiDAPTIV": "without", "Single-aiDAPTIV": None}
grp = {}
for r in arch:
    if not r["model"].startswith("Llama") or r["np"] not in (50, 100):
        continue
    key = (r["np"], r["input_tokens"], r["output_tokens"])
    mode = "without" if r["aidaptiv"] == "without aiDAPTIV" else ("cold" if r["run"] == "Run1" else "warm")
    grp.setdefault(key, {})[mode] = r
new = []
for (np_, inp, out), modes in sorted(grp.items(), key=lambda kv: (kv[0][2], kv[0][0], kv[0][1])):
    assert set(modes) == {"without", "cold", "warm"}, (np_, inp, out, set(modes))
    row = {"model": "Llama-3.3-70B", "output": out, "np": np_, "input": inp,
           "ttft_ms": {m: round(modes[m]["ttft_mean_ms"] * 1000, 1) for m in modes}, "tpot_ms": {m: modes[m]["tpot_ms_unspecified"] for m in modes},
           "aggregate_tps": {m: modes[m]["aggregate_tps"] for m in modes}, "normalized_tps": {m: round(modes[m]["aggregate_tps"] / np_, 2) for m in modes},
           "status": "PASS", "source": "benchmark_archive (report p.2; ids " + ", ".join(sorted(m["id"] for m in modes.values())) + ")"}
    new.append(row)
d["pro6000_runs"] += new
d["profile"]["np"] = sorted(set(d["profile"]["np"]) | {50, 100})
d["note"] = d["note"].replace("Llama-3.3-70B（NP 16 / 32）", "Llama-3.3-70B（NP 16 / 32 / 50 / 100）")
for n in d.get("not_run", []):
    if n.get("model") == "Llama-3.3-70B":
        n["reason"] = "報告涵蓋 NP16 / 32 / 50 / 100（NP1–8 無資料）"
d.setdefault("provenance", {})["archive_added"] = {"file": "data/benchmark-archive/pro6000-vis.json", "rows": len(new), "what": "Llama-3.3-70B NP50 / NP100 (Without, Cold = Single-aiDAPTIV Run1, Warm = mean(Run2,Run3))",
    "unit_note": "the archive's ttft_mean_ms for NP50 / NP100 holds seconds (6.79 for NP50 / 1K; it doubles with the input and continues NP16 2.254 s, NP32 4.668 s); converted x1000 to ms here",
    "check": "the other 239 archive records equal rows already in this dataset; one differs: Llama-3.3-70B NP32 / 1K / Output 2K Warm aggregate TPS 680.24 here vs 690.24 in the archive (not changed)"}
DS.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
print("added", len(new), "rows; dataset now", len(d["pro6000_runs"]), "rows")
