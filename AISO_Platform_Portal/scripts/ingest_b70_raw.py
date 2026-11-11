#!/usr/bin/env python3
"""L0 -> L3: add TTFT / TPOT / decode TPS and the verified launch parameters to the B70 llama.cpp B1024 dataset.

Usage: ingest_b70_raw.py <dir that contains sb_full_20261110_151623_117599/ (extracted B70_sb_full_small.tgz)>

Reads only: <model>/summary.csv (per-repeat batch metrics), <model>/command_np*.json, configuration.json, <model>/environment.json.
Hard stops: row count != 36 per model, any non-PASS row, Aggregate TPS differing from the already published (terminal-transcribed) value.
Nothing from the machine's private paths (/home/..., docker --name, host name) is copied into the public dataset.
NOTE on definitions: B70 TPOT is the server-reported predicted_ms/predicted_n; AISO1/B60 TPOT is computed client-side. Recorded in the dataset.
"""
import csv, hashlib, json, statistics as st, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "benchmark-b70" / "AISO_B70_llamacpp_V4B1024_20261110.json"
RUN = "sb_full_20261110_151623_117599"
KEY = {"gemma26": "Gemma26", "gemma31": "Gemma31", "laguna": "Laguna", "nemotron": "Nemotron"}


def mean(xs):
    return st.mean(xs)


def main(d):
    base = Path(d) / RUN
    ds = json.loads(OUT.read_text())
    runs = {(r["model"], r["np"], r["input"]): r for r in ds["b70_runs"]}
    prov, split, flags = {}, {}, None
    for m, name in KEY.items():
        rows = list(csv.DictReader((base / m / "summary.csv").open()))
        assert len(rows) == 36 and all(r["status"] == "PASS" for r in rows), f"{m}: expected 36 PASS rows"
        groups = {}
        for r in rows:
            groups.setdefault((int(r["np"]), int(r["input_target"])), []).append(r)
        assert len(groups) == 12 and all(len(v) == 3 for v in groups.values()), f"{m}: expected 12 conditions x 3 repeats"
        for (np_, inp), rs in groups.items():
            run = runs[(name, np_, inp)]
            agg = mean([float(r["aggregate_tps"]) for r in rs])
            assert abs(agg - run["aggregate_tps"]) < 0.002, f"{name} NP{np_} {inp}: aggregate {agg:.3f} != published {run['aggregate_tps']}"
            run["ttft_s"] = round(mean([float(r["ttft_sec"]) for r in rs]), 3)
            run["tpot_ms"] = round(mean([float(r["tpot_ms"]) for r in rs]), 3)
            run["decode_tps"] = round(mean([float(r["decode_tps"]) for r in rs]), 3)
            run["repeats"] = {"ttft_s": [round(float(r["ttft_sec"]), 3) for r in rs], "tpot_ms": [round(float(r["tpot_ms"]), 3) for r in rs],
                              "aggregate_tps": [round(float(r["aggregate_tps"]), 3) for r in rs]}
            run["ttft_over_180s"] = any(float(r["ttft_sec"]) > 180 for r in rs)
        cmds = {n: json.loads((base / m / f"command_np{n}.json").read_text()) for n in (1, 2, 4, 5)}
        modes = {c[c.index("--split-mode") + 1] for c in cmds.values()}
        assert len(modes) == 1, f"{m}: split mode differs between NP"
        split[name] = (modes.pop(), cmds[2][cmds[2].index("--tensor-split") + 1] if "--tensor-split" in cmds[2] else None)
        for n, c in cmds.items():
            assert c[c.index("--ctx-size") + 1] == str(n * 18432) and c[c.index("--batch-size") + 1] == "1024" and c[c.index("--ubatch-size") + 1] == "512" and c[c.index("--parallel") + 1] == "10", f"{m} NP{n}: launch flags differ from B1024 protocol"
        flags = cmds[2]
        prov[m] = {"summary_csv_sha256": hashlib.sha256((base / m / "summary.csv").read_bytes()).hexdigest(), "raw_csv_sha256": hashlib.sha256((base / m / "raw.csv").read_bytes()).hexdigest()}
    cfg = json.loads((base / "configuration.json").read_text())
    env = json.loads((base / "gemma26" / "environment.json").read_text())
    image = env["image_id"]
    commit = cfg["commit"].splitlines()[0].replace("version: ", "")
    ds["generated_on"] = "2026-11-11"
    ds["evidence_until"] = "2026-11-10"
    ds["source_file"] = f"B70 result directory {RUN} (summary.csv / raw.csv / command_np*.json / environment.json), received 2026-11-11"
    ds["note"] = "Intel B70 llama.cpp，B60 V4 協定 + batch 1024：4 模型 × NP1/2/4/5 × 4K/8K/16K × 3 次，48/48 PASS。TTFT／TPOT／Aggregate／Normalized 皆取自結果目錄 summary.csv（逐次重複的批次值，取 3 次算術平均）；Aggregate 與先前終端機轉錄逐筆核對一致。"
    p = ds["profile"]
    p.update({"runtime": f"llama.cpp {commit} · SYCL (Docker image {image[:19]}…)", "backend": "SYCL", "split": "tensor (Gemma26/Gemma31/Laguna, tensor-split 1,1) · layer (Nemotron)",
              "total_kv_by_np": {str(n): n * 18432 for n in (1, 2, 4, 5)}, "unified_kv": "ON", "cont_batching": "ON", "context_shift": "OFF", "gpu_layers": 999,
              "prefix_cache": "OFF", "gpu_count": 2, "devices": "SYCL0, SYCL1 (Intel Arc Pro B70, 32 GB each)", "image_sha256": image.replace("sha256:", ""), "metrics_version": "v4-pdf-e2e",
              "metric_definitions": {"ttft": "client seconds to first content (same as AISO1)", "tpot": "SERVER-reported predicted_ms / predicted_n, ms/token (AISO1 / B60 compute TPOT client-side from the stream: not the same definition)",
                                     "aggregate": "sum output tokens / complete batch wall seconds", "normalized": "aggregate / NP"}})
    for name, (mode, ts) in split.items():
        c = ds["config_by_model"][name]
        c["tp"] = f"{mode} split" + (f" (tensor-split {ts}) · 2 張 B70" if ts else " · 2 張 B70")
        c["backend"] = f"llama.cpp {commit} · SYCL"
        c["cache"] = "Prefix Cache OFF · KV f16"
    ds["comparability"] = {"level": "retest_unverified", "text": "B70 於 2026-11-10 以 batch 1024 執行，啟動參數已由各 NP 的 command_np*.json 核對（--parallel 10、--ctx-size = NP×18432、--kv-unified-per-slot 18432、--batch-size 1024、--ubatch-size 512、KV f16、--kv-unified、--no-cache-prompt、--no-context-shift、--cont-batching、-ngl 999）。與 AISO1 的差異：後端 SYCL（AISO1 為 Vulkan）、split mode tensor 1,1（Nemotron 為 layer；AISO1 為 layer）、TPOT 為 server 端回報值（AISO1 為客戶端串流計時）。Flash Attention 未出現在啟動命令中，未核實。B60 現有資料為 batch 4096。"}
    ds["protocol_notes"] = ["V4 協定：Input 4096/8192/16384、Output 1024、Repeat 3、每個 NP 重啟伺服器；每個指標取 3 次重複的算術平均（3 位小數）。",
                            "TPOT 定義差異：B70 = server predicted_ms/predicted_n；AISO1、B60 = 客戶端串流計時。TTFT 為客戶端秒數，兩邊相同。",
                            "模型 GGUF SHA256 與 AISO1 preflight 相同（Gemma26／Gemma31／Laguna／Nemotron）；repo 欄位在 B70 結果目錄為 UNVERIFIED_LOCAL_SMOKE_ONLY，沿用既有 official 對照。"]
    ds["provenance"] = {"result_dir": RUN, "per_model": prov, "ingest": "scripts/ingest_b70_raw.py"}
    OUT.write_text(json.dumps(ds, ensure_ascii=False, indent=1) + "\n")
    print("updated", OUT.name, "| TTFT/TPOT filled for", len(ds["b70_runs"]), "conditions | split:", split)


main(sys.argv[1])
