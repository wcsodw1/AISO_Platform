#!/usr/bin/env python3
"""Snapshot of the AISO1 KV cache test for the published AISO1 page (data/benchmark-aiso1/AISO_AISO1_llamacpp_KVcache_B1024.json).

Reads the machine read-only through benchmark/kvcache.py (the same answer the local page shows live) and keeps only what the page needs:
PASS rows (3/3 repeats, averaged by the campaign script), the smoke table and the detected KV types. No paths, IPs or logs.
Usage: python3 scripts/export_aiso1_kvcache.py
"""
import json
import sys
from datetime import datetime
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE))
from benchmark import kvcache  # noqa: E402

OUT = BASE / "data" / "benchmark-aiso1" / "AISO_AISO1_llamacpp_KVcache_B1024.json"


def num(v):
    try:
        f = float(v)
        return f if f == f else None
    except (TypeError, ValueError):
        return None


def main():
    st = kvcache.status()
    if not st.get("ok"):
        raise SystemExit("no answer from the machine: " + str(st.get("error")))
    rows, smoke, smoke_np8, types, campaigns = [], [], [], set(), []
    for stage in ("np1", "np24", "np8fa"):
        c = (st["stages"].get(stage) or {}).get("campaign")
        if not c:
            continue
        campaigns.append(c["name"])
        types.update(c.get("kv_types") or [])
        if stage in ("np1", "np8fa"):      # NP8 is its own campaign (Flash Attention on); its smoke table is kept apart from NP1's
            (smoke if stage == "np1" else smoke_np8).extend({"kv": r["kv_cache_k"], "model": r["model"], "status": r["status"]} for r in (c.get("smoke") or []))
        for np_name, lst in (c.get("results") or {}).items():
            for r in lst or []:
                if r.get("status") != "PASS":
                    continue
                ttft = num(r.get("ttft_ms"))
                rows.append({"np": int(np_name[2:]), "kv": r["kv_cache_k"], "model": r["model"], "input": int(r["input_tokens"]),
                             "ttft_s": ttft / 1000 if ttft is not None else None, "tpot_ms": num(r.get("tpot_ms")),
                             "aggregate_tps": num(r.get("tps_aggregate")), "norm_tps": num(r.get("tps_normalized"))})
    out = {"machine": "AISO1", "framework": "llama.cpp (Vulkan)", "test": "KV cache precision, K = V",
           "protocol": {"batch": 1024, "ubatch": 512, "context_per_slot": 18432, "flash_attention": "off (NP1/2/4) · on (NP8)", "output_tokens": 1024, "repeats": 3},
           "baseline": "f16 of the same campaign", "campaigns": campaigns, "kv_types": sorted(types), "running": bool(st.get("busy")),
           "generated_at": datetime.now().isoformat(timespec="seconds"), "rows": rows, "smoke": smoke, "smoke_np8": smoke_np8}
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
    print(f"wrote {OUT.relative_to(BASE)}: {len(rows)} PASS rows, {len(smoke)} smoke rows, running={out['running']}")


if __name__ == "__main__":
    main()
