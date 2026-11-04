#!/usr/bin/env python3
"""Ingest a 'Completed results' xlsx (stdlib only) into the per-framework dataset JSONs.

usage: tools/ingest_benchmark_xlsx.py <machine-key, e.g. b60> <file.xlsx>

Reads data/benchmark-registry.json to find each framework's dataset file, replaces its `<machine>_runs`
with the xlsx rows (xlsx = complete set for that machine) and keeps profile / failures / not_run / retry.
Values are copied as given (no rounding, no inference). Full source paths are reduced to the run directory name.
"""
import json, re, sys, zipfile, xml.etree.ElementTree as ET
from pathlib import Path

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
BASE = Path(__file__).resolve().parent.parent
FW_KEY = {"sglang": "sglang", "vllm": "vllm", "llama.cpp": "llamacpp", "llamacpp": "llamacpp"}


def read_sheet(path, index=1):
    z = zipfile.ZipFile(path)
    ss = []
    if "xl/sharedStrings.xml" in z.namelist():
        ss = ["".join(t.text or "" for t in si.iter(NS + "t")) for si in ET.fromstring(z.read("xl/sharedStrings.xml"))]
    rows = []
    for row in ET.fromstring(z.read(f"xl/worksheets/sheet{index}.xml")).iter(NS + "row"):
        cells = {}
        for c in row:
            v, t = c.find(NS + "v"), c.get("t")
            if t == "inlineStr":
                val = "".join(x.text or "" for x in c.iter(NS + "t"))
            elif v is None:
                continue
            elif t == "s":
                val = ss[int(v.text)]
            else:
                val = v.text
            cells[re.match(r"[A-Z]+", c.get("r")).group()] = val
        rows.append(cells)
    return rows


def main(machine, xlsx):
    reg = json.load(open(BASE / "data/benchmark-registry.json", encoding="utf-8"))
    rows = read_sheet(xlsx, 1)
    head = rows[0]
    col = {v: k for k, v in head.items()}
    need = ["Framework", "Model", "NP", "Input (tokens)", "TTFT source (s)", "TPOT (ms/token)", "TPS Aggregate (tok/s)", "Status"]
    miss = [n for n in need if n not in col]
    if miss:
        sys.exit(f"missing columns: {miss}")
    by_fw = {}
    for r in rows[1:]:
        g = lambda name: r.get(col[name]) if name in col else None
        if not g("Framework"):
            continue
        fw = FW_KEY[g("Framework").strip().lower()]
        np_, inp = int(float(g("NP"))), int(float(g("Input (tokens)")))
        agg = float(g("TPS Aggregate (tok/s)"))
        d = (g("B60 source case directory") or "").rstrip("/").split("/")
        run = {
            "model": g("Model"), "format": g("Format"), "np": np_, "input": inp,
            "ttft_s": float(g("TTFT source (s)")), "tpot_ms": float(g("TPOT (ms/token)")),
            "aggregate_tps": agg, "decode_tps": agg / np_,   # decode_tps field = Normalized = aggregate / NP
            "status": g("Status"), "run_id": next((x for x in reversed(d) if re.search(r"\d{6,}|_", x) and not re.match(r"np\d", x)), ""),
        }
        run["ttft_over_180s"] = run["ttft_s"] >= 180
        if "retry" in "/".join(d).lower():
            run["retry"] = True
        by_fw.setdefault(fw, []).append(run)
    for ds in reg["datasets"]:
        if ds["machine"] != machine:
            continue
        p = BASE / ds["file"]
        data = json.load(open(p, encoding="utf-8"))
        key = ds["runs_key"]
        old = {(r["model"], r["np"], r["input"]): r for r in data.get(key, [])}
        new = by_fw.get(ds["framework"], [])
        for r in new:  # keep hand-written annotations (e.g. consistency_note)
            o = old.get((r["model"], r["np"], r["input"]))
            if o and o.get("consistency_note"):
                r["consistency_note"] = o["consistency_note"]
        data[key] = new
        json.dump(data, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"{ds['framework']}: {len(new)} rows -> {ds['file']}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
