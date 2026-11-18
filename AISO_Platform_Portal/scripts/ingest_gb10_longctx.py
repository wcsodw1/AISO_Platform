#!/usr/bin/env python3
"""Import GB10 long-context vLLM results into data/benchmark-gb10.

Input: one or more result folders copied from GB10 (~/gb10_benchmark/results/<run>/),
each with parameters.json, summary.csv and case_*.json, written by
GB10_vllm_gemma26_5user_longctx.py. Folders without summary.csv (failed start-ups)
are listed as attempts but give no rows.

Usage:
  python3 scripts/ingest_gb10_longctx.py RESULT_DIR [RESULT_DIR ...] [--out data/benchmark-gb10/FILE.json]
"""
import argparse
import csv
import datetime
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL_LABEL = {"google/gemma-4-26B-A4B-it": "Gemma 4 26B A4B"}


def num(v, cast=float):
    try:
        return cast(v) if v not in ("", None) else None
    except ValueError:
        return None


def load_dir(d):
    d = Path(d)
    params = json.loads((d / "parameters.json").read_text())
    phase = "smoke" if "_smoke_" in d.name else "run"
    summary = d / "summary.csv"
    if not summary.exists():
        return params, phase, []
    rows = []
    for r in csv.DictReader(summary.open()):
        ctx, rep = int(r["context"]), int(r["repeat"])
        case = d / f"case_{r['label']}_r{rep}.json"
        reqs = []
        if case.exists():
            c = json.loads(case.read_text())
            reqs = [{"ttft_s": q.get("ttft_s"), "tpot_ms": q.get("tpot_ms"), "e2e_s": q.get("e2e_s"), "status": q.get("status"), "error": q.get("error", "")}
                    for q in c.get("requests", [])]
        rows.append({
            "phase": phase,
            "model": MODEL_LABEL.get(params["model"], params["model"]),
            "np": int(r["users"]),
            "context": ctx,
            "input": num(r["input_tokens"], int),
            "output": num(r["output_tokens"], int),
            "repeat": rep,
            "status": r["status"],
            "ttft_s": num(r["ttft_mean_s"]),
            "ttft_max_s": num(r["ttft_max_s"]),
            "tpot_ms": num(r["tpot_mean_ms"]),
            "aggregate_tps": num(r["tps_aggregate"]),
            "normalized_tps": num(r["tps_normalized"]),
            "wall_s": num(r["wall_s"]),
            "kv_cache_tokens": num(r["kv_cache_tokens"], int),
            "kv_needed_tokens": num(r["kv_needed_tokens"], int),
            "gpu_memory_utilization": params.get("gpu_memory_utilization"),
            "error": r.get("error", ""),
            "requests": reqs,
            "source_dir": d.name,
        })
    return params, phase, rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dirs", nargs="+")
    ap.add_argument("--out")
    a = ap.parse_args()
    runs, attempts, params_seen = [], [], []
    for d in a.dirs:
        p, phase, rows = load_dir(d)
        attempts.append({"dir": Path(d).name, "phase": phase, "rows": len(rows)})
        params_seen.append(p)
        runs += rows
    if not runs:
        sys.exit("no rows found (no summary.csv in any folder)")
    p = params_seen[-1]
    stamp = max(r["source_dir"].rsplit("_", 2)[-2] for r in runs)
    out = Path(a.out) if a.out else ROOT / "data/benchmark-gb10" / f"AISO_GB10_vLLM_gemma26_{stamp}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    runs.sort(key=lambda r: (r["phase"] != "run", r["np"], r["context"], r["repeat"]))
    data = {
        "dataset": out.stem,
        "evidence_until": f"{stamp[:4]}-{stamp[4:6]}-{stamp[6:8]}",
        "generated_on": datetime.date.today().isoformat(),
        "note": "GB10（NVIDIA DGX Spark 類，128 GB 統一記憶體）vLLM 長上下文測試：Gemma 4 26B A4B、fp8 KV cache、不開 prefix caching。"
                "每個條件 NP 個請求同時送出；context = 輸入 + 輸出。數值取自 GB10 上 summary.csv 與 case_*.json，未經人工改寫。",
        "comparability": {"level": "not_comparable",
                          "text": "GB10 為新機器、長上下文（8K–256K）測法，與 B60 / B70 / AISO1 的 1K–16K 壓力測試及 PRO6000 的 aiDAPTIV VIS 測法條件不同，不可直接比較。"},
        "profile": {
            "machine": "NVIDIA GB10 · 128 GB 統一記憶體（CPU 與 GPU 共用）",
            "framework": "vLLM",
            "model": p["model"],
            "kv_cache_dtype": p.get("kv_cache_dtype"),
            "image": p.get("image"),
            "extra_vllm_args": p.get("extra_vllm_args", []),
            "prefix_caching": p.get("prefix_caching"),
            "chunked_prefill": p.get("chunked_prefill"),
            "max_num_batched_tokens": p.get("max_num_batched_tokens"),
            "metrics": p.get("metrics", {}),
            "runtime": "VERIFIED_ON_MACHINE",
        },
        "attempts": attempts,
        "gb10_runs": runs,
    }
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
    print(f"wrote {out.relative_to(ROOT) if out.is_relative_to(ROOT) else out}: {len(runs)} rows from {len(a.dirs)} folders")


if __name__ == "__main__":
    main()
