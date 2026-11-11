"""Environment setup checks that run BEFORE any benchmark starts (Step 1 of the Run flow).

`run_preflight(spec, probe, registry)` is a pure function: the executor collects `probe` from the machine (ssh, ps, nvidia-smi / sycl-ls / vulkaninfo,
docker image inspect, sha256sum, df ...), the registry holds what we expect. Every check names the real bug that made it necessary.
Status PASS / WARN / FAIL; the run may start only when nothing FAILs. Nothing here touches a machine, so it is fully unit-tested.
"""
from __future__ import annotations

import re

from .vendors import VendorError, resolve

PROTOCOL = {"batch": 1024, "ubatch": 512, "per_slot_ctx": 18432, "slots": 10, "kv": "f16"}
MIN_DISK_GB = 5
VRAM_HEADROOM = 1.2          # weights x 1.2 must fit in free VRAM before KV cache (B60-SGL-02: 672 MiB allocation failed with 233 MiB free)


def _r(cid, title, bug, status, detail):
    return {"id": cid, "title": title, "bug": bug, "status": status, "detail": detail}


def _norm(text):
    """'Intel(R) Arc(TM) Pro B70 Graphics' and 'Arc Pro B70' must match: drop (R)/(TM), punctuation and case."""
    return " ".join(re.sub(r"\((?:tm|r)\)", " ", str(text), flags=re.I).lower().replace("-", " ").split())


def _flag(cmd, name):
    return cmd[cmd.index(name) + 1] if name in cmd and cmd.index(name) + 1 < len(cmd) else None


def run_preflight(spec, probe, registry):
    res = []
    add = lambda *a: res.append(_r(*a))
    vendor, fw, models = spec["vendor"], spec["framework"], spec["models"]
    try:
        vs = resolve(vendor, fw, spec.get("gpus_used", 1))
    except VendorError as e:
        add("E00", "Vendor / framework settings", "-", "FAIL", str(e))
        return {"ok": False, "results": res, "blocking": [r for r in res if r["status"] == "FAIL"]}
    add("E00", "Vendor settings assigned automatically", "-", "PASS" if vs["verified"] else "WARN",
        f"{vs['vendor']} · {vs['backend']} · {vs.get('runtime')}" + ("" if vs["verified"] else " · UNVERIFIED template: smoke test is mandatory"))

    ssh = probe.get("ssh", {})
    add("E01", "Key-based ssh login works (no password prompt)", "AISO1 asks for a password: automation cannot type it", "PASS" if ssh.get("batch_ok") else "FAIL",
        "BatchMode login ok" if ssh.get("batch_ok") else "set up SSH key login for this machine first")

    dev = probe.get("devices", [])
    want = spec.get("gpu_model", "")
    names = " | ".join(d.get("name", "") for d in dev)
    add("E02", "Installed GPU model is the expected one", "host had its card swapped (B70 -> B60 -> B70)", "PASS" if want and _norm(want) in _norm(names) else "FAIL",
        f"expected '{want}', found: {names or 'no GPU reported'}")

    used = spec.get("gpus_used", 1)
    wanted_list = vs.get("device_list", "")
    ids = {d.get("id") for d in dev}
    ok = used <= len(dev) and all(x in ids for x in wanted_list.split(",") if x)
    add("E03", "Requested devices exist and are the intended cards", "SYCL0,SYCL1 is not necessarily the two intended cards (B70 checklist)", "PASS" if ok else "FAIL",
        f"using {wanted_list or '-'} of {sorted(i for i in ids if i)}")

    busy = probe.get("processes", [])
    add("E04", "No other GPU workload is running", "AISO1 runner: BLOCKED: Existing GPU workload", "PASS" if not busy else "FAIL",
        "GPU idle" if not busy else "running: " + ", ".join(map(str, busy[:5])))

    pm = probe.get("models", {})
    missing = [m for m in models if not pm.get(m, {}).get("exists") or not pm.get(m, {}).get("bytes")]
    add("E05", "Model files are at the expected path", "models imported by hand into different folders", "PASS" if not missing else "FAIL",
        "all present" if not missing else "missing or empty: " + ", ".join(missing))

    bad = []
    for m in models:
        exp = registry.get("models", {}).get(m, {})
        got = pm.get(m, {})
        if not exp.get("sha256") or got.get("sha256") != exp.get("sha256") or exp.get("source") in (None, "UNVERIFIED_LOCAL_SMOKE_ONLY"):
            bad.append(m)
    add("E06", "Model file sha256 and official source are verified", "B60-LLAMA-01: GGUF found but source/integrity unverified; repo UNVERIFIED_LOCAL_SMOKE_ONLY", "PASS" if not bad else "FAIL",
        "all verified" if not bad else "not verified: " + ", ".join(bad))

    rn = probe.get("runner", {})
    rg = registry.get("runners", {}).get(spec.get("runner", ""), {})
    ok = bool(rn.get("exists")) and bool(rg.get("sha256")) and rn.get("sha256") == rg.get("sha256")
    add("E07", "Runner is registered and unchanged (sha256)", "runner variants edited on the machine (fastlane / remaining / NP4-only)", "PASS" if ok else "FAIL",
        "runner matches the registry" if ok else "runner missing, unregistered or changed: register this version first")

    art = probe.get("artifact", {})
    exp_art = registry.get("artifacts", {}).get(f"{vendor}:{fw}", {})
    ok = bool(art.get("sha256")) and art.get("sha256") == exp_art.get("sha256")
    add("E08", "Runtime image / binary is pinned (sha256)", "docker --pull never; AISO1 binary sha256", "PASS" if ok else "FAIL",
        "pinned artifact present" if ok else "image or binary missing or different from the registry")

    if vs.get("help_check_needs_device"):
        hc = probe.get("help_check", {})
        ok = hc.get("with_device") and hc.get("exit_code") == 0
        add("E09", "CLI pre-check runs with the GPU device mounted", "B60-VLLM-03: --help without /dev/dri raised a false 'no device' error", "PASS" if ok else "FAIL",
            "ok" if ok else "pre-check must run with the device mounted and exit 0")

    need = {m: int(pm.get(m, {}).get("bytes", 0) * VRAM_HEADROOM / 1048576) for m in models}
    free = probe.get("vram_free_mib", 0)
    short = [m for m, n in need.items() if n > free]
    add("E10", "Enough free GPU memory for the largest model", "B60-SGL-02: Nemotron OOM with 233 MiB free", "PASS" if not short else "FAIL",
        f"free {free} MiB, largest need {max(need.values()) if need else 0} MiB" + ("" if not short else " - too small for " + ", ".join(short)))

    add("E11", "Disk space and RAM recorded", "RAM was changed on the B70 host (256 GB); load time depends on it", "PASS" if probe.get("disk_free_gb", 0) >= MIN_DISK_GB and probe.get("ram_gb") else "FAIL",
        f"disk {probe.get('disk_free_gb', '?')} GB free, RAM {probe.get('ram_gb', '?')} GB")

    st = probe.get("state_file_exists")
    add("E12", "No unfinished campaign would be overwritten", "AISO1 fastlane: STOP: campaign exists; inspect before restarting", "PASS" if not st or spec.get("resume") else "FAIL",
        "no previous state" if not st else ("resuming from the saved state" if spec.get("resume") else "a saved campaign exists: resume it or choose a new campaign name"))

    plan = spec.get("command_plan") or []
    dev_ok = []
    if fw == "llamacpp":
        for np_ in spec.get("np", []):
            c = plan if not isinstance(plan, dict) else plan.get(np_, [])
            if (_flag(c, "--batch-size"), _flag(c, "--ubatch-size"), _flag(c, "--parallel"), _flag(c, "--kv-unified-per-slot"), _flag(c, "--ctx-size"), _flag(c, "--cache-type-k")) != \
               (str(PROTOCOL["batch"]), str(PROTOCOL["ubatch"]), str(PROTOCOL["slots"]), str(PROTOCOL["per_slot_ctx"]), str(np_ * PROTOCOL["per_slot_ctx"]), PROTOCOL["kv"]):
                dev_ok.append(np_)
    add("E13", "Launch flags match the benchmark protocol (batch 1024, ctx = NP x 18432 ...)", "B60 ran batch 4096; B70 batch 2048 earlier: runs were not comparable", "PASS" if not dev_ok else "FAIL",
        "flags match" if not dev_ok else f"deviation for NP {dev_ok}: the run would not be 'identical parameters'")

    add("E14", "Manifest folder is writable", "handoff packaging was done by hand", "PASS" if probe.get("manifest_dir_writable") else "FAIL",
        "ok" if probe.get("manifest_dir_writable") else "cannot write the run manifest")

    snap = probe.get("snapshot", {})
    add("E15", "Hardware snapshot (driver, OS, GPU, RAM) captured for the manifest", "runtime versions were 'unverified' on most datasets", "PASS" if all(snap.get(k) for k in ("driver", "os", "gpu", "ram_gb")) else "WARN",
        "complete" if all(snap.get(k) for k in ("driver", "os", "gpu", "ram_gb")) else "incomplete: the run can start, the manifest will show unverified fields")

    blocking = [r for r in res if r["status"] == "FAIL"]
    return {"ok": not blocking, "results": res, "blocking": blocking}
