"""Benchmark workflow: one fixed sequence of steps per machine, with a READ-ONLY status check for each step.

connect -> command -> gpus -> smoke -> full run -> ingest -> report

Only read-only commands are ever sent to a machine (`true`, `hostname`, `nvidia-smi --query-gpu`). Starting a smoke test or a full run is NOT done here:
it needs the operator's approval, the test password (run_auth) and a free GPU, and stays a separate action.
Hosts are reached through the SSH aliases of ~/.ssh/config only (same rule as the terminal service); IP addresses are redacted from every detail text.
"""
from __future__ import annotations

import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

# platform machine id -> (ssh alias, vendor, result page)
MACHINES = {
    "aiso1": ("AISO1-key", "amd", "stress-test-aiso1.html"),
    "pro6000": ("TPIUSER-PRO6000-MNT", "nvidia", "stress-test-pro6000.html"),
}
GROUPS = [   # three big items; each lists its steps and gets a one-line "where are we now" per machine
    ("terminal", "Terminal", "終端連線", ("connect", "command")),
    ("benchmark", "Test benchmark", "測試 Benchmark", ("gpus", "smoke", "full")),
    ("data", "Data", "資料", ("ingest", "report")),
]
STEPS = [
    ("connect", "Connect", "連線"),
    ("command", "Answers a command", "回應指令"),
    ("gpus", "GPUs free", "GPU 可用"),
    ("smoke", "Smoke test", "冒煙測試"),
    ("full", "Full benchmark", "完整測試"),
    ("ingest", "Data on the platform", "資料入平台"),
    ("report", "Result page", "結果頁"),
]
SSH = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "-o", "RemoteCommand=none", "-o", "RequestTTY=no", "-T"]
_IP = re.compile(r"\b\d{1,3}(?:\.\d{1,3}){3}\b")
FREE_MIB = 1024      # a GPU counts as free below this much used memory


def _redact(text: str) -> str:
    return _IP.sub("<ip>", text or "").strip()


def _run(alias: str, command: str, runner=subprocess.run, timeout: int = 20):
    """Returns (returncode, redacted output). Never raises."""
    try:
        p = runner(SSH + [alias, command], capture_output=True, text=True, timeout=timeout)
        return p.returncode, _redact((p.stdout or "") + (p.stderr or ""))
    except Exception as exc:        # timeout, ssh missing, ...
        return 255, _redact(str(exc))


def _step(sid: str, status: str, detail: str = "") -> dict:
    title = next(t for t in STEPS if t[0] == sid)
    return {"id": sid, "title": title[1], "zh": title[2], "status": status, "detail": detail}


def parse_gpus(csv_text: str) -> tuple[int, list[int]]:
    """nvidia-smi 'index,memory.used,memory.total' (nounits) -> (total, free indexes)."""
    total, free = 0, []
    for line in csv_text.splitlines():
        parts = [x.strip() for x in line.split(",")]
        if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
            total += 1
            if int(parts[1]) < FREE_MIB:
                free.append(int(parts[0]))
    return total, free


def check(machine: str, root: Path, runner=subprocess.run) -> dict:
    if machine not in MACHINES:
        raise KeyError(machine)
    alias, vendor, page = MACHINES[machine]
    steps = []
    rc, out = _run(alias, "true", runner)
    if rc != 0:
        detail = "SSH refused: public key not accepted (the host asks for a password)" if "Permission denied" in out else (out[:120] or "no connection")
        steps.append(_step("connect", "fail", detail))
        for sid in ("command", "gpus", "smoke"):
            steps.append(_step(sid, "blocked", "needs a connection"))
    else:
        steps.append(_step("connect", "ok", "SSH key login works"))
        rc, out = _run(alias, "hostname", runner)
        steps.append(_step("command", "ok" if rc == 0 and out else "fail", "replied to `hostname`" if rc == 0 and out else (out[:120] or "no reply")))
        if vendor == "nvidia":
            rc, out = _run(alias, "nvidia-smi --query-gpu=index,memory.used,memory.total --format=csv,noheader,nounits", runner)
            total, free = parse_gpus(out) if rc == 0 else (0, [])
            if rc != 0:
                steps.append(_step("gpus", "fail", "nvidia-smi did not answer"))
            elif free:
                steps.append(_step("gpus", "warn" if len(free) < total else "ok", f"{len(free)} of {total} free (GPU {', '.join(map(str, free))}); the host is shared, other GPUs are in use" if len(free) < total else f"all {total} free"))
            else:
                steps.append(_step("gpus", "warn", f"0 of {total} free - wait or ask the owners"))
        else:
            steps.append(_step("gpus", "todo", "not checked for this vendor yet"))
        steps.append(_smoke_step(machine, root))
    # data-side steps do not need the machine
    reg = json.loads((root / "data" / "benchmark-registry.json").read_text())
    entries = [d for d in reg.get("datasets", []) + reg.get("single_machines", []) if d["machine"] == machine and d.get("file") and (root / d["file"]).is_file()]
    if entries:   # all frameworks of the machine together (AISO1 has llama.cpp + vLLM, PRO6000 has vLLM VIS)
        total, until, names = 0, "", []
        for d in entries:
            ds = json.loads((root / d["file"]).read_text())
            n = len(ds.get(d["runs_key"], []))
            total += n
            until = max(until, ds.get("evidence_until", ""))
            names.append(f"{d['framework']} {n}")
        steps.append(_step("full", "ok" if total else "todo", f"{total} conditions measured ({', '.join(names)})" if total else "no result yet"))
        steps.append(_step("ingest", "ok" if total else "todo", f"{len(entries)} dataset(s) registered · evidence until {until or '?'}"))
    else:
        steps.append(_step("full", "todo", "no result yet"))
        steps.append(_step("ingest", "todo", "no dataset registered"))
    steps.append(_step("report", "ok" if (root / page).is_file() else "todo", page))
    order = [s[0] for s in STEPS]
    steps.sort(key=lambda s: order.index(s["id"]))
    return {"machine": machine, "target": alias, "vendor": vendor, "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "steps": steps, "groups": group(steps)}


def rollup(statuses: list[str]) -> str:
    for s in ("fail", "blocked", "warn"):
        if s in statuses:
            return s
    return "ok" if statuses and all(x == "ok" for x in statuses) else "todo"


def group(steps: list[dict]) -> list[dict]:
    """Three big items with the current position of each, built from the step results (no extra remote calls)."""
    by = {s["id"]: s for s in steps}
    out = []
    for gid, title, zh, ids in GROUPS:
        items = [by[i] for i in ids if i in by]
        status = rollup([i["status"] for i in items])
        where = " · ".join(f"{i['title']}: {i['detail']}" for i in items)
        out.append({"id": gid, "title": title, "zh": zh, "status": status, "where": where, "steps": items})
    return out


def _smoke_step(machine: str, root: Path) -> dict:
    rec = root / "data" / "workflow" / f"{machine}.json"
    if rec.is_file():
        s = json.loads(rec.read_text()).get("smoke")
        if s:
            return _step("smoke", "ok" if s.get("status") == "PASS" else "fail", f"{s.get('status')} · {s.get('at', '')}")
    return _step("smoke", "todo", "not run yet - needs approval, the test password and a free GPU")
