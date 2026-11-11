#!/usr/bin/env python3
"""Build the AISO1 llama.cpp B1024 dataset from the platform snapshot CSV.

Usage: ingest_aiso1_llamacpp_b1024.py <AISO1_B1024_Platform_Snapshot_*.csv>

Only conditions with an Aggregate TPS mean become runs (ttft_s / tpot_ms stay null, nothing is estimated).
Per-repeat Aggregate values are stored only where the terminal log we have reproduces the CSV mean.
Conditions that are partial / deferred / pending are kept out of `aiso1_runs` (listed in `partial_runs` / `not_run`).
"""
import csv, json, statistics, sys
from pathlib import Path

NAMES = {"gemma26": "Gemma26", "gemma31": "Gemma31", "laguna": "Laguna", "nemotron": "Nemotron"}
# per-round Aggregate TPS from the terminal log (R1..R3); used only when mean(rounds) == CSV mean (tolerance 0.1%)
ROUNDS = {
    ("gemma31", 1, 4096): [5.379930, 5.380228, 5.378816], ("gemma31", 1, 8192): [3.023038, 3.050341, 3.039389],
    ("gemma31", 1, 16384): [2.410541, 2.413262, 2.396832], ("gemma31", 2, 4096): [3.553258, 3.533425, 4.173801],
    ("gemma31", 2, 8192): [3.207897, 2.884316, 2.935584], ("gemma31", 2, 16384): [2.265776, 2.203483, 2.201969],
}
OUT = Path(__file__).resolve().parent.parent / "data" / "benchmark-aiso1" / "AISO_AISO1_llamacpp_B1024_20261111.json"


def main(csv_path):
    rows = list(csv.DictReader(open(csv_path, encoding="utf-8")))
    runs, partial, pending = [], [], {}
    run_id = None
    for r in rows:
        if not r.get("model"):
            continue
        m, np_, inp = NAMES[r["model"]], int(r["np"]), int(r["input_tokens"])
        run_id = run_id or r["campaign"]
        fmt = "GGUF " + r["quantization"]
        if r["aggregate_tps_mean"]:
            agg = round(float(r["aggregate_tps_mean"]), 3)
            run = {"model": m, "format": fmt, "np": np_, "input": inp, "ttft_s": None, "tpot_ms": None, "aggregate_tps": agg,
                   "decode_tps": None, "status": "PASS", "run_id": "AISO1_llamacpp_B1024_" + run_id.split("B1024_")[-1], "ttft_over_180s": False}
            rd = ROUNDS.get((r["model"], np_, inp))
            if rd and abs(statistics.mean(rd) - agg) <= 0.001 * agg:
                run["repeats_aggregate_tps"] = [round(x, 3) for x in rd]
            if r["notes"]:
                run["consistency_note"] = r["notes"]
            runs.append(run)
        elif r["status"] == "PENDING":
            pending.setdefault(m, []).append((np_, inp))
        else:
            partial.append({"model": m, "np": np_, "input": inp, "repeats_pass": int(r["repeats_pass_reported"] or 0),
                            "status": r["status"], "reason": r["notes"] or "尚無完整 Aggregate"})
    models_seen = {"Gemma26": "GGUF Q4_0", "Gemma31": "GGUF Q4_0", "Laguna": "GGUF Q4_K_M", "Nemotron": "GGUF Q4_K_M"}
    old = json.loads((OUT.parent / "AISO_AISO1_llamacpp_V4retest_20261109.json").read_text())
    data = {
        "dataset": "AISO_AISO1_llamacpp_B1024_20261111", "evidence_until": "2026-11-11", "generated_on": "2026-11-11",
        "note": f"AISO1 llama.cpp B1024（batch 1024 統一參數）截至 2026-11-11 08:54 的 Runner 快照：{len(runs)} 組完整條件已有 Aggregate TPS（Gemma26 / Gemma31，NP1/2/4）；Laguna、Nemotron 與 NP5 尚在執行或暫緩。Runner 仍在執行，數據會再增加。只有 Aggregate，TTFT／TPOT 尚缺，不估算。",
        "comparability": {"level": "retest_unverified", "text": "這批為 batch 1024 統一參數（Ubatch 512、Context／Slot 18432、KV F16、Flash Attention OFF）的進行中快照，PASS 由 waves.csv 與終端紀錄統計，完整 Raw 驗證與模型來源稽核尚待確認。數值明顯低於 2026-11-09 重測（例如 Gemma26 NP1 4K 25.7 vs 51.0、Gemma31 NP1 4K 5.38 vs 9.34），原因未查明（可能是機器負載、降頻或記憶體壓力，不只是 batch）；Gemma31 NP4 被標為 very slow／outlier，Gemma26 NP4 8K（5.86）低於 16K（7.50）不單調，皆保留原值。"},
        "profile": {"machine": old["profile"]["machine"], "framework": "llama.cpp", "np": [1, 2, 4, 5], "input_tokens": [4096, 8192, 16384],
                    "output_tokens": 1024, "repeat": 3, "runtime": "UNVERIFIED", "batch": 1024, "ubatch": 512, "per_slot_context": 18432,
                    "kv_cache_type": "f16", "flash_attention": "OFF"},
        "aiso1_runs": runs, "partial_runs": partial,
        "not_run": [{"model": m, "reason": "待測（Runner 執行中）", "conditions": len(v)} for m, v in pending.items()],
        "config_by_model": {m: {"repo": None, "format": f, "backend": "llama.cpp（版本未核實）", "tp": None, "max_context": "18432 / slot", "batch": "batch 1024 / ubatch 512",
                                "max_seqs": None, "mem_fraction": None, "cache": "KV f16 · Flash Attention OFF", "run_id": "AISO1_llamacpp_B1024_" + run_id.split("B1024_")[-1], "date": "2026-11-10 ~ 11"} for m, f in models_seen.items()},
        "source_file": Path(csv_path).name + "（Runner " + run_id + "）",
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
    print("wrote", OUT.name, "runs", len(runs), "partial", len(partial), "pending models", {k: len(v) for k, v in pending.items()})


main(sys.argv[1])
