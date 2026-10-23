"""Machine profiles: committed examples plus a git-ignored local overlay. No secrets are stored here."""
from __future__ import annotations

import json
import os
from pathlib import Path

from .frameworks import ADAPTER_CLASSES, FRAMEWORK_STATUS

BASE = Path(__file__).resolve().parent
VENDORS = [("nvidia", "NVIDIA"), ("amd", "AMD"), ("intel", "Intel")]
SECRET_KEYS = {"password", "private_key", "passphrase", "token", "secret"}


def _read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def load_machines(local_path=None):
    """Example profiles overlaid by machines.local.json (matched on machine_id)."""
    profiles = {m["machine_id"]: m for m in _read(BASE / "machines.example.json")["machines"]}
    local = Path(local_path or os.environ.get("AISO_BENCHMARK_MACHINES", BASE / "machines.local.json"))
    if local.is_file():
        for machine in _read(local).get("machines", []):
            profiles[machine["machine_id"]] = machine
    for machine in profiles.values():
        validate_profile(machine)
    return profiles


def validate_profile(machine):
    for key in ("machine_id", "display_name", "vendor", "gpu_model", "gpu_count", "ssh", "paths", "frameworks"):
        if key not in machine:
            raise ValueError(f"Machine profile missing {key}")
    if machine["vendor"] not in {v for v, _ in VENDORS}:
        raise ValueError("Unknown vendor")
    leaked = SECRET_KEYS & set(machine["ssh"])
    if leaked:
        raise ValueError(f"Secrets must not be stored in a profile: {sorted(leaked)}")
    for name, spec in machine["frameworks"].items():
        if name not in ADAPTER_CLASSES or spec.get("status") not in FRAMEWORK_STATUS:
            raise ValueError(f"Invalid framework entry: {name}")


def public_profile(machine):
    """Profile as shown to the (loopback/token) admin UI; the key itself is only a profile name."""
    ssh = machine["ssh"]
    configured = not str(ssh.get("host", "")).startswith("REPLACE")
    out = {k: v for k, v in machine.items() if k != "ssh"}
    out["ssh"] = {"configured": configured, "host": ssh["host"] if configured else None,
                  "port": ssh.get("port", 22), "user": ssh["user"] if configured else None,
                  "auth_profile": ssh.get("auth_profile"), "host_key_pinned": bool(ssh.get("host_key_fingerprint"))}
    out["framework_status"] = {
        name: {"status": spec["status"], "label": FRAMEWORK_STATUS[spec["status"]]} for name, spec in machine["frameworks"].items()}
    return out


def mock_preflight(machine, framework):
    """Simulated checks. Nothing is contacted; results are labelled so they cannot be mistaken for real ones."""
    labels = ["SSH connection", "GPU visible", "Docker available", "Model files present", f"{ADAPTER_CLASSES[framework].label} environment"]
    return {"mock": True, "machine_id": machine["machine_id"], "framework": framework,
            "message": "Simulated preflight. No remote connection was made.",
            "checks": [{"name": n, "status": "SIMULATED"} for n in labels]}
