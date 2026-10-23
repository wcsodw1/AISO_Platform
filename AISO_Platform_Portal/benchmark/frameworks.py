"""Framework adapters (metadata, parameters, health, error classes) and the parameter registry.

P0 adapters describe frameworks; they do not launch anything. Launch commands for approved
runners are added with the SSH executor in P1 once the real runner CLI and logs are imported.
"""
from __future__ import annotations

import re

FRAMEWORK_STATUS = {
    "verified": "Verified",
    "runtime_unverified": "Runtime Unverified",
    "not_verified": "Not Verified",
    "unavailable": "Unavailable",
}

TEST_MODES = {
    "smoke": {"label": "Smoke", "np": [2], "input_tokens": [4096], "output_tokens": 128, "repeat": 1,
              "tip": "Quick sanity check: one concurrency level, 4K input, short output. Not comparable with Full results."},
    "full": {"label": "Full", "np": [2, 4], "input_tokens": [4096, 8192, 16384, 32768, 65536], "output_tokens": 1024, "repeat": 3,
             "tip": "Formal workload: NP 2 and 4, 4K-64K input, 1024 output, 3 repeats. Required for cross-machine comparison."},
    "custom": {"label": "Custom", "np": [2], "input_tokens": [4096], "output_tokens": 1024, "repeat": 1,
               "tip": "Free selection. Results are labelled Custom and are excluded from formal comparison."},
}


def _p(key, label, kind, frameworks, default, tip, tip_zh, unit="", lo=None, hi=None, choices=None):
    return {"key": key, "label": label, "kind": kind, "frameworks": frameworks, "default": default,
            "unit": unit, "min": lo, "max": hi, "choices": choices, "tip": tip, "tip_zh": tip_zh}


ALL = ["llamacpp", "vllm", "sglang", "openvino"]
PARAMS = [
    _p("np", "NP - concurrent requests", "multi", ALL, [2, 4],
       "Number of requests sent at the same moment. Higher NP raises total throughput until memory or compute saturates, while per-request latency usually gets worse.",
       "同時送出的請求數。", "requests", 1, 128, [1, 2, 4, 8, 16, 32]),
    _p("tp", "TP - tensor parallel size", "int", ["vllm", "sglang"], 2,
       "How many GPUs share each layer of the model. Must divide the attention/KV head count. Larger TP fits bigger models and cuts per-GPU memory, but adds inter-GPU communication.",
       "跨幾張 GPU 切分模型。", "GPUs", 1, 8),
    _p("input_tokens", "Input tokens", "multi", ALL, [4096, 8192, 16384, 32768, 65536],
       "Prompt length per request. Longer input raises time-to-first-token roughly linearly (prefill) and KV-cache memory, and slows decode.",
       "每個請求的輸入長度。", "tokens", 1, 262144, [4096, 8192, 16384, 32768, 65536]),
    _p("output_tokens", "Output tokens", "int", ALL, 1024,
       "Tokens generated per request. Longer output improves the accuracy of TPOT/decode measurements and increases total run time.",
       "每個請求產生的輸出長度。", "tokens", 1, 8192),
    _p("repeat", "Repeat count", "int", ALL, 3,
       "How many times each case is repeated. Means are computed from successful repeats only; more repeats reduce noise but cost time.",
       "每組測試重複次數。", "runs", 1, 10),
    _p("max_model_len", "Max model length", "int", ["vllm"], 69632,
       "Longest sequence (input + output) the server accepts. Must cover the largest input plus output; larger values reserve more KV-cache memory.",
       "伺服器接受的最大序列長度。", "tokens", 1024, 262144),
    _p("max_num_seqs", "Max number of sequences", "int", ["vllm"], 4,
       "Maximum requests the scheduler runs concurrently. Set it at or above the largest NP, otherwise extra requests queue and inflate TTFT.",
       "排程器同時處理的最大序列數。", "sequences", 1, 1024),
    _p("max_num_batched_tokens", "Max batched tokens", "int", ["vllm"], 4096,
       "Token budget per scheduler step (chunked prefill size). Larger values speed up prefill but can delay decode steps of other requests.",
       "每個排程步驟的 token 上限。", "tokens", 256, 262144),
    _p("gpu_memory_utilization", "GPU memory utilization", "float", ["vllm"], 0.9,
       "Fraction of each GPU's memory the server may claim for weights and KV cache. Higher fits more concurrent context; too high risks out-of-memory.",
       "GPU 記憶體使用比例。", "fraction", 0.5, 0.98),
    _p("prefix_caching", "Prefix caching", "bool", ["vllm", "sglang", "llamacpp"], False,
       "Reuses KV cache for identical prompt prefixes. Keep OFF for formal comparison; repeats would otherwise measure cache hits instead of hardware.",
       "正式比較請關閉，避免量到快取命中。"),
    _p("context_length", "Context length", "int", ["sglang"], 69632,
       "Maximum sequence length SGLang will serve (input + output). Larger values reserve more KV-cache memory.",
       "SGLang 可服務的最大序列長度。", "tokens", 1024, 262144),
    _p("max_running_requests", "Max running requests", "int", ["sglang"], 4,
       "Upper bound on requests decoded together. Set it at or above the largest NP.",
       "同時解碼的請求上限。", "requests", 1, 1024),
    _p("chunked_prefill_size", "Chunked prefill size", "int", ["sglang"], 4096,
       "Tokens processed per prefill chunk. Smaller chunks interleave better with decode; larger chunks finish prefill sooner.",
       "每次預填的 token 數。", "tokens", 256, 262144),
    _p("mem_fraction_static", "Static memory fraction", "float", ["sglang"], 0.9,
       "Fraction of GPU memory reserved for weights plus KV pool. Higher allows more cache but leaves less working memory.",
       "靜態配置的記憶體比例。", "fraction", 0.5, 0.98),
    _p("ctx_size", "Context size (total)", "int", ["llamacpp"], 69632,
       "Total KV context shared across all parallel slots; each slot gets ctx_size / NP. Verify the per-slot value in the server log before trusting a result.",
       "所有並行 slot 共用的總 context。", "tokens", 512, 1048576),
    _p("batch_size", "Batch size (-b)", "int", ["llamacpp"], 2048,
       "Logical maximum tokens processed per decode call. Not the same thing as vLLM max batched tokens.",
       "每次解碼的邏輯批次大小。", "tokens", 32, 16384),
    _p("ubatch_size", "UBatch size (-ub)", "int", ["llamacpp"], 512,
       "Physical micro-batch size. Smaller values lower peak memory; larger values can speed up prompt processing.",
       "實際的微批次大小。", "tokens", 32, 8192),
    _p("n_gpu_layers", "GPU layers (-ngl)", "int", ["llamacpp"], 999,
       "Layers offloaded to GPU. Anything below the model's layer count moves work to CPU and slows decode sharply.",
       "放到 GPU 的層數。", "layers", 0, 999),
    _p("split_mode", "Split mode", "choice", ["llamacpp"], "layer",
       "How a model is spread over GPUs: layer, row or tensor. Support depends on architecture; some models fail with tensor split.",
       "多 GPU 切分方式。", choices=["none", "layer", "row", "tensor"]),
    _p("device", "Device", "choice", ["openvino"], "GPU",
       "OpenVINO target device. GPU uses the Intel GPU runtime; AUTO lets OpenVINO choose.",
       "OpenVINO 執行裝置。", choices=["GPU", "CPU", "AUTO"]),
    _p("num_streams", "Inference streams", "int", ["openvino"], 2,
       "Parallel inference streams. More streams raise throughput for concurrent requests at the cost of per-request latency.",
       "並行推論串流數。", "streams", 1, 32),
]


def params_for(framework):
    return [p for p in PARAMS if framework in p["frameworks"]]


class Adapter:
    name = ""
    label = ""
    class_name = ""
    model_formats = ()
    health_path = "/health"
    # Health paths are the framework defaults and must be confirmed against the real service in P1.

    @classmethod
    def describe(cls):
        return {"name": cls.name, "label": cls.label, "adapter": cls.class_name,
                "model_formats": list(cls.model_formats), "health_path": cls.health_path,
                "params": [p["key"] for p in params_for(cls.name)]}


class VllmAdapter(Adapter):
    name, label, class_name, model_formats = "vllm", "vLLM", "VllmAdapter", ("Safetensors",)


class LlamaCppAdapter(Adapter):
    name, label, class_name, model_formats = "llamacpp", "llama.cpp", "LlamaCppAdapter", ("GGUF",)


class SGLangAdapter(Adapter):
    name, label, class_name, model_formats = "sglang", "SGLang", "SGLangAdapter", ("Safetensors",)


class OpenVINOAdapter(Adapter):
    name, label, class_name, model_formats = "openvino", "OpenVINO", "OpenVINOAdapter", ("OpenVINO IR",)
    health_path = "/v2/health/ready"


ADAPTER_CLASSES = {c.name: c for c in (LlamaCppAdapter, VllmAdapter, SGLangAdapter, OpenVINOAdapter)}

_ERROR_RULES = [
    ("out_of_memory", r"out of (device )?memory|OUT_OF_DEVICE_MEMORY|\bOOM\b|CUDA error: out of memory"),
    ("context_exceeded", r"maximum context length|exceeds? (the )?(max|context)|context window"),
    ("connection", r"connection (refused|reset)|timed? ?out|unreachable"),
    ("missing_first_token_or_usage", r"no generated token|missing first token|missing usage"),
    ("model_not_found", r"model .*not found|404"),
    ("token_count_mismatch", r"token count|usage mismatch|prompt_tokens"),
]


def classify_error(text):
    """Classify from log text only; the result is 'unknown' unless the log says otherwise."""
    for name, pattern in _ERROR_RULES:
        if re.search(pattern, text or "", re.IGNORECASE):
            return name
    return "unknown"
