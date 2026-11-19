#!/usr/bin/env python3
"""Export the GB10 "variants" dataset (MTP / QAT / NVFP4 KV combinations, Input 8K set) for the benchmark report and the MTP page.

Reads the machine READ-ONLY over ssh (GB10-key): every results folder whose name has one of the tags below (parameters.json + summary.csv + server.log).
For MTP runs the mean acceptance length and the draft acceptance rate are taken from vLLM's own `SpecDecoding metrics` lines in server.log.
Each variant names its baseline (same weights, MTP off / KV fp8 ...), so a report can quote differences. Nothing is estimated.
Writes data/benchmark-gb10/AISO_GB10_vLLM_gemma26_variants.json.
"""
import csv
import datetime
import io
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/benchmark-gb10/AISO_GB10_vLLM_gemma26_variants.json"
SSH = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "GB10-key"]
# tag in the results folder name -> (key, label, group, baseline key, note)
VARIANTS = [
    ("nvfp4kv_nat_in8k", "nvfp4kv_mtp_off", "NVFP4 weights + NVFP4 KV · MTP off", "MTP (natural-text prompts)", None, "Natural-text prompts (Python docs); the baseline of the MTP comparison."),
    ("nvfp4kv_mtp_nat_in8k", "nvfp4kv_mtp_on", "NVFP4 weights + NVFP4 KV · MTP on", "MTP (natural-text prompts)", "nvfp4kv_mtp_off", "gemma-4-26B-A4B-it-assistant, 3 draft tokens, same natural-text prompts as the baseline."),
    ("nvfp4kv_mtp_in8k", "nvfp4kv_mtp_repeat", "NVFP4 weights + NVFP4 KV · MTP on (repeated-block prompts)", "MTP (natural-text prompts)", "nvfp4kv_mtp_off", "OVER-STATES MTP: the prompt repeats one block, the output is repetitive and ~100% of draft tokens are accepted. Shown only to document the mistake."),
    ("qat_in8k", "qat", "QAT checkpoint · KV fp8", "QAT", "bf16", "google/gemma-4-26B-A4B-it-qat-q4_0-unquantized: unquantized weights, expected speed ~ bf16."),
    ("qat_nvfp4kv_in8k", "qat_nvfp4kv", "QAT checkpoint · NVFP4 KV", "QAT", "qat", "QAT weights with the NVFP4 KV cache (FlashInfer, text only)."),
    ("bf16_mtp_nat_in8k", "bf16_mtp", "bf16 weights · MTP on", "MTP (bf16 / QAT)", "bf16", "Baseline = bf16, KV fp8 (speed does not depend on the prompt without MTP)."),
    ("qat_mtp_nat_in8k", "qat_mtp", "QAT checkpoint · MTP on (QAT assistant)", "MTP (bf16 / QAT)", "qat", "google/gemma-4-26B-A4B-it-qat-q4_0-unquantized-assistant, 3 draft tokens."),
]
REMOTE = r'''cd ~/gb10_benchmark/results && for d in $(ls -d *nvfp4kv_nat_in8k_*/ *nvfp4kv_mtp_nat_in8k_*/ *nvfp4kv_mtp_in8k_*/ *qat_in8k_*/ *qat_nvfp4kv_in8k_*/ *bf16_mtp_nat_in8k_*/ *qat_mtp_nat_in8k_*/ 2>/dev/null); do d=${d%/}; echo "=== $d"; cat $d/parameters.json 2>/dev/null | python3 -c "import json,sys;d=json.load(sys.stdin);print('PARAMS '+json.dumps({k:d.get(k) for k in ('kv_cache_dtype','weights','gpu_memory_utilization','max_model_len','max_num_seqs','extra_vllm_args','model')}))"; echo "--- csv"; cat $d/summary.csv 2>/dev/null; echo "--- spec"; grep -E "SpecDecoding metrics" $d/server.log 2>/dev/null | sed -E "s/.*Mean acceptance length: ([0-9.]+).*Accepted: ([0-9]+) tokens, Drafted: ([0-9]+) tokens.*/SPEC \1 \2 \3/" | grep "^SPEC"; done; true'''


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
    p = subprocess.run(SSH + [REMOTE], capture_output=True, text=True, timeout=120)
    if p.returncode != 0 and not p.stdout:
        raise SystemExit("no answer from GB10: " + p.stderr[:200])
    found = {}
    for block in p.stdout.split("=== ")[1:]:
        name, _, rest = block.partition("\n")
        tag = next((v[0] for v in sorted(VARIANTS, key=lambda v: -len(v[0])) if f"_{v[0]}_" in name), None)
        if not tag:
            continue
        m = re.search(r"^PARAMS (.*)$", rest, re.M)
        pr = json.loads(m.group(1)) if m else {}
        csv_part, _, spec = rest.partition("--- csv\n")[2].partition("--- spec\n")
        rows = rows_of(csv_part)
        sp = [tuple(float(x) for x in l.split()[1:]) for l in spec.splitlines() if l.startswith("SPEC")]
        cur = found.get(tag)
        if cur is None or len(rows) >= len(cur["rows"]):
            found[tag] = {"rows": rows, "params": pr, "run": name, "spec": sp}
    variants = []
    for tag, key, label, group, base, note in VARIANTS:
        d = found.get(tag)
        if not d:
            continue
        v = {"key": key, "label": label, "group": group, "note": note, "baseline": base, "rows": d["rows"], "run": d["run"], "gpu_memory_utilization": d["params"].get("gpu_memory_utilization"),
             "kv_cache_dtype": d["params"].get("kv_cache_dtype"), "extra_vllm_args": d["params"].get("extra_vllm_args"),
             "servers": {"in8k": {"kv_cache_tokens": next((r["kv_cache_tokens"] for r in d["rows"] if r["kv_cache_tokens"]), None)}}, "attempts": 1}
        if d["spec"]:
            acc, dr = sum(s[1] for s in d["spec"]), sum(s[2] for s in d["spec"])
            v["mtp"] = {"mean_acceptance_length": round(sum(s[0] for s in d["spec"]) / len(d["spec"]), 2), "max_acceptance_length": 4.0, "draft_acceptance_rate": round(acc / dr, 3) if dr else None, "samples": len(d["spec"])}
        variants.append(v)
    data = {"machine": "GB10", "framework": "vLLM", "test": "MTP / QAT / NVFP4 KV variants, Gemma 4 26B MoE, Input 8K", "generated_at": datetime.datetime.now().isoformat(timespec="seconds"),
            "protocol": {"nps": [1, 3, 5], "inputs": [8192], "outputs": [256, 512], "repeats": 1}, "variants": variants}
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
    print("wrote", OUT.name, {v["key"]: (len(v["rows"]), sum(1 for r in v["rows"] if r["status"] == "PASS"), v.get("mtp", {}).get("draft_acceptance_rate")) for v in variants})


if __name__ == "__main__":
    main()
