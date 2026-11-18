"""SSH executor with a fixed allowlist: the platform can ONLY run these actions on a machine (no free-form command ever reaches the host).

  models       read-only   newest preflight profile -> model list, llama.cpp version, device
  busy         read-only   is a benchmark runner or llama-server already running?
  status       read-only   busy flag + the last lines of the newest platform smoke log
  start_smoke  STARTS a run  the machine's own runner in smoke mode (one request per model); refused while the machine is busy

Starting a run is gated by the one-time test-password ticket in the launcher (run_auth). Hosts are reached through ~/.ssh/config aliases only;
IP addresses and home-directory paths are removed from everything returned.
"""
from __future__ import annotations

import hashlib
import json
import re
import shlex
import subprocess
from pathlib import Path

BASE = Path(__file__).resolve().parent
CFG = {
    "aiso1": {"alias": "AISO1-key", "dir": "aiso1_benchmark/retest_B1024_20261110", "runner": "AISO1_B1024.py", "root": "aiso1_benchmark", "framework": "llama.cpp", "tier": "mini-workstation",
              "manifest": BASE / "manifests" / "aiso1_platform_smoke.manifest.json",
              # test parameters: the limits of THIS machine (the defaults come from its scale, TIER_DEFAULTS); "fixed" = set by the machine's own protocol (B1024 always asks for 1024 output tokens)
              "params": {"np": {"min": 1, "max": 4}, "input": {"min": 256, "max": 16384}, "output": {"fixed": True}, "repeat": {"min": 1, "max": 3}},
              "standard": {"inputs": {"min": 256, "max": 16384, "count": 4}, "nps": {"min": 1, "max": 4, "count": 4},
                           "repeats": {"min": 1, "max": 3}, "output": {"fixed": True}}},
    # shared 8-GPU host: only GPU 1 is ever used; a run is refused while GPU 1 holds other work. The runner starts the machine's own aiDAPTIV container for GPU 1.
    "pro6000": {"alias": "TPIUSER-PRO6000-MNT", "root": "aiso_platform_runs", "runner": "pro6000_platform_smoke.py", "kind": "docker-gpu1", "framework": "vLLM", "tier": "server",
                "manifest": BASE / "manifests" / "pro6000_platform_smoke.manifest.json",
                "params": {"np": {"min": 1, "max": 4}, "input": {"min": 128, "max": 16000}, "output": {"min": 16, "max": 1024}, "repeat": {"fixed": True}},
                "standard": {"inputs": {"min": 128, "max": 16384, "count": 4}, "nps": {"min": 1, "max": 4, "count": 4},
                             "repeats": {"min": 1, "max": 3}, "output": {"min": 16, "max": 1024}},
                "max_total_tokens": 19500,      # input + output must fit the model length of the machine's own flags (20000)
                "static_models": [{"id": "GPT-OSS-20B", "quant": "MXFP4", "repo": "openai/gpt-oss-20b", "size_gb": 13, "path": "~/Desktop/TPI_AISO_NEW/models/GPT-OSS-20B/config.json"}],      # quant_method mxfp4 in config.json; 13 GB = the safetensors the server loads (the folder is 39 GB because it also keeps two copies)
                "version": "vLLM 0.12.0 (aiDAPTIV image aidaptiv:vNXUN_3_03_AA), Without aiDAPTIV", "device": "NVIDIA RTX PRO 6000 Blackwell · GPU 1 only"},
    # same shared host, llama.cpp CUDA image, GPU 1 only. Own folder / logs so it never mixes with the vLLM runs. Smoke only (no standard runner yet, and the comparison GGUFs are not on this host).
    "pro6000_llamacpp": {"alias": "TPIUSER-PRO6000-MNT", "root": "aiso_platform_runs_llamacpp", "runner": "pro6000_llamacpp_smoke.py", "kind": "docker-gpu1", "framework": "llama.cpp", "tier": "server",
                         "manifest": BASE / "manifests" / "pro6000_llamacpp_smoke.manifest.json",
                         "params": {"np": {"min": 1, "max": 4}, "input": {"min": 128, "max": 16000}, "output": {"min": 16, "max": 1024}, "repeat": {"fixed": True}},
                         "standard": None, "max_total_tokens": 19500,
                         "static_models": [{"id": "gemma26", "quant": "BF16", "repo": "google/gemma-4-26B-A4B-it", "size_gb": 48, "path": "~/Desktop/TPI_AISO_NEW/models/gemma-4-26B-A4B-it-GGUF/BF16/gemma-4-26B-A4B-it-BF16-00001-of-00002.gguf"}],
                         "version": "llama.cpp (CUDA image ghcr.io/ggml-org/llama.cpp:server-cuda), model already on the host (BF16)", "device": "NVIDIA RTX PRO 6000 Blackwell · GPU 1 only"},
    # GB10: one 128 GB pool shared by CPU and GPU, other services on the same box. The runner refuses to start while another GB10 benchmark runs or < 60 GB is free.
    "gb10": {"alias": "GB10-key", "root": "aiso_platform_runs", "runner": "gb10_platform_smoke.py", "kind": "gb10", "framework": "vLLM", "tier": "mini-workstation",
             "manifest": BASE / "manifests" / "gb10_platform_smoke.manifest.json",
             "params": {"np": {"min": 1, "max": 5}, "input": {"min": 128, "max": 131072}, "output": {"min": 16, "max": 1024}, "repeat": {"fixed": True}},
             "standard": {"inputs": {"min": 128, "max": 131072, "count": 4}, "nps": {"min": 1, "max": 5, "count": 4},
                          "repeats": {"min": 1, "max": 3}, "output": {"min": 16, "max": 1024}},
             "static_models": [{"id": "gemma26", "quant": "BF16 weights · fp8 KV", "repo": "google/gemma-4-26B-A4B-it", "size_gb": 48,
                                "path": "~/gb10_models/hf/hub/models--google--gemma-4-26B-A4B-it"}],
             "version": "vLLM (lmcache/vllm-openai:nightly-2026-11-02), memory share 0.70", "device": "NVIDIA GB10 · 128 GB unified memory"},
}
# One default per scale (Consumer / Mini-workstation / Server): every machine of that scale starts from these values and the operator may adjust them inside the machine's limits.
# A scale without an entry here (Consumer) has no executor default yet - the first machine of that scale has to define it.
TIER_DEFAULTS = {
    "mini-workstation": {"smoke": {"np": 1, "input": 4096, "output": 1024, "repeat": 1}, "standard": {"inputs": [4096, 8192, 16384], "nps": [1, 2, 4], "repeats": 3, "output": 1024}},
    "server": {"smoke": {"np": 1, "input": 4000, "output": 200, "repeat": 1}, "standard": {"inputs": [4096, 8192, 16384], "nps": [1, 2, 4], "repeats": 3, "output": 1024}},
}
TIER_OVERRIDE = {"pro6000_llamacpp": {"smoke": {"output": 128}}}      # smoke only needs a short answer; input / NP follow the scale default
for _c in CFG.values():
    _t = TIER_DEFAULTS[_c["tier"]]
    for _k, _v in _t["smoke"].items():
        _c["params"][_k]["default"] = _v
    for _k, _v in _t["standard"].items():
        if _c["standard"]:
            _c["standard"][_k]["default"] = _v
for _m, _o in TIER_OVERRIDE.items():
    for _k, _v in _o.get("smoke", {}).items():
        CFG[_m]["params"][_k]["default"] = _v
def _remote_path(p):
    """Quote a path for the remote shell; a leading ~/ is expanded to the remote $HOME (quotes would otherwise stop the expansion)."""
    return '"$HOME"/' + shlex.quote(p[2:]) if p.startswith("~/") else shlex.quote(p)


def _apply_local_overrides():
    """Machine-specific values live in benchmark/executor.local.json (git-ignored), never in the repository:
    {"gb10": {"model_path": "<where the bf16 model folder is on GB10>", "hf_dir": "<HF cache dir passed to the GB10 runner>"}}"""
    f = BASE / "executor.local.json"
    if not f.is_file():
        return
    try:
        o = json.loads(f.read_text(encoding="utf-8")).get("gb10", {})
    except ValueError:
        return
    if o.get("model_path"):
        CFG["gb10"]["static_models"][0]["path"] = o["model_path"]
    if o.get("hf_dir"):
        CFG["gb10"]["env"] = {"GB10_HF_DIR": o["hf_dir"]}


_apply_local_overrides()

SSH = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "-o", "RemoteCommand=none", "-o", "RequestTTY=no", "-T"]
_IP = re.compile(r"\b\d{1,3}(?:\.\d{1,3}){3}\b")
_HOME = re.compile(r"/home/[A-Za-z0-9_.-]+/")

MAX_CASES = 120

MODELS_PY = r'''
import json, pathlib
root = pathlib.Path.home() / "{root}" / "campaigns"
ps = sorted(root.glob("*/profile.json"), key=lambda p: p.stat().st_mtime)
d = None
for p in reversed(ps):          # newest campaign that really has the verified model table (other work, e.g. the UX latency test, writes profiles with a model LIST: skipped)
    try:
        x = json.loads(p.read_text())
    except ValueError:
        continue
    if isinstance(x.get("models"), dict) and x["models"]:
        d = x
        break
if d is None:
    raise SystemExit("no campaign profile with a model table")
print(json.dumps({{"models": {{k: {{"quant": v.get("quant"), "repo": v.get("repo"), "bytes": v.get("bytes")}} for k, v in d["models"].items()}}, "version": d.get("version", "").splitlines()[0] if d.get("version") else None, "device": d.get("device_description")}}))
'''
# GB10: our runner, a manual GB10 benchmark, or a GB10 vLLM container is running, OR less than 60 GB is free (other services hold the shared memory)
BUSY_GB10_SH = ("n=$(pgrep -af 'gb10_platform_smoke\\.py|longctx\\.py (run|smoke)|GB10_vllm_gemma26_matrix\\.py|run_quant_queue' | grep -v pgrep | wc -l); "
                "c=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -cE '^(sb-gb10-|aiso_platform_gb10_)'); "
                "f=$(awk '/MemAvailable/{printf \"%d\", $2/1048576}' /proc/meminfo); "
                "echo $((n + c + (f < 60 ? 1 : 0)))")
BUSY_SH = "pgrep -af '{runner_glob}|aiso1_platform_smoke\\.py|llama-server' | grep -v pgrep | wc -l"
# PRO6000: our smoke runner is running, OR GPU 1 is held by other work (> 1 GiB used)
BUSY_GPU1_SH = ("n=$(pgrep -af 'pro6000_(platform|llamacpp)_smoke\\.py' | grep -v pgrep | wc -l); "
                "m=$(nvidia-smi -i 1 --query-gpu=memory.used --format=csv,noheader,nounits 2>/dev/null | head -1); "
                "if [ -z \"$m\" ]; then echo 1; else echo $((n + (m > 1024 ? 1 : 0))); fi")


def _clean(text: str) -> str:
    return _HOME.sub("~/", _IP.sub("<ip>", text or "")).strip()


def _ssh(alias, command, runner=subprocess.run, timeout=30):
    try:
        p = runner(SSH + [alias, command], capture_output=True, text=True, timeout=timeout)
        return p.returncode, (p.stdout or ""), (p.stderr or "")
    except subprocess.TimeoutExpired:
        return 124, "", "ssh timed out"
    except Exception as exc:
        return 255, "", _clean(str(exc))


def _cfg(machine):
    if machine not in CFG:
        raise KeyError(machine)
    return CFG[machine]


def models(machine, runner=subprocess.run):
    c = _cfg(machine)
    if c.get("static_models"):      # one-GPU models only; the machine is checked to answer
        # the list is fixed in the platform, but each entry is only offered when its file is really on the machine (checked now, read-only)
        paths = [m["path"] for m in c["static_models"] if m.get("path")]
        # each path is answered by its NUMBER (a leading ~/ is expanded on the machine, so the path itself would not match what is configured here)
        rc, out, err = _ssh(c["alias"], "true; " + "; ".join(f"[ -e {_remote_path(x)} ] && echo {i}" for i, x in enumerate(paths)), runner)
        if rc != 0:
            return {"ok": False, "error": _clean(err) or "no answer"}
        found = {paths[int(n)] for n in out.split() if n.isdigit() and int(n) < len(paths)}
        present = [{k: v for k, v in m.items() if k != "path"} for m in c["static_models"] if not m.get("path") or m["path"] in found]
        if not present:
            return {"ok": False, "error": "none of the configured models was found on the machine"}
        return {"ok": True, "models": present, "version": c.get("version"), "device": c.get("device"), "framework": c.get("framework"), "params": c.get("params"), "standard": c.get("standard"), "tier": c.get("tier")}
    rc, out, err = _ssh(c["alias"], "python3 - <<'PY'" + MODELS_PY.format(root=c["root"]) + "PY", runner)
    if rc != 0:
        return {"ok": False, "error": _clean(err) or "no answer"}
    d = json.loads(out)
    return {"ok": True, "models": [{"id": k, **v} for k, v in d["models"].items()], "version": d.get("version"), "device": d.get("device"), "framework": c.get("framework"), "params": c.get("params"), "standard": c.get("standard"), "tier": c.get("tier")}


def busy(machine, runner=subprocess.run):
    c = _cfg(machine)
    if c.get("kind") == "gb10":
        rc, out, err = _ssh(c["alias"], BUSY_GB10_SH, runner)
        return rc != 0 or out.strip() not in ("0",)      # no answer counts as busy: never start blind
    if c.get("kind") == "docker-gpu1":
        rc, out, err = _ssh(c["alias"], BUSY_GPU1_SH, runner)
        return rc != 0 or out.strip() not in ("0",)      # no answer from nvidia-smi counts as busy: never start blind
    rc, out, err = _ssh(c["alias"], BUSY_SH.format(runner_glob="AISO1_[A-Za-z0-9_]*\\.py"), runner)
    return rc == 0 and out.strip() not in ("", "0")


_LOADING = re.compile(r"LOADING:\s+([\w.-]+)")
_CASE = re.compile(r"(?:llamacpp|vllm)/([\w.-]+)\s+NP=(\d+)\s+input=(\d+)\s+R=(\d+)\s+(PASS|FAIL)(?:.*?agg=([\d.]+))?")


def parse_progress(lines):
    """Per-model state from the runner log: loading -> pass / fail (agg = aggregate tok/s of the smoke request)."""
    prog = {}
    for l in lines:
        m = _LOADING.search(l)
        if m:
            prog[m.group(1)] = {"state": "loading", "agg": None}
        m = _CASE.search(l)
        if m:
            prog[m.group(1)] = {"state": m.group(5).lower(), "agg": round(float(m.group(6)), 2) if m.group(6) else None}
    return prog


_STD = re.compile(r"(?:llamacpp|vllm)/([\w.-]+)\s+NP=(\d+)\s+input=(\d+)\s+R=(\d+)\s+(PASS|FAIL)(.*)")
_PLAN = re.compile(r"STANDARD_PLAN:\s*(\{.*\})")


def parse_standard(lines):
    """Standard run: the plan line, every case line, and per-model progress (done / total) from them."""
    plan, cases, current = None, [], None
    for l in lines:
        m = _PLAN.search(l)
        if m:
            try:
                plan = json.loads(m.group(1))
            except ValueError:
                pass
        m = _LOADING.search(l)
        if m:
            current = m.group(1)
        m = _STD.search(l)
        if m:
            rest = m.group(6)
            num = lambda k: (lambda x: float(x.group(1)) if x else None)(re.search(k + r"=([\d.]+)", rest))
            cases.append({"model": m.group(1), "np": int(m.group(2)), "input": int(m.group(3)), "repeat": int(m.group(4)), "status": m.group(5),
                          "agg": num("agg"), "ttft_ms": num("ttft_ms"), "tpot_ms": num("tpot_ms")})
    return plan, cases, current


def standard_progress(plan, cases, current, busy):
    prog = {}
    if not plan:
        return prog
    per = len(plan["inputs"]) * len(plan["nps"]) * plan["repeats"]
    for model in plan["models"]:
        mine = [c for c in cases if c["model"] == model]
        done, bad = len(mine), sum(1 for c in mine if c["status"] != "PASS")
        if done >= per:
            state = "fail" if bad else "pass"
        elif not busy:
            state = "fail" if done else "waiting"      # the run ended (stopped / failed) before every case was reported
        else:
            state = "loading" if (done or current == model) else "waiting"
        prog[model] = {"state": state, "agg": None, "done": done, "total": per, "bad": bad}
    return prog


STD_LAST_PY = r'''
import json, pathlib
best = None
for m in pathlib.Path.home().joinpath("{root}", "platform_runs").glob("standard_*/manifest.json"):
    if best is None or m.parent.name > best.parent.name:
        best = m
out = {{}}
if best:
    try:
        d = json.loads(best.read_text())
        out = {{"run": best.parent.name, "started_at": d.get("started_at"), "finished_at": d.get("finished_at"), "stopped": bool(d.get("stopped")), "inputs": d.get("inputs"), "nps": d.get("nps"),
               "repeats": d.get("repeats"), "output_tokens": d.get("output_tokens"), "models": d.get("models"), "cases": d.get("cases", [])}}
    except Exception:
        out = {{}}
print(json.dumps(out))
'''


def standard_last(machine, runner=subprocess.run):
    c = _cfg(machine)
    rc, out, err = _ssh(c["alias"], "python3 - <<'PY'" + STD_LAST_PY.format(root=c["root"]) + "PY", runner)
    try:
        return json.loads(out) if rc == 0 else {}
    except ValueError:
        return {}


LAST_PY = r'''
import json, pathlib
out = {{}}
for m in sorted(pathlib.Path.home().joinpath("{root}", "platform_runs").glob("smoke_*/manifest.json")):
    try:
        d = json.loads(m.read_text())
    except Exception:
        continue
    for k, v in (d.get("results") or {{}}).items():
        v = v if isinstance(v, dict) else {{"status": v}}
        e = {{"status": v.get("status"), "agg": round(v["aggregate_tps"], 2) if v.get("aggregate_tps") else None, "ttft_s": v.get("ttft_s"), "tpot_ms": v.get("tpot_ms"), "run": m.parent.name}}
        try:                                   # AISO1: the per-request values are in the run's own smoke.json
            sj = json.loads((m.parent / k / "smoke.json").read_text())
            r = sj["requests"][0]
            e["ttft_s"], e["tpot_ms"] = r.get("ttft_s"), r.get("tpot_ms")
        except Exception:
            pass
        if e["ttft_s"] is None:                # PRO6000 runs made before TTFT/TPOT were stored: read the benchmark table of that run
            try:
                import re
                tx = (m.parent / k / "bench.txt").read_text()
                a1, a2 = re.search(r"Mean TTFT \(ms\):\s+([\d.]+)", tx), re.search(r"Mean TPOT \(ms\):\s+([\d.]+)", tx)
                e["ttft_s"] = float(a1.group(1)) / 1000 if a1 else None
                e["tpot_ms"] = float(a2.group(1)) if a2 else None
            except Exception:
                pass
        for f, n in (("ttft_s", 3), ("tpot_ms", 2)):
            if e.get(f) is not None:
                e[f] = round(e[f], n)
        out[k] = e
print(json.dumps(out))
'''


def last_by_model(machine, runner=subprocess.run):
    """Newest smoke result of every model over ALL platform smoke runs of the machine (a model tested in an earlier run still counts)."""
    c = _cfg(machine)
    rc, out, err = _ssh(c["alias"], "python3 - <<'PY'" + LAST_PY.format(root=c["root"]) + "PY", runner)
    try:
        return json.loads(out) if rc == 0 else {}
    except ValueError:
        return {}


def status(machine, runner=subprocess.run):
    c = _cfg(machine)
    b = busy(machine, runner)
    cmd = ("echo \"OURS $(pgrep -af 'aiso1_platform_smoke\\.py|pro6000_(platform|llamacpp)_smoke\\.py|gb10_platform_smoke\\.py' | grep -v pgrep | wc -l)\"; "
           "echo \"KV $(pgrep -af 'AISO1_KVCache_' | grep -v pgrep | wc -l)\"; "
           "L=$(ls -t $HOME/%(root)s/debug/platform_smoke_*.log $HOME/%(root)s/debug/platform_standard_*.log 2>/dev/null | head -1); "
           "if [ -n \"$L\" ]; then echo \"LOG $(basename $L)\"; "
           "M=$HOME/%(root)s/platform_runs/$(basename $L .log | sed 's/^platform_//')/manifest.json; "
           "[ -f \"$M\" ] && echo \"MODELS $(python3 -c 'import json,sys;print(\",\".join(json.load(open(sys.argv[1]))[\"models\"]))' \"$M\")\"; "
           "tail -n 400 \"$L\"; else echo 'LOG none'; fi") % c
    rc, out, err = _ssh(c["alias"], cmd, runner)
    lines = _clean(out).splitlines() if rc == 0 else []
    ours = b                                  # no answer about our own runner: fall back to "busy"
    if lines and lines[0].startswith("OURS "):
        ours = lines[0][5:].strip() not in ("", "0")
        lines = lines[1:]
    kv = False                                # the platform's KV cache test (benchmark/kvcache.py) holds the machine: ours, not "other work"
    if lines and lines[0].startswith("KV "):
        kv = lines[0][3:].strip() not in ("", "0")
        lines = lines[1:]
    name = lines[0][4:] if lines and lines[0].startswith("LOG ") else "none"
    tail = lines[1:] if lines else []
    run_models = []
    if tail and tail[0].startswith("MODELS "):      # the models of that run (from the run's own manifest)
        run_models = [m for m in tail[0][7:].split(",") if m]
        tail = tail[1:]
    kind = "standard" if name.startswith("platform_standard_") else "smoke"
    result = next((l for l in reversed(tail) if "SMOKE_STATUS" in l or "STANDARD_STATUS" in l), None)
    out = {"ok": rc == 0, "busy": ours, "kv_running": kv, "external": bool(b and not ours and not kv), "log": name, "kind": kind, "run_models": run_models, "result": result}
    if kind == "standard":
        plan, cases, current = parse_standard(tail)
        out.update(plan=plan, cases=cases, progress=standard_progress(plan, cases, current, ours), tail=tail[-40:], last={}, standard_last={} if ours else standard_last(machine, runner))
    else:
        out.update(progress=parse_progress(tail), tail=tail[-12:], last={} if ours else last_by_model(machine, runner), standard_last={} if ours else standard_last(machine, runner))
    return out


models_of = models   # start_smoke has a parameter called models


def manifest(machine):
    return json.loads(_cfg(machine)["manifest"].read_text())


def deploy_runner(machine, runner=subprocess.run):
    """Copy the platform-owned runner to the machine (over SSH stdin) and check the sha256 there against the manifest. Returns (ok, remote_path or error)."""
    c, m = _cfg(machine), manifest(machine)
    src = BASE.parent / m["runner_file"]
    data = src.read_bytes()
    want = hashlib.sha256(data).hexdigest()
    if want != m["runner_sha256"]:
        return False, "the runner file no longer matches its manifest (rebuild the manifest)"
    remote = m["deploy_to"].replace("~/", "$HOME/")
    d = remote.rsplit("/", 1)[0]
    try:
        p = runner(SSH + [c["alias"], f"mkdir -p {d} && cat > {remote} && sha256sum {remote}"], input=data, capture_output=True, timeout=40)
        out = (p.stdout or b"").decode(errors="replace")
    except Exception as exc:
        return False, _clean(str(exc))
    if p.returncode != 0 or want not in out:
        return False, "the copy on the machine does not match the manifest sha256"
    return True, remote


def check_params(machine, params):
    """Whole numbers inside the limits of the machine, nothing else. Returns (ok, {name: int} | error). Only integers ever reach the command line."""
    c, spec = _cfg(machine), _cfg(machine)["params"]
    params = params or {}
    if not isinstance(params, dict):
        return False, "parameters must be an object"
    out = {}
    for k, v in params.items():
        if k not in spec:
            return False, f"unknown parameter: {k}"
        if spec[k].get("fixed"):
            if v is not None and v != spec[k]["default"]:
                return False, f"{k} is fixed to {spec[k]['default']} on this machine"
            continue
        if isinstance(v, bool) or not isinstance(v, int) or not spec[k]["min"] <= v <= spec[k]["max"]:
            return False, f"{k} must be a whole number from {spec[k]['min']} to {spec[k]['max']}"
        out[k] = v
    full = {k: out.get(k, spec[k]["default"]) for k in spec}
    if c.get("max_total_tokens") and full["input"] + full["output"] > c["max_total_tokens"]:
        return False, f"input + output must be at most {c['max_total_tokens']} tokens"
    return True, {k: v for k, v in out.items()}


def check_standard(machine, params, n_models):
    """Standard test: lists of whole numbers inside the limits, at most MAX_CASES cases in all. Returns (ok, {name: value} | error)."""
    c, spec = _cfg(machine), _cfg(machine)["standard"]
    if not spec:
        return False, "The standard test is not available for this engine yet."
    params = params or {}
    if not isinstance(params, dict):
        return False, "parameters must be an object"
    full = {k: v["default"] for k, v in spec.items()}
    for k, v in params.items():
        if k not in spec:
            return False, f"unknown parameter: {k}"
        x = spec[k]
        if x.get("fixed"):
            if v is not None and v != x["default"]:
                return False, f"{k} is fixed to {x['default']} on this machine"
            continue
        vals = v if isinstance(v, list) else [v]
        if (k in ("inputs", "nps") and not isinstance(v, list)) or not vals or any(isinstance(i, bool) or not isinstance(i, int) or not x["min"] <= i <= x["max"] for i in vals):
            return False, f"{k} must be whole numbers from {x['min']} to {x['max']}"
        if k in ("inputs", "nps") and (len(vals) > x["count"] or len(set(vals)) != len(vals)):
            return False, f"{k}: at most {x['count']} different values"
        full[k] = vals if k in ("inputs", "nps") else vals[0]
    if n_models * len(full["inputs"]) * len(full["nps"]) * full["repeats"] > MAX_CASES:
        return False, f"too many cases (the limit is {MAX_CASES})"
    if c.get("max_total_tokens") and max(full["inputs"]) + full["output"] > c["max_total_tokens"]:
        return False, f"input + output must be at most {c['max_total_tokens']} tokens"
    return True, {k: v for k, v in full.items() if not spec[k].get("fixed")}


def start_smoke(machine, models=("all",), params=None, runner=subprocess.run):
    return start_run(machine, models, params, "smoke", runner)


def start_run(machine, models=("all",), params=None, kind="smoke", runner=subprocess.run):
    """kind: "smoke" (one request per model) or "standard" (Input x NP x Repeat, started in the background on the machine)."""
    c = _cfg(machine)
    if kind not in ("smoke", "standard"):
        return {"ok": False, "error": "unknown test kind"}
    if kind == "smoke":
        ok, checked = check_params(machine, params)
        if not ok:
            return {"ok": False, "error": checked}
    listed = models_of(machine, runner)
    known = [m["id"] for m in listed.get("models", [])]
    if not known:
        return {"ok": False, "error": "could not read the model list of the machine"}
    picked = list(known) if list(models) == ["all"] or not models else list(models)
    if any(m not in known for m in picked):
        return {"ok": False, "error": "unknown model"}
    if kind == "standard":
        ok, checked = check_standard(machine, params, len(picked))
        if not ok:
            return {"ok": False, "error": checked}
    if busy(machine, runner):
        return {"ok": False, "error": "The machine is busy (a runner is running, or the GPU is in use). Wait until it finishes."}
    ok, remote = deploy_runner(machine, runner)
    if not ok:
        return {"ok": False, "error": remote}
    arg = "all" if picked == known else ",".join(picked)
    # started inside ( ... & ): the subshell ends at once, so the SSH session closes right away
    cmd = ("mkdir -p $HOME/%(root)s/debug && L=$HOME/%(root)s/debug/platform_%(kind)s_$(date +%%Y%%m%%d_%%H%%M%%S).log && "
           "(setsid nohup %(envp)s python3 -u %(remote)s --models %(arg)s%(extra)s > \"$L\" 2>&1 < /dev/null &) ; sleep 1; echo started") % {**c, "envp": " ".join(f"{k}={shlex.quote(str(v))}" for k, v in (c.get("env") or {}).items()), "remote": remote, "arg": arg, "kind": kind,
                                                                                                                  "extra": (" --mode standard" + "".join(f" --{k} " + (",".join(str(int(i)) for i in v) if isinstance(v, list) else str(int(v))) for k, v in checked.items())) if kind == "standard"
                                                                                                                  else "".join(f" --{k} {int(v)}" for k, v in checked.items())}
    rc, out, err = _ssh(c["alias"], cmd, runner)
    if rc == 124 and busy(machine, runner):
        return {"ok": True, "message": ("Standard test started." if kind == "standard" else "Smoke test started."), "models": picked, "params": checked}
    if rc != 0 or "started" not in out:
        return {"ok": False, "error": _clean(err) or "could not start"}
    return {"ok": True, "message": ("Standard test started." if kind == "standard" else "Smoke test started."), "models": picked, "params": checked}


STOP_SH = {"aiso1": "pkill -TERM -f '[a]iso1_platform_smoke\\.py'; sleep 3; echo stopped",
           "pro6000": "pkill -TERM -f '[p]ro6000_platform_smoke\\.py'; sleep 3; docker ps -q --filter name=aiso_platform_smoke_ | xargs -r docker rm -f >/dev/null 2>&1; echo stopped",
           "gb10": "pkill -TERM -f '[g]b10_platform_smoke\\.py'; sleep 5; docker ps -q --filter name=aiso_platform_gb10_ | xargs -r docker rm -f >/dev/null 2>&1; echo stopped",
           "pro6000_llamacpp": "pkill -TERM -f '[p]ro6000_llamacpp_smoke\\.py'; sleep 3; docker ps -q --filter name=aiso_platform_smoke_ | xargs -r docker rm -f >/dev/null 2>&1; echo stopped"}


def stop(machine, runner=subprocess.run):
    """Ask the platform runner (and nothing else on the machine) to stop: SIGTERM lets it close its server / container."""
    c = _cfg(machine)
    rc, out, err = _ssh(c["alias"], STOP_SH[machine], runner)
    if rc != 0 or "stopped" not in out:
        return {"ok": False, "error": _clean(err) or "could not send the stop"}
    return {"ok": True, "message": "Stop sent."}
