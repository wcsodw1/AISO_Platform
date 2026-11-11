#!/usr/bin/env python3
"""Record WHICH GPU produced each dataset and HOW we know (added after the 10/27 card swap question).

Timeline given by David (2026-11-11): the test host had Intel B70 before 2026-10-27, then B60 (11/04-11/05 runs), and was switched back to B70 on 2026-11-09 for the re-test (11/10 run).
- 'machine-reported' = the run's own environment.json / preflight lists the device name (strong evidence).
- 'inferred' = only the run date + the swap timeline (the dataset itself has no device string).
"""
import json
from pathlib import Path

D = Path(__file__).resolve().parent.parent / "data"
EV = {
    "benchmark-b60/AISO_B60_llamacpp_V4_20261105.json": "機器回報 Arc Pro B60（11/04–05）",
    "benchmark-b60/AISO_B60_vLLM_V4_20261105.json": "機器回報 Arc Pro B60（11/04–05）",
    "benchmark-b60/AISO_B60_SGLang_V4_20261105.json": "機器回報 Arc Pro B60（11/04–05）",
    "benchmark-b70/AISO_B70_llamacpp_V4B1024_20261110.json": "機器回報 Arc Pro B70 ×2（11/10）",
    "benchmark-b70/AISO_B70_vLLM_20261019.json": "推定 B70：執行日 10/19（早於 10/27 換卡），資料內無裝置字串",
    "benchmark-b70/AISO_B70_SGLang_20261022.json": "推定 B70：執行日 10/22（早於 10/27 換卡），資料內無裝置字串",
    "benchmark-aiso1/AISO_AISO1_llamacpp_B1024_20261111.json": "機器回報 Radeon 8060S（RADV GFX1151）",
}
for rel, text in EV.items():
    p = D / rel
    d = json.loads(p.read_text())
    d["profile"]["gpu_evidence"] = text
    p.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
    print("annotated", p.name, "->", text)
