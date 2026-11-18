#!/usr/bin/env python3
"""AISO platform runner for NVIDIA GB10 (vLLM, Gemma 4 26B A4B, fp8 KV cache). Owned by the platform: copied to the machine by the executor, verified by sha256, started there.

GB10 has ONE 128 GB pool shared by CPU and GPU, and other services live on the same box. The run refuses to start when:
  - another GB10 benchmark (longctx.py) or a GB10 vLLM container (sb-gb10-*, aiso_platform_gb10_*) is running, or
  - less than MIN_FREE_GB of memory is available (other services up): the operator frees the memory first; this runner never stops other services.
It writes ONLY into its own folder  ~/aiso_platform_runs/platform_runs/<smoke|standard>_<stamp>/ .

One vLLM container per model (127.0.0.1 only, removed at the end, also on SIGTERM from the platform's Stop). Requests go to /v1/completions as token ids
(random, seeded), so every input has exactly the asked length; ignore_eos + min_tokens make every answer exactly `output` tokens. NP requests start together.
  TTFT = first streamed token - request start;  TPOT = (last token - first token) / (output - 1);  agg = all output tokens / (last done - first start)

Usage:  gb10_platform_smoke.py --models all [--np 1 --input 4096 --output 1024]                          smoke: one case per model
        gb10_platform_smoke.py --mode standard --models all --inputs 4096,32768 --nps 1,5 --repeats 1 --output 1024
Progress lines (the platform reads them):  LOADING: <model> | vllm/<model> NP=<n> input=<i> R=<r> PASS|FAIL agg=<tok/s> ttft_ms=<ms> tpot_ms=<ms>
                                           SMOKE_STATUS: {...} | STANDARD_PLAN: {...} | STANDARD_STATUS: {...}
"""
import argparse
import hashlib
import json
import os
import random
import re
import signal
import subprocess
import sys
import threading
import time
import urllib.request
from datetime import datetime
from pathlib import Path

MODELS = {"gemma26": {"repo": "google/gemma-4-26B-A4B-it", "served": "gemma4-26b"}}
IMAGE = "lmcache/vllm-openai:nightly-2026-11-02"
HF = os.environ.get("GB10_HF_DIR") or str(Path.home() / "gb10_models" / "hf")      # HF cache dir (set by the platform from its local config)
PORT = 18091
UTIL = "0.70"
MIN_FREE_GB = 60
NP_MAX, IN_MIN, IN_MAX, OUT_MIN, OUT_MAX = 5, 128, 131072, 16, 1024
MAX_CASES = 120
CASE_LIMIT_S = 1800
READY_LIMIT_S = 900
NP, INPUT, OUTPUT = 1, 4096, 1024
ROOT = Path.home() / "aiso_platform_runs"
CONTAINER = None


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def atomic_json(path, value):
    tmp = Path(str(path) + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=1) + "\n")
    os.replace(tmp, path)


def ints(text, lo, hi, most=4):
    v = [int(x) for x in str(text).split(",") if x.strip()]
    assert v and len(v) <= most and len(set(v)) == len(v) and all(lo <= x <= hi for x in v), "parameter outside the allowed range"
    return v


def free_gb():
    for line in open("/proc/meminfo"):
        if line.startswith("MemAvailable:"):
            return int(line.split()[1]) // 1048576
    return 0


def preflight():
    p = subprocess.run("pgrep -af 'longctx\\.py (run|smoke)' | grep -v pgrep | wc -l", shell=True, capture_output=True, text=True)
    if p.stdout.strip() not in ("", "0"):
        raise RuntimeError("another GB10 benchmark is running - not started")
    names = subprocess.run(["docker", "ps", "--format", "{{.Names}}"], capture_output=True, text=True, timeout=30).stdout.split()
    held = [n for n in names if n.startswith(("sb-gb10-", "aiso_platform_gb10_"))]
    if held:
        raise RuntimeError(f"GB10 vLLM container already running ({', '.join(held)}) - not started")
    free = free_gb()
    if free < MIN_FREE_GB:
        raise RuntimeError(f"only {free} GB free on GB10 (needs {MIN_FREE_GB}; other services are using the memory) - not started")


def start_server(model, name, max_len, max_seqs, log_path):
    c = MODELS[model]
    cmd = ["docker", "run", "-d", "--init", "--name", name, "--gpus", "all", "--ipc", "host", "--network", "host",
           "-v", f"{HF}:/hf:ro", "-e", "HF_HOME=/hf", "-e", "HF_HUB_OFFLINE=1", "--entrypoint", "/opt/venv/bin/vllm", IMAGE,
           "serve", c["repo"], "--served-model-name", c["served"], "--host", "127.0.0.1", "--port", str(PORT),
           "--max-model-len", str(max_len), "--max-num-seqs", str(max_seqs), "--kv-cache-dtype", "fp8", "--gpu-memory-utilization", UTIL,
           "--no-enable-prefix-caching", "--enable-chunked-prefill", "--max-num-batched-tokens", "8192", "--enforce-eager", "--moe-backend", "triton"]
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if p.returncode != 0:
        raise RuntimeError("docker run failed: " + (p.stderr or p.stdout).strip()[-200:])
    t0 = time.time()
    while time.time() - t0 < READY_LIMIT_S:
        try:
            if urllib.request.urlopen(f"http://127.0.0.1:{PORT}/v1/models", timeout=3).status == 200:
                return
        except Exception:
            pass
        st = subprocess.run(["docker", "inspect", "-f", "{{.State.Running}}", name], capture_output=True, text=True).stdout.strip()
        if st != "true":
            break
        time.sleep(5)
    Path(log_path).write_text(subprocess.run(["docker", "logs", "--tail", "200", name], capture_output=True, text=True).stdout)
    raise RuntimeError("vLLM server did not become ready (see server.log)")


def kv_tokens(name):
    """KV cache size vLLM reported at start ("GPU KV cache size: N tokens"); None when the line is missing."""
    out = subprocess.run(["docker", "logs", name], capture_output=True, text=True)
    m = re.findall(r"GPU KV cache size:\s*([\d,]+)\s*tokens", (out.stdout or "") + (out.stderr or ""))
    return int(m[-1].replace(",", "")) if m else None


def save_server_log(name, path):
    p = subprocess.run(["docker", "logs", name], capture_output=True, text=True)
    Path(path).write_text((p.stdout or "")[-200000:] + (p.stderr or "")[-200000:])


def remove(name):
    if name:
        subprocess.run(["docker", "rm", "-f", name], capture_output=True, timeout=60)


def one_request(model, ids, out, rec):
    body = json.dumps({"model": MODELS[model]["served"], "prompt": ids, "max_tokens": out, "min_tokens": out, "ignore_eos": True,
                       "temperature": 0, "stream": True, "stream_options": {"include_usage": True}}).encode()
    req = urllib.request.Request(f"http://127.0.0.1:{PORT}/v1/completions", data=body, headers={"Content-Type": "application/json"})
    rec["start"] = time.time()
    try:
        with urllib.request.urlopen(req, timeout=CASE_LIMIT_S) as r:
            for raw in r:
                line = raw.decode(errors="replace").strip()
                if not line.startswith("data:") or line == "data: [DONE]":
                    continue
                d = json.loads(line[5:])
                if d.get("choices") and rec.get("first") is None:
                    rec["first"] = time.time()
                if d.get("usage"):
                    rec["tokens"] = d["usage"].get("completion_tokens")
        rec["done"] = time.time()
        rec["ok"] = rec.get("first") is not None and rec.get("tokens") == out
        if not rec["ok"]:
            rec["error"] = f"got {rec.get('tokens')} of {out} output tokens"
    except Exception as exc:
        rec["ok"], rec["error"] = False, str(exc)[:200]


def run_case(model, np_, inp, out, rep, mdir, kv=None):
    need = np_ * (inp + out)
    tight = kv is not None and need > kv      # still sent: vLLM queues / preempts, and the measured result is what gets reported
    if tight:
        print(f"KV_TIGHT NP={np_} input={inp}: {np_} x {inp + out} = {need} tokens > KV cache {kv} tokens, sending anyway", flush=True)
    rng = random.Random(np_ * 1_000_003 + inp * 31 + out * 7 + rep)
    prompts = [[rng.randrange(1000, 200000) for _ in range(inp)] for _ in range(np_)]
    recs = [{} for _ in range(np_)]
    threads = [threading.Thread(target=one_request, args=(model, prompts[i], out, recs[i])) for i in range(np_)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    ok = all(r.get("ok") for r in recs)
    agg = ttft = tpot = 0.0
    if ok:
        agg = sum(r["tokens"] for r in recs) / (max(r["done"] for r in recs) - min(r["start"] for r in recs))
        ttft = sum(r["first"] - r["start"] for r in recs) / np_ * 1000
        tpot = sum((r["done"] - r["first"]) / max(1, out - 1) for r in recs) / np_ * 1000
    rows = [{"request": i + 1, "ok": bool(r.get("ok")), "error": r.get("error", ""), "ttft_s": round(r["first"] - r["start"], 4) if r.get("first") else None,
             "tpot_ms": round((r["done"] - r["first"]) / max(1, out - 1) * 1000, 3) if r.get("first") and r.get("done") else None,
             "e2e_s": round(r["done"] - r["start"], 3) if r.get("done") else None, "output_tokens": r.get("tokens")} for i, r in enumerate(recs)]
    atomic_json(mdir / f"case_np{np_}_in{inp}_r{rep}.json", {"np": np_, "input": inp, "output": out, "repeat": rep, "ok": ok, "aggregate_tps": agg, "ttft_ms": ttft, "tpot_ms": tpot,
                                                            "kv_cache_tokens": kv, "kv_needed_tokens": need, "kv_tight": tight, "requests": rows})
    err = next((r.get("error") for r in recs if r.get("error")), "")
    line = f"vllm/{model} NP={np_} input={inp} R={rep} {'PASS' if ok else 'FAIL'} agg={agg:.2f} ttft_ms={ttft:.2f} tpot_ms={tpot:.2f}"
    note = f" ({err[:120]})" if err and not ok else ""
    note += f" (KV tight: {need} > {kv} tokens)" if tight else ""
    print(line + note, flush=True)
    return ok, agg, ttft, tpot


def max_len_for(inputs, out):
    need = max(inputs) + out
    return ((need + 1023) // 1024) * 1024


def host(models):
    global CONTAINER
    run_id = "smoke_" + datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = ROOT / "platform_runs" / run_id
    dest.mkdir(parents=True)
    manifest = {"run_id": run_id, "kind": "smoke", "scope": "SMOKE_ONLY_NOT_FORMAL", "machine": "GB10", "framework": "vLLM", "image": IMAGE, "kv_cache_dtype": "fp8",
                "gpu_memory_utilization": float(UTIL), "models": models, "np": NP, "input_tokens": INPUT, "output_tokens": OUTPUT, "repeat": 1,
                "runner_sha256": sha256(__file__), "started_at": datetime.now().isoformat(timespec="seconds"), "results": {}}
    atomic_json(dest / "manifest.json", manifest)
    results = {}
    for model in models:
        print(f"LOADING: {model}", flush=True)
        status, agg, ttft, tpot = "FAIL", None, None, None
        mdir = dest / model
        mdir.mkdir()
        name = f"aiso_platform_gb10_{run_id}"
        try:
            preflight()
            CONTAINER = name
            start_server(model, name, max_len_for([INPUT], OUTPUT), NP, mdir / "server.log")
            kv = kv_tokens(name)
            print(f"KV cache capacity: {kv} tokens", flush=True)
            manifest["kv_cache_tokens"] = kv
            ok, agg, ttft, tpot = run_case(model, NP, INPUT, OUTPUT, 1, mdir, kv)
            status = "PASS" if ok else "FAIL"
        except Exception as exc:
            print(f"vllm/{model} NP={NP} input={INPUT} R=1 FAIL agg=0 ({str(exc)[:120]})", flush=True)
        finally:
            save_server_log(name, mdir / "server.log") if CONTAINER else None
            remove(CONTAINER)
            CONTAINER = None
        results[model] = status
        manifest["results"][model] = {"status": status, "aggregate_tps": agg, "ttft_s": round(ttft / 1000, 4) if ttft else None, "tpot_ms": round(tpot, 2) if tpot else None}
        atomic_json(dest / "manifest.json", manifest)
    manifest["finished_at"] = datetime.now().isoformat(timespec="seconds")
    atomic_json(dest / "manifest.json", manifest)
    print("SMOKE_STATUS: " + json.dumps(results), flush=True)
    return 0 if all(v == "PASS" for v in results.values()) else 1


def host_standard(models, inputs, nps, repeats):
    global CONTAINER
    run_id = "standard_" + datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = ROOT / "platform_runs" / run_id
    dest.mkdir(parents=True)
    total = len(models) * len(inputs) * len(nps) * repeats
    assert total <= MAX_CASES, f"too many cases ({total} > {MAX_CASES})"
    manifest = {"run_id": run_id, "kind": "standard", "scope": "PLATFORM_STANDARD_NOT_INGESTED", "machine": "GB10", "framework": "vLLM", "image": IMAGE, "kv_cache_dtype": "fp8",
                "gpu_memory_utilization": float(UTIL), "models": models, "inputs": inputs, "nps": nps, "repeats": repeats, "output_tokens": OUTPUT,
                "runner_sha256": sha256(__file__), "started_at": datetime.now().isoformat(timespec="seconds"), "results": {}, "cases": []}
    atomic_json(dest / "manifest.json", manifest)
    print("STANDARD_PLAN: " + json.dumps({"models": models, "inputs": inputs, "nps": nps, "repeats": repeats, "cases": total}), flush=True)
    summary = {}
    for model in models:
        print(f"LOADING: {model}", flush=True)
        summary[model] = {"pass": 0, "fail": 0}
        mdir = dest / model
        mdir.mkdir()
        name = f"aiso_platform_gb10_{run_id}"
        try:
            preflight()
            CONTAINER = name
            start_server(model, name, max_len_for(inputs, OUTPUT), max(nps), mdir / "server.log")
            kv = kv_tokens(name)
            print(f"KV cache capacity: {kv} tokens", flush=True)
            manifest["kv_cache_tokens"] = kv
            for np_ in nps:
                for inp in inputs:
                    for rep in range(1, repeats + 1):
                        ok, agg, ttft, tpot = run_case(model, np_, inp, OUTPUT, rep, mdir, kv)
                        summary[model]["pass" if ok else "fail"] += 1
                        manifest["cases"].append({"model": model, "np": np_, "input": inp, "repeat": rep, "status": "PASS" if ok else "FAIL",
                                                  "aggregate_tps": round(agg, 3), "ttft_ms": round(ttft, 2), "tpot_ms": round(tpot, 3)})
                        atomic_json(dest / "manifest.json", manifest)
        except Exception as exc:
            print(f"vllm/{model} NP={nps[0]} input={inputs[0]} R=1 FAIL agg=0 ({str(exc)[:120]})", flush=True)
        finally:
            save_server_log(name, mdir / "server.log") if CONTAINER else None
            remove(CONTAINER)
            CONTAINER = None
        missing = len(inputs) * len(nps) * repeats - summary[model]["pass"] - summary[model]["fail"]
        if missing > 0:      # cases that never ran count as failed, never as passed
            summary[model]["fail"] += missing
        manifest["results"][model] = summary[model]
        atomic_json(dest / "manifest.json", manifest)
    manifest["finished_at"] = datetime.now().isoformat(timespec="seconds")
    atomic_json(dest / "manifest.json", manifest)
    print("STANDARD_STATUS: " + json.dumps(summary), flush=True)
    return 0 if all(v["fail"] == 0 for v in summary.values()) else 1


def on_term(signum, frame):
    raise SystemExit("stopped from the platform")      # the finally blocks remove the container


def main():
    global NP, INPUT, OUTPUT
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", default="all")
    ap.add_argument("--np", type=int, default=NP)
    ap.add_argument("--input", type=int, default=INPUT)
    ap.add_argument("--output", type=int, default=OUTPUT)
    ap.add_argument("--mode", choices=("smoke", "standard"), default="smoke")
    ap.add_argument("--inputs", default="4096,8192,16384")
    ap.add_argument("--nps", default="1,2,4")
    ap.add_argument("--repeats", type=int, default=1)
    a = ap.parse_args()
    assert 1 <= a.np <= NP_MAX and IN_MIN <= a.input <= IN_MAX and OUT_MIN <= a.output <= OUT_MAX, "parameter outside the allowed range"
    NP, INPUT, OUTPUT = a.np, a.input, a.output
    models = list(MODELS) if a.models == "all" else [m for m in a.models.split(",") if m]
    assert models and all(m in MODELS for m in models), f"unknown model in {models}"
    signal.signal(signal.SIGTERM, on_term)
    if a.mode == "standard":
        inputs, nps = ints(a.inputs, IN_MIN, IN_MAX), ints(a.nps, 1, NP_MAX)
        assert 1 <= a.repeats <= 3, "parameter outside the allowed range"
        return host_standard(models, inputs, nps, a.repeats)
    return host(models)


if __name__ == "__main__":
    sys.exit(main())
