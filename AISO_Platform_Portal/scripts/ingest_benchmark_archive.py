#!/usr/bin/env python3
"""Ingest Benchmark_Archive_<date>.xlsx (David's history archive) into data/benchmark-archive/: one dataset per machine group, every record keeps its own
test parameters (model, weight quantization, backend, NP, input, output, cold/warm, run, aiDAPTIV mode). Nothing is merged into the existing B60 / B70 / AISO1 /
PRO6000 datasets and nothing is invented: unknown stays null; the archive's own status / precision evidence is carried along.
Usage (repo root of AISO_Platform_Portal):  python3 scripts/ingest_benchmark_archive.py /path/Benchmark_Archive_2026-11-15.xlsx"""
import collections
import json
import re
import sys
from pathlib import Path

import openpyxl

BASE = Path(__file__).resolve().parent.parent
OUT = BASE / "data" / "benchmark-archive"          # published: only records that can be drawn as a line (2+ input lengths)
FULL = BASE / "data" / "benchmark-archive-full"    # everything, NOT exported
UNPUBLISHED_GROUPS = {"nvidia-vllm", "unverified"}  # machine not identified in the archive
GROUPS = [   # (id, label, test: substring of the archive's machine column)
    ("pro6000-vis", "NVIDIA · RTX PRO 6000 (VIS)", lambda m: "VIS" in m and "RTX PRO 6000" in m or "RTX PRO 6000" in m and "multi-platform" in m),
    ("aiso1", "AMD · AISO1 · AI MAX+ 395", lambda m: "AISO1" in m),
    ("b390", "Intel · Arc B390 (MSI)", lambda m: "B390" in m),
    ("rog-z13", "AMD · ROG Flow Z13 · AI MAX+ 395", lambda m: "ROG Flow" in m),
    ("max392", "AMD · Ryzen AI MAX+ 392", lambda m: "MAX+ 392" in m),
    ("a6000", "NVIDIA · A6000 ×4", lambda m: "A6000" in m),
    ("nvidia-vllm", "NVIDIA / vLLM（實體主機待核對）", lambda m: m.startswith("NVIDIA") or m.startswith("HPE")),
    ("unverified", "機器待核對", lambda m: True),
]
NUM = {"Mean TTFT (ms)": "ttft_mean_ms", "Median TTFT (ms)": "ttft_median_ms", "Mean TPOT (ms/token)": "tpot_mean_ms", "Median TPOT (ms/token)": "tpot_median_ms",
       "TPOT統計未明 (ms/token)": "tpot_ms_unspecified", "Aggregate output (tok/s)": "aggregate_tps", "Generation (tok/s)": "generation_tps", "Prompt (tok/s)": "prompt_tps"}


def num(v):
    if v is None or v == "":
        return None
    try:
        return float(str(v).replace(",", ""))
    except ValueError:
        return None


def k_tokens(txt, exact):
    """'1K' -> 1024 style is the report's own wording; keep the original text and also the exact number when the sheet has one."""
    if exact not in (None, ""):
        return int(num(exact)) if num(exact) is not None else None
    m = re.fullmatch(r"(\d+)\s*[Kk]", str(txt or "").strip())
    return int(m.group(1)) * 1024 if m else None


def complete(r):
    ttft = r.get("ttft_mean_ms") if r.get("ttft_mean_ms") is not None else r.get("ttft_median_ms")
    tpot = next((r[k] for k in ("tpot_median_ms", "tpot_mean_ms", "tpot_ms_unspecified") if r.get(k) is not None), None)
    tps = next((r[k] for k in ("aggregate_tps", "generation_tps", "prompt_tps") if r.get(k) is not None), None)
    return r.get("np") is not None and r.get("input_tokens") and r.get("output_tokens") and ttft is not None and tpot is not None and tps is not None and not re.search(r"invalid|missing", r.get("status") or "", re.I)


def chartable(recs):
    """Keep complete records whose (model, NP, output, mode) has at least two input lengths: only those make a line. NP may be a single value."""
    groups = collections.defaultdict(list)
    for r in recs:
        if complete(r):
            groups[(r.get("model"), r["np"], r["output_tokens"], r.get("aidaptiv"), r.get("run"))].append(r)
    return [r for rs in groups.values() if len({x["input_tokens"] for x in rs}) >= 2 for r in rs]


def main(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    rows = list(wb["測試紀錄"].iter_rows(values_only=True))
    h = rows[0]
    ix = {n: i for i, n in enumerate(h)}
    g = lambda r, k: r[ix[k]] if k in ix and r[ix[k]] not in ("", None) else None
    srcs = {r[0]: {"file": r[1], "type": r[2], "uploaded": r[3]} for r in list(wb["來源索引"].iter_rows(values_only=True))[1:] if r[0]}
    launch = [dict(zip(["type", "machine", "model", "field", "value", "source", "where", "note"], r)) for r in list(wb["啟動與監控"].iter_rows(values_only=True))[1:] if r[0]]
    out = {gid: {"label": label, "records": []} for gid, label, _ in GROUPS}
    for r in rows[1:]:
        machine = str(g(r, "機器／平台") or "")
        gid = next(i for i, _, t in GROUPS if t(machine))
        rec = {"id": g(r, "紀錄ID"), "evidence": g(r, "證據類型"), "machine_text": machine, "model": g(r, "模型"), "weight_quant": g(r, "權重量化"), "runtime_dtype": g(r, "Runtime dtype"),
               "backend": g(r, "後端"), "status": g(r, "批次／狀態"), "date": g(r, "測試／報告日期"), "np": int(num(g(r, "NP／併發"))) if num(g(r, "NP／併發")) is not None else None,
               "input_tokens": k_tokens(g(r, "Input原文"), g(r, "Input tokens")), "input_text": g(r, "Input原文"), "output_tokens": k_tokens(g(r, "Output原文"), g(r, "Output tokens")), "output_text": g(r, "Output原文"),
               "context_tokens": num(g(r, "Context tokens")), "run": g(r, "Run／彙總"), "aidaptiv": g(r, "aiDAPTIV"), "cold_warm": g(r, "冷／熱"), "speed_text": g(r, "原文速度／區間"),
               "source_ids": g(r, "來源ID"), "source_where": g(r, "來源位置"), "precision_evidence": g(r, "精度證據"), "note": g(r, "備註"), "host": g(r, "主機名稱"), "gpu_ids": g(r, "GPU IDs"), "tensor_parallel": g(r, "Tensor Parallel")}
        for col, key in NUM.items():
            rec[key] = num(g(r, col))
        out[gid]["records"].append({k: v for k, v in rec.items() if v is not None})
    OUT.mkdir(parents=True, exist_ok=True)
    FULL.mkdir(parents=True, exist_ok=True)
    index = {"generated_from": Path(path).name, "scope": "history archive, not the same protocol as the stress-test pages; host / precision unverified where marked 待核對", "sources": len(srcs), "groups": []}
    for gid, label, _ in GROUPS:
        full_recs = out[gid]["records"]
        if not full_recs:
            continue
        recs = [] if gid in UNPUBLISHED_GROUPS else chartable(full_recs)
        (FULL / f"{gid}.json").write_text(json.dumps({"group": gid, "label": label, "records": len(full_recs), "runs": full_recs}, ensure_ascii=False) + "\n")
        print(gid, "published", len(recs), "of", len(full_recs))
        if not recs:
            continue
        per_model = collections.OrderedDict()
        for x in recs:
            key = x.get("model", "—")
            m = per_model.setdefault(key, {"rows": 0, "quant": set(), "backend": set(), "np": set(), "input": set(), "output": set(), "status": collections.Counter()})
            m["rows"] += 1
            for src, dst in (("weight_quant", "quant"), ("backend", "backend"), ("np", "np"), ("input_tokens", "input"), ("output_tokens", "output")):
                if x.get(src) is not None:
                    m[dst].add(x[src])
            m["status"][x.get("status", "—")] += 1
        models = [{"model": k, "rows": v["rows"], "quant": sorted(map(str, v["quant"])), "backend": sorted(map(str, v["backend"])), "np": sorted(v["np"]), "input": sorted(v["input"]), "output": sorted(v["output"]), "status": dict(v["status"])} for k, v in per_model.items()]
        used = {s.strip() for x in recs for s in str(x.get("source_ids", "")).split(",") if s.strip()}
        data = {"dataset": f"AISO_ARCHIVE_{gid}_20261115", "group": gid, "label": label, "generated_on": "2026-11-15", "source_file": Path(path).name, "records": len(recs), "models": models,
                "comparability": {"level": "archive_not_comparable", "text": "歷史彙整，測試條件各筆不同（見每筆的模型、量化、後端、NP、Input、Output、冷熱、Run）；機器歸屬與精度未註明者標「待核對」，不與壓力測試頁直接比較。"},
                "launch": [x for x in launch if gid == next(i for i, _, t in GROUPS if t(str(x.get("machine") or "")))], "sources": {k: srcs[k] for k in sorted(used) if k in srcs}, "runs": recs}
        (OUT / f"{gid}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
        index["groups"].append({"id": gid, "label": label, "file": f"data/benchmark-archive/{gid}.json", "records": len(recs), "models": [m["model"] for m in models]})
        print("   ->", len(models), "models")
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n")


if __name__ == "__main__":
    main(sys.argv[1])
