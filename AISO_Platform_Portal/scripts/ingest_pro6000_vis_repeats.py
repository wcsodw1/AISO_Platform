#!/usr/bin/env python3
"""L0 -> L3: per-run (Run1..3) TTFT of the PRO6000 "Without aiDAPTIV" VIS benchmark, for the repeat-stability chart.

Usage: ingest_pro6000_vis_repeats.py <gpt-oss-120b vis_*.txt> <llama-3.3-70b vis_*.txt>
Input lines are Python dict reprs, one per run, in the runner's order: NP -> input (1K,2K,4K,8K,16K) -> output (1K,2K) -> run (3).
Hard stops: wrong line count, successful requests != NP, mean of the 3 TTFT differs from the published (PDF) "Without" value by more than 2 %.
Throughput is NOT taken from these files: their "Mean Output throughput" is the per-request decode rate, a different metric from the PDF's Normalized (Aggregate / NP, includes TTFT), and does not reproduce it (median 6 % apart, up to 97 %).
Only metric values are read; hostnames and paths are not in the files and are not stored.
"""
import ast, hashlib, json, statistics as st, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "benchmark-pro6000" / "AISO_PRO6000_vLLM_VIS_20260825.json"
INS, OUTS = (1024, 2048, 4096, 8192, 16384), (1024, 2048)


def load(path, nps):
    rows = [ast.literal_eval(l) for l in Path(path).read_text().splitlines() if l.startswith("{")]
    assert len(rows) == len(nps) * len(INS) * len(OUTS) * 3, f"{path}: expected {len(nps) * len(INS) * len(OUTS) * 3} runs, got {len(rows)}"
    cells, i = {}, 0
    for n in nps:
        for inp in INS:
            for out in OUTS:
                grp = rows[i:i + 3]; i += 3
                assert all(int(g["Successful requests"]) == n for g in grp), f"NP mismatch at NP{n}/{inp}/{out}"
                assert all(abs(float(g["Input tokens per request"]) - inp * 1000 / 1024) < 1 for g in grp), f"input mismatch at NP{n}/{inp}/{out}"
                cells[(n, inp, out)] = ([float(g["Mean TTFT (ms)"]) for g in grp], [float(g["Mean Output throughput (tok/s)"]) for g in grp])
    return cells


def main(p120, p70):
    ds = json.loads(OUT.read_text())
    runs = {(r["model"], r["output"], r["np"], r["input"]): r for r in ds["pro6000_runs"]}
    added = 0
    for model, path, nps in (("GPT-OSS-120B", p120, (1, 2, 4, 8, 16, 32)), ("Llama-3.3-70B", p70, (16, 32))):
        for (n, inp, out), (ttft, thr) in load(path, nps).items():
            r = runs[(model, out, n, inp)]
            ref_t = r["ttft_ms"]["without"]
            assert abs(st.mean(ttft) - ref_t) <= 0.02 * ref_t + 1, f"{model} NP{n}/{inp}/{out}: TTFT mean {st.mean(ttft):.1f} vs published {ref_t}"
            r["repeats"] = {"without": {"ttft_s": [round(x / 1000, 4) for x in ttft]}}
            added += 1
    ds["provenance"] = {**ds.get("provenance", {}), "vis_without_runs_sha256": {Path(p).name: hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in (p120, p70)}}
    ds["note"] = ds["note"].split(" Without 逐次")[0] + " Without aiDAPTIV 的 3 次逐次 TTFT 取自 PRO6000 原始 vis 結果檔，平均與 PDF 一致（差 0.6% 內）；吞吐、TPOT 與 Cold／Warm 無可核對的逐次數值。"
    OUT.write_text(json.dumps(ds, ensure_ascii=False, indent=1) + "\n")
    print("conditions with per-run Without values:", added)


main(sys.argv[1], sys.argv[2])
