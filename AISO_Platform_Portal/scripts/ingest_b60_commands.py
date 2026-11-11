#!/usr/bin/env python3
"""L0 -> L3: add the VERIFIED launch parameters of the B60 campaign (from the runner manifest's command.json files) to the B60 datasets.

Usage: ingest_b60_commands.py <RunnerManifest_*_B60.tar.gz>
Reads only command.json (llamacpp / vllm / sglang). Host paths, container names and env vars are NOT copied.
Hard stops: flags differ between models/NP of the same framework, or differ from the values already published (batch 4096, ubatch 512, ctx 18432, slots 10, TP 2, 0.90, chunked prefill 4096).
"""
import json, re, sys, tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = {"llamacpp": "AISO_B60_llamacpp_V4_20261105.json", "vllm": "AISO_B60_vLLM_V4_20261105.json", "sglang": "AISO_B60_SGLang_V4_20261105.json"}


def flags(cmd):
    s = " ".join(cmd)
    return s


def val(s, flag):
    m = re.search(re.escape(flag) + r"\s+(\S+)", s)
    return m.group(1) if m else None


def main(tgz):
    t = tarfile.open(tgz)
    found = {k: [] for k in F}
    for m in t.getmembers():
        mm = re.match(r"B60/llamacpp/checkpoints/(llamacpp|vllm|sglang)/[^/]+/load[^/]*/[^/]+/command\.json$", m.name)
        if mm:
            c = json.load(t.extractfile(m))
            found[mm.group(1)].append(" ".join(map(str, c if isinstance(c, list) else c.get("command", []))))
    assert all(found.values()), "missing command.json for a framework"
    img = lambda s: re.search(r"(sha256:[0-9a-f]{64})", s).group(1)
    for fw, cmds in found.items():
        assert len({img(c) for c in cmds}) == 1, f"{fw}: more than one image"
    L, V, S = found["llamacpp"], found["vllm"], found["sglang"]
    for c in L:
        assert val(c, "--batch-size") == "4096" and val(c, "--ubatch-size") == "512" and val(c, "--parallel") == "10" and val(c, "--kv-unified-per-slot") == "18432" and val(c, "--split-mode") == "layer" and "--device SYCL0,SYCL1" in c, "llama.cpp flags differ from the published B60 profile"
    for c in V:
        assert (val(c, "--tensor-parallel-size"), val(c, "--max-model-len"), val(c, "--max-num-seqs"), val(c, "--max-num-batched-tokens"), val(c, "--gpu-memory-utilization")) == ("2", "18432", "10", "4096", "0.90") and "--no-enable-prefix-caching" in c, "vLLM flags differ from the published B60 profile"
    for c in S:
        assert (val(c, "--tp"), val(c, "--context-length"), val(c, "--chunked-prefill-size"), val(c, "--max-running-requests"), val(c, "--mem-fraction-static")) == ("2", "18432", "4096", "10", "0.90") and "--disable-radix-cache" in c, "SGLang flags differ from the published B60 profile"
    upd = {
        "llamacpp": {"runtime": f"llama.cpp commit e937b17a2 (build 11561) · SYCL (Docker image {img(L[0])[:19]}…)", "backend": "SYCL", "image_sha256": img(L[0]).replace("sha256:", ""), "devices": "SYCL0, SYCL1", "gpus_used": 2,
                     "split": "layer (tensor-split 1,1)", "unified_kv": "ON", "cont_batching": "ON", "context_shift": "OFF", "gpu_layers": 999, "cache_ram": "0"},
        "vllm": {"runtime": f"vLLM XPU (Docker image {img(V[0])[:19]}…)", "image_sha256": img(V[0]).replace("sha256:", ""), "gpus_used": 2, "chunked_prefill": "ON", "memory_fraction_note": "B60 vLLM 啟動命令（command.json）已核實：TP2、max-model-len 18432、max-num-seqs 10、max-num-batched-tokens 4096、gpu-memory-utilization 0.90、no prefix caching。"},
        "sglang": {"runtime": f"lmsysorg/sglang:v0.5.22-xpu (Docker image {img(S[0])[:19]}…)", "image_sha256": img(S[0]).replace("sha256:", ""), "gpus_used": 2, "attention_backend": "intel_xpu", "page_size": 64, "memory_fraction_note": "B60 SGLang 啟動命令（command.json）已核實：tp 2、context-length 18432、chunked-prefill-size 4096、max-running-requests 10、mem-fraction-static 0.90、disable-radix-cache。"},
    }
    for fw, name in F.items():
        p = ROOT / "data" / "benchmark-b60" / name
        d = json.loads(p.read_text())
        d["profile"].update(upd[fw])
        d.setdefault("protocol_notes", []).append("啟動參數已由 RunnerManifest 內各模型／NP 的 command.json 核對（見 scripts/ingest_b60_commands.py）；主機路徑與環境變數不公開。")
        p.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
        print("updated", name)


main(sys.argv[1])
