#!/usr/bin/env python3
"""L0 -> L2/L3: turn the AISO1 handoff folder into the platform dataset and terminal metadata.

Usage: ingest_aiso1_handoff.py <AISO1_Platform_Handoff dir>      (dir holds aiso1_manifest.json, aiso1_platform_cases.csv, runner_sha256_manifest.json, zips)

Validation (hard stop on failure): 48 rows, PASS rows == manifest.complete_cases, every PASS has ttft/tpot/aggregate/normalized.
Only the PUBLIC files are read (platform_cases / manifest / runner hashes). aiso1_private_cases.csv (server paths) and the runner zips stay in L0.
Nothing is estimated: pending / deferred / partial conditions are listed, never filled.
"""
import csv, hashlib, json, re, sys, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NAMES = {"gemma26": "Gemma26", "gemma31": "Gemma31", "laguna": "Laguna", "nemotron": "Nemotron"}
FMT = {"gemma26": "GGUF Q4_0", "gemma31": "GGUF Q4_0", "laguna": "GGUF Q4_K_M", "nemotron": "GGUF UD-Q4_K_M"}
OUT = ROOT / "data" / "benchmark-aiso1" / "AISO_AISO1_llamacpp_B1024_20261111.json"
TERM = ROOT / "data" / "terminal" / "aiso1.json"


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def preflight_public(d):
    """Public-safe launch parameters from the newest handoff ZIP's private/runners/preflight.json (paths, hostname, binary path, file hashes are NOT copied)."""
    zips = sorted(Path(d).glob("AISO1_Runner_Manifest_Handoff_*.zip"))
    if not zips:
        return {}
    pf = json.loads(zipfile.ZipFile(zips[-1]).read("private/runners/preflight.json"))
    w, commit = pf["workload"], re.search(r"commit (\w+)", pf.get("version", ""))
    assert (w["batch"], w["ubatch"], w["slots"], w["context_per_request"], w["kv"], w["flash_attention"], w["split"]) == (1024, 512, 10, 18432, "f16", "off", "layer"), "preflight differs from the agreed B1024 protocol"
    return {"slots": w["slots"], "per_slot_context": w["context_per_request"], "total_kv_by_np": w["total_kv"], "split": w["split"], "backend": w["backend"],
            "prefix_cache": "OFF" if not w["cache_prompt"] else "ON", "kv_cache_type": w["kv"], "flash_attention": w["flash_attention"].upper(), "cpu_threads": w["cpu_threads"],
            "gpu_count": pf.get("device_count"), "runtime": f"llama.cpp commit {commit.group(1) if commit else '?'} · {w['backend']} (RADV GFX1151)", "metrics_version": pf["metrics"]["version"],
            "metric_definitions": {k: pf["metrics"][k] for k in ("ttft", "tpot", "aggregate", "normalized")}}


def main(d):
    d = Path(d)
    man = json.loads((d / "aiso1_manifest.json").read_text())
    rows = list(csv.DictReader((d / "aiso1_platform_cases.csv").open()))
    rsha = json.loads((d / "runner_sha256_manifest.json").read_text())
    passed = [r for r in rows if r["status"] == "PASS"]
    missing = [r for r in passed if any(not r.get(k) for k in ("ttft_ms", "tpot_ms", "tps_aggregate", "tps_normalized"))]
    assert len(rows) == 48 == man["expected_cases"], "expected 48 rows"
    assert len(passed) == man["complete_cases"], "PASS rows != manifest.complete_cases"
    assert not missing, f"{len(missing)} PASS rows miss a KPI"
    runs, partial, pending = [], [], {}
    for r in rows:
        m, np_, inp = NAMES[r["model"]], int(r["np"]), int(r["input_tokens"])
        if r["status"] == "PASS":
            runs.append({"model": m, "format": FMT[r["model"]], "np": np_, "input": inp, "ttft_s": round(float(r["ttft_ms"]) / 1000, 3), "tpot_ms": round(float(r["tpot_ms"]), 3),
                         "aggregate_tps": round(float(r["tps_aggregate"]), 3), "decode_tps": None, "status": "PASS", "campaign": r["source_campaign"], "valid_repeats": int(r["valid_repeats"]), "ttft_over_180s": float(r["ttft_ms"]) >= 180000})
        elif r["status"] == "PENDING":
            pending.setdefault(m, []).append((np_, inp))
        else:
            partial.append({"model": m, "np": np_, "input": inp, "valid_repeats": int(r["valid_repeats"] or 0), "status": r["status"]})
    stamp = man["generated_at"]
    zips = sorted(d.glob("AISO1_Runner_Manifest_Handoff_*.zip"))
    data = {
        "dataset": "AISO_AISO1_llamacpp_B1024_20261111", "evidence_until": "2026-11-11", "generated_on": "2026-11-11",
        "note": f"AISO1 llama.cpp B1024（batch 1024 統一參數）：{len(runs)} / 48 條件完整（TTFT／TPOT／Aggregate／Normalized 皆有），交接包 {stamp}；Runner 仍在執行，Laguna、Nemotron 尚未全部完成；NP5 跑不動，已省略（不列為缺口）。",
        "comparability": {"level": "retest_unverified", "text": f"{man['note']}；驗證：{man['validation']}。參數：Batch 1024 / Ubatch 512 / Context 18432 每 slot / KV f16 / Flash Attention off。數值明顯低於 2026-11-09 重測，原因未查明（Gemma31 NP4 在原 log 標為 very slow／outlier，保留原值）。"},
        "profile": {"machine": "AISO1 AMD (Radeon 8060S · RADV GFX1151 · Vulkan0 97 GiB)", "framework": "llama.cpp", "np": man["workload"]["np"], "input_tokens": man["workload"]["input_tokens"], "output_tokens": man["workload"]["output_tokens"],
                    "repeat": man["workload"]["repeat"], "runtime": "UNVERIFIED", **preflight_public(d), "batch": man["workload"]["batch_size"], "ubatch": man["workload"]["ubatch_size"], "per_slot_context": 18432, "kv_cache_type": man["workload"]["kv_type"], "flash_attention": man["workload"]["flash_attention"]},
        "aiso1_runs": runs, "partial_runs": partial,
        "not_run": [{"model": m, "reason": "待測（Runner 執行中）", "conditions": len(v)} for m, v in pending.items()],
        "config_by_model": {NAMES[k]: {"repo": None, "format": FMT[k], "backend": "llama.cpp（版本未核實）", "tp": None, "max_context": "18432 / slot", "batch": "batch 1024 / ubatch 512", "max_seqs": 10, "mem_fraction": None,
                                       "cache": "KV f16 · Flash Attention off", "run_id": f"AISO1_llamacpp_B1024 (handoff {stamp})", "date": "2026-11-10 ~ 11"} for k in man["models"]},
        "source_file": f"AISO1 handoff {stamp}: aiso1_platform_cases.csv, aiso1_manifest.json",
        "provenance": {"handoff_stamp": stamp, "zip_sha256": {z.name: sha(z) for z in zips}, "runner_sha256": rsha, "cases_csv_sha256": sha(d / "aiso1_platform_cases.csv"), "manifest_sha256": sha(d / "aiso1_manifest.json")},
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
    # terminal metadata (public parts only)
    t = json.loads(TERM.read_text())
    t["manifest"] = man
    t["manifest_note"] = None
    t["summary"] = f"In progress · {len(runs)}/48 conditions complete (handoff {stamp})"
    t["runner"]["sha256"] = None
    t["runner"]["files_sha256"] = rsha
    t["runner"]["note"] = "Runner / manifest are archived on AISO1 (L0 copy on the Mac in Buffer/Benchmark/AISO1_evidence). Only hashes are published here."
    t["source"] = "Verbatim lines from the AISO1 terminal (partial) · manifest and runner hashes from the AISO1 handoff package. Not a completed run."
    TERM.write_text(json.dumps(t, ensure_ascii=False, indent=1) + "\n")
    print("wrote", OUT.name, "runs", len(runs), "partial", len(partial), "pending", {k: len(v) for k, v in pending.items()}, "| terminal metadata updated")


main(sys.argv[1])
