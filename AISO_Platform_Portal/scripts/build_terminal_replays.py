#!/usr/bin/env python3
"""Build data/terminal/{b60,b70,aiso1}.json - the 'Completed run' replays shown by terminal.js.

Usage: build_terminal_replays.py <extracted B60 evidence dir containing campaigns/>

Sources (nothing is invented; each file states where its lines come from):
- B60: reconstructed from the evidence campaign B60_matrix_v4_20261104_201559_715039 (profile.json, summary.csv). Not a verbatim capture.
- B70: the terminal output pasted from the B70 run (Smoke config check + sb_full_20261110_151623_117599). Verbatim lines.
- AISO1: the terminal output pasted from the still-running B1024 run (partial). Runner/manifest files live on AISO1 (pending).
"""
import csv, json, re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "data" / "terminal"


def b60(evidence):
    camp = Path(evidence) / "campaigns" / "B60_matrix_v4_20261104_201559_715039"
    profile = json.loads((camp / "profile.json").read_text())
    rows = [r for r in csv.DictReader(open(camp / "summary.csv")) if r["framework"] == "llamacpp"]
    assert len(rows) == 36 and all(r["status"] == "PASS" for r in rows), "expected 36/36 PASS llama.cpp rows"
    tr = [{"k": "dim", "t": "# Intel B60 Matrix V4 · llama.cpp · NP 1/2/5 × Input 4096/8192/16384 × Output 1024 × Repeat 3 · Smoke excluded"},
          {"k": "cmd", "t": "python3 B60_Benchmark_matrix_v4_261104.py --root ~/b60_benchmark --run"}]
    model = None
    for r in rows:
        if r["model"] != model:
            model = r["model"]
            tr.append({"k": "dim", "t": f"── {model} ──"})
        tr.append({"k": "ok", "t": f"{r['framework']} {r['model']} NP={r['np']} input={r['input_tokens']} PASS  TTFT={float(r['ttft_ms']):.1f} ms  TPOT={float(r['tpot_ms']):.2f} ms/token  Aggregate={float(r['tps_aggregate']):.3f} tok/s  Normalized={float(r['tps_normalized']):.3f}"})
    tr.append({"k": "ok", "t": "llamacpp: 36/36 PASS · 4/4 models complete"})
    keep = {k: profile[k] for k in ("workload", "metrics", "script_sha256", "machine", "images") if k in profile}
    return {"title": "Intel B60 · llama.cpp V4", "completed": True, "summary": "Completed 36/36 PASS (4 models × NP1/2/5 × 4K/8K/16K × 3 repeats)",
            "source": "Reconstructed from the B60 evidence campaign B60_matrix_v4_20261104_201559_715039 (profile.json, summary.csv). Not a verbatim terminal capture; batch 4096 (before the batch-1024 decision).",
            "runner": {"file": "B60_Benchmark_matrix_v4_261104.py", "where": "~/b60_benchmark on the B60 machine (copy in Buffer/Benchmark)", "sha256": profile.get("script_sha256"),
                       "command": "python3 B60_Benchmark_matrix_v4_261104.py --root ~/b60_benchmark --run", "note": "B60 has been returned to the vendor; this run cannot be repeated."},
            "manifest": keep, "target": None, "presets": [], "transcript": tr}


D70 = 'python3 -u "$HOME/b70_benchmark/frameworks/llamacpp/scripts/B70_V4_B1024_llamacpp.py" --platform intel --root "$HOME/b70_benchmark/B70_V4_B1024" --np 1,2,4,5 --ctx 18432 --model-workers 1 2>&1 | tee "$HOME/b70_benchmark/B70_V4_B1024/B70_Full_48.log"'


def b70():
    src = (HERE / "ingest_b70_llamacpp_b1024.py").read_text()
    raw = re.search(r'RAW = """(.*?)"""', src, re.S).group(1).strip().splitlines()
    tr = [{"k": "dim", "t": "# Smoke config check against the B1024 protocol (output of the verification script)"}]
    for key, val in (("--parallel", "10"), ("--ctx-size", "18432"), ("--kv-unified-per-slot", "18432"), ("--batch-size", "1024"), ("--ubatch-size", "512"), ("--cache-type-k", "f16"), ("--cache-type-v", "f16"), ("--kv-unified", ""), ("--no-cache-prompt", ""), ("--no-context-shift", "")):
        tr.append({"k": "ok", "t": f"{key} {val} OK".replace("  ", " ")})
    tr.append({"k": "ok", "t": "SMOKE CONFIG VERIFIED"})
    tr.append({"k": "cmd", "t": 'python3 -u "$S/B70_V4_B1024_llamacpp.py" --platform intel --root "$ROOT" --np 1,2,4,5 --ctx 18432 --model-workers 1 2>&1 | tee "$ROOT/B70_Full_48.log"'})
    tr.append({"k": "out", "t": "full: inputs=[4096, 8192, 16384], output=1024, R=3, NP=[1, 2, 4, 5], model-workers=1"})
    for l in raw:
        m, np_, inp, *rs = l.split()
        for i, v in enumerate(rs, 1):
            tr.append({"k": "ok", "t": f"{m} NP={np_} input={inp} R={i} PASS Aggregate={v}"})
    tr.append({"k": "out", "t": "RESULT_DIR: ~/b70_benchmark/B70_V4_B1024/frameworks/llamacpp/results/sb_full_20261110_151623_117599"})
    manifest = {"protocol": "B60 V4 + batch 1024", "campaign": "sb_full_20261110_151623_117599", "workload": {"np": [1, 2, 4, 5], "inputs": [4096, 8192, 16384], "output": 1024, "repeat": 3, "model_workers": 1},
                "llamacpp_flags_verified_in_smoke": {"--parallel": 10, "--ctx-size": 18432, "--kv-unified-per-slot": 18432, "--batch-size": 1024, "--ubatch-size": 512, "--cache-type-k": "f16", "--cache-type-v": "f16", "--kv-unified": True, "--no-cache-prompt": True, "--no-context-shift": True},
                "not_verified": ["image sha256 / build (B60 used SYCL build 11561, sha256:f457e95a…)", "GGUF SHA256 on the B70", "device / split-mode settings", "TTFT / TPOT (only Aggregate TPS was captured)"]}
    return {"title": "Intel B70 · llama.cpp V4 · batch 1024", "completed": True, "summary": "Completed 48/48 PASS (4 models × NP1/2/4/5 × 4K/8K/16K × 3 repeats)",
            "source": "Verbatim lines from the B70 terminal (Smoke config check and B70_Full_48.log). Only Aggregate TPS was printed; TTFT/TPOT are not in this log.",
            "runner": {"file": "B70_V4_B1024_llamacpp.py", "where": "~/b70_benchmark/frameworks/llamacpp/scripts on the B70 machine", "sha256": None,
                       "command": 'S="$HOME/b70_benchmark/frameworks/llamacpp/scripts"\nROOT="$HOME/b70_benchmark/B70_V4_B1024"\npython3 -u "$S/B70_V4_B1024_llamacpp.py" --platform intel --root "$ROOT" --np 1,2,4,5 --ctx 18432 --model-workers 1 2>&1 | tee "$ROOT/B70_Full_48.log"',
                       "note": "Derived from B70_Benchmark_matrix_v4_llamacpp.py (copy in Buffer/Benchmark); the B1024 runner file itself is on the B70 and has not been copied here."},
            "manifest": manifest, "target": None, "presets": [{"label": "Plan only (no run)", "command": 'python3 -u "$HOME/b70_benchmark/frameworks/llamacpp/scripts/B70_V4_B1024_llamacpp.py" --platform intel --root "$HOME/b70_benchmark/B70_V4_B1024" --plan'}, {"label": "Run full 48 cases", "run": True, "command": D70}], "transcript": tr}


def aiso1():
    lines = [
        ("dim", "# AISO1 llama.cpp B1024 · still running (snapshot of the terminal)"),
        ("cmd", 'python3 "$S/checkpoint_manifest.py"'),
        ("out", "=== PRESERVED GEMMA26 ==="),
        ("out", "CHECKPOINT: 10 /48 cases; 31 /144 waves; NEXT: gemma31/NP1/Input4096/R1"),
        ("cmd", 'python3 -u "$S/AISO1_B1024_remaining.py" 2>&1 | tee "$R/AISO1_Remaining_36.log"'),
        ("out", "AISO1 REMAINING MODELS: ('gemma31', 'laguna', 'nemotron')"),
        ("out", "MATRIX: 12 conditions/model"),
        ("warn", "Gemma26: SKIPPED / ORIGINAL DATA PRESERVED"),
    ]
    rounds = [("gemma31", 1, 4096, [5.379930194751822, 5.380228492720835, 5.378816397648998]), ("gemma31", 1, 8192, [3.0230379357628587, 3.050341381023951, 3.039389466332932]),
              ("gemma31", 1, 16384, [2.4105410597561217, 2.4132623510197964, 2.3968317971495248]), ("gemma31", 2, 4096, [3.553258127491391, 3.5334248898822396, 4.173800761863721]),
              ("gemma31", 2, 8192, [3.2078974970695278, 2.884315994516474, 2.9355838740585862]), ("gemma31", 2, 16384, [2.2657758983135188, 2.2034826531621423, 2.2019685276529746])]
    for m, np_, inp, rs in rounds:
        for i, v in enumerate(rs, 1):
            lines.append(("ok", f"llamacpp/{m} NP={np_} input={inp} R={i} PASS agg={v} norm={v / np_}"))
    lines.append(("warn", "llamacpp/gemma31 NP=4 input=4096 R=2 PASS agg=0.6383648445267487 norm=0.15959121113168717   ← very slow / outlier, kept as is"))
    lines.append(("dim", "… Runner still running (snapshot 2026-11-11 08:54: 19/48 conditions, Laguna and Nemotron not started)."))
    return {"title": "AISO1 · llama.cpp B1024", "completed": False, "summary": "In progress · 18 conditions with Aggregate so far (Gemma26 / Gemma31)",
            "source": "Verbatim lines from the AISO1 terminal (partial). This is NOT a completed run: the completed runner / manifest files are on AISO1 and are still to be provided.",
            "runner": {"file": "AISO1_B1024_remaining.py (+ checkpoint_manifest.py)", "where": "~/aiso1_benchmark/retest_B1024_20261110 on AISO1 (not copied here yet)", "sha256": None,
                       "command": 'S="$HOME/aiso1_benchmark/retest_B1024_20261110"\nR="$HOME/aiso1_benchmark/campaigns/AISO1_llamacpp_B1024_20261110_094603_759433"\npython3 "$S/checkpoint_manifest.py"\npython3 -u "$S/AISO1_B1024_remaining.py" 2>&1 | tee "$R/AISO1_Remaining_36.log"',
                       "note": "Waiting for the runner and manifest from AISO1."},
            "target": "AISO1", "presets": [{"label": "Active runners (read-only)", "command": 'ps -eo pid,ppid,etime,args | grep -E "[A]ISO1_B1024|[l]lama-server" || true'}, {"label": "Original checkpoint (read-only)", "command": 'python3 "$HOME/aiso1_benchmark/retest_B1024_20261110/checkpoint_manifest.py"'}, {"label": "Fastlane status (read-only)", "command": 'cat "$HOME/aiso1_benchmark/retest_B1024_20261110/campaign_fastlane_np12.json" 2>/dev/null || true'}, {"label": "Latest fastlane log (read-only)", "command": 'f=$(ls -t "$HOME"/aiso1_benchmark/retest_B1024_20261110/AISO1_Fastlane_*.log 2>/dev/null | head -1); [ -n "$f" ] && tail -n 20 "$f"'}], "manifest": None, "manifest_note": "The AISO1 manifest has not been provided yet (it is on the AISO1 machine).",
            "transcript": [{"k": k, "t": t} for k, t in lines]}


def main(evidence):
    OUT.mkdir(parents=True, exist_ok=True)
    for name, data in (("b60", b60(evidence)), ("b70", b70()), ("aiso1", aiso1())):
        (OUT / f"{name}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
        print(name, len(data["transcript"]), "lines")


main(sys.argv[1])
