#!/usr/bin/env python3
"""GB10 quick test: Gemma 4 26B MoE on vLLM, 5 concurrent users, one session of 128K and of 256K tokens each, KV cache fp8.

What it measures (same metric definitions as the B60 V4 / NP4 runners, so the numbers read the same way):
  TTFT              time from sending the request to the first streamed content (seconds)
  TPOT              (stream_done - first_content) / (output_tokens - 1)  (milliseconds per token)
  TPS Normalized    output tokens per second per request = Aggregate / NP
  TPS Aggregate     all output tokens / (last stream_done - first request start)  (includes the first-token wait)
Each case = NP (default 5) requests sent at the same moment, every one with its own prompt of CONTEXT - OUTPUT input tokens,
so the full session context is 131072 (128K) or 262144 (256K) tokens. Prefix caching is switched off and every prompt starts
with a different marker, so no request can reuse another one's KV cache.

Typical use on the GB10 (needs Docker with the NVIDIA runtime, the model downloaded or reachable on Hugging Face):
  python3 -u GB10_vllm_gemma26_5user_longctx.py preflight
  python3 -u GB10_vllm_gemma26_5user_longctx.py smoke        # 2 users x 8K, about 3 minutes: proves server start + metrics
  python3 -u GB10_vllm_gemma26_5user_longctx.py run          # 5 users x 128K, then 5 users x 256K
Already have a vLLM server running?  Add  --attach http://127.0.0.1:8000  and the script will not start or stop anything.

Honest limits:
  * 5 sessions x 256K tokens need a lot of KV cache. The script reads vLLM's "GPU KV cache size" from the server log and stops
    a case with KV_INSUFFICIENT (no request sent) when NP x context does not fit, instead of crashing the server.
  * Nothing here was run on a GB10 yet; the client and metric code was tested against a mock server only.
Environment overrides: VLLM_IMAGE, MODEL, SERVED_NAME, PORT, GPU_MEM_UTIL, MAX_BATCHED_TOKENS, HF_HOME, HF_TOKEN (never printed).
"""
import argparse
import csv
import datetime
import json
import math
import os
import random
import re
import shlex
import shutil
import statistics
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(os.environ.get("GB10_ROOT", str(Path.home() / "gb10_benchmark")))
IMAGE = os.environ.get("VLLM_IMAGE", "nvcr.io/nvidia/vllm:latest")          # set to the vLLM image you use on the GB10
MODEL = os.environ.get("MODEL", "google/gemma-4-26B-A4B-it")                   # Gemma 4 26B MoE (A4B); a local path also works
SERVED = os.environ.get("SERVED_NAME", "gemma4-26b")
PORT = int(os.environ.get("PORT", "18090"))
GPU_MEM_UTIL = os.environ.get("GPU_MEM_UTIL", "0.80")                         # GB10 has unified memory: leave room for the system
MAX_BATCHED = os.environ.get("MAX_BATCHED_TOKENS", "8192")
VLLM_BIN = os.environ.get("VLLM_BIN", "vllm")                                   # vllm executable inside the image
EXTRA_ARGS = shlex.split(os.environ.get("EXTRA_VLLM_ARGS", ""))              # extra vllm serve flags
CONTAINER = "sb-gb10-vllm"
KV_DTYPE = "fp8"
BLOCK = ("GB10 long-context benchmark. Summarise the following working notes and keep every number. "
         "The warehouse robot logged battery 82 percent, shelf C14 empty, conveyor speed 1.2 metres per second, "
         "and a temperature of 21 degrees. Maintenance is planned for Tuesday and the spare belt is in cabinet 7. ")


def say(*a):
    print(*a, flush=True)


# ---------------------------------------------------------------- http helpers
def http_json(method, url, body=None, timeout=60):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode() or "{}")


def healthy(base):
    try:
        urllib.request.urlopen(base + "/health", timeout=5).read()
        return True
    except Exception:
        try:
            return bool(http_json("GET", base + "/v1/models", timeout=5).get("data"))
        except Exception:
            return False


# ---------------------------------------------------------------- prompts
def make_ids(base, served, size, marker, timeout=600):
    """Exactly `size` token ids; each request gets its own marker so no two prompts share a prefix."""
    reps = max(8, size // 40 + 8)
    text = f"[session {marker}] " + BLOCK * reps
    for _ in range(4):
        obj = http_json("POST", base + "/tokenize", {"model": served, "prompt": text, "add_special_tokens": True}, timeout=timeout)
        ids = obj.get("tokens")
        if not isinstance(ids, list):
            raise RuntimeError("tokenizer returned no token list")
        if len(ids) >= size:
            return [int(t) for t in ids[:size]]
        text += BLOCK * (reps // 2 + 8)
    raise RuntimeError("could not build a prompt of %d tokens" % size)


# ---------------------------------------------------------------- one streamed request
def one_request(base, served, ids, out_tokens, idx, gate, timeout):
    row = dict(request=idx, status="FAIL", error="", input_tokens=len(ids), output_tokens=0,
               start_s=None, first_content_s=None, stream_done_s=None, ttft_s=None, tpot_ms=None, e2e_s=None)
    body = {"model": served, "prompt": ids, "max_tokens": out_tokens, "min_tokens": out_tokens, "temperature": 0.0,
            "seed": 42, "stream": True, "stream_options": {"include_usage": True}, "ignore_eos": True}
    req = urllib.request.Request(base + "/v1/completions", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        gate.wait(timeout=60)
        t0 = time.time()
        row["start_s"] = t0
        chunks, usage_tokens, first = 0, None, None
        with urllib.request.urlopen(req, timeout=timeout) as r:
            for raw in r:
                line = raw.decode("utf-8", "ignore").strip()
                if not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if payload == "[DONE]":
                    break
                try:
                    d = json.loads(payload)
                except ValueError:
                    continue
                if d.get("usage") and d["usage"].get("completion_tokens") is not None:
                    usage_tokens = d["usage"]["completion_tokens"]
                ch = (d.get("choices") or [{}])[0]
                if ch.get("text"):
                    chunks += 1
                    if first is None:
                        first = time.time()
        done = time.time()
        if first is None:
            row["error"] = "no content streamed"
            return row
        n = usage_tokens if usage_tokens is not None else chunks
        row.update(first_content_s=first, stream_done_s=done, output_tokens=n, ttft_s=first - t0, e2e_s=done - t0)
        if n > 1:
            row["tpot_ms"] = 1000.0 * (done - first) / (n - 1)
        row["status"] = "PASS" if n >= out_tokens else "SHORT_OUTPUT"
        if row["status"] != "PASS":
            row["error"] = "expected %d output tokens, got %d" % (out_tokens, n)
    except urllib.error.HTTPError as e:
        row["error"] = "HTTP %d %s" % (e.code, e.read()[:200].decode("utf-8", "ignore"))
    except Exception as e:
        row["error"] = "%s: %s" % (type(e).__name__, str(e)[:200])
    return row


def wave(base, served, prompts, out_tokens, timeout):
    np_ = len(prompts)
    gate = threading.Barrier(np_ + 1)
    with ThreadPoolExecutor(max_workers=np_) as pool:
        jobs = [pool.submit(one_request, base, served, ids, out_tokens, i + 1, gate, timeout) for i, ids in enumerate(prompts)]
        try:
            gate.wait(timeout=60)
        except threading.BrokenBarrierError:
            pass
        rows = [j.result() for j in jobs]
    ok = all(r["status"] == "PASS" for r in rows)
    res = dict(status="PASS" if ok else "FAIL", users=np_, successful=sum(r["status"] == "PASS" for r in rows),
               wall_s=None, tps_aggregate=None, tps_normalized=None)
    if ok:
        wall = max(r["stream_done_s"] for r in rows) - min(r["start_s"] for r in rows)
        res.update(wall_s=wall, tps_aggregate=sum(r["output_tokens"] for r in rows) / wall)
        res["tps_normalized"] = res["tps_aggregate"] / np_
    return rows, res


# ---------------------------------------------------------------- vLLM server (own container only)
def sh(cmd, check=True):
    return subprocess.run([str(x) for x in cmd], capture_output=True, text=True, check=check)


def preflight(args):
    problems = []
    if not shutil.which("docker"):
        problems.append("docker not found")
    if args.attach:
        say("ATTACH mode: using the vLLM server at", args.attach, "(nothing is started or stopped)")
    else:
        if shutil.which("nvidia-smi"):
            say(sh(["nvidia-smi", "--query-gpu=name,memory.total,memory.used", "--format=csv,noheader"], check=False).stdout.strip() or "nvidia-smi: no output")
        else:
            problems.append("nvidia-smi not found (NVIDIA driver missing?)")
        have = sh(["docker", "image", "inspect", IMAGE, "--format", "{{.Id}}"], check=False)
        if have.returncode != 0:
            problems.append(f"vLLM image not found locally: {IMAGE}  (docker pull it, or set VLLM_IMAGE)")
        else:
            say("image:", IMAGE, have.stdout.strip()[:19])
        busy = sh(["docker", "ps", "--format", "{{.Names}}"], check=False).stdout.split()
        if busy:
            say("NOTE running containers (not touched):", ", ".join(busy))
        if sh(["ss", "-ltn"], check=False).stdout.count(f":{PORT} "):
            problems.append(f"port {PORT} is already in use")
    say("model:", MODEL, "| served name:", SERVED, "| KV cache dtype:", KV_DTYPE)
    if problems:
        raise SystemExit("PREFLIGHT_FAILED: " + "; ".join(problems))
    say("PREFLIGHT_OK")


class Server:
    def __init__(self, out_dir, max_len, users):
        self.base = f"http://127.0.0.1:{PORT}"
        self.out, self.max_len, self.users, self.kv_tokens = out_dir, max_len, users, None
        hf = Path(os.environ.get("HF_HOME", str(Path.home() / ".cache/huggingface")))
        self.cmd = ["docker", "run", "-d", "--init", "--name", CONTAINER, "--gpus", "all", "--ipc", "host", "--network", "host",
                    "-v", f"{hf}:/hf:ro", "-e", "HF_HOME=/hf", "-e", "HF_HUB_OFFLINE=1", "--entrypoint", VLLM_BIN]
        if os.environ.get("HF_TOKEN"):
            self.cmd += ["-e", "HF_TOKEN"]                               # passed through from the environment, never printed
        self.cmd += [IMAGE, "serve", MODEL, "--served-model-name", SERVED, "--host", "127.0.0.1", "--port", str(PORT),
                     "--max-model-len", str(max_len), "--max-num-seqs", str(users), "--kv-cache-dtype", KV_DTYPE,
                     "--gpu-memory-utilization", GPU_MEM_UTIL, "--no-enable-prefix-caching", "--enable-chunked-prefill",
                     "--max-num-batched-tokens", MAX_BATCHED] + EXTRA_ARGS

    def start(self, wait_s=3600):
        (self.out / "server_command.txt").write_text(" ".join(self.cmd) + "\n")
        sh(["docker", "rm", "-f", CONTAINER], check=False)
        sh(self.cmd)
        deadline = time.time() + wait_s
        while time.time() < deadline:
            state = sh(["docker", "inspect", CONTAINER, "--format", "{{.State.Running}}"], check=False).stdout.strip()
            if state != "true":
                self.save_log()
                raise RuntimeError("vLLM exited during start; see server.log in " + str(self.out))
            if healthy(self.base):
                self.kv_tokens = self.read_kv_tokens()
                return
            time.sleep(5)
        raise RuntimeError("vLLM start timeout")

    def read_kv_tokens(self):
        log = sh(["docker", "logs", CONTAINER], check=False)
        text = (log.stdout or "") + (log.stderr or "")
        m = re.findall(r"GPU KV cache size:\s*([\d,]+)\s*tokens", text)
        return int(m[-1].replace(",", "")) if m else None

    def save_log(self):
        log = sh(["docker", "logs", "--tail", "400", CONTAINER], check=False)
        (self.out / "server.log").write_text((log.stdout or "") + (log.stderr or ""))

    def close(self):
        try:
            self.save_log()
        finally:
            sh(["docker", "rm", "-f", CONTAINER], check=False)          # only our own container


# ---------------------------------------------------------------- run
def attach_kv_tokens(base):
    try:
        text = urllib.request.urlopen(base + "/metrics", timeout=10).read().decode()
        m = re.search(r'num_gpu_blocks="?(\d+)"?', text) and re.search(r'block_size="?(\d+)"?', text)
        if m:
            blocks = int(re.search(r'num_gpu_blocks="?(\d+)"?', text).group(1))
            size = int(re.search(r'block_size="?(\d+)"?', text).group(1))
            return blocks * size
    except Exception:
        pass
    return None


def run_cases(args, base, kv_tokens, out_dir, contexts, repeats, users, out_tokens, tag):
    rows_csv, case_list = [], []
    for ctx in contexts:
        need = users * ctx
        label = f"{ctx // 1024}K"
        tight = kv_tokens is not None and need > kv_tokens
        if tight and args.send_anyway:
            say(f"KV_TIGHT {label}: {users} sessions x {ctx} = {need} tokens > KV cache {kv_tokens} tokens, sending anyway (--send-anyway)")
        if tight and not args.send_anyway:
            say(f"KV_INSUFFICIENT {label}: {users} sessions x {ctx} = {need} tokens > KV cache {kv_tokens} tokens, case not sent")
            rows_csv.append(dict(context=ctx, label=label, users=users, repeat="", status="KV_INSUFFICIENT", kv_cache_tokens=kv_tokens,
                                 kv_needed_tokens=need))
            continue
        in_tokens = ctx - out_tokens
        say(f"[{label}] building {users} prompts of {in_tokens} input tokens (+{out_tokens} output = {ctx} context)")
        prompts = [make_ids(base, args.served, in_tokens, f"{tag}-{ctx}-{i + 1}") for i in range(users)]
        warm = wave(base, args.served, [prompts[0][:2048]], 8, 600)[1]            # warm-up, excluded from results
        say(f"[{label}] warm-up {warm['status']}")
        for rep in range(1, repeats + 1):
            say(f"[{label}] repeat {rep}/{repeats}: {users} requests at once ...")
            rows, res = wave(base, args.served, prompts, out_tokens, args.timeout)
            case = dict(context=ctx, repeat=rep, input_tokens=in_tokens, output_tokens=out_tokens, result=res, requests=rows)
            (out_dir / f"case_{label}_r{rep}.json").write_text(json.dumps(case, ensure_ascii=False, indent=2))
            if res["status"] == "PASS":
                ttfts = [r["ttft_s"] for r in rows]
                tpots = [r["tpot_ms"] for r in rows if r["tpot_ms"] is not None]
                say(f"  PASS  TTFT mean {statistics.mean(ttfts):.1f}s (max {max(ttfts):.1f}s)  TPOT {statistics.mean(tpots):.1f} ms  "
                    f"TPS aggregate {res['tps_aggregate']:.2f} / normalized {res['tps_normalized']:.2f} tok/s")
                rows_csv.append(dict(context=ctx, label=label, users=users, repeat=rep, status="PASS", input_tokens=in_tokens,
                                     output_tokens=out_tokens, ttft_mean_s=round(statistics.mean(ttfts), 3), ttft_max_s=round(max(ttfts), 3),
                                     tpot_mean_ms=round(statistics.mean(tpots), 2) if tpots else "",
                                     tps_aggregate=round(res["tps_aggregate"], 3), tps_normalized=round(res["tps_normalized"], 3),
                                     wall_s=round(res["wall_s"], 2), kv_cache_tokens=kv_tokens or "", kv_needed_tokens=need if tight else ""))
            else:
                errs = sorted({r["error"] for r in rows if r["error"]})
                say(f"  FAIL  {res['successful']}/{users} ok; errors: {errs[:3]}")
                rows_csv.append(dict(context=ctx, label=label, users=users, repeat=rep, status="FAIL", error="; ".join(errs)[:300],
                                     kv_cache_tokens=kv_tokens or "", kv_needed_tokens=need if tight else ""))
        case_list.append(ctx)
    cols = ["context", "label", "users", "repeat", "status", "input_tokens", "output_tokens", "ttft_mean_s", "ttft_max_s",
            "tpot_mean_ms", "tps_aggregate", "tps_normalized", "wall_s", "kv_cache_tokens", "kv_needed_tokens", "error"]
    with (out_dir / "summary.csv").open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows_csv)
    say("SUMMARY_CSV", out_dir / "summary.csv")
    return rows_csv


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("mode", choices=["preflight", "smoke", "run"])
    ap.add_argument("--attach", help="use an already running vLLM server, e.g. http://127.0.0.1:8000 (nothing is started or stopped)")
    ap.add_argument("--served", default=SERVED, help="served model name of the attached server")
    ap.add_argument("--users", type=int, default=5)
    ap.add_argument("--contexts", default="131072,262144", help="comma list of total session contexts in tokens (default 128K,256K)")
    ap.add_argument("--output", type=int, default=256, help="output tokens per request (default 256)")
    ap.add_argument("--repeats", type=int, default=1)
    ap.add_argument("--send-anyway", action="store_true", help="send a case even when users x context is larger than the KV cache (vLLM queues / preempts; the result is recorded as measured)")
    ap.add_argument("--timeout", type=int, default=7200, help="seconds allowed for one request (long prefill)")
    args = ap.parse_args()
    if args.mode == "preflight":
        return preflight(args)
    preflight(args)
    stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    contexts = [int(x) for x in args.contexts.split(",")]
    users, out_tokens, repeats = args.users, args.output, args.repeats
    if args.mode == "smoke":
        contexts, users, out_tokens, repeats = [8192], min(args.users, 2), 64, 1
    out_dir = ROOT / "results" / f"gemma26_vllm_fp8_{args.mode}_{stamp}"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "parameters.json").write_text(json.dumps(dict(
        model=MODEL, framework="vLLM", kv_cache_dtype=KV_DTYPE, users=users, contexts=contexts, output_tokens=out_tokens,
        repeats=repeats, prefix_caching=False, chunked_prefill=True, max_num_batched_tokens=int(MAX_BATCHED),
        gpu_memory_utilization=float(GPU_MEM_UTIL), image=None if args.attach else IMAGE, extra_vllm_args=EXTRA_ARGS,
        metrics=dict(ttft="first_content - start (s)", tpot="(done - first_content)/(output_tokens-1) (ms)",
                     aggregate="sum output tokens / (last done - first start)", normalized="aggregate / users"),
        comparability="NEW_GB10_NOT_COMPARABLE_WITH_B60_OR_AISO1"), indent=2))
    server = None
    try:
        if args.attach:
            base = args.attach.rstrip("/")
            if not healthy(base):
                raise SystemExit("attached server does not answer: " + base)
            kv_tokens = attach_kv_tokens(base)
        else:
            server = Server(out_dir, max(contexts), users)
            say("starting vLLM (own container", CONTAINER + ") ...")
            server.start()
            base, kv_tokens = server.base, server.kv_tokens
        say("KV cache capacity:", f"{kv_tokens} tokens" if kv_tokens else "unknown (cases are not pre-checked)")
        run_cases(args, base, kv_tokens, out_dir, contexts, repeats, users, out_tokens, stamp)
    finally:
        if server is not None:
            server.close()
    say("DONE", out_dir)


if __name__ == "__main__":
    main()
