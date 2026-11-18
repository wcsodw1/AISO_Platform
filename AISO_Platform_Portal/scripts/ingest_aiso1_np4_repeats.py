#!/usr/bin/env python3
"""L0 -> L3: AISO1 NP4 per-repeat results WITH TTFT / TPOT (replaces the aggregate-only rows from ingest_aiso1_np4_waves.py).

Usage: ingest_aiso1_np4_repeats.py <np4_repeats.csv>
CSV columns: model,np,input,repeat,status,ok,ttft_s_mean,tpot_ms_mean,tps_aggregate,tps_normalized   (one row per repeat; ttft/tpot are means over the 4 requests of that repeat)
Hard stops: np != 4, status != PASS, ok != 4, normalized x 4 != aggregate (> 1e-6 relative), a condition without exactly 3 repeats, duplicate repeat.
Condition value = mean of the 3 repeat values (TTFT, TPOT, Aggregate). Nothing is estimated.
"""
import csv, hashlib, json, re, statistics as st, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "benchmark-aiso1" / "AISO_AISO1_llamacpp_B1024_20261111.json"
TERM = ROOT / "data" / "terminal" / "aiso1.json"
NAMES = {"laguna": "Laguna", "nemotron": "Nemotron"}
FMT = {"Laguna": "GGUF Q4_K_M", "Nemotron": "GGUF UD-Q4_K_M"}
CAMPAIGN = "NP4_20261111_144405"
INPUTS = (4096, 8192, 16384)


def main(path):
    rows = list(csv.DictReader(open(path)))
    groups = {}
    for r in rows:
        assert int(r["np"]) == 4 and r["status"] == "PASS" and int(r["ok"]) == 4, f"not a clean NP4 PASS: {r}"
        agg, norm = float(r["tps_aggregate"]), float(r["tps_normalized"])
        assert abs(norm * 4 - agg) <= 1e-6 * agg, f"normalized x 4 != aggregate: {r}"
        g = groups.setdefault((NAMES[r["model"]], int(r["input"])), {})
        rep = int(r["repeat"])
        assert rep not in g, f"duplicate repeat: {r}"
        g[rep] = r
    for k, g in groups.items():
        assert sorted(g) == [1, 2, 3], f"{k}: need exactly repeats 1,2,3, got {sorted(g)}"
    ds = json.loads(OUT.read_text())
    runs = {(r["model"], r["np"], r["input"]): r for r in ds["aiso1_runs"]}
    partial = [p for p in ds["partial_runs"] if not (p["model"] in FMT and p["np"] == 4)]
    for (model, inp), g in sorted(groups.items()):
        reps = [g[i] for i in (1, 2, 3)]
        ttft = [float(x["ttft_s_mean"]) for x in reps]
        tpot = [float(x["tpot_ms_mean"]) for x in reps]
        agg = [float(x["tps_aggregate"]) for x in reps]
        norm = [float(x["tps_normalized"]) for x in reps]
        runs[(model, 4, inp)] = {"model": model, "format": FMT[model], "np": 4, "input": inp, "ttft_s": round(st.mean(ttft), 3), "tpot_ms": round(st.mean(tpot), 3),
                                 "aggregate_tps": round(st.mean(agg), 3), "decode_tps": None, "status": "PASS", "campaign": CAMPAIGN, "valid_repeats": 3, "ttft_over_180s": st.mean(ttft) >= 180,
                                 "repeats": {"ttft_s": [round(x, 3) for x in ttft], "tpot_ms": [round(x, 3) for x in tpot], "aggregate_tps": [round(x, 3) for x in agg], "norm_tps": [round(x, 3) for x in norm]}}
    ds["aiso1_runs"] = sorted(runs.values(), key=lambda r: (r["model"], r["np"], r["input"]))
    ds["partial_runs"] = partial
    have = set(runs) | {(p["model"], p["np"], p["input"]) for p in partial}
    nr = [x for x in ds["not_run"] if x["model"] not in FMT]
    for model in FMT:
        left = [(n, i) for n in (1, 2, 4) for i in INPUTS if (model, n, i) not in have]
        if left:
            nr.append({"model": model, "reason": "待測（Runner 執行中）", "conditions": len(left)})
    ds["not_run"] = nr
    ds["note"] = re.sub(r" NP4（[^）]*）只有每次 Aggregate／Normalized，TTFT／TPOT 待補（不推估）。", "", ds["note"]) + " NP4（Laguna、Nemotron 各 3 個 Input × 3 次）取自 AISO1 的逐次結果檔，含 TTFT／TPOT。"
    ds["provenance"]["np4_repeats_csv_sha256"] = hashlib.sha256(Path(path).read_bytes()).hexdigest()
    OUT.write_text(json.dumps(ds, ensure_ascii=False, indent=1) + "\n")
    t = json.loads(TERM.read_text())
    t["summary"] = re.sub(r"\d+/48 conditions with values \(NP4: aggregate only\)", f"{len(ds['aiso1_runs'])}/48 conditions with values", t["summary"])
    TERM.write_text(json.dumps(t, ensure_ascii=False, indent=1) + "\n")
    print("NP4 conditions", len(groups), "total runs", len(ds["aiso1_runs"]), "not_run", {x["model"]: x["conditions"] for x in nr}, "partial", len(partial))


main(sys.argv[1])
