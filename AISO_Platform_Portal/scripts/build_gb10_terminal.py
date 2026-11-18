#!/usr/bin/env python3
"""Build data/terminal/gb10.json from the GB10 run logs (verbatim lines only).

Input: a folder with the logs copied from ~/gb10_benchmark on GB10 (smoke.log, np1.log, np5.log, np5_out64.log, np5_out512.log)
and the runner's sha256 as printed by `sha256sum` on GB10. Missing logs are skipped; nothing is invented.

Usage:
  python3 scripts/build_gb10_terminal.py LOG_DIR --sha256 HEX [--running] [--out data/terminal/gb10.json]
"""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNNER = "GB10_vllm_gemma26_5user_longctx.py"
# the commands that really produced each log (env.sh sets the image, extra vLLM args and GPU_MEM_UTIL=0.54; the long runs override it to 0.70)
STEPS = [
    ("smoke.log", ["cd ~/gb10_benchmark && . ./env.sh", f"python3 -u {RUNNER} smoke > smoke.log 2>&1"]),
    ("np1.log", ["export GPU_MEM_UTIL=0.70", f"python3 -u {RUNNER} run --users 1 --contexts 131072,262144 --output 1024 > np1.log 2>&1"]),
    ("np5.log", [f"python3 -u {RUNNER} run --users 5 --contexts 32768,65536 --output 1024 > np5.log 2>&1"]),
    ("np5_out64.log", [f"python3 -u {RUNNER} run --users 5 --contexts 32768,65536 --output 64 > np5_out64.log 2>&1"]),
    ("np5_out512.log", [f"python3 -u {RUNNER} run --users 5 --contexts 32768,65536 --output 512 > np5_out512.log 2>&1"]),
    # 64K was predicted not to fit (KV) for output 64 / 512: re-run and sent anyway, so the table shows what really happened
    ("np5_64k_out64.log", [f"python3 -u {RUNNER} run --users 5 --contexts 65536 --output 64 --send-anyway > np5_64k_out64.log 2>&1"]),
    ("np5_64k_out512.log", [f"python3 -u {RUNNER} run --users 5 --contexts 65536 --output 512 --send-anyway > np5_64k_out512.log 2>&1"]),
]
HOME = re.compile(r"/home/[A-Za-z0-9_.-]+/")
IP = re.compile(r"\b\d{1,3}(?:\.\d{1,3}){3}\b")


def kind(line):
    if re.search(r"\bPASS\b|PREFLIGHT_OK|^DONE ", line):
        return "ok"
    if re.search(r"\bFAIL\b|\bSKIP\b|Error|Traceback|Killed|OOM", line):
        return "warn"
    return "out"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("log_dir")
    ap.add_argument("--sha256", required=True)
    ap.add_argument("--running", action="store_true", help="a run is still in progress")
    ap.add_argument("--out", default=str(ROOT / "data/terminal/gb10.json"))
    a = ap.parse_args()
    d = Path(a.log_dir)
    transcript = [{"k": "dim", "t": "# GB10 · vLLM long context · " + ("still running (snapshot of the terminal)" if a.running else "finished")}]
    used = []
    for name, cmds in STEPS:
        f = d / name
        if not f.exists() or not f.read_text().strip():
            continue
        used.append(name)
        transcript += [{"k": "cmd", "t": c} for c in cmds]
        for line in f.read_text(errors="replace").splitlines():
            if re.match(r"\s*NOTE running containers", line):      # names other systems on the box (public page): replaced, never copied
                line = "NOTE other services on this machine are not touched"
            line = IP.sub("<ip>", HOME.sub("~/", line.rstrip()))
            if line.strip():
                transcript.append({"k": kind(line.strip()), "t": line})
    data = json.loads(Path(a.out).read_text()) if Path(a.out).exists() else {}
    data.update({
        "title": "GB10 · vLLM",
        "completed": not a.running,
        "summary": "Running" if a.running else "Finished",
        "source": "Verbatim lines from the GB10 run logs in ~/gb10_benchmark (" + ", ".join(used) + "); home paths shortened to ~/, and the list of other services' containers replaced by one line.",
        "target": "GB10",
        "runner": {
            "file": RUNNER,
            "where": "~/gb10_benchmark on GB10",
            "sha256": a.sha256,
            "command": "cd ~/gb10_benchmark && . ./env.sh\n" + "\n".join(c for name, cmds in STEPS if name in used for c in cmds if not c.startswith("cd ")),
            "note": "Each run starts its own vLLM container (sb-gb10-vllm) and removes it at the end. Results: ~/gb10_benchmark/results/<run>/ (summary.csv, case_*.json).",
        },
        "presets": [
            {"label": "Active runs (read-only)", "command": "ps -eo pid,etime,args | grep -E \"[l]ongctx.py|[g]b10_platform_smoke\" || true"},
            {"label": "GB10 vLLM containers (read-only)", "command": "docker ps --filter name=gb10 --format \"{{.Names}} {{.Status}}\""},
            {"label": "Latest summary (read-only)", "command": "cat \"$(ls -t ~/gb10_benchmark/results/*/summary.csv | head -1)\""},
            {"label": "Free memory (read-only)", "command": "grep MemAvailable /proc/meminfo"},
        ],
        "transcript": transcript,
    })
    Path(a.out).write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
    print(f"wrote {a.out}: {len(transcript)} lines from {used}")


if __name__ == "__main__":
    main()
