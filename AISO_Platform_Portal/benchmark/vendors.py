"""Per-vendor / per-framework runtime settings, assigned automatically from the machine's GPU vendor.

Only what was actually observed on our machines is marked verified:
- Intel (B60 / B70): llama.cpp in Docker (SYCL, --device /dev/dri, SYCL0,SYCL1), vLLM XPU, SGLang XPU  (command.json of the B60 and B70 runs)
- AMD AI MAX+ 395 (AISO1): llama.cpp native build-vulkan (Vulkan0); vLLM ROCm exists only as a 2026-10-15 historical run
- NVIDIA (CUDA): template only - nothing has been run yet, so every NVIDIA run must start with a smoke test and is flagged unverified
"""
from __future__ import annotations

INTEL_DOCKER = ["--device", "/dev/dri:/dev/dri"]

VENDORS = {
    "intel": {
        "label": "Intel", "backend": "SYCL / XPU", "verified": True,
        "frameworks": {
            "llamacpp": {"runtime": "docker", "device_prefix": "SYCL", "container_args": INTEL_DOCKER, "split_modes": ["layer", "tensor"], "pull_never": True,
                         "notes": ["--device SYCL0,SYCL1 does not necessarily map to the two intended cards: check the device list (B70 checklist)", "image pinned by sha256 (docker --pull never)"]},
            "vllm": {"runtime": "docker", "container_args": ["--network", "host", "--ipc", "host", "--device", "/dev/dri:/dev/dri:rwm", "-v", "/dev/dri/by-path:/dev/dri/by-path:ro"],
                     "env": {"VLLM_TARGET_DEVICE": "xpu", "VLLM_WORKER_MULTIPROC_METHOD": "spawn"}, "help_check_needs_device": True,
                     "notes": ["run the CLI --help pre-check WITH /dev/dri mounted (B60-VLLM-03)"]},
            "sglang": {"runtime": "docker", "container_args": ["--network", "host", "--ipc", "host", "--privileged", "--device", "/dev/dri:/dev/dri", "-v", "/dev/dri/by-path:/dev/dri/by-path:ro"],
                       "server_args": ["--device", "xpu", "--attention-backend", "intel_xpu", "--page-size", "64"],
                       "notes": ["Gemma26 AWQ needs a CUDA Marlin MoE JIT path and fails on XPU (B60-SGL-01)"]},
        },
    },
    "amd": {
        "label": "AMD", "backend": "Vulkan (llama.cpp) / ROCm (vLLM)", "verified": True,
        "frameworks": {
            "llamacpp": {"runtime": "native", "device_prefix": "Vulkan", "binary_glob": "runtime/llama_*/build-vulkan/bin/llama-server", "split_modes": ["layer"],
                         "notes": ["one iGPU device: Vulkan0", "no Docker: the binary sha256 is pinned instead of an image"]},
            "vllm": {"runtime": "docker", "verified": False, "notes": ["only a 2026-10-15 ROCm historical run exists; settings unverified"]},
        },
    },
    "nvidia": {
        "label": "NVIDIA", "backend": "CUDA", "verified": False,
        "frameworks": {
            "llamacpp": {"runtime": "docker", "device_prefix": "CUDA", "container_args": ["--gpus", "all"], "split_modes": ["layer", "row"], "notes": ["template only - never run here"]},
            "vllm": {"runtime": "docker", "container_args": ["--gpus", "all", "--ipc", "host"], "notes": ["template only - never run here"]},
            "sglang": {"runtime": "docker", "container_args": ["--gpus", "all", "--ipc", "host"], "notes": ["template only - never run here"]},
        },
    },
}


class VendorError(ValueError):
    pass


def resolve(vendor, framework, gpus_used=1):
    """Settings for (vendor, framework); device list like SYCL0,SYCL1 / Vulkan0 / CUDA0,CUDA1."""
    v = VENDORS.get(str(vendor).lower())
    if not v:
        raise VendorError(f"Unknown GPU vendor: {vendor!r}")
    f = v["frameworks"].get(framework)
    if not f:
        raise VendorError(f"{v['label']} has no settings for framework {framework!r}")
    if not isinstance(gpus_used, int) or isinstance(gpus_used, bool) or gpus_used < 1:
        raise VendorError("gpus_used must be a positive integer")
    out = dict(f, vendor=v["label"], backend=v["backend"], verified=bool(v["verified"] and f.get("verified", True)))
    if f.get("device_prefix"):
        out["device_list"] = ",".join(f"{f['device_prefix']}{i}" for i in range(gpus_used))
    out["caveats"] = list(f.get("notes", [])) + ([] if out["verified"] else ["unverified settings: a smoke test is mandatory and results are labelled unverified"])
    return out
