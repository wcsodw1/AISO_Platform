"""Imported B70 + vLLM records (the first implementation fixture).

Values come from David's recorded results. Raw CSV, runner, client and server logs are not in the
repository yet, so nothing here can be PASS: rows are UNVERIFIED until logs are imported (P1).
Missing values stay None. The root cause of the Gemma31 64K failure is not established.
"""
from __future__ import annotations

import csv
from pathlib import Path
from statistics import fmean

from .schema import INPUT_TOKENS, NPS

MACHINE_ID, FRAMEWORK = "intel-b70", "vllm"

MODELS = [
    {"id": "gemma26", "name": "Gemma 4 26B A4B IT", "quantization": "Q4 (scheme not recorded)", "model_format": "Safetensors",
     "repo": None, "source_compliance": "non_compliant", "source_note": "Checkpoint source recorded as non-compliant.",
     "summary": "NP2/NP4 4K-64K recorded as PASS (logs not imported)."},
    {"id": "gemma31", "name": "Gemma 4 31B IT", "quantization": "Q4 (scheme not recorded)", "model_format": "Safetensors",
     "repo": None, "source_compliance": "unknown", "source_note": "Source compliance not recorded.",
     "summary": "NP2/NP4 4K-32K recorded as PASS; 64K R1 FAIL (logs not imported)."},
    {"id": "nemotron", "name": "NVIDIA Nemotron 3.5 Lightning 30B-A3B", "quantization": "Q4 (scheme not recorded)", "model_format": "Safetensors",
     "repo": None, "source_compliance": "non_compliant", "source_note": "Checkpoint source recorded as non-compliant.",
     "summary": "NP2/NP4 4K-64K recorded as PASS (logs not imported)."},
    {"id": "laguna_fp8", "name": "Laguna XS 2.1 (FP8)", "quantization": "FP8", "model_format": "Safetensors",
     "repo": None, "source_compliance": "unknown", "source_note": "Files verified; formal benchmark did not start.",
     "summary": "Files verified; vLLM server start timed out on 2026-10-21 (excerpt only); no benchmark case ran."},
]

# Gemma31 NP4 means: input -> (TTFT s, TPOT ms, Aggregate TPS). 32K is computed from three console logs.
GEMMA31_NP4 = {4096: (21.693, 80.414, 39.361), 8192: (66.921, 108.764, 22.953),
               16384: (248.728, 227.758, 8.494), 32768: (998.505, 706.857, 2.377)}
RECORDED_PASS = {"gemma26": set(INPUT_TOKENS), "nemotron": set(INPUT_TOKENS), "gemma31": set(INPUT_TOKENS[:4])}

CONFIG_SNAPSHOT = {"tp": 2, "max_model_len": 69632, "max_batched_tokens": 4096, "gpu_memory_utilization": 0.9,
                   "prefix_cache": False, "port": 18090, "container": "vllm/vllm-openai-xpu:latest",
                   "container_digest": None, "framework_version": None}
LAGUNA_START, LAGUNA_STOP = "2026-10-21T16:51:53+08:00", "2026-10-21T17:01:57+08:00"
EVIDENCE_PENDING = ["Benchmark CSV", "Runner script", "Client log", "Server log"]
NOTE_UNPAIRED_64K = "Summary records '64K R1 FAIL' without naming the NP; per-NP log not imported."


def build_rows(machine):
    snapshot = {"gpu_count": machine["gpu_count"], "vram_gb_each": machine["vram_gb"], "ram_gb": machine["ram_gb"], "os": machine["os"]}
    rows = []
    for model in MODELS:
        for np in NPS:
            for tokens in INPUT_TOKENS:
                row = {"run_id": f"imp-{MACHINE_ID}-{FRAMEWORK}-{model['id']}-np{np}-{tokens}", "machine_id": MACHINE_ID,
                       "framework": FRAMEWORK, "model": model["id"], "model_repo": model["repo"], "quantization": model["quantization"],
                       "model_format": model["model_format"], "source_verified": False, "source_compliance": model["source_compliance"],
                       "np": np, "tp": 2, "input_tokens": tokens, "output_tokens": 1024, "repeat": None, "repeats_recorded": 3,
                       "expected_requests": np * 3, "successful_requests": None, "ttft_s": None, "tpot_ms": None,
                       "decode_tps": None, "aggregate_tps": None, "e2e_s": None, "source": "imported", "log_path": None,
                       "log_verified": False, "output_tokens_verified": False, "start_time": None, "end_time": None,
                       "hardware_snapshot": snapshot, "config_snapshot": CONFIG_SNAPSHOT, "error_type": None, "error_message": None}
                if model["id"] == "laguna_fp8":
                    row.update(reported_status="BLOCKED", error_type="server_health_timeout", start_time=LAGUNA_START, end_time=LAGUNA_STOP,
                               error_message="vLLM server did not report healthy before the runner's health timeout; no benchmark case started (exit code 1). Root cause not confirmed.",
                               config_snapshot=dict(CONFIG_SNAPSHOT, framework_version="vLLM 0.31.0 (observed in server log)"),
                               note="Evidence: tail of the runner log (excerpt). The captured server output ends during distributed initialization.")
                elif model["id"] == "gemma31" and tokens == 65536:
                    if np == 4:
                        row.update(reported_status="FAIL", error_type="missing_first_token_or_usage",
                                   error_message="Missing first token / usage at 64K (R1). Root cause not confirmed.",
                                   raw_error=None, raw_error_pending=True)
                    else:
                        row.update(reported_status="UNVERIFIED", note=NOTE_UNPAIRED_64K)
                elif tokens in RECORDED_PASS[model["id"]]:
                    row["reported_status"] = "PASS"
                    if model["id"] == "gemma31" and np == 4:
                        row["ttft_s"], row["tpot_ms"], row["aggregate_tps"] = GEMMA31_NP4[tokens]
                        if tokens == 32768:
                            row["note"] = "Mean of three repeats computed from console logs."
                rows.append(row)
    return rows


# ---- B70 + SGLang XPU, Gemma31: imported from the run's raw/summary CSV content (2026-10-22) ----
EVIDENCE_DIR = Path(__file__).resolve().parent / "fixtures" / "evidence"
SGLANG_MODELS = [{"id": "gemma31", "name": "Gemma 4 31B IT", "quantization": "QAT W4A16 (from repo name)", "model_format": "Safetensors",
                  "repo": "google/gemma-4-31B-it-qat-w4a16-ct", "source_compliance": "unknown",
                  "source_note": "Repo taken from the run command; official-source check pending.",
                  "summary": "NP2/NP4 4K-64K, 3 repeats: every request reported PASS; raw and summary CSV agree. Logs not imported."}]
SGLANG_RUN = {"result_dir": "/home/sparkle/b70_benchmark/frameworks/sglang/results/Gemma31_SGLang_NP24_20261022_163457",
              "client": "frameworks/sglang/scripts/B70_SGLang_np24_V2.py", "port": 18091, "served_model": "/model",
              "container": "sb_b70_sglang_gemma31"}
# Hashes of the ORIGINAL files on the B70. The repository holds a trimmed copy of their content, not the files themselves.
SGLANG_SOURCE_FILES = {"raw_np2.csv": ("e6c36c92231133ded84c77f39a0340efb64015a78aa51abab70a52e7a2853a74", 30),
                       "raw_np4.csv": ("ffa3ede2b5475d9846058b315619543af9a70b01addce5d0a82a52065b5fa0b9", 60),
                       "summary_np2.csv": ("04df104a0e93d03317506314d5e935f7b9281f2fb7dd014d9152eab490e8aa7a", 5),
                       "summary_np4.csv": ("948852ce0bb3889e9ca882752d6f95122ca648b1ed15a6dca5acbc0a6010a3c7", 5)}
# input -> prompt token SHA256 printed by the client (fixed-prompt reproducibility)
SGLANG_PROMPT_SHA = {4096: "dc874ef03d965c57b2c1b1328e4b037e2840fc707040197f4843401492f27b57",
                     8192: "50d5a44d37c00b203c4e360d4e2900c1cecf91d58b286bf9edb3e5dc4e2c856e",
                     16384: "3a673cc267436c2719e46f24eb8a7d35c1fdade811198ffcff2ff23172360d2e",
                     32768: "e4264acc90fe6d93a960e7f603338ef96ce9883fb5c9befc1d60ffcbbccec5cd",
                     65536: "c968d853ab7d69af5d215716e43c3ec611cd721535868c934a324f912ac61ca2"}
SGLANG_CONFIG = {"tp": 2, "port": 18091, "prefix_cache": None, "max_model_len": None, "max_batched_tokens": None,
                 "gpu_memory_utilization": None, "container": None, "container_digest": None, "framework_version": None}
SGLANG_EVIDENCE_PENDING = ["Client logs (Gemma31_NP2.log / Gemma31_NP4.log)", "SGLang server log (saved on the machine)",
                           "Per-request completion-token counts", "Original CSV files (hash recorded)"]


def _read_csv(name):
    with open(EVIDENCE_DIR / name, newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def integrity_report(tolerance=1e-6):
    """Recompute every summary mean from the raw requests and compare; this checks the import, not the original run."""
    raw, summary = _read_csv("b70_sglang_gemma31_raw.csv"), _read_csv("b70_sglang_gemma31_summary.csv")
    groups, problems = {}, []
    for r in raw:
        groups.setdefault((int(r["np"]), int(r["input_tokens"])), []).append(r)
    pairs = [("ttft_sec", "ttft_mean_sec"), ("tpot_ms", "tpot_mean_ms"), ("decode_tps", "decode_tps_mean"), ("e2e_sec", "e2e_mean_sec")]
    for s in summary:
        key, rows = (int(s["np"]), int(s["input_tokens"])), groups.get((int(s["np"]), int(s["input_tokens"])), [])
        if len(rows) != int(s["expected_requests"]) or sum(r["status"] == "PASS" for r in rows) != int(s["successful_requests"]):
            problems.append(f"{key}: request counts differ")
        for raw_col, sum_col in pairs:
            mean_value = fmean(float(r[raw_col]) for r in rows) if rows else None
            if mean_value is None or abs(mean_value - float(s[sum_col])) > tolerance * max(1.0, abs(mean_value)):
                problems.append(f"{key}: {sum_col} differs")
        repeats = {}
        for r in rows:
            repeats.setdefault(r["repeat"], set()).add(r["aggregate_tps"])
        if any(len(v) != 1 for v in repeats.values()) or not rows or abs(fmean(float(next(iter(v))) for v in repeats.values()) - float(s["aggregate_tps_mean"])) > 1e-9:
            problems.append(f"{key}: aggregate_tps differs")
    return {"checked": True, "raw_rows": len(raw), "summary_rows": len(summary), "consistent": not problems, "problems": problems,
            "source_files": {name: {"sha256": h, "data_rows": n} for name, (h, n) in SGLANG_SOURCE_FILES.items()},
            "scope": "Checks that raw and summary agree. It does not replace verification against the client/server logs."}


def build_sglang_rows(machine):
    snapshot = {"gpu_count": machine["gpu_count"], "vram_gb_each": machine["vram_gb"], "ram_gb": machine["ram_gb"], "os": machine["os"]}
    model, groups, rows = SGLANG_MODELS[0], {}, []
    for r in _read_csv("b70_sglang_gemma31_raw.csv"):
        groups.setdefault((int(r["np"]), int(r["input_tokens"]), int(r["repeat"])), []).append(r)
    for (np, tokens, repeat), reqs in sorted(groups.items()):
        ok = [q for q in reqs if q["status"] == "PASS"]
        rows.append({"run_id": f"imp-{MACHINE_ID}-sglang-gemma31-np{np}-{tokens}-r{repeat}", "machine_id": MACHINE_ID, "framework": "sglang",
                     "model": model["id"], "model_repo": model["repo"], "quantization": model["quantization"], "model_format": model["model_format"],
                     "source_verified": False, "source_compliance": model["source_compliance"], "np": np, "tp": 2, "input_tokens": tokens,
                     "output_tokens": 1024, "repeat": repeat, "expected_requests": np, "successful_requests": len(ok),
                     "ttft_s": fmean(float(q["ttft_sec"]) for q in ok) if ok else None, "tpot_ms": fmean(float(q["tpot_ms"]) for q in ok) if ok else None,
                     "decode_tps": fmean(float(q["decode_tps"]) for q in ok) if ok else None, "aggregate_tps": float(reqs[0]["aggregate_tps"]),
                     "e2e_s": fmean(float(q["e2e_sec"]) for q in ok) if ok else None, "source": "imported", "log_path": None, "log_verified": False,
                     "output_tokens_verified": False, "reported_status": "PASS", "prompt_token_sha256": SGLANG_PROMPT_SHA[tokens],
                     "requests": [{"request": int(q["request"]), "status": q["status"], "ttft_s": float(q["ttft_sec"]), "tpot_ms": float(q["tpot_ms"]),
                                   "decode_tps": float(q["decode_tps"]), "e2e_s": float(q["e2e_sec"])} for q in reqs],
                     "note": "Imported from CSV content; client/server logs not imported, so PASS is not confirmed.",
                     "start_time": None, "end_time": None, "hardware_snapshot": snapshot, "config_snapshot": SGLANG_CONFIG,
                     "error_type": None, "error_message": None})
    return rows
