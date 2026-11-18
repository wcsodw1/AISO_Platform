#!/usr/bin/env python3
"""AISO platform smoke runner for PRO6000 (vLLM in the aiDAPTIV image, "Without aiDAPTIV" mode). Owned by the platform: copied to the machine by the executor, verified by sha256, started there.

ONE request per model: NP1, Input 4000 (~4K), Output 200, 1 repeat (SMOKE_ONLY_NOT_FORMAL). The host is shared: the run uses GPU 1 ONLY and refuses to start when GPU 1 is not free.
It writes ONLY into its own folder  ~/aiso_platform_runs/platform_runs/smoke_<stamp>/  - the machine's benchmark tree (results/, logs/) is never touched.

Two modes of the same file:
  host   (default)  checks GPU 1, starts the aiDAPTIV container for GPU 1, follows it, prints the progress lines, removes the container
  --inner           runs inside the container: starts the machine's own vllm_api_server.py with the machine's own flags for the model, sends one request with the machine's own benchmark_serving.py

Usage:  pro6000_platform_smoke.py --models GPT-OSS-20B        (or --models all)      smoke test (default)
        pro6000_platform_smoke.py --mode standard --models GPT-OSS-20B --inputs 4096,8192,16384 --nps 1,2,4 --repeats 3 --output 1024      standard test: every Input x NP x Repeat on ONE server start
Standard progress lines:  STANDARD_PLAN: {...} | vllm/<model> NP=<n> input=<i> R=<r> PASS|FAIL agg=<tok/s> ttft_ms=<ms> tpot_ms=<ms> | STANDARD_STATUS: {...}
Progress lines on stdout (the platform reads them):  LOADING: <model> | vllm/<model> NP=1 input=4000 R=1 PASS|FAIL agg=<tok/s> ttft_ms=<ms> tpot_ms=<ms> | SMOKE_STATUS: {...}
"""
import argparse
import ast
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
MODELS = {   # one-GPU models only; flags copied from general/configs/models.yaml of the machine (tensor_parallel_size 1)
    "GPT-OSS-20B": {"path": "/app/models/GPT-OSS-20B", "max_len": 20000, "util": 0.85, "kv_dir": "gpt-oss-20b", "port": 8001},
}
NP, INPUT, OUTPUT, REPEAT = 1, 4000, 200, 1
CASE_LIMIT_S = 2400
MAX_CASES = 120
PER_MODEL_LIMIT_S = 1800
FREE_MIB = 1024
IMAGE = "aidaptiv:vNXUN_3_03_AA"
ROOT = Path.home() / "aiso_platform_runs"
BENCH = "/app/benchmark/general/benchmark_serving.py"
SERVER_DIR = "/home/root/aiDAPTIV2/script"


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def atomic_json(path, value):
    tmp = Path(str(path) + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=1) + "\n")
    os.replace(tmp, path)


def gpu_used_mib():
    out = subprocess.run(["nvidia-smi", "-i", GPU, "--query-gpu=memory.used", "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=20).stdout.strip()
    return int(out.splitlines()[0])


def parse_result(text, np=None):
    """benchmark_serving.py prints a text table (or, in older wrappers, one dict per run); returns (ok, output tok/s, mean TTFT ms, mean TPOT ms)."""
    def num(label):
        m = re.search(re.escape(label) + r"\s*:?\s*([\d.]+)", text)
        return float(m.group(1)) if m else None
    np = NP if np is None else np
    ok_n, agg, ttft, tpot = num("Successful requests"), num("Output token throughput (tok/s)"), num("Mean TTFT (ms)"), num("Mean TPOT (ms)")
    if ok_n is not None and agg is not None and ttft is not None:
        return int(ok_n) == np and agg > 0, agg, ttft, tpot or 0.0
    for line in text.splitlines():          # dict form
        if line.startswith("{"):
            d = ast.literal_eval(line)
            return int(d.get("Successful requests", 0)) == np, float(d.get("Mean Output throughput (tok/s)", 0)), float(d.get("Mean TTFT (ms)", 0)), float(d.get("Mean TPOT (ms)", 0))
    return False, 0.0, 0.0, 0.0


def ints(text, lo, hi, most=4):
    v = [int(x) for x in str(text).split(",") if x.strip()]
    assert v and len(v) <= most and len(set(v)) == len(v) and all(lo <= x <= hi for x in v), "parameter outside the allowed range"
    return v


def bench_cmd(c, np_, inp, out, rep=1):
    return ["python3", BENCH, "--backend", "vllm", "--model", c["path"], "--tokenizer", c["path"], "--endpoint", "/v1/completions", "--dataset-name", "random",
            "--seed", str(np_ * 3 + inp + out + rep), "--num-prompts", str(np_), "--max-concurrency", str(np_), "--request-rate", str(np_),
            "--random-input-len", str(inp), "--random-output-len", str(out), "--ignore-eos", "--init-different-prompt", "--host", "127.0.0.1", "--port", str(c["port"])]


def inner_standard(model, inputs, nps, repeats):
    """Inside the container: ONE vLLM server start, then every NP x Input x Repeat with the machine's own benchmark_serving.py."""
    c = MODELS[model]
    cmd = ["python3", "vllm_api_server.py", "--model", c["path"], "--tensor-parallel-size", "1", "--max-model-len", str(c["max_len"]),
           "--gpu-memory-utilization", str(c["util"]), "--enable-chunked-prefill", "--nvme-path", f"/mnt/nvme0/{c['kv_dir']}",
           "--dram-kv-offload-gb", "0", "--disable-gpu-reuse", "--ssd-kv-offload-gb", "500", "--no-resume-kv-cache", "--disable-kv-cache-offload", "--port", str(c["port"])]
    env = dict(os.environ, VLLM_USE_V1="1", VLLM_WORKER_MULTIPROC_METHOD="spawn")
    server = subprocess.Popen(cmd, cwd=SERVER_DIR, env=env, stdout=open("/out/server.log", "w"), stderr=subprocess.STDOUT)
    fails = 0
    try:
        t0, ready = time.time(), False
        while time.time() - t0 < 900 and not ready:
            if server.poll() is not None:
                break
            try:
                ready = urllib.request.urlopen(f"http://127.0.0.1:{c['port']}/v1/models", timeout=3).status == 200
            except Exception:
                time.sleep(5)
        for np_ in nps:
            for inp in inputs:
                for rep in range(1, repeats + 1):
                    ok, agg, ttft, tpot = False, 0.0, 0.0, 0.0
                    if ready:
                        try:
                            p = subprocess.run(bench_cmd(c, np_, inp, OUTPUT, rep), capture_output=True, text=True, timeout=CASE_LIMIT_S)
                            Path(f"/out/bench_np{np_}_in{inp}_r{rep}.txt").write_text(p.stdout + "\n" + p.stderr[-2000:])
                            ok, agg, ttft, tpot = parse_result(p.stdout, np_)
                        except Exception:
                            pass
                    fails += 0 if ok else 1
                    print(f"vllm/{model} NP={np_} input={inp} R={rep} {'PASS' if ok else 'FAIL'} agg={agg:.2f} ttft_ms={ttft:.2f} tpot_ms={tpot:.2f}", flush=True)
        return 0 if fails == 0 else 1
    finally:
        server.terminate()
        try:
            server.wait(timeout=60)
        except Exception:
            server.kill()


def inner(model):
    """Inside the container (GPU 1 only)."""
    c = MODELS[model]
    cmd = ["python3", "vllm_api_server.py", "--model", c["path"], "--tensor-parallel-size", "1", "--max-model-len", str(c["max_len"]),
           "--gpu-memory-utilization", str(c["util"]), "--enable-chunked-prefill", "--nvme-path", f"/mnt/nvme0/{c['kv_dir']}",
           "--dram-kv-offload-gb", "0", "--disable-gpu-reuse", "--ssd-kv-offload-gb", "500", "--no-resume-kv-cache", "--disable-kv-cache-offload", "--port", str(c["port"])]
    env = dict(os.environ, VLLM_USE_V1="1", VLLM_WORKER_MULTIPROC_METHOD="spawn")
    log = open("/out/server.log", "w")
    server = subprocess.Popen(cmd, cwd=SERVER_DIR, env=env, stdout=log, stderr=subprocess.STDOUT)
    try:
        url = f"http://127.0.0.1:{c['port']}/v1/models"
        t0 = time.time()
        while time.time() - t0 < 900:
            if server.poll() is not None:
                raise RuntimeError(f"vLLM server exited early (code {server.returncode}); see server.log")
            try:
                if urllib.request.urlopen(url, timeout=3).status == 200:
                    break
            except Exception:
                time.sleep(5)
        else:
            raise TimeoutError("vLLM server not ready after 900 s")
        bench = ["python3", BENCH, "--backend", "vllm", "--model", c["path"], "--tokenizer", c["path"], "--endpoint", "/v1/completions", "--dataset-name", "random",
                 "--seed", str(NP * 3 + INPUT + OUTPUT), "--num-prompts", str(NP), "--max-concurrency", str(NP), "--request-rate", str(NP),
                 "--random-input-len", str(INPUT), "--random-output-len", str(OUTPUT), "--ignore-eos", "--init-different-prompt", "--host", "127.0.0.1", "--port", str(c["port"])]
        p = subprocess.run(bench, capture_output=True, text=True, timeout=PER_MODEL_LIMIT_S)
        Path("/out/bench.txt").write_text(p.stdout + "\n" + p.stderr[-2000:])
        ok, agg, ttft, tpot = parse_result(p.stdout)
        print(f"vllm/{model} NP={NP} input={INPUT} R=1 {'PASS' if ok else 'FAIL'} agg={agg:.2f} ttft_ms={ttft:.2f} tpot_ms={tpot:.2f}", flush=True)
        return 0 if ok else 1
    finally:
        server.terminate()
        try:
            server.wait(timeout=60)
        except Exception:
            server.kill()


def host(models):
    run_id = "smoke_" + datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = ROOT / "platform_runs" / run_id
    dest.mkdir(parents=True)
    manifest = {"run_id": run_id, "kind": "smoke", "scope": "SMOKE_ONLY_NOT_FORMAL", "machine": "PRO6000", "framework": "vLLM (aiDAPTIV image, Without aiDAPTIV)", "gpu": GPU,
                "models": models, "np": NP, "input_tokens": INPUT, "output_tokens": OUTPUT, "repeat": REPEAT, "image": IMAGE,
                "runner_sha256": sha256(__file__), "started_at": datetime.now().isoformat(timespec="seconds"), "results": {}}
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
            if (dest / "inner").exists() is False:
                (dest / "inner").mkdir()
            mdir = dest / model
            mdir.mkdir()
            c = MODELS[model]
            Path(f"/mnt/nvme0/{c['kv_dir']}").mkdir(parents=True, exist_ok=True)
            cmd = ["docker", "run", "--rm", "--name", name, "--gpus", "all", "-e", f"NVIDIA_VISIBLE_DEVICES={GPU}", "-e", f"CUDA_VISIBLE_DEVICES={GPU}",
                   "--ipc=host", "--ulimit", "memlock=-1", "--ulimit", "stack=67108864",
                   "-v", f"{Path.home()}/Desktop/TPI_AISO_NEW:/app", "-v", "/mnt/nvme0:/mnt/nvme0", "-v", f"{mdir}:/out", "-v", f"{os.path.abspath(__file__)}:/runner.py:ro",
                   IMAGE, "python3", "/runner.py", "--inner", "--models", model, "--np", str(NP), "--input", str(INPUT), "--output", str(OUTPUT)]
            p = subprocess.run(cmd, capture_output=True, text=True, timeout=PER_MODEL_LIMIT_S + 1200)
            (mdir / "container.log").write_text((p.stdout or "") + "\n" + (p.stderr or "")[-4000:])
            line = next((l for l in (p.stdout or "").splitlines() if l.startswith(f"vllm/{model} ")), None)
            if line:
                print(line, flush=True)
                status = "PASS" if " PASS " in line else "FAIL"
                m = re.search(r"agg=([\d.]+)", line)
                agg = float(m.group(1)) if m else None
                m = re.search(r"ttft_ms=([\d.]+)", line); ttft_ms = float(m.group(1)) if m else None
                m = re.search(r"tpot_ms=([\d.]+)", line); tpot_ms = float(m.group(1)) if m else None
            else:
                tail = [l for l in ((p.stdout or "") + (p.stderr or "")).splitlines() if l.strip()][-1:] or ["no output"]
                print(f"vllm/{model} NP={NP} input={INPUT} R=1 FAIL agg=0 ({tail[0][:120]})", flush=True)
        except Exception as exc:
            print(f"vllm/{model} NP={NP} input={INPUT} R=1 FAIL agg=0 ({str(exc)[:120]})", flush=True)
        finally:
            subprocess.run(["docker", "rm", "-f", name], capture_output=True, timeout=60)
        results[model] = status
        manifest["results"][model] = {"status": status, "aggregate_tps": agg, "ttft_s": round(ttft_ms / 1000, 4) if ttft_ms is not None else None, "tpot_ms": tpot_ms}
        atomic_json(dest / "manifest.json", manifest)
    manifest["finished_at"] = datetime.now().isoformat(timespec="seconds")
    atomic_json(dest / "manifest.json", manifest)
    print("SMOKE_STATUS: " + json.dumps(results), flush=True)
    return 0 if all(v == "PASS" for v in results.values()) else 1


def on_term(signum, frame):
    raise SystemExit("stopped from the platform")      # the finally block below removes the container


def host_standard(models, inputs, nps, repeats):
    run_id = "standard_" + datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = ROOT / "platform_runs" / run_id
    dest.mkdir(parents=True)
    total = len(models) * len(inputs) * len(nps) * repeats
    assert total <= MAX_CASES, f"too many cases ({total} > {MAX_CASES})"
    manifest = {"run_id": run_id, "kind": "standard", "scope": "PLATFORM_STANDARD_NOT_INGESTED", "machine": "PRO6000", "framework": "vLLM (aiDAPTIV image, Without aiDAPTIV)", "gpu": GPU,
                "models": models, "inputs": inputs, "nps": nps, "repeats": repeats, "output_tokens": OUTPUT, "image": IMAGE, "runner_sha256": sha256(__file__),
                "started_at": datetime.now().isoformat(timespec="seconds"), "results": {}, "cases": []}
    atomic_json(dest / "manifest.json", manifest)
    print("STANDARD_PLAN: " + json.dumps({"models": models, "inputs": inputs, "nps": nps, "repeats": repeats, "cases": total}), flush=True)
    summary = {}
    for model in models:
        print(f"LOADING: {model}", flush=True)
        name = f"aiso_platform_smoke_{run_id}"
        summary[model] = {"pass": 0, "fail": 0}
        seen = 0
        try:
            used = gpu_used_mib()
            if used >= FREE_MIB:
                raise RuntimeError(f"GPU {GPU} is not free ({used} MiB used) - not started")
            mdir = dest / model
            mdir.mkdir()
            c = MODELS[model]
            Path(f"/mnt/nvme0/{c['kv_dir']}").mkdir(parents=True, exist_ok=True)
            cmd = ["docker", "run", "--rm", "--name", name, "--gpus", "all", "-e", f"NVIDIA_VISIBLE_DEVICES={GPU}", "-e", f"CUDA_VISIBLE_DEVICES={GPU}",
                   "--ipc=host", "--ulimit", "memlock=-1", "--ulimit", "stack=67108864",
                   "-v", f"{Path.home()}/Desktop/TPI_AISO_NEW:/app", "-v", "/mnt/nvme0:/mnt/nvme0", "-v", f"{mdir}:/out", "-v", f"{os.path.abspath(__file__)}:/runner.py:ro",
                   IMAGE, "python3", "/runner.py", "--inner", "--mode", "standard", "--models", model, "--inputs", ",".join(map(str, inputs)), "--nps", ",".join(map(str, nps)),
                   "--repeats", str(repeats), "--output", str(OUTPUT)]
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            log = (mdir / "container.log").open("w")
            for line in proc.stdout:               # forwarded as it arrives: the platform shows every case live
                log.write(line); log.flush()
                if line.startswith(f"vllm/{model} "):
                    line = line.strip()
                    print(line, flush=True)
                    seen += 1
                    m = re.match(r"vllm/\S+ NP=(\d+) input=(\d+) R=(\d+) (PASS|FAIL) agg=([\d.]+) ttft_ms=([\d.]+) tpot_ms=([\d.]+)", line)
                    if m:
                        summary[model]["pass" if m.group(4) == "PASS" else "fail"] += 1
                        manifest["cases"].append({"model": model, "np": int(m.group(1)), "input": int(m.group(2)), "repeat": int(m.group(3)), "status": m.group(4),
                                                  "aggregate_tps": float(m.group(5)), "ttft_ms": float(m.group(6)), "tpot_ms": float(m.group(7))})
                        atomic_json(dest / "manifest.json", manifest)
            proc.wait()
        except Exception as exc:
            print(f"vllm/{model} NP={nps[0]} input={inputs[0]} R=1 FAIL agg=0 ({str(exc)[:120]})", flush=True)
            summary[model]["fail"] += max(1, len(inputs) * len(nps) * repeats - seen)
        finally:
            subprocess.run(["docker", "rm", "-f", name], capture_output=True, timeout=60)
        missing = len(inputs) * len(nps) * repeats - summary[model]["pass"] - summary[model]["fail"]
        if missing > 0:                           # the container ended before every case reported: they count as failed, never as passed
            summary[model]["fail"] += missing
        manifest["results"][model] = summary[model]
        atomic_json(dest / "manifest.json", manifest)
    manifest["finished_at"] = datetime.now().isoformat(timespec="seconds")
    atomic_json(dest / "manifest.json", manifest)
    print("STANDARD_STATUS: " + json.dumps(summary), flush=True)
    return 0 if all(v["fail"] == 0 for v in summary.values()) else 1


def main():
    global NP, INPUT, OUTPUT
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", default="all")
    ap.add_argument("--inner", action="store_true")
    ap.add_argument("--np", type=int, default=NP)               # adjustable by the operator inside the limits below
    ap.add_argument("--input", type=int, default=INPUT)
    ap.add_argument("--output", type=int, default=OUTPUT)
    ap.add_argument("--mode", choices=("smoke", "standard"), default="smoke")
    ap.add_argument("--inputs", default="4096,8192,16384")       # standard only
    ap.add_argument("--nps", default="1,2,4")
    ap.add_argument("--repeats", type=int, default=3)
    a = ap.parse_args()
    assert 1 <= a.np <= 4 and 128 <= a.input <= 16000 and 16 <= a.output <= 1024 and a.input + a.output <= 19500, "parameter outside the allowed range"
    NP, INPUT, OUTPUT = a.np, a.input, a.output
    if a.mode == "standard":
        inputs, nps = ints(a.inputs, 128, 16384), ints(a.nps, 1, 4)
        assert 1 <= a.repeats <= 3 and max(inputs) + OUTPUT <= 19500, "parameter outside the allowed range"
        models = list(MODELS) if a.models == "all" else [m for m in a.models.split(",") if m]
        assert models and all(m in MODELS for m in models), f"unknown model in {models}"
        if a.inner:
            return inner_standard(models[0], inputs, nps, a.repeats)
        signal.signal(signal.SIGTERM, on_term)
        return host_standard(models, inputs, nps, a.repeats)
    models = list(MODELS) if a.models == "all" else [m for m in a.models.split(",") if m]
    assert models and all(m in MODELS for m in models), f"unknown model in {models}"
    return inner(models[0]) if a.inner else host(models)


if __name__ == "__main__":
    sys.exit(main())
