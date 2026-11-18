#!/usr/bin/env python3
"""AISO platform smoke runner for PRO6000 with llama.cpp (CUDA docker image already on the host). Owned by the platform: copied to the machine by the executor, verified by sha256, started there.

SMOKE ONLY (SMOKE_ONLY_NOT_FORMAL): NP parallel requests of ~Input tokens with Output tokens, 1 repeat. The host is shared: the run uses GPU 1 ONLY and refuses to start when GPU 1 is not free.
It writes ONLY into its own folder  ~/aiso_platform_runs_llamacpp/platform_runs/smoke_<stamp>/  - nothing of the machine's benchmark trees is touched, no model is downloaded.
Timing is the server's own (llama-server `timings`): TTFT = prompt processing time, TPOT = time per generated token (server-side basis).

Usage:  pro6000_llamacpp_smoke.py --models gemma26 [--np 1 --input 4096 --output 128]
Progress lines on stdout:  LOADING: <model> | llamacpp/<model> NP=<n> input=<i> R=1 PASS|FAIL agg=<tok/s> ttft_ms=<ms> tpot_ms=<ms> | SMOKE_STATUS: {...}
"""
import argparse
import concurrent.futures
import hashlib
import json
import os
import re
import signal
import subprocess
import sys
import time
import urllib.request
from datetime import datetime
from pathlib import Path

GPU = "1"
IMAGE = "ghcr.io/ggml-org/llama.cpp:server-cuda"      # the image the host team already uses for llama.cpp on this machine
MODELS = {   # GGUF files already on the host (read-only mount). Comparison quantizations (Q4_0 / Q4_K_M) are not on this host, so this id is BF16 and is labelled so.
    "gemma26": {"dir": str(Path.home() / "Desktop/TPI_AISO_NEW/models/gemma-4-26B-A4B-it-GGUF"), "file": "BF16/gemma-4-26B-A4B-it-BF16-00001-of-00002.gguf"},
}
NP, INPUT, OUTPUT = 1, 4096, 128
HOST_PORT = 18083
ROOT = Path.home() / "aiso_platform_runs_llamacpp"
PER_MODEL_LIMIT_S = 1800
FREE_MIB = 1024


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def atomic_json(path, value):
    tmp = Path(str(path) + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=1) + "\n")
    os.replace(tmp, path)


def gpu_used_mib():
    out = subprocess.run(["nvidia-smi", "-i", GPU, "--query-gpu=memory.used", "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=20).stdout.strip()
    return int(out.splitlines()[0])


def post(path, body, timeout):
    req = urllib.request.Request(f"http://127.0.0.1:{HOST_PORT}{path}", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read())


def prompt_ids(n):
    """~n token ids made from the server's own tokenizer: a fixed sentence repeated, cut to exactly n ids."""
    base = post("/tokenize", {"content": "Explain how a local language model processes a prompt, step by step. " * 400, "add_special": False}, 120)["tokens"]
    return (base * (n // len(base) + 1))[:n]


def summarise(replies, wall):
    """(ok, aggregate tok/s, mean TTFT ms, mean TPOT ms) from llama-server timings of the NP replies."""
    good = [r for r in replies if r and r.get("timings") and r["timings"].get("predicted_n", 0) > 0]
    if len(good) != len(replies) or not good:
        return False, 0.0, 0.0, 0.0
    tokens = sum(r["timings"]["predicted_n"] for r in good)
    return True, tokens / wall, sum(r["timings"]["prompt_ms"] for r in good) / len(good), sum(r["timings"]["predicted_per_token_ms"] for r in good) / len(good)


def on_term(signum, frame):
    raise SystemExit("stopped from the platform")      # the finally block removes the container


def host(models):
    run_id = "smoke_" + datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = ROOT / "platform_runs" / run_id
    dest.mkdir(parents=True)
    manifest = {"run_id": run_id, "kind": "smoke", "scope": "SMOKE_ONLY_NOT_FORMAL", "machine": "PRO6000", "framework": "llama.cpp (CUDA image)", "gpu": GPU, "models": models,
                "np": NP, "input_tokens": INPUT, "output_tokens": OUTPUT, "repeat": 1, "image": IMAGE, "runner_sha256": sha256(__file__),
                "started_at": datetime.now().isoformat(timespec="seconds"), "results": {}}
    atomic_json(dest / "manifest.json", manifest)
    results = {}
    for model in models:
        print(f"LOADING: {model}", flush=True)
        name = f"aiso_platform_smoke_{run_id}"
        status, agg, ttft_ms, tpot_ms = "FAIL", None, None, None
        try:
            used = gpu_used_mib()
            if used >= FREE_MIB:
                raise RuntimeError(f"GPU {GPU} is not free ({used} MiB used) - not started")
            mdir = dest / model
            mdir.mkdir()
            c = MODELS[model]
            ctx = NP * (INPUT + OUTPUT + 64)
            cmd = ["docker", "run", "-d", "--rm", "--name", name, "--gpus", "all", "-e", f"NVIDIA_VISIBLE_DEVICES={GPU}", "-e", f"CUDA_VISIBLE_DEVICES={GPU}", "--ipc=host",
                   "-p", f"127.0.0.1:{HOST_PORT}:8080", "-v", f"{c['dir']}:/models:ro", IMAGE,
                   "--model", f"/models/{c['file']}", "--host", "0.0.0.0", "--port", "8080", "--n-gpu-layers", "99", "--ctx-size", str(ctx), "--flash-attn", "on",
                   "--parallel", str(NP), "--batch-size", "1024", "--ubatch-size", "512", "--no-warmup"]
            subprocess.run(cmd, capture_output=True, text=True, timeout=120, check=True)
            t0, ready = time.time(), False
            while time.time() - t0 < 900 and not ready:
                try:
                    ready = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{HOST_PORT}/health", timeout=3).read()).get("status") == "ok"
                except Exception:
                    time.sleep(5)
            if not ready:
                raise TimeoutError("llama-server not ready after 900 s")
            ids = prompt_ids(INPUT)
            body = {"prompt": ids, "n_predict": OUTPUT, "temperature": 0, "cache_prompt": False, "ignore_eos": True, "stream": False}
            t1 = time.time()
            with concurrent.futures.ThreadPoolExecutor(max_workers=NP) as pool:
                replies = list(pool.map(lambda _: post("/completion", body, PER_MODEL_LIMIT_S), range(NP)))
            ok, agg, ttft_ms, tpot_ms = summarise(replies, time.time() - t1)
            atomic_json(mdir / "result.json", {"np": NP, "input_tokens": INPUT, "output_tokens": OUTPUT, "timings": [r.get("timings") for r in replies]})
            status = "PASS" if ok else "FAIL"
            print(f"llamacpp/{model} NP={NP} input={INPUT} R=1 {status} agg={agg:.2f} ttft_ms={ttft_ms:.2f} tpot_ms={tpot_ms:.2f}", flush=True)
        except Exception as exc:
            print(f"llamacpp/{model} NP={NP} input={INPUT} R=1 FAIL agg=0 ({str(exc)[:120]})", flush=True)
        finally:
            lg = subprocess.run(["docker", "logs", "--tail", "200", name], capture_output=True, text=True, timeout=60)
            try:
                (dest / model / "server.log").write_text((lg.stdout or "") + (lg.stderr or ""))
            except Exception:
                pass
            subprocess.run(["docker", "rm", "-f", name], capture_output=True, timeout=60)
        results[model] = status
        manifest["results"][model] = {"status": status, "aggregate_tps": agg, "ttft_s": round(ttft_ms / 1000, 4) if ttft_ms else None, "tpot_ms": tpot_ms}
        atomic_json(dest / "manifest.json", manifest)
    manifest["finished_at"] = datetime.now().isoformat(timespec="seconds")
    atomic_json(dest / "manifest.json", manifest)
    print("SMOKE_STATUS: " + json.dumps(results), flush=True)
    return 0 if all(v == "PASS" for v in results.values()) else 1


def main():
    global NP, INPUT, OUTPUT
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", default="all")
    ap.add_argument("--np", type=int, default=NP)
    ap.add_argument("--input", type=int, default=INPUT)
    ap.add_argument("--output", type=int, default=OUTPUT)
    a = ap.parse_args()
    assert 1 <= a.np <= 4 and 128 <= a.input <= 16000 and 16 <= a.output <= 1024, "parameter outside the allowed range"
    NP, INPUT, OUTPUT = a.np, a.input, a.output
    models = list(MODELS) if a.models == "all" else [m for m in a.models.split(",") if m]
    assert models and all(m in MODELS for m in models), f"unknown model in {models}"
    signal.signal(signal.SIGTERM, on_term)
    return host(models)


if __name__ == "__main__":
    sys.exit(main())
