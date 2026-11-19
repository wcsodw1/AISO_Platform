#!/usr/bin/env python3
"""Export the GB10 KV-cache-type comparison (bf16 weights): KV full precision (auto) vs KV fp8, same conditions.

Reads the machine READ-ONLY over ssh (GB10-key): ~/gb10_benchmark/results/*kvauto_*/ (parameters.json + summary.csv). The fp8-KV rows are taken from the
weight-quantization dataset (bf16 weights, KV fp8), so both sides come from measured files. Nothing is estimated; a case that did not fit is kept with what vLLM really did.
Writes data/benchmark-gb10/AISO_GB10_vLLM_gemma26_kvdtype.json.
"""
import csv
import datetime
import io
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/benchmark-gb10/AISO_GB10_vLLM_gemma26_kvdtype.json"
WQ = ROOT / "data/benchmark-gb10/AISO_GB10_vLLM_gemma26_weightquant.json"
SSH = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "GB10-key"]
REMOTE = r'''cd ~/gb10_benchmark/results && for d in $(ls -d *kvauto_*/ *nvfp4kv_*/); do d=${d%/}; echo "=== $d"; cat $d/parameters.json 2>/dev/null | python3 -c "import json,sys;d=json.load(sys.stdin);print('PARAMS '+json.dumps({k:d.get(k) for k in ('kv_cache_dtype','weights','gpu_memory_utilization','max_model_len','max_num_seqs','max_num_batched_tokens','extra_vllm_args','image')}))"; echo "--- csv"; cat $d/summary.csv 2>/dev/null; done'''


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def rows_of(text):
    out = []
    for r in csv.DictReader(io.StringIO(text)):
        out.append({"np": int(r["np"]), "input": int(r["input_tokens"]), "output": int(r["output_tokens"]), "status": r["status"], "ttft_s": num(r.get("ttft_mean_s")), "ttft_max_s": num(r.get("ttft_max_s")),
                    "tpot_ms": num(r.get("tpot_mean_ms")), "aggregate_tps": num(r.get("tps_aggregate")), "normalized_tps": num(r.get("tps_normalized")), "wall_s": num(r.get("wall_s")),
                    "kv_cache_tokens": num(r.get("kv_cache_tokens")), "kv_needed_tokens": num(r.get("kv_needed_tokens")), "kv_tight": bool(r.get("kv_needed_tokens")), "error": (r.get("error") or "")[:300]})
    return out


def main():
    p = subprocess.run(SSH + [REMOTE], capture_output=True, text=True, timeout=90)
    if p.returncode != 0 and not p.stdout:      # a folder of a failed start has no summary.csv: `cat` fails there, that is not a lost connection
        raise SystemExit("no answer from GB10: " + p.stderr[:200])
    fam = {}      # family key ("bf16" = KV full precision, "nvfp4" = NVFP4 KV) -> rows / servers / params of the KV variant
    for block in p.stdout.split("=== ")[1:]:
        name, _, rest = block.partition("\n")
        m = re.search(r"^PARAMS (.*)$", rest, re.M)
        pr = json.loads(m.group(1)) if m else {}
        rows = rows_of(rest.partition("--- csv\n")[2])
        if not rows:
            continue
        f = "nvfp4" if "nvfp4kv_" in name else "bf16"
        tset = "in8k" if "_in8k_" in name else "ryan"
        d = fam.setdefault(f, {"rows": [], "servers": {}, "params": pr})
        d["rows"] += rows
        d["servers"][tset] = {"kv_cache_tokens": next((r["kv_cache_tokens"] for r in rows if r["kv_cache_tokens"]), None), "max_model_len": pr.get("max_model_len"), "max_num_seqs": pr.get("max_num_seqs"), "gpu_memory_utilization": pr.get("gpu_memory_utilization"), "run": name}
    wq = json.loads(WQ.read_text())
    SPEC = {"bf16": {"wkey": "bf16", "label": ["KV full precision (auto)", "KV 全精度（auto）"], "kvd": "auto", "weights": "bf16 (not quantized)", "title": "KV cache type, bf16 weights"},
            "nvfp4": {"wkey": "nvfp4", "label": ["NVFP4 KV cache", "NVFP4 KV cache"], "kvd": "nvfp4", "weights": "NVFP4 (nvidia/Gemma-4-26B-A4B-NVFP4)", "title": "KV cache type, NVFP4 weights"}}
    families = []
    for f, sp in SPEC.items():
        if f not in fam:
            continue
        w = next((x for x in wq["weights"] if x["key"] == sp["wkey"]), None)
        keep = {(r["np"], r["input"], r["output"]) for r in fam[f]["rows"]}
        fp8_rows = [r for r in (w["rows"] if w else []) if (r["np"], r["input"], r["output"]) in keep]
        d = fam[f]
        families.append({"weights_key": sp["wkey"], "weights": sp["weights"], "title": sp["title"], "kv_types": [
            {"key": "fp8", "label": ["KV fp8", "KV fp8"], "kv_cache_dtype": "fp8", "rows": fp8_rows, "servers": ({k: {"kv_cache_tokens": v.get("kv_cache_tokens")} for k, v in ((w or {}).get("sets") or {}).items()} or ({"ryan": {"kv_cache_tokens": w["kv_cache_tokens"]}} if w and w.get("kv_cache_tokens") else {}))},
            {"key": sp["kvd"], "label": sp["label"], "kv_cache_dtype": sp["kvd"], "rows": sorted(d["rows"], key=lambda r: (r["input"], r["np"], r["output"])), "servers": d["servers"], "extra_vllm_args": d["params"].get("extra_vllm_args"), "gpu_memory_utilization": d["params"].get("gpu_memory_utilization")}]})
    data = {"machine": "GB10", "framework": "vLLM", "test": "KV cache type, Gemma 4 26B MoE, long context",
            "protocol": {"nps": [1, 3, 5], "inputs": [8192, 65536, 131072], "outputs": [256, 512], "repeats": 1},
            "generated_at": datetime.datetime.now().isoformat(timespec="seconds"),
            "note": "Cases are always sent, never skipped from a KV estimate; a case above the KV capacity is marked kv_tight and shows what vLLM really did (queued). Each family compares one weights precision with KV fp8 against the other KV type.",
            "kv_types": families[0]["kv_types"] if families else [], "families": families}
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
    print("wrote", OUT.name, {f["weights_key"] + ":" + k["key"]: (len(k["rows"]), sum(1 for r in k["rows"] if r["status"] == "PASS")) for f in families for k in f["kv_types"]})


if __name__ == "__main__":
    main()
