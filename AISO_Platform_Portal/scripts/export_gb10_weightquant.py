#!/usr/bin/env python3
"""GB10 weight-quantization results -> data/benchmark-gb10/AISO_GB10_vLLM_gemma26_weightquant.json (published, no paths / IPs / logs).

Reads the machine READ-ONLY over ssh (GB10-key): every ~/gb10_benchmark/results/gemma26_vllm_fp8_ryan_*/ (parameters.json + summary.csv).
Per weights option the newest run is kept; a run without summary.csv is listed as "no result" (e.g. it did not start). Usage: python3 scripts/export_gb10_weightquant.py
"""
import csv
import io
import json
import re
import subprocess
from datetime import datetime
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "benchmark-gb10" / "AISO_GB10_vLLM_gemma26_weightquant.json"
SSH = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "-o", "RemoteCommand=none", "-o", "RequestTTY=no", "-T", "GB10-key"]
REMOTE = r'''cd ~/gb10_benchmark/results && for d in $(ls -t -d gemma26_vllm_fp8_*/ | grep -vE '_(run|smoke)_[0-9]'); do d=${d%/}; echo "=== $d"; cat $d/parameters.json 2>/dev/null | python3 -c "import json,sys;d=json.load(sys.stdin);print('PARAMS '+json.dumps({k:d.get(k) for k in ('model','weights','kv_cache_dtype','gpu_memory_utilization','max_model_len','max_num_seqs','max_num_batched_tokens','prefix_caching','chunked_prefill','extra_vllm_args','nps','inputs','outputs','repeats','image','request')}))" 2>/dev/null; echo "--- csv"; cat $d/summary.csv 2>/dev/null; if [ ! -s $d/summary.csv ]; then echo "--- err"; e=$(grep -h -m1 '^ValueError: ' $d/server.log 2>/dev/null | cut -c1-300); [ -z "$e" ] && e=$(grep -h -m1 '^RuntimeError: ' $d/server.log 2>/dev/null | cut -c1-300); echo "$e" | sed -E "s#/home/[a-z]+/#~/#g"; fi; done'''
LABEL = {"bf16": ["bf16", "bf16（不量化）"], "bf16_kvauto": ["bf16 · KV auto", "bf16 · KV cache 全精度（auto）"], "nvfp4": ["NVFP4", "NVFP4（NVIDIA 官方）"], "fp8": ["fp8 online", "fp8 線上量化"], "fp8pre": ["fp8 pre-quantized", "fp8 預量化"], "int8": ["int8 AWQ", "int8 AWQ"], "int4": ["int4 AWQ", "int4 AWQ"]}


def key_of(weights, model):
    w = (weights or "").lower()
    if "nvfp4" in w or "nvfp4" in (model or "").lower():
        return "nvfp4"
    if "int4" in w or "awq-4bit" in (model or "").lower():
        return "int4"
    if "int8" in w or "awq-8bit" in (model or "").lower():
        return "int8"
    if "pre-quantized" in w or "fp8-dynamic" in (model or "").lower():
        return "fp8pre"
    if "fp8" in w:
        return "fp8"
    return "bf16"


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def main():
    out = subprocess.run(SSH + [REMOTE], capture_output=True, text=True, timeout=60)
    if out.returncode != 0:
        raise SystemExit("no answer from GB10: " + out.stderr[:200])
    best, attempts = {}, {}      # (key, set) -> the attempt with the MOST PASS results; every attempt is listed
    for block in out.stdout.split("=== ")[1:]:
        name, _, rest = block.partition("\n")
        params = {}
        m = re.search(r"^PARAMS (.*)$", rest, re.M)
        if m:
            params = json.loads(m.group(1))
        csv_text, _, err = rest.partition("--- csv\n")[2].partition("--- err\n")
        rows = []
        for r in csv.DictReader(io.StringIO(csv_text)):
            rows.append({"np": int(r["np"]), "input": int(r["input_tokens"]), "output": int(r["output_tokens"]), "status": r["status"], "ttft_s": num(r.get("ttft_mean_s")), "ttft_max_s": num(r.get("ttft_max_s")),
                         "error": (r.get("error") or "")[:300], "tpot_ms": num(r.get("tpot_mean_ms")), "aggregate_tps": num(r.get("tps_aggregate")), "normalized_tps": num(r.get("tps_normalized")), "kv_tight": bool(r.get("kv_needed_tokens")), "kv_cache_tokens": num(r.get("kv_cache_tokens"))})
        k = key_of(params.get("weights"), params.get("model"))
        if k == "bf16" and params.get("kv_cache_dtype") not in (None, "fp8"):
            k = "bf16_kvauto"                      # the same bf16 weights with the KV cache at full precision (auto)
        sset = "8k" if (params.get("inputs") or [0])[0] <= 8192 else "long"
        npass = len([r for r in rows if r["status"] == "PASS"])
        attempts.setdefault(k, []).append({"set": sset, "dir_time": (re.search(r"(\d{8}_\d{6})$", name) or [None, None])[1], "pass": npass, "error": err.strip()[:300] or None})
        cur = best.get((k, sset))
        if cur and (cur["_pass"] > npass or (cur["_pass"] == npass and (cur["start_error"] or not err.strip()))):      # a later failed attempt never hides a finished run
            continue
        best[(k, sset)] = {"params": params, "rows": rows, "start_error": err.strip()[:300] or None, "_pass": npass, "started": (re.search(r"(\d{8}_\d{6})$", name) or [None, None])[1]}
    runs = {}
    for k in LABEL:
        parts = [best[(k, st)] for st in ("long", "8k") if (k, st) in best]
        if not parts:
            continue
        main = parts[0]; params = main["params"]; rows = [r for x in parts for r in x["rows"]]
        npass = len([r for r in rows if r["status"] == "PASS"])
        runs[k] = {"key": k, "label": LABEL[k], "weights": params.get("weights"), "model": params.get("model"), "kv_cache_dtype": params.get("kv_cache_dtype"), "extra_vllm_args": params.get("extra_vllm_args"), "gpu_memory_utilization": params.get("gpu_memory_utilization"),
                   "max_model_len": params.get("max_model_len"), "max_num_seqs": params.get("max_num_seqs"), "max_num_batched_tokens": params.get("max_num_batched_tokens"),
                   "prefix_caching": params.get("prefix_caching"), "chunked_prefill": params.get("chunked_prefill"), "image": params.get("image"), "request": params.get("request"),
                   "kv_cache_tokens": next((r["kv_cache_tokens"] for r in rows if r.get("kv_cache_tokens")), None), "rows": rows, "cases_expected": 18, "started": main["started"],
                   "start_error": next((x["start_error"] for x in parts if x["start_error"]), None), "_pass": npass,
                   "status": "COMPLETE" if npass >= 18 else ("PARTIAL" if npass else "NO_RESULT")}
    data = {"machine": "GB10", "framework": "vLLM", "test": "Weight quantization, Gemma 4 26B MoE, KV cache fp8 (+ bf16 with KV auto), 8K and long context",
            "protocol": {"nps": [1, 3, 5], "inputs": [8192, 65536, 131072], "outputs": [256, 512], "repeats": 1, "kv_cache_dtype": "fp8", "baseline": "bf16 (not quantized)", "cases_per_weights": 18},
            "generated_at": datetime.now().isoformat(timespec="seconds"), "weights": [{**{a: b for a, b in runs[k].items() if a != "_pass"}, "attempts": attempts.get(k, []), "start_failed": not runs[k]["rows"] and bool(runs[k]["start_error"])} for k in LABEL if k in runs]}
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
    print("wrote", OUT.name, {w["key"]: (w["status"], len(w["rows"])) for w in data["weights"]})


if __name__ == "__main__":
    main()
