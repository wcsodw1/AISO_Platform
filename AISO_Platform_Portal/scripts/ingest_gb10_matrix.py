#!/usr/bin/env python3
"""Add the GB10 "Ryan matrix" (NP 1/3/5 x Input 64K/128K x Output 256/512, KV fp8) to data/benchmark-gb10.

Input: ONE result folder copied from GB10 (~/gb10_benchmark/results/gemma26_vllm_fp8_ryan_<stamp>/), written by
GB10_vllm_gemma26_matrix.py (parameters.json, summary.csv, case_np<N>_in<I>_out<O>.json).

The rows are stored in the existing GB10 dataset with set="ryan" (the original long-context rows have no "set").
For a ryan row `context` is the INPUT token count (65536 / 131072) so the page groups by input; `session_tokens`
= input + output. Running it again replaces the earlier ryan rows. Numbers are copied, never edited.

Usage:
  python3 scripts/ingest_gb10_matrix.py RESULT_DIR [--data data/benchmark-gb10/AISO_GB10_vLLM_gemma26_20261118.json]
"""
import argparse
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT = ROOT / "data/benchmark-gb10/AISO_GB10_vLLM_gemma26_20261118.json"


def num(v, cast=float):
    try:
        return cast(v) if v not in ("", None) else None
    except ValueError:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dir")
    ap.add_argument("--data", default=str(DEFAULT))
    a = ap.parse_args()
    d, data_path = Path(a.dir), Path(a.data)
    params = json.loads((d / "parameters.json").read_text())
    rows = []
    for r in csv.DictReader((d / "summary.csv").open()):
        np_, n_in, n_out = int(r["np"]), int(r["input_tokens"]), int(r["output_tokens"])
        case = d / f"case_np{np_}_in{n_in}_out{n_out}.json"
        reqs = []
        if case.exists():
            c = json.loads(case.read_text())
            reqs = [{"ttft_s": q.get("ttft_s"), "tpot_ms": q.get("tpot_ms"), "e2e_s": q.get("e2e_s"),
                     "status": q.get("status"), "error": q.get("error", "")} for q in c.get("requests", [])]
        rows.append({
            "set": "ryan", "phase": "run", "model": "Gemma 4 26B A4B", "np": np_,
            "context": n_in, "session_tokens": n_in + n_out, "input": n_in, "output": n_out, "repeat": 1,
            "status": r["status"], "ttft_s": num(r["ttft_mean_s"]), "ttft_max_s": num(r["ttft_max_s"]),
            "tpot_ms": num(r["tpot_mean_ms"]), "aggregate_tps": num(r["tps_aggregate"]),
            "normalized_tps": num(r["tps_normalized"]), "wall_s": num(r["wall_s"]),
            "kv_cache_tokens": num(r["kv_cache_tokens"], int), "kv_needed_tokens": num(r["kv_needed_tokens"], int),
            "kv_tight": bool(r.get("kv_needed_tokens")), "gpu_memory_utilization": params.get("gpu_memory_utilization"),
            "error": r.get("error", ""), "requests": reqs, "source_dir": d.name,
        })
    if not rows:
        sys.exit("no rows in summary.csv")
    rows.sort(key=lambda r: (r["np"], r["context"], r["output"]))
    ds = json.loads(data_path.read_text())
    ds["gb10_runs"] = [x for x in ds["gb10_runs"] if x.get("set") != "ryan"] + rows
    ds["attempts"] = [x for x in ds.get("attempts", []) if x.get("set") != "ryan"] + [{"dir": d.name, "phase": "run", "set": "ryan", "rows": len(rows)}]
    ds["profile_ryan"] = {
        "weights": params.get("weights"), "kv_cache_dtype": params.get("kv_cache_dtype"),
        "max_model_len": params.get("max_model_len"), "max_num_seqs": params.get("max_num_seqs"),
        "max_num_batched_tokens": params.get("max_num_batched_tokens"), "extra_vllm_args": params.get("extra_vllm_args", []),
        "gpu_memory_utilization": params.get("gpu_memory_utilization"), "prefix_caching": params.get("prefix_caching"),
        "request": params.get("request"), "order": params.get("order"), "metrics": params.get("metrics", {}),
    }
    ds["note_ryan"] = ("Ryan 條件（TPI-Ryan 2026-11-18）：NP 1 / 3 / 5 × Input 64K（65,536）/ 128K（131,072）× Output 256 / 512，KV cache fp8，"
                       "模型權重 bf16（未量化），不開 prefix caching；每組 1 次、一次開機跑完 12 組。Input 為精確輸入 token 數，"
                       "session 總長 = 輸入 + 輸出，與另一組「context = 輸入 + 輸出」的測試不同，不可直接比較。數值取自 GB10 上 summary.csv 與 case_*.json，未經人工改寫。")
    ds["progress_ryan"] = [
        {"label": "Preflight", "zh": "預檢", "status": "done"},
        {"label": "Smoke", "zh": "冒煙", "detail": "np=2, input=8K, output=64", "status": "done"},
        {"label": "Input 64K / 128K", "zh": "輸入 64K / 128K", "detail": "np=1/3/5, input=64K/128K, output=256/512, KV fp8",
         "status": "done" if all(r["status"] == "PASS" for r in rows) and len(rows) == 12 else "fail"},
    ]
    data_path.write_text(json.dumps(ds, ensure_ascii=False, indent=1) + "\n")
    print(f"ryan rows: {len(rows)} ({sum(r['status'] == 'PASS' for r in rows)} PASS) -> {data_path}")


if __name__ == "__main__":
    main()
