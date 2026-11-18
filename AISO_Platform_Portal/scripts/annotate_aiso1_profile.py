#!/usr/bin/env python3
"""L0 -> L3: add the verified AISO1 launch profile (model repo / revision / file sha256, llama.cpp commit, device) to the AISO1 dataset.

Source: AISO1 campaign profile.json (NP4 campaign 20261111_144405, preflight 2026-11-10), pasted by David on 2026-11-11.
Public-safe fields only: no host name, file paths, inode / file_stat, debug folder. Model repos match the B70 published model_parity (checked below).
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "benchmark-aiso1" / "AISO_AISO1_llamacpp_B1024_20261111.json"
B70 = ROOT / "data" / "benchmark-b70"
MODELS = {   # platform key -> (repo, revision, quant, sha256, bytes, file)
    "Gemma26": ("google/gemma-4-26B-A4B-it-qat-q4_0-gguf", "d1c082be9cf3c8a514acf63b8761f4b41935842e", "Q4_0", "3eca3b8f6d7baf218a7dd6bba5fb59a56ee25fe2d567b6f5f589b4f697eca51d", 14439363584, "gemma-4-26B_q4_0-it.gguf"),
    "Gemma31": ("google/gemma-4-31B-it-qat-q4_0-gguf", "59dde24573e7e61570dba08b18a2e1fe246955ed", "Q4_0", "179cfb99212709597eae5929112cfca677e1bbf566178b479ae1da0c4772874b", 17651001568, "gemma-4-31B_q4_0-it.gguf"),
    "Laguna": ("poolside/Laguna-XS-2.1-GGUF", "1a37c0a5fb8c7a18e6106decb6be6327d1b63fa6", "Q4_K_M", "1ac7079101fca5a6df8c5a7523a3c30ea7d1c0e4b1258090e7d6d4039287f6cb", 20274300032, "Laguna-XS-2.1-Q4_K_M.gguf"),
    "Nemotron": ("unsloth/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-GGUF", "f2d3fe3694501008786e81e5f20360cbf715496a", "UD-Q4_K_M", "edcb5d4650796ed2fb412498de6f83b585862312c747ddb74f0ea04b22206181", 25266255936, "NVIDIA-Nemotron-3.5-Lightning-30B-A3B-UD-Q4_K_M.gguf"),
}
BINARY_SHA = "3392ba571bc32d7a1ab0889209a56bbfccb96d45874b0dbca8c1856fc1353f51"
RUNTIME = "llama.cpp 0.6.0-dev (build 1, commit e937b17) · Vulkan0 · Radeon 8060S (RADV GFX1151, 97499 MiB)"


def main():
    # parity with the B70 published list (repo + file)
    reg = json.loads((ROOT / "data" / "benchmark-registry.json").read_text())
    b70 = next(d for d in reg["datasets"] if d["machine"] == "b70" and d["framework"] == "llamacpp")
    parity = {m["model"]: m for m in json.loads((ROOT / b70["file"]).read_text())["model_parity"]}
    for k, (repo, _rev, _q, _sha, _n, file) in MODELS.items():
        assert parity[k]["repo"] == repo and parity[k]["file"] == file, f"{k}: AISO1 profile differs from the B70 published parity"
    ds = json.loads(OUT.read_text())
    for k, (repo, rev, quant, sha, n, file) in MODELS.items():
        c = ds["config_by_model"][k]
        c.update({"repo": repo, "revision": rev, "file": file, "sha256": sha, "bytes": n, "backend": "llama.cpp commit e937b17 · Vulkan"})
    p = ds["profile"]
    p["runtime"] = RUNTIME
    p["binary_sha256"] = BINARY_SHA
    p["gpu_evidence"] = "機器回報（llama-server）Vulkan0 · Radeon 8060S Graphics (RADV GFX1151) · 97499 MiB；preflight 2026-11-10"
    ds["provenance"]["profile_source"] = "AISO1 campaign profile.json (NP4_20261111_144405), public-safe fields only; model sha256 / revision / binary sha256 recorded"
    OUT.write_text(json.dumps(ds, ensure_ascii=False, indent=1) + "\n")
    print("AISO1 profile annotated: 4 models (repo/revision/sha256 verified against the B70 parity list), runtime + binary sha256")


main()
