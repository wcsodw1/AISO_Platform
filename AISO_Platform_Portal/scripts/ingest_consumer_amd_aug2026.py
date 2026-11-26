#!/usr/bin/env python3
"""Import the 2026-08-28 llama.cpp Vulkan results of the two consumer AMD laptops (ROG AI MAX 395, TUF AI MAX 392).

Source: the old AISO-Platform-UI/Consumer/AMD/... folders. They are read from a git commit (default HEAD), so this works
even when the working tree no longer has them. Nothing is estimated: every number is a source value, Decode TPS is 1000 / TPOT.
Writes data/benchmark-consumer-amd/AISO_{ROG395,TUF392}_llamacpp_Q4KM_20260828.json (read by stress-test-amd-consumer.js).
Usage: python3 scripts/ingest_consumer_amd_aug2026.py [git-ref]
"""
import csv
import hashlib
import io
import json
import re
import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
REPO = BASE.parent
OUT = BASE / "data" / "benchmark-consumer-amd"
REF = sys.argv[1] if len(sys.argv) > 1 else "HEAD"
ROOT = "AISO-Platform-UI/Consumer/AMD/"
MODELS = {"Gemma 4 26B A4B": ("gemma26", "Gemma 4 26B A4B"), "GPT-OSS 20B": ("gptoss20", "GPT-OSS 20B")}


def blob(path):
    data = subprocess.run(["git", "-C", str(REPO), "show", f"{REF}:{ROOT}{path}"], capture_output=True, check=True).stdout
    return data, hashlib.sha256(data).hexdigest()


def table(path):
    data, sha = blob(path)
    return list(csv.DictReader(io.StringIO(data.decode("utf-8-sig")))), sha


def f(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def model_files(hash_path, rows):
    """Model files that were really benchmarked: repository, file, quantization, size (bytes, GiB, GB), sha256 (checked against the summary)."""
    hashes, sha_h = table(hash_path)
    used = {r["ModelName"]: r["ModelSHA256"].upper() for r in rows}
    out = []
    for h in hashes:
        if h["ModelName"] not in used:
            continue
        key, name = MODELS[h["ModelName"]]
        q = re.search(r"(UD-)?(Q\d_K_[A-Z]|Q\d_\d|MXFP4|BF16|F16)", h["FileName"], re.I)
        size = int(h["SizeBytes"])
        out.append(dict(model=key, model_name=name, repository=h["Repository"], file=h["FileName"], quant=q.group(2).upper() if q else None, quant_variant="Unsloth Dynamic (UD)" if q and q.group(1) else None,
                        size_bytes=size, size_gib=round(size / 2 ** 30, 3), size_gb=round(size / 1e9, 2), sha256=h["SHA256"].upper(), sha256_matches_results=h["SHA256"].upper() == used[h["ModelName"]]))
    return out, sha_h


def build(key, label, folder, summary_path, trials_path, env_path, extra, hash_path):
    rows, sha_s = table(summary_path)
    files, sha_h = model_files(hash_path, rows)
    env = json.loads(blob(env_path)[0].decode("utf-8-sig"))
    trials, sha_t = ([], None)
    if trials_path:
        trials, sha_t = table(trials_path)
    runs, notes = [], []
    for r in rows:
        mk, mn = MODELS[r["ModelName"]]
        ttft, tpot, agg, norm = f(r["TTFT_ms"]) / 1000 if "TTFT_ms" in r else None, f(r["TPOT_ms_per_token"]), f(r["Throughput_Aggregate_tokens_per_s"]), f(r["Throughput_Normalized_tokens_per_s_per_user"])
        inp, out = int(r["InputTokens"]), int(r["OutputTokens"])
        run = dict(model=mk, model_name=mn, np=1, input=inp, output=out, context=int(r["ContextSize"]) if r.get("ContextSize") else None,
                   ttft_s=ttft, tpot_ms=tpot, aggregate_tps=agg, normalized_tps=norm, decode_only_tps=1000 / tpot if tpot else None, trials=int(r["Trials"]) if r.get("Trials") else 3)
        if ttft is not None and tpot and agg:
            calc = out / (ttft + (out - 1) * tpot / 1000)
            if abs(calc / agg - 1) > 0.02:
                run["consistency_note"] = f"reported Aggregate {agg:.2f} vs formula {calc:.2f} ({100 * (calc / agg - 1):+.1f}%)"
                notes.append(f"{mk} {inp}: {run['consistency_note']}")
        t = [x for x in trials if x.get("ModelName") == r["ModelName"] and int(x["InputTokens"]) == inp and x.get("TTFT_ms")]
        if t:
            run["repeats"] = dict(ttft_s=[f(x["TTFT_ms"]) / 1000 for x in t], tpot_ms=[f(x["TPOT_ms_per_token"]) for x in t], aggregate_tps=[f(x["Throughput_Aggregate_tokens_per_s"]) for x in t])
        runs.append(run)
    if not (env.get("AmdDriverVersion") or env.get("DriverVersion")):      # the 392 environment.json has no driver line; the V5 comparison sheet does
        cmp_rows, _ = table("AIMAX392_vs_AIMAX395_V5.csv")
        if cmp_rows and cmp_rows[0].get("ReferenceDriver"):
            env["AmdDriverVersion"] = cmp_rows[0]["ReferenceDriver"]
    profile = dict(framework="llama.cpp", backend="Vulkan", build=str(env.get("LlamaCppVersion", "")).splitlines()[0], os=env.get("OperatingSystem"),
                   threads=env.get("BenchmarkThreads"), gpu_layers=env.get("GPUOffloadLayers"), batch=env.get("BatchSize"), ubatch=env.get("UBatchSize"),
                   repeats=env.get("Repetitions"), output_tokens=env.get("GeneratedTokens"), parallel_slots=env.get("ParallelSlots"),
                   context_policy=env.get("ContextSize"), weights="Q4_K_M", kv_cache="f16 (llama.cpp default, not set)", prompt_cache="disabled", seed=env.get("RandomSeed"),
                   power_plan=env.get("ActivePowerPlan"), amd_driver=env.get("AmdDriverVersion") or env.get("DriverVersion"), vulkan_device=(env.get("LlamaDevices") or "").replace("\r", "").splitlines()[-1].strip() if env.get("LlamaDevices") else None,
                   captured_at=env.get("CapturedAt"), computer=f'{env.get("Manufacturer")} {env.get("Model")}', cpu=(env.get("CPU") or "").strip(), os_visible_ram_gib=env.get("TotalPhysicalMemoryGiB"))
    return dict(dataset=f"AISO_{key.upper()}_llamacpp_Q4KM_20260828", machine=key, machine_label=label, evidence_until="2026-08-28", runs=runs, models=files, profile=profile,
                comparability=dict(level="not_comparable", text="Windows laptop, batch 2048, Output 300, NP1 only, other models than the AISO1 / B60 / B70 stress test. Not comparable with those pages; ROG 395 vs TUF 392 is like for like except threads and power plan (see profile)."),
                consistency_notes=notes, not_run=["NP2 and above", "Gemma 4 31B, Laguna XS 2.1, Nemotron 3.5", "vLLM, SGLang"],
                source=dict(git_ref=REF, folder=ROOT + folder, summary=dict(path=summary_path, sha256=sha_s), trials=dict(path=trials_path, sha256=sha_t) if trials_path else None, environment=env_path, model_hashes=dict(path=hash_path, sha256=sha_h), note=extra))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = [("rog395", "ROG AI MAX 395", "ASUS-ROG-AI-MAX395/", "ASUS-ROG-AI-MAX395/Benchmark_Result/Public/benchmark_summary.csv", None,
             "ASUS-ROG-AI-MAX395/Benchmark_Result/Public/environment.json", "ASUS-ROG-AI-MAX395/Benchmark_Result/OneNP/model_hashes.csv", "Means of 3 trials from benchmark_summary.csv; per-trial Gemma values were not kept (only gpt-oss-20b server trials exist, a different measurement)."),
            ("tuf392", "TUF AI MAX 392", "ASUS-TUF-GAMING-AI-MAX392/", "ASUS-TUF-GAMING-AI-MAX392/Benchmark_Result/Public/benchmark_summary.csv", "ASUS-TUF-GAMING-AI-MAX392/Benchmark_Result/benchmark_trials.csv",
             "ASUS-TUF-GAMING-AI-MAX392/Benchmark_Result/environment.json", "ASUS-TUF-GAMING-AI-MAX392/Benchmark_Result/OneNP/20260828_094137/model_hashes.csv", "Means from benchmark_summary.csv; the 3 trials per case come from benchmark_trials.csv.")]
    for key, label, folder, s, t, e, hp, note in jobs:
        d = build(key, label, folder, s, t, e, note, hp)
        path = OUT / f"{d['dataset']}.json"
        path.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
        print(f"wrote {path.relative_to(BASE)}: {len(d['runs'])} runs, {len(d['consistency_notes'])} consistency notes")


if __name__ == "__main__":
    main()
