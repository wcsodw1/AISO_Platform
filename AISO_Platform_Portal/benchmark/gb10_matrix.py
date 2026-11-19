"""GB10 Ryan matrix (Gemma 4 26B on vLLM, KV cache fp8): start it from the Run page and follow it live - also when somebody started it by hand.

Matrix (fixed, David / GB10 session 2026-11-18): NP 1 / 3 / 5 x Input 65536 / 131072 x Output 256 / 512, 1 repeat, ONE server start = 12 cases.
Weights option (whitelist, never a string from the browser): bf16 | fp8 online | fp8 pre-quantized | int8 AWQ | int4 AWQ.
  status  read-only   busy flag, who is running, the newest ryan_*.log (tail + parsed cases), what the weights were
  start   STARTS the script in place (never copies over it; refused if its sha256 differs from the manifest, or the machine is busy)
  stop    stops ONLY a run that carries the platform tag (--tag ryan_plat_*), with SIGINT so the script closes its container; never the hand-started queue
"""
import csv
import hashlib
import json
import re
import subprocess
from pathlib import Path

from . import executor as ex

BASE = Path(__file__).resolve().parent
MANIFEST = BASE / "manifests" / "gb10_matrix.manifest.json"
MACHINE = "gb10"
NPS, INPUTS, OUTPUTS = (1, 3, 5), (65536, 131072), (256, 512)
TOTAL = len(NPS) * len(INPUTS) * len(OUTPUTS)
TOTAL_8K = len(NPS) * len(OUTPUTS)      # the Input 8K set: NP 1/3/5 x Output 256/512 (hand-started runs, logs in8k_*.log / nvfp4_in8k.log)
EXPECT = {"nvfp4": TOTAL + TOTAL_8K, "nvfp4kv": TOTAL + TOTAL_8K}      # NVFP4 is tested on both sets (18 conditions)
QUANT = "--quantization fp8"
BF16 = {"MODEL": "google/gemma-4-26B-A4B-it", "HF_HOME": "/opt/orientai/models/huggingface", "EXTRA_VLLM_ARGS": "--enforce-eager --moe-backend triton"}
PRE = {"HF_HOME": "$HOME/gb10_models/hf", "EXTRA_VLLM_ARGS": "--enforce-eager"}
WEIGHTS = {
    "bf16": {"label": ["bf16", "bf16（不量化）"], "tag": "bf16", "env": {**BF16, "WEIGHTS_LABEL": "bf16 (not quantized)"}},
    "fp8": {"label": ["fp8 online", "fp8 線上量化"], "tag": "fp8", "env": {**BF16, "EXTRA_VLLM_ARGS": BF16["EXTRA_VLLM_ARGS"] + " " + QUANT, "WEIGHTS_LABEL": "fp8 online quantization (weights quantized at load)"}},
    "fp8pre": {"label": ["fp8 pre-quantized", "fp8 預量化"], "tag": "fp8pre", "env": {**PRE, "MODEL": "RedHatAI/gemma-4-26B-A4B-it-FP8-dynamic", "WEIGHTS_LABEL": "fp8 pre-quantized checkpoint RedHatAI/gemma-4-26B-A4B-it-FP8-dynamic"}},
    "int8": {"label": ["int8 AWQ", "int8 AWQ"], "tag": "int8", "env": {**PRE, "MODEL": "cyankiwi/gemma-4-26B-A4B-it-AWQ-8bit", "WEIGHTS_LABEL": "int8 AWQ (pre-quantized checkpoint cyankiwi/gemma-4-26B-A4B-it-AWQ-8bit)"}},
    "nvfp4": {"label": ["NVFP4", "NVFP4（NVIDIA 官方）"], "tag": "nvfp4", "env": {**PRE, "MODEL": "nvidia/Gemma-4-26B-A4B-NVFP4", "WEIGHTS_LABEL": "NVFP4 (NVIDIA ModelOpt checkpoint nvidia/Gemma-4-26B-A4B-NVFP4)"}},
    "int4": {"label": ["int4 AWQ", "int4 AWQ"], "tag": "int4", "env": {**PRE, "MODEL": "cyankiwi/gemma-4-26B-A4B-it-AWQ-4bit", "WEIGHTS_LABEL": "int4 AWQ (pre-quantized checkpoint cyankiwi/gemma-4-26B-A4B-it-AWQ-4bit)"}},
}
_SAFE = re.compile(r"^(?!.*\$[({])[^\"\\`;|&<>\n]+$")      # inside double quotes: no quote, backslash, backtick, ; | & < >, no $( or ${ (a plain $HOME is wanted)
_CASE = re.compile(r"^CASE NP(\d+) input (\d+) output (\d+)")
_RES = re.compile(r"^\s+(PASS|FAIL) NP(\d+) in(\d+) out(\d+)(.*)$")
_NUM = lambda k, t: (lambda m: float(m.group(1)) if m else None)(re.search(k + r"\s+([\d.]+)", t))

STATUS_SH = ("for f in $(ls -t $HOME/gb10_benchmark/ryan_*.log $HOME/gb10_benchmark/in8k_*.log $HOME/gb10_benchmark/nvfp4_*.log $HOME/gb10_benchmark/nvfp4kv_*.log 2>/dev/null); do p=$(grep -c '^  PASS' $f); x=$(grep -c '^  FAIL' $f); d=$(grep -c '^DONE' $f); e=''; "
             "if [ \"$p\" = 0 ]; then q=$(grep -m1 -oE 'see server.log in /[^ ]+' $f | awk '{print $NF}'); [ -n \"$q\" ] && e=$(grep -h -m1 '^ValueError: ' \"$q/server.log\" 2>/dev/null | cut -c1-240); [ -z \"$e\" ] && e=$(grep -h -m1 '^RuntimeError: ' \"$q/server.log\" 2>/dev/null | cut -c1-240); "
             "[ -z \"$e\" ] && e=$(grep -m1 -E '^(RuntimeError|[A-Za-z.]*Error): ' $f | cut -c1-240); fi; "
             "printf 'LOGSTAT\\t%s\\t%s\\t%s\\t%s\\t%s\\n' $(basename $f) $p $x $d \"$e\"; done; "
             "echo \"MATRIX $(pgrep -af 'GB10_vllm_gemma26_matrix\\.py' | grep -v pgrep | wc -l)\"; "
             "echo \"PLAT $(pgrep -af 'GB10_vllm_gemma26_matrix\\.py.*--tag ryan_plat_' | grep -v pgrep | wc -l)\"; "
             "echo \"QUEUE $(pgrep -af 'run_quant_queue|run_step2|run_mtp|run_nvfp4|run_kvauto|run_fp8' | grep -v pgrep | wc -l)\"; "
             "echo \"SHA $(sha256sum $HOME/gb10_benchmark/GB10_vllm_gemma26_matrix.py 2>/dev/null | cut -c1-64)\"; "
             "L=''; P=$(pgrep -f 'GB10_vllm_gemma26_matrix\\.py' | head -1); [ -n \"$P\" ] && L=$(readlink /proc/$P/fd/1 2>/dev/null); "
             "case \"$L\" in $HOME/gb10_benchmark/*.log) ;; *) L=''; for f in $(ls -t $HOME/gb10_benchmark/*.log 2>/dev/null | head -40); do head -1 $f | grep -q '^NVIDIA GB10' && { L=$f; break; }; done;; esac; "
             "echo \"CONT $(docker ps -q --filter name=sb-gb10-vllm | wc -l)\"; BN=$(basename \"$L\" .log); D=$(ls -td $HOME/gb10_benchmark/results/*_${BN}_*/ 2>/dev/null | head -1); "
             "[ -n \"$D\" ] && echo \"WLABEL $(python3 -c \"import json,sys;print(json.load(open(sys.argv[1]))['weights'])\" $D/parameters.json 2>/dev/null | cut -c1-160)\"; "
             "if [ -n \"$L\" ]; then echo \"LOG $(basename $L)\"; echo '---TAIL---'; tail -n 400 \"$L\"; echo '---ALLCASES---'; "
             "for f in $(ls -t $HOME/gb10_benchmark/ryan_*.log $HOME/gb10_benchmark/in8k_*.log $HOME/gb10_benchmark/nvfp4_*.log $HOME/gb10_benchmark/nvfp4kv_*.log 2>/dev/null); do echo \"FILE $(basename $f)\"; grep -E '^  (PASS|FAIL) ' $f; done; "
             "echo '---VLLM---'; docker logs --tail 120 sb-gb10-vllm 2>&1 | grep -E 'INFO|WARNING|ERROR|Loading|flashinfer|Building|Traceback|Error' | tail -30 | cut -c1-260; "
             "else echo 'LOG none'; fi")


def manifest():
    return json.loads(MANIFEST.read_text())


def parse(lines):
    """Cases from the log: the result lines in order, the case running now, and whether the run is over."""
    cases, now, done = [], None, False
    for l in lines:
        m = _CASE.match(l)
        if m:
            now = {"np": int(m.group(1)), "input": int(m.group(2)), "output": int(m.group(3))}
        m = _RES.match(l)
        if m:
            t = m.group(5)
            cases.append({"status": m.group(1), "np": int(m.group(2)), "input": int(m.group(3)), "output": int(m.group(4)), "ttft_s": _NUM("TTFT mean", t), "tpot_ms": _NUM("TPOT", t),
                          "agg": _NUM("TPS agg", t), "norm": (lambda x: float(x.group(1)) if x else None)(re.search(r"norm\s+([\d.]+)", t))})
            now = None
        if l.startswith("DONE"):
            done = True
    return {"cases": cases, "now": now, "done": done}


def by_weights(stats, running, current):
    """One line per weights option. The log with the MOST PASS results is the result (not the newest: a later failed or interrupted attempt never hides a finished run);
    every attempt is kept in `attempts`. state: running (only the weights that is running now) | done (12 PASS) | stopped (some PASS) | failed (no PASS and an error: start-up failed) | none."""
    groups = {}
    for x in stats:                                   # newest first
        w = weights_of(x["log"])
        if w:
            groups.setdefault(w, []).append(x)
    out = {}
    for w, xs in groups.items():
        r8 = [x for x in xs if "in8k" in x["log"]]                    # Input 8K set (6 conditions)
        rl = [x for x in xs if "in8k" not in x["log"]]                # long set 64K / 128K (12 conditions)
        base = rl or r8
        best = max(base, key=lambda x: (x["pass"], -base.index(x)))
        pass_8k = max((x["pass"] for x in r8), default=0)
        pass_total = (best["pass"] if rl else 0) + pass_8k
        total = EXPECT.get(w, TOTAL + (TOTAL_8K if r8 else 0))
        if running and current == w:
            state = "running"
        elif pass_total >= total:
            state = "done"
        elif pass_total > 0:
            state = "stopped"
        elif any(x["error"] for x in xs):
            state = "failed"
        else:
            state = "stopped"
        err = next((x["error"] for x in xs if x["error"]), "")
        out[w] = {"state": state, "pass": best["pass"] if rl else 0, "fail": best["fail"], "done": best["done"], "log": best["log"], "pass_8k": pass_8k, "pass_total": pass_total, "total": total,
                  "error": err if state == "failed" else "", "attempts": [{"log": x["log"], "pass": x["pass"], "fail": x["fail"], "error": x["error"]} for x in xs]}
    if running and current and current not in out:      # running now, no result log yet (first minutes of a start, or a hand-started run with its own log name)
        out[current] = {"state": "running", "pass": 0, "fail": 0, "done": False, "log": "", "pass_8k": 0, "pass_total": 0, "total": EXPECT.get(current, TOTAL), "error": "", "attempts": []}
    return out


def weights_of(log):
    """Which weights a ryan_*.log belongs to, from its name (the platform's own ryan_plat_<w>_ and the hand-started ryan_w<x>.log)."""
    if re.match(r"nvfp4kv_", log or ""):
        return "nvfp4kv"      # NVFP4 weights + NVFP4 KV cache (hand-started: nvfp4kv_in8k.log / nvfp4kv_ryan*.log)
    if re.match(r"nvfp4_", log or ""):
        return "nvfp4"      # nvfp4_in8k.log / nvfp4_ryan.log (hand-started)
    m = re.search(r"(?:ryan|in8k)_(?:plat_)?w?(bf16|fp8pre|fp8|int8|int4)", log or "")      # in8k_*: the Input 8K set (2026-11-18)
    if not m and re.match(r"ryan_matrix", log or ""):
        return "bf16"        # the first matrix run (not quantized) was started by hand without a weights tag
    return m.group(1) if m else ""


CONFIGS = {"nvfp4kv": ["NVFP4 weights + NVFP4 KV cache", "NVFP4 權重 + NVFP4 KV cache"]}
PHASES = {"testing": ["Testing", "測試中"], "compiling": ["Compiling GPU kernels (first use, up to ~20 min)", "編譯 GPU 核心（第一次使用，最多約 20 分鐘）"], "loading": ["Loading weights", "載入權重"],
          "kv": ["Allocating KV cache", "配置 KV cache"], "ready": ["Warm-up", "暖身"], "starting": ["Starting vLLM", "啟動 vLLM"]}


def _vl_clean(l):
    """One readable line from a vLLM container log line (process / level / time prefixes dropped; IPs and home paths removed)."""
    l = re.sub(r"^\(\w+ pid=\d+\)\s+", "", l.strip())
    l = re.sub(r"^(INFO|WARNING|ERROR)\s+\d\d-\d\d\s+\d\d:\d\d:\d\d\s+(\[[^\]]*\]\s*)?", lambda m: "" if m.group(1) == "INFO" else "⚠ ", l)
    l = re.sub(r"^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d,\d+ - INFO - ", "", l)
    return ex._clean(l)[:200]


def live_extras(w, by, allc, vl, p, active, wlabel="", running=None, logname=""):
    """What the Run page needs to show LIVE: which configuration is running, which phase, every finished case of that configuration (all rounds), the overall count,
    and the vLLM container's own recent lines (loading / compiling / KV allocation happen there, the matrix script prints nothing while it waits)."""
    cur, files = None, {}
    for l in allc.splitlines():
        if l.startswith("FILE "):
            cur = l[5:].strip(); files[cur] = []
        elif cur:
            files[cur].append(l)
    seen, cases_all = set(), []
    for name, ls in files.items():                      # newest log first: a re-run replaces an older result of the same case
        if w and weights_of(name) != w:
            continue
        for c in parse(ls)["cases"]:
            k = (c["np"], c["input"], c["output"])
            if k not in seen:
                seen.add(k); cases_all.append(c)
    vlines = [x for x in (_vl_clean(l) for l in vl.splitlines()) if x]
    last = (vl.strip().splitlines() or [""])[-1].lower()
    if not active:
        phase = None
    elif p.get("now"):
        phase = "testing"
    elif "building jit module" in last or "jit" in last and "build" in last:
        phase = "compiling"
    elif "loading safetensors" in last or "loading weights" in last or "model loading took" in last:
        phase = "loading"
    elif "kv cache" in last or "memory profil" in last or "available kv" in last:
        phase = "kv"
    elif "startup complete" in last or "api server" in last or "uvicorn" in last:
        phase = "ready"
    else:
        phase = "starting"
    lab = CONFIGS.get(w) or ((WEIGHTS.get(w) or {}).get("label") if w else None) or ([wlabel, wlabel] if wlabel else None)
    if not w:                                           # a configuration the option list does not know (QAT, MTP ...): only the cases of the current log
        cases_all = list(p.get("cases") or [])
    b = by.get(w) if w else None
    prog = {"done": b["pass_total"], "total": b["total"], "pass_8k": b["pass_8k"], "long": b["pass"]} if b else ({"done": len([c for c in cases_all if c.get("status") == "PASS"]), "total": TOTAL_8K if "in8k" in logname else TOTAL} if active and logname else None)
    return {"config": ({"key": w or "custom", "en": lab[0], "zh": lab[1]} if lab else None), "phase": ({"key": phase, "en": PHASES[phase][0], "zh": PHASES[phase][1]} if phase else None),
            "cases_all": cases_all, "progress": prog, "vllm": vlines[-25:]}


def status(runner=subprocess.run):
    c = ex.CFG[MACHINE]
    rc, out, err = ex._ssh(c["alias"], STATUS_SH, runner, timeout=40)
    if rc != 0:
        return {"ok": False, "error": ex._clean(err) or "no answer"}
    head, _, tail = out.partition("---TAIL---")
    tail, _, extra = tail.partition("---ALLCASES---")
    allc, _, vl = extra.partition("---VLLM---")
    kv, stats = {}, []
    for l in head.splitlines():
        if l.startswith("LOGSTAT\t"):
            f = l.split("\t")
            if len(f) >= 5 and f[2].isdigit() and f[3].isdigit() and f[4].isdigit():
                stats.append({"log": f[1], "pass": int(f[2]), "fail": int(f[3]), "done": int(f[4]) > 0, "error": ex._clean(f[5]).strip() if len(f) > 5 else ""})
            continue
        k, _, v = l.partition(" ")
        kv[k] = v.strip()
    running_now = kv.get("MATRIX", "0") not in ("", "0")
    by = by_weights(stats, running_now, weights_of(kv.get("LOG") or ""))
    lines = ex._clean(tail).splitlines()
    p = parse(lines)
    running = running_now
    b = ex.busy(MACHINE, runner)
    return {"ok": True, "busy": running or kv.get("QUEUE", "0") not in ("", "0") or kv.get("CONT", "0") not in ("", "0"), "running": running, "ours": kv.get("PLAT", "0") not in ("", "0"), "queue": kv.get("QUEUE", "0") not in ("", "0"),
            "external": bool(b and not (kv.get("PLAT", "0") not in ("", "0"))), "script_ok": kv.get("SHA", "") == manifest()["runner_sha256"], "log": kv.get("LOG"), "weights": weights_of(kv.get("LOG") or ""),
            "total": TOTAL, "by_weights": by, "tail": lines[-60:], "log_lines": len(lines), **p, **live_extras(weights_of(kv.get("LOG") or ""), by, allc, vl, p, running or kv.get("QUEUE", "0") not in ("", "0") or kv.get("CONT", "0") not in ("", "0"), kv.get("WLABEL", ""), running, kv.get("LOG") or "")}


def start(weights, runner=subprocess.run):
    if weights not in WEIGHTS:
        return {"ok": False, "error": "unknown weights option"}
    st = status(runner)
    if not st.get("ok"):
        return {"ok": False, "error": st.get("error") or "no answer"}
    if not st["script_ok"]:
        return {"ok": False, "error": "The matrix script on the machine is not the one in the manifest (it was changed). Not started."}
    if st["busy"] or ex.busy(MACHINE, runner):
        return {"ok": False, "error": "The machine is busy (a test or a model server is running, or too little memory is free). Wait until it finishes."}
    w = WEIGHTS[weights]
    for k, v in w["env"].items():
        if not _SAFE.match(v) or not re.fullmatch(r"[A-Z_]+", k):
            return {"ok": False, "error": "unsafe value in the weights table"}
    exports = " ".join(f'{k}="{v}"' for k, v in w["env"].items())
    tag = "ryan_plat_" + w["tag"]
    cmd = (f"cd $HOME/gb10_benchmark && . ./env.sh && export GPU_MEM_UTIL=0.70 {exports} && L=$HOME/gb10_benchmark/{tag}_$(date +%Y%m%d_%H%M%S).log && "
           f"(setsid nohup python3 -u GB10_vllm_gemma26_matrix.py --nps {','.join(map(str, NPS))} --inputs {','.join(map(str, INPUTS))} --outputs {','.join(map(str, OUTPUTS))} --tag {tag} "
           "> \"$L\" 2>&1 < /dev/null &) ; sleep 1; echo started")
    rc, out, err = ex._ssh(ex.CFG[MACHINE]["alias"], cmd, runner)
    if rc != 0 or "started" not in out:
        return {"ok": False, "error": ex._clean(err) or "could not start"}
    return {"ok": True, "message": f"GB10 matrix started ({w['label'][0]}): {TOTAL} cases in one server start."}


def stop(runner=subprocess.run):
    """Only a run that carries the platform tag; SIGINT lets the script's finally close its container. The hand-started queue is never touched."""
    rc, out, err = ex._ssh(ex.CFG[MACHINE]["alias"], "pkill -INT -f '[G]B10_vllm_gemma26_matrix\\.py.*--tag ryan_plat_'; sleep 5; echo stopped", runner)
    if rc != 0 or "stopped" not in out:
        return {"ok": False, "error": ex._clean(err) or "could not send the stop"}
    return {"ok": True, "message": "Stop sent (only a run started from the platform; the script closes its model server)."}
