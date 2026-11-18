#!/usr/bin/env python3
"""Write the GB10 "Parameters" panel data (params_ctx / params_ryan) into data/benchmark-gb10/*.json.

Every server value is READ from the result folders copied from GB10 (server_command.txt + server.log of each
vLLM start), never typed by hand; a value that differs between starts is shown as a list.

Usage:
  python3 scripts/build_gb10_params.py --ryan RYAN_DIR --ctx CTX_DIR [CTX_DIR ...] [--data FILE.json]
"""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT = ROOT / "data/benchmark-gb10/AISO_GB10_vLLM_gemma26_20261118.json"


def server_facts(d):
    d = Path(d)
    cmd = (d / "server_command.txt").read_text()
    log = (d / "server.log").read_text(errors="ignore")
    flag = lambda name: (re.search(rf"--{name} (\S+)", cmd) or [None, None])[1]
    f = {
        "max_model_len": int(flag("max-model-len")), "max_num_seqs": int(flag("max-num-seqs")),
        "max_batched": int(flag("max-num-batched-tokens")), "mem_util": float(flag("gpu-memory-utilization")),
        "kv_dtype": flag("kv-cache-dtype"), "moe": flag("moe-backend"),
        "eager": "--enforce-eager" in cmd, "chunked": "--enable-chunked-prefill" in cmd,
        "prefix": "--no-enable-prefix-caching" not in cmd,
    }
    g = lambda pat, cast=str: (lambda m: cast(m.group(1)) if m else None)(re.search(pat, log))
    f["version"] = g(r"(v0\.\d+\.\d+\w*\.dev\d+\+g[0-9a-f]+)")
    f["attn"] = g(r"Using AttentionBackendEnum\.(\w+) backend")
    f["kv_tokens"] = g(r"GPU KV cache size: ([\d,]+) tokens", lambda s: int(s.replace(",", "")))
    f["kv_gib"] = g(r"Available KV cache memory: ([\d.]+) GiB", float)
    f["desired_gib"] = g(r"Desired GPU memory utilization is \([\d.]+, ([\d.]+) GiB\)", float)
    f["weights_gib"] = g(r"Actual usage is ([\d.]+) GiB for consumed memory", float)
    f["dtype"] = g(r"dtype=(torch\.\w+)")
    f["quant"] = g(r"quantization=(\w+)")
    f["tp"] = g(r"tensor_parallel_size=(\d+)", int)
    f["pp"] = g(r"pipeline_parallel_size=(\d+)", int)
    f["forced_attn_reason"] = "heterogeneous head dimensions" in log and "FA4 not available" in log
    return f


def uniq(vals, fmt=str):
    vals = [v for v in vals if v is not None]
    out = []
    for v in sorted(set(vals)):
        out.append(fmt(v))
    return " / ".join(out)


def kfmt(n):
    return f"{n // 1024}K" if n % 1024 == 0 and n >= 1024 else f"{n:,}"


def rng(vals, unit=""):
    vals = [v for v in vals if v is not None]
    lo, hi = min(vals), max(vals)
    return f"{lo:,}{unit}" if lo == hi else f"{lo:,} – {hi:,}{unit}"


def server_rows(facts, multi):
    a = facts
    one = lambda k: a[0][k]
    note = " (varies per start)" if multi else ""
    attn_reason = "auto-selected: Gemma 4 has two head sizes (256 sliding / 512 full), FA4 not available" if all(x["forced_attn_reason"] for x in a) else "auto-selected"
    return [
        ["Framework", "推論框架", f"vLLM {uniq([x['version'] for x in a])}"],
        ["Attention backend", "注意力後端", f"{uniq([x['attn'] for x in a])} ({attn_reason})"],
        ["MoE backend", "MoE 後端", uniq([x["moe"] for x in a]).capitalize()],
        ["Execution mode", "執行模式", "Eager - torch.compile and CUDA graphs OFF (--enforce-eager)" if all(x["eager"] for x in a) else "mixed"],
        ["Dtype · quantization", "權重精度", f"{uniq([x['dtype'] for x in a]).replace('torch.', '')} · weights not quantized" if all(x["quant"] in (None, "None") for x in a) else "check"],
        ["KV cache type", "KV cache 型別", uniq([x["kv_dtype"] for x in a])],
        ["Max model len", "單一請求最大長度", uniq([x["max_model_len"] for x in a], lambda n: f"{n:,}") + (" (differs per start)" if multi else " tokens (per request)")],
        ["Max num seqs", "同時請求數上限", uniq([x["max_num_seqs"] for x in a])],
        ["Max batched tokens", "每批 token 上限", uniq([x["max_batched"] for x in a], lambda n: f"{n:,}") + (" · chunked prefill ON" if all(x["chunked"] for x in a) else "")],
        ["Prefix cache", "前綴快取", "OFF" if not any(x["prefix"] for x in a) else "ON"],
        ["GPU memory share", "記憶體比例", uniq([x["mem_util"] for x in a]) + (f" ({one('desired_gib')} GiB)" if not multi else "")],
        ["Weights + other memory", "模型與固定用量", f"{rng([x['weights_gib'] for x in a], ' GiB')}"],
        ["KV cache capacity", "KV cache 實測容量", rng([x["kv_tokens"] for x in a], " tokens") + (note if multi else f" ({one('kv_gib')} GiB)")],
        ["Parallelism", "平行度", f"TP {uniq([x['tp'] for x in a])} · PP {uniq([x['pp'] for x in a])} · 1 GPU (unified memory)"],
        ["Request", "請求方式", "streaming /v1/completions · all NP requests released at the same moment · ignore_eos · min_tokens = max_tokens · temperature 0 · seed 42"],
        ["Warm-up", "暖機", "1 request of 2,048 input tokens, 8 output tokens, excluded from results"],
    ]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ryan", required=True)
    ap.add_argument("--ctx", nargs="+", required=True)
    ap.add_argument("--data", default=str(DEFAULT))
    a = ap.parse_args()
    path = Path(a.data)
    ds = json.loads(path.read_text())
    runs = ds["gb10_runs"]
    ry = [r for r in runs if r.get("set") == "ryan"]
    cx = [r for r in runs if r.get("set") != "ryan"]
    nps = lambda rs: " / ".join(str(n) for n in sorted({r["np"] for r in rs if r["phase"] != "smoke"}))
    ryan_inputs = sorted({r["input"] for r in ry})
    ds["params_ryan"] = {
        "key": [
            ["Input", "輸入", " / ".join(f"{kfmt(n)} ({n:,})" for n in ryan_inputs) + " tokens, exact"],
            ["Output", "輸出", " / ".join(str(n) for n in sorted({r["output"] for r in ry})) + " tokens (forced, ignore_eos)"],
            ["NP (concurrency)", "並發", nps(ry)],
            ["Session length", "單一請求總長", "input + output (e.g. 64K input + 512 output = 66,048 tokens)"],
            ["Repeat", "重複", "1 run, not averaged (B60 / B70 / AISO1 average 3 runs)"],
            ["KV cache type", "KV cache 型別", "fp8 (weights stay bf16)"],
            ["Weight quantization", "權重量化", "bf16 = tested · fp8 / int8 / int4 weights = not run yet 待測"],
        ],
        "server": server_rows([server_facts(a.ryan)], False),
        "source": f"{Path(a.ryan).name}: server_command.txt + server.log (1 vLLM start for all 12 conditions)",
    }
    smoke_ctx = sorted({r["context"] for r in cx if r["phase"] != "smoke"})
    ds["params_ctx"] = {
        "key": [
            ["Context (input + output)", "總長度", " / ".join(f"{kfmt(n)} ({n:,})" for n in smoke_ctx) + " tokens; input = context - output"],
            ["Output", "輸出", " / ".join(str(n) for n in sorted({r["output"] for r in cx if r["phase"] != "smoke"})) + " tokens (forced, ignore_eos)"],
            ["NP (concurrency)", "並發", nps(cx) + " (+ Smoke NP2 at 8K)"],
            ["Repeat", "重複", "1 run, not averaged (B60 / B70 / AISO1 average 3 runs)"],
            ["KV cache type", "KV cache 型別", "fp8 (weights stay bf16)"],
            ["Weight quantization", "權重量化", "bf16 = tested · fp8 / int8 / int4 weights = not run yet 待測"],
        ],
        "server": server_rows([server_facts(d) for d in a.ctx], True),
        "source": f"{len(a.ctx)} vLLM starts: " + ", ".join(Path(d).name for d in a.ctx),
    }
    path.write_text(json.dumps(ds, ensure_ascii=False, indent=1) + "\n")
    print("params written:", len(ds["params_ryan"]["server"]), "+", len(ds["params_ctx"]["server"]), "rows ->", path)


if __name__ == "__main__":
    main()
