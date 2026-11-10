#!/usr/bin/env python3
"""Fetch real file sizes of the VIS models' quantised repos from Hugging Face and write a dated snapshot.

Usage: check_model_sizes.py            -> data/sizing-model-sizes.json
The Sizing page (sizing-core.js VIS_MODELS) uses these file sizes instead of a bits-per-weight formula;
tests/sizing-core.test.js compares the two so they cannot drift apart silently.
Sizes are bytes of the GGUF files (sharded files summed) or the summed *.safetensors of the repo.
"""
import datetime, json, re, subprocess, sys
from collections import defaultdict
from pathlib import Path

REPOS = [
    "Qwen/Qwen3.6-35B-A3B", "Qwen/Qwen3.6-35B-A3B-FP8", "ggml-org/Qwen3.6-35B-A3B-GGUF", "unsloth/Qwen3.6-35B-A3B-GGUF",
    "Qwen/Qwen3.8-27B", "Qwen/Qwen3.8-27B-FP8", "ggml-org/Qwen3.8-27B-GGUF", "unsloth/Qwen3.8-27B-GGUF",
    "google/gemma-4-31B-it", "ggml-org/gemma-4-31B-it-GGUF", "unsloth/gemma-4-31B-it-GGUF", "bartowski/google_gemma-4-31B-it-GGUF",
]


def tree(repo):
    raw = subprocess.run(["curl", "-sf", "--max-time", "60", f"https://huggingface.co/api/models/{repo}/tree/main?recursive=true"],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(raw)


def sizes(repo):
    out = defaultdict(int)
    for f in tree(repo):
        if f["type"] != "file":
            continue
        path, size = f["path"], (f.get("lfs") or {}).get("size", f.get("size", 0))
        if path.endswith(".gguf") and "mmproj" not in path.lower():
            name = re.sub(r"-\d{5}-of-\d{5}\.gguf$", "", path.split("/")[-1]).replace(".gguf", "")
            out[name] += size
        elif path.endswith(".safetensors"):
            out["__safetensors_total__"] += size
    return dict(sorted(out.items(), key=lambda kv: kv[1]))


def main():
    snap = {"checked_on": datetime.date.today().isoformat(), "source": "huggingface.co /api/models/<repo>/tree/main", "repos": {}}
    for repo in REPOS:
        snap["repos"][repo] = sizes(repo)
        print(repo, len(snap["repos"][repo]), "entries")
    path = Path(__file__).resolve().parent.parent / "data" / "sizing-model-sizes.json"
    path.write_text(json.dumps(snap, indent=1) + "\n")
    print("wrote", path)


if __name__ == "__main__":
    sys.exit(main())
