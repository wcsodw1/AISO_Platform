"""KV cache test of AISO1 (llama.cpp / Vulkan): the platform deploys David's own campaign scripts (copied byte for byte, sha256 checked) and starts their modes.

The scripts keep their own campaign folders on the machine (~/aiso1_benchmark/campaigns/AISO1_llamacpp_KV_B1024_NP*_<time>) and never write into the formal AISO1 results.
Nothing is edited here. Order (enforced): NP1 preflight -> smoke -> run -> (review) -> NP2/NP4 preflight -> smoke -> run NP2 -> run NP4.
NP8 FA (np8fa, David 2026-11-18): its own campaign, preflight -> smoke -> run; it does not wait for NP1.
  status  read-only   what is installed, the campaign state, the smoke matrix, the result tables, the log tail
  start   STARTS a step in the background; refused while the machine is busy, while one of our steps runs, or when the order is not respected
  stop    sends SIGINT to the script (not SIGTERM): the script's `finally` then closes its llama-server
"""
import csv
import hashlib
import io
import json
import re
import subprocess
from pathlib import Path

from . import executor as ex

BASE = Path(__file__).resolve().parent
MACHINE = "aiso1"
MANIFEST = BASE / "manifests" / "aiso1_kvcache.manifest.json"
ROOT = "aiso1_benchmark"
STAGES = {"np1": {"nps": [1], "state": "kv_cache_B1024_np1"}, "np24": {"nps": [2, 4], "state": "kv_cache_B1024_np24"},
          "np8fa": {"nps": [8], "state": "kv_cache_B1024_np8fa"}}      # NP8, Flash Attention on, f16/q8_0/q4_0 (platform wrapper around the NP1 script)
STEPS = {"all": None, "preflight": ["preflight"], "smoke": ["smoke"], "run": ["run"], "run_np2": ["run", "--np", "2"], "run_np4": ["run", "--np", "4"], "audit": ["audit"]}
STEPS_OF = {"np1": ("all", "preflight", "smoke", "run", "audit"), "np24": ("all", "preflight", "smoke", "run_np2", "run_np4", "audit"),
            "np8fa": ("all", "preflight", "smoke", "run", "audit")}      # "all" = the chain script: every remaining step, one click
MODELS = 4                       # the scripts test the four models of the machine's own runner
INPUTS, REPEATS = 3, 3
LOG_GLOB = "platform_kvcache_"

STATUS_PY = r'''
import csv, hashlib, json, pathlib, subprocess
home = pathlib.Path.home(); root = home / "ROOT"
def rd(p):
    try: return json.loads(pathlib.Path(p).read_text())
    except Exception: return None
def rows(p, keep):
    try:
        with open(p, newline="") as f: return [{k: r.get(k) for k in keep} for r in csv.DictReader(f)]
    except Exception: return None
def sha(p):
    try: return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
    except Exception: return None
out = {"stages": {}}
for stage, spec in json.loads('STAGES_JSON').items():
    d = root / spec["state"]; s = {"installed_sha256": sha(d / spec["script"]), "campaign": None}
    st = rd(d / "campaign.json")
    if st and st.get("folder") and pathlib.Path(st["folder"]).parent == root / "campaigns":
        c = pathlib.Path(st["folder"]); prof = rd(c / "profile.json") or {}
        w = prof.get("workload") or {}
        s["campaign"] = {"name": c.name, "kv_types": [x.get("k") for x in w.get("kv_pairs", [])], "version": (prof.get("version") or "").splitlines()[0] if prof.get("version") else None,
                         "smoke": rows(c / "kv_smoke_matrix.csv", ["kv_cache_k", "model", "status", "reason"]),
                         "stages": {n: rd(c / (n + "_stage.json")) for n in ("np1", "np2", "np4", "np8")},
                         "results": {n: rows(c / (n + "_results.csv"), ["kv_cache_k", "model", "input_tokens", "status", "verified_repeats", "ttft_ms", "tpot_ms", "tps_aggregate", "tps_normalized"]) for n in ("np1", "np2", "np4", "np8")},
                         "vs_original": rows(c / "np1_vs_original.csv", ["model", "kv_cache_k", "input_tokens", "status", "reason", "ttft_ms_delta_pct", "tpot_ms_delta_pct", "tps_aggregate_delta_pct", "tps_normalized_delta_pct"])}
    out["stages"][stage] = s
logs = sorted((root / "debug").glob("platform_kvcache_*.log"), key=lambda p: p.stat().st_mtime)
out["log"] = logs[-1].name if logs else None
lines = logs[-1].read_text(errors="replace").splitlines() if logs else []
out["tail"] = lines[-400:]
out["log_lines"] = len(lines)
by = {}
for l in lines:
    f = l.split()
    if len(f) >= 6 and f[0] == "FORMAL_PASS":
        k = f[1] + "|" + f[2] + "|" + f[3]; by[k] = by.get(k, 0) + 1
out["by_case"] = by
out["counts_all"] = {"formal_pass": sum(1 for l in lines if l.startswith("FORMAL_PASS ")), "formal_other": sum(1 for l in lines if l.startswith(("FORMAL_FAIL ", "FORMAL_TIMEOUT "))),
                     "smoke": sum(1 for l in lines if l.startswith("KV_SMOKE ")), "smoke_pass": sum(1 for l in lines if l.startswith("KV_SMOKE ") and l.split()[-1:] == ["PASS"])}
print(json.dumps(out))
'''


def manifest():
    return json.loads(MANIFEST.read_text())


def _script_name(stage):
    return Path(manifest()["scripts"][stage]["deploy_to"]).name


def status(runner=subprocess.run):
    c = ex.CFG[MACHINE]
    spec = {k: {"state": v["state"], "script": _script_name(k)} for k, v in STAGES.items()}
    code = STATUS_PY.replace("ROOT", ROOT).replace("STAGES_JSON", json.dumps(spec))
    rc, out, err = ex._ssh(c["alias"], "pgrep -af 'AISO1_KVCache_' | grep -v pgrep | wc -l; pgrep -af 'AISO1_KVCache_chain' | grep -v pgrep | wc -l; python3 - <<'PY'\n" + code + "PY", runner, timeout=40)
    if rc != 0:
        return {"ok": False, "error": ex._clean(err) or "no answer"}
    first, _, rest = out.partition("\n")
    chain_n, _, rest = rest.partition("\n")
    try:
        data = json.loads(rest)
    except ValueError:
        return {"ok": False, "error": "unreadable answer from the machine"}
    ours = first.strip() not in ("", "0")
    b = ex.busy(MACHINE, runner)
    want = {k: v["runner_sha256"] for k, v in manifest()["scripts"].items()}
    for k, s in data["stages"].items():
        s["installed_ok"] = s.pop("installed_sha256") == want[k]
    data = json.loads(ex._clean(json.dumps(data)))      # no IPs / home paths leave this function
    prog = progress(data["tail"])
    prog["by_case"] = data.pop("by_case", {})
    if data.get("counts_all"):                 # counted over the WHOLE log (the tail is only the last 400 lines)
        prog["counts"] = data.pop("counts_all")
    return {"ok": True, "busy": ours, "chain": chain_n.strip() not in ("", "0"), "external": bool(b and not ours), **data, "progress": prog}


_P = {"smoke": re.compile(r"^KV_SMOKE\s+(\S+)\s+(\S+)\s+(\S+)"), "formal": re.compile(r"^FORMAL_(PASS|FAIL|TIMEOUT)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)"),
      "stage": re.compile(r"^NP_STAGE\s+(\d+)\s+(\d+)\s+/\s+(\d+)")}


def progress(tail):
    """What the log of the newest step says so far (counts only; the tables come from the campaign files)."""
    smoke, formal, stage = [], [], None
    for l in tail:
        m = _P["smoke"].match(l)
        if m:
            smoke.append({"kv": m.group(1), "model": m.group(2), "status": m.group(3)})
        m = _P["formal"].match(l)
        if m:
            formal.append({"status": m.group(1), "kv": m.group(2), "model": m.group(3), "np": int(m.group(4)), "input": int(m.group(5)), "repeat": int(m.group(6))})
        m = _P["stage"].match(l)
        if m:
            stage = {"np": int(m.group(1)), "done": int(m.group(2)), "total": int(m.group(3))}
    return {"smoke": smoke[-30:], "formal": formal[-30:], "stage": stage,
            "counts": {"smoke": len(smoke), "smoke_pass": sum(x["status"] == "PASS" for x in smoke), "formal_pass": sum(x["status"] == "PASS" for x in formal), "formal_other": sum(x["status"] != "PASS" for x in formal)}}


def deploy(stage, runner=subprocess.run, chain=False):
    """Copy the script (and for NP2/NP4 also the NP1 script it loads) to the machine over SSH stdin; the sha256 there must equal the manifest."""
    c, m = ex.CFG[MACHINE], manifest()
    for key in (["np1"] if stage == "np1" else ["np1", stage]) + (["chain"] if chain else []):
        spec = m["scripts"][key]
        data = (BASE.parent / spec["runner_file"]).read_bytes()
        want = hashlib.sha256(data).hexdigest()
        if want != spec["runner_sha256"]:
            return False, "a script file no longer matches its manifest (rebuild the manifest)"
        remote = spec["deploy_to"].replace("~/", "$HOME/")
        try:
            p = runner(ex.SSH + [c["alias"], f"mkdir -p {remote.rsplit('/', 1)[0]} && cat > {remote} && sha256sum {remote}"], input=data, capture_output=True, timeout=40)
            out = (p.stdout or b"").decode(errors="replace")
        except Exception as exc:
            return False, ex._clean(str(exc))
        if p.returncode != 0 or want not in out:
            return False, "the copy on the machine does not match the manifest sha256"
    return True, m["scripts"]["chain" if chain else stage]["deploy_to"].replace("~/", "$HOME/")


def order_ok(stage, step, st):
    """The order the handoff asks for; the scripts check most of it again themselves."""
    s = st["stages"][stage]
    camp = s.get("campaign")
    if stage == "np24" and not (st["stages"]["np1"].get("campaign") or {}).get("stages", {}).get("np1"):
        return "Finish and review the NP1 run first (np1 stage file missing)."
    if step in ("preflight", "all"):
        return ""
    if step == "audit":
        return "" if camp else "Run the preflight first."
    if not camp:
        return "Run the preflight first."
    if step != "smoke" and not camp.get("smoke"):
        return "Run the smoke step first (it writes kv_smoke_matrix.csv)."
    if step == "run_np4" and not (camp.get("stages") or {}).get("np2"):
        return "Run NP2 and review np2_results.csv before NP4."
    return ""


def start(stage, step, runner=subprocess.run):
    if stage not in STAGES or step not in STEPS_OF[stage]:
        return {"ok": False, "error": "unknown stage or step"}
    c = ex.CFG[MACHINE]
    st = status(runner)
    if not st.get("ok"):
        return {"ok": False, "error": st.get("error") or "no answer"}
    if step == "all":
        if st.get("chain"):
            return {"ok": False, "error": "The one-click run is already going."}
    elif st["busy"]:
        return {"ok": False, "error": "A KV cache step is already running."}
    why = order_ok(stage, step, st)
    if why:
        return {"ok": False, "error": why}
    if step != "audit" and not st["busy"] and ex.busy(MACHINE, runner):       # audit only reads; a model server of OUR running step is not "other work" (the chain waits for it)
        return {"ok": False, "error": "The machine is busy (another benchmark or a model server is running). Wait until it finishes."}
    ok, remote = deploy(stage, runner, chain=step == "all")
    if not ok:
        return {"ok": False, "error": remote}
    if step == "all":
        cmd = (f"mkdir -p $HOME/{ROOT}/debug && L=$HOME/{ROOT}/debug/{LOG_GLOB}{stage}_all_$(date +%Y%m%d_%H%M%S).log && "
               f"(setsid nohup bash {remote} {stage} > \"$L\" 2>&1 < /dev/null &) ; sleep 1; echo started")
        rc, out, err = ex._ssh(c["alias"], cmd, runner)
        if rc != 0 or "started" not in out:
            return {"ok": False, "error": ex._clean(err) or "could not start"}
        return {"ok": True, "message": f"KV cache {stage}: every step started, one after the other."}
    args = " ".join(STEPS[step])
    cmd = (f"mkdir -p $HOME/{ROOT}/debug && L=$HOME/{ROOT}/debug/{LOG_GLOB}{stage}_{step}_$(date +%Y%m%d_%H%M%S).log && "
           f"(setsid nohup python3 -u {remote} {args} > \"$L\" 2>&1 < /dev/null &) ; sleep 1; echo started")
    rc, out, err = ex._ssh(c["alias"], cmd, runner)
    if rc != 0 or "started" not in out:
        return {"ok": False, "error": ex._clean(err) or "could not start"}
    return {"ok": True, "message": f"KV cache {stage} {step} started."}


def stop(runner=subprocess.run):
    """SIGINT, not SIGTERM: the scripts have no SIGTERM handler, a KeyboardInterrupt runs their `finally` that closes the llama-server."""
    c = ex.CFG[MACHINE]
    rc, out, err = ex._ssh(c["alias"], "pkill -INT -f '[A]ISO1_KVCache_'; sleep 5; echo stopped", runner)
    if rc != 0 or "stopped" not in out:
        return {"ok": False, "error": ex._clean(err) or "could not send the stop"}
    return {"ok": True, "message": "Stop sent (the script closes its model server)."}
