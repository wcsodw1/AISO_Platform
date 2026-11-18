#!/usr/bin/env python3
"""L0 -> L3: add the AISO1 NP4 results that exist only as per-repeat wave summaries (no TTFT / TPOT yet).

Usage: ingest_aiso1_np4_waves.py <np4_wave_lines.txt>
Input lines:  <model> NP4 <input> R <repeat> {"repeat":..,"status":"PASS","successful_requests":4,"wall_s":..,"tps_aggregate":..,"tps_normalized":..}

Hard stops: wave not PASS, not 4/4 requests, normalized x 4 differs from aggregate (> 1e-6 relative), duplicate repeat.
A condition with 3 PASS repeats becomes a run (aggregate = mean of the 3, ttft_s / tpot_ms stay null — NOT estimated);
fewer than 3 repeats goes to partial_runs. A later full handoff (with TTFT / TPOT) replaces these rows: run ingest_aiso1_handoff.py then ingest_aiso1_repeats.py.
"""
import hashlib, json, re, statistics as st, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "benchmark-aiso1" / "AISO_AISO1_llamacpp_B1024_20261111.json"
TERM = ROOT / "data" / "terminal" / "aiso1.json"
NAMES = {"laguna": "Laguna", "nemotron": "Nemotron"}
FMT = {"Laguna": "GGUF Q4_K_M", "Nemotron": "GGUF UD-Q4_K_M"}
CAMPAIGN = "NP4_20261111_144405"
LINE = re.compile(r"^(\w+) NP4 (\d+) R (\d+) (\{.*\})$")
INPUTS = (4096, 8192, 16384)


def main(path):
    text = Path(path).read_text()
    groups = {}
    for ln in text.splitlines():
        ln = ln.strip()
        if not ln:
            continue
        m = LINE.match(ln)
        assert m, f"unrecognised line: {ln[:80]}"
        model, inp, rep, wave = NAMES[m.group(1)], int(m.group(2)), int(m.group(3)), json.loads(m.group(4))
        assert wave["repeat"] == rep and wave["status"] == "PASS" and wave["successful_requests"] == 4, f"not a clean PASS: {ln[:80]}"
        assert abs(wave["tps_normalized"] * 4 - wave["tps_aggregate"]) <= 1e-6 * wave["tps_aggregate"], f"normalized x 4 != aggregate: {ln[:80]}"
        g = groups.setdefault((model, inp), {})
        assert rep not in g, f"duplicate repeat: {ln[:80]}"
        g[rep] = wave
    ds = json.loads(OUT.read_text())
    runs = {(r["model"], r["np"], r["input"]): r for r in ds["aiso1_runs"]}
    partial = [p for p in ds["partial_runs"] if not (p["model"] in FMT and p["np"] == 4)]
    done = part = 0
    for (model, inp), g in sorted(groups.items()):
        agg = [g[k]["tps_aggregate"] for k in sorted(g)]
        if len(g) == 3:
            runs[(model, 4, inp)] = {"model": model, "format": FMT[model], "np": 4, "input": inp, "ttft_s": None, "tpot_ms": None, "aggregate_tps": round(st.mean(agg), 3), "decode_tps": None,
                                     "status": "PASS", "campaign": CAMPAIGN, "valid_repeats": 3, "ttft_over_180s": False,
                                     "repeats": {"aggregate_tps": [round(x, 3) for x in agg], "norm_tps": [round(g[k]["tps_normalized"], 3) for k in sorted(g)]},
                                     "ttft_tpot_missing": True}
            done += 1
        else:
            partial.append({"model": model, "np": 4, "input": inp, "valid_repeats": len(g), "status": "PARTIAL_PASS"})
            part += 1
    ds["aiso1_runs"] = sorted(runs.values(), key=lambda r: (r["model"], r["np"], r["input"]))
    ds["partial_runs"] = partial
    # pending (NP 1/2/4 only; NP5 is omitted by decision)
    have = set(runs) | {(p["model"], p["np"], p["input"]) for p in partial}
    nr = [x for x in ds["not_run"] if x["model"] not in FMT]
    for model in FMT:
        left = [(n, i) for n in (1, 2, 4) for i in INPUTS if (model, n, i) not in have]
        if left:
            nr.append({"model": model, "reason": "待測（Runner 執行中）", "conditions": len(left)})
    ds["not_run"] = nr
    ds["note"] = re.sub(r"\d+ / 48 條件完整", f"{len(ds['aiso1_runs'])} / 48 條件有數值", ds["note"]) + " NP4（Laguna 全部、Nemotron 4K／8K）只有每次 Aggregate／Normalized，TTFT／TPOT 待補（不推估）。"
    ds["provenance"]["np4_wave_lines_sha256"] = hashlib.sha256(Path(path).read_bytes()).hexdigest()
    OUT.write_text(json.dumps(ds, ensure_ascii=False, indent=1) + "\n")
    t = json.loads(TERM.read_text())
    t["summary"] = re.sub(r"\d+/48 conditions complete", f"{len(ds['aiso1_runs'])}/48 conditions with values (NP4: aggregate only)", t["summary"])
    TERM.write_text(json.dumps(t, ensure_ascii=False, indent=1) + "\n")
    print("runs added", done, "partial", part, "total runs", len(ds["aiso1_runs"]), "not_run", {x["model"]: x["conditions"] for x in nr})


main(sys.argv[1])
