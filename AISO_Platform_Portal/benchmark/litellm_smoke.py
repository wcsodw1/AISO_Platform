"""LiteLLM smoke test for the local platform.

One short run (about 70 s) that compares "without LiteLLM" (direct to the machine) with "with LiteLLM" (through the gateway):
  Preflight  gateway healthy, nothing else running on the platform, endpoints reachable
  Speed      the same small load: machine A direct, machine B direct, both machines split by the app itself ("by hand"), gateway with both machines (needs machine B)
  Cost       short requests, direct vs gateway, interleaved
  Control    a key limited to one model: own model allowed, another model refused; an open key allowed

Pass criteria are fixed here, before any run. Only inference requests are sent. Nothing on any machine is started, stopped or
changed. Keys are read from the environment or from a key file outside the repository and never appear in a result or a log.
The launcher exposes it under /api/litellm/ (localhost only, one-time test-password ticket to start).
"""
from __future__ import annotations

import json
import os
import statistics as st
import threading
import time
import urllib.error
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

CONFIG_NAME = "litellm.local.json"                       # next to launcher.py, git-ignored (machines.local.json style)
KEY_FILE = Path("~/.config/aiso/litellm_smoke.env")      # KEY=VALUE lines, outside the repository
CRIT = {"speedup_min": 1.3, "overhead_max_s": 0.10}
LOAD = {"requests": 8, "concurrency": 4, "tokens": 100, "repeats": 3, "cost_pairs": 6, "request_timeout_s": 60, "job_timeout_s": 120}
STEP_NAMES = ("Preflight", "Speed", "Cost", "Control")


class SmokeError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def _read_key_file():
    out = {}
    try:
        for line in KEY_FILE.expanduser().read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, _, v = line.partition("=")
                out[k.strip()] = v.strip().strip("'\"")
    except OSError:
        pass
    return out


def load_keys(cfg):
    """(open_key, limited_key); environment wins over the key file."""
    file_keys = _read_key_file()
    get = lambda name: os.environ.get(name, "").strip() or file_keys.get(name, "")
    return get(cfg.get("open_key_env", "LITELLM_SMOKE_OPEN_KEY")), get(cfg.get("limited_key_env", "LITELLM_SMOKE_LIMITED_KEY"))


def _http(method, url, body=None, bearer=None, timeout=60):
    """-> (status, headers, parsed json or None). Never raises for HTTP errors; connection problems give status 0."""
    headers = {"Content-Type": "application/json"}
    if bearer:
        headers["Authorization"] = "Bearer " + bearer
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data, headers, method=method), timeout=timeout) as r:
            raw = r.read()
            try:
                return r.status, dict(r.headers), json.loads(raw)
            except ValueError:
                return r.status, dict(r.headers), None
    except urllib.error.HTTPError as e:
        return e.code, {}, None
    except Exception:
        return 0, {}, None


def _chat(base, model, content, tokens, bearer=None, timeout=60):
    body = {"model": model, "messages": [{"role": "user", "content": content}], "max_tokens": tokens, "chat_template_kwargs": {"enable_thinking": False}}
    t = time.time()
    status, _, data = _http("POST", base.rstrip("/") + "/v1/chat/completions", body, bearer, timeout)
    toks = ((data or {}).get("usage") or {}).get("completion_tokens", 0) if status == 200 else 0
    return {"code": status, "s": time.time() - t, "tok": toks}


def _load(base, model, bearer, n, conc, tokens, timeout):
    t = time.time()
    with ThreadPoolExecutor(conc) as ex:
        rs = list(ex.map(lambda _: _chat(base, model, "用約80字介紹台北的夜市文化", tokens, bearer, timeout), range(n)))
    wall = time.time() - t
    ok = [r for r in rs if r["code"] == 200]
    return {"wall_s": wall, "ok": len(ok), "n": n, "tok_s": sum(r["tok"] for r in ok) / wall if wall else 0}


def _load_hand(a, b, n, conc, tokens, timeout):
    """What an app has to do WITHOUT a gateway to use both machines: alternate between them itself."""
    t = time.time()
    pick = lambda i: a if i % 2 == 0 else b
    with ThreadPoolExecutor(conc) as ex:
        rs = list(ex.map(lambda i: _chat(pick(i)["url"], pick(i)["model"], "用約80字介紹台北的夜市文化", tokens, None, timeout), range(n)))
    wall = time.time() - t
    ok = [r for r in rs if r["code"] == 200]
    return {"wall_s": wall, "ok": len(ok), "n": n, "tok_s": sum(r["tok"] for r in ok) / wall if wall else 0}


class SmokeService:
    def __init__(self, base_dir, busy_check=None, config=None, keys=None, load=None):
        self.base_dir = Path(base_dir)
        self.busy_check = busy_check or (lambda: None)
        self._config, self._keys, self.load = config, keys, dict(LOAD, **(load or {}))
        self.jobs, self.lock = {}, threading.RLock()

    # ---- config / status ----
    def config(self):
        if self._config is not None:
            return self._config
        try:
            return json.loads((self.base_dir / CONFIG_NAME).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None

    def keys(self, cfg):
        return self._keys if self._keys is not None else load_keys(cfg)

    def status(self):
        cfg = self.config()
        if not cfg:
            return {"ok": False, "reason": "not configured (litellm.local.json is missing)"}
        if not all(self.keys(cfg)):
            return {"ok": False, "reason": "test keys are not set"}
        code, _, _ = _http("GET", cfg["gateway"].rstrip("/") + "/health/liveliness", timeout=4)
        if code != 200:
            return {"ok": False, "reason": "gateway is not reachable"}
        return {"ok": True, "machines": [cfg["machine_a"]["name"], cfg["machine_b"]["name"]], "load": {k: self.load[k] for k in ("requests", "concurrency", "tokens", "repeats")}}

    # ---- jobs ----
    def start(self, include_b=False):
        st_ = self.status()
        if not st_["ok"]:
            raise SmokeError("Smoke test is not available: " + st_["reason"], 503)
        with self.lock:
            running = next((j for j in self.jobs.values() if j["state"] == "running"), None)
            if running:
                raise SmokeError("A smoke test is already running; it was not interrupted.", 409)
            job = {"job_id": uuid.uuid4().hex[:12], "state": "running", "include_b": bool(include_b), "started": time.time(),
                   "steps": [{"state": "wait", "detail": ""} for _ in STEP_NAMES], "result": None, "error": "", "cancel": False}
            self.jobs[job["job_id"]] = job
            for old in sorted(self.jobs.values(), key=lambda j: j["started"])[:-10]:
                self.jobs.pop(old["job_id"], None)
        threading.Thread(target=self._run, args=(job,), daemon=True).start()
        return {"job_id": job["job_id"]}

    def get(self, job_id):
        with self.lock:
            j = self.jobs.get(job_id)
            if not j:
                raise SmokeError("Unknown smoke test.", 404)
            return {k: j[k] for k in ("job_id", "state", "steps", "result", "error")}

    def cancel(self, job_id):
        with self.lock:
            j = self.jobs.get(job_id)
            if not j:
                raise SmokeError("Unknown smoke test.", 404)
            j["cancel"] = True
        return {"ok": True}

    # ---- the run ----
    def _step(self, job, i, state, detail=""):
        with self.lock:
            job["steps"][i] = {"state": state, "detail": detail}

    def _check(self, job, deadline):
        if job["cancel"]:
            raise SmokeError("Cancelled.")
        if time.time() > deadline:
            raise SmokeError("Stopped: the smoke test took longer than %d s." % self.load["job_timeout_s"])

    def _run(self, job):
        deadline = time.time() + self.load["job_timeout_s"]
        try:
            res = self._execute(job, deadline)
            with self.lock:
                job["result"], job["state"] = res, "done"
        except SmokeError as e:
            with self.lock:
                job["error"], job["state"] = str(e), ("cancelled" if job["cancel"] else "failed")
        except Exception as e:  # never leak details (they could contain URLs)
            with self.lock:
                job["error"], job["state"] = "Unexpected error (%s)." % type(e).__name__, "failed"

    def _execute(self, job, deadline):
        cfg, L = self.config(), self.load
        gw, A, B = cfg["gateway"].rstrip("/"), cfg["machine_a"], cfg["machine_b"]
        k_open, k_lim = self.keys(cfg)
        to = L["request_timeout_s"]
        include_b = job["include_b"]
        res = {"speed": None, "cost": None, "control": None, "skipped": [], "criteria": CRIT, "load": {k: L[k] for k in ("requests", "concurrency", "tokens", "repeats")}}

        # 0 Preflight: nothing is sent to a model until every check has passed
        self._step(job, 0, "run", "checking")
        reason = self.busy_check()
        if reason:
            self._step(job, 0, "fail", reason)
            raise SmokeError("Not started: " + reason)
        if _http("GET", gw + "/health/liveliness", timeout=5)[0] != 200:
            self._step(job, 0, "fail", "gateway down")
            raise SmokeError("Not started: the gateway is not reachable.")
        for m in [A] + ([B] if include_b else []):
            if _http("GET", m["url"].rstrip("/") + "/v1/models", timeout=5)[0] != 200:
                self._step(job, 0, "fail", m["name"] + " unreachable")
                raise SmokeError("Not started: %s is not reachable." % m["name"])
        code, _, models = _http("GET", gw + "/v1/models", bearer=k_open, timeout=5)
        have = {x.get("id") for x in (models or {}).get("data", [])} if code == 200 else set()
        need = {cfg["single_alias"], cfg["group_alias"], cfg["limited_alias"], cfg["other_model"]}
        if code != 200 or not need <= have:
            self._step(job, 0, "fail", "aliases missing" if code == 200 else "test key refused")
            raise SmokeError("Not started: the gateway does not offer the aliases this test needs.")
        self._step(job, 0, "ok", "gateway up")

        # 1 Speed
        self._check(job, deadline)
        if not include_b:
            self._step(job, 1, "skip", "%s not included" % B["name"])
            res["skipped"].append("speed")
        else:
            self._step(job, 1, "run", "measuring")
            n, c, tk = L["requests"], L["concurrency"], L["tokens"]
            _chat(A["url"], A["model"], "hi", 5, timeout=to); _chat(gw, cfg["group_alias"], "hi", 5, k_open, to)   # warm-up
            runs = {"a": [], "b": [], "hand": [], "ab": []}
            for _ in range(L["repeats"]):                      # one pass of each mode per repeat; the median of the repeats is reported
                runs["a"].append(_load(A["url"], A["model"], None, n, c, tk, to)); self._check(job, deadline)
                runs["b"].append(_load(B["url"], B["model"], None, n, c, tk, to)); self._check(job, deadline)
                runs["hand"].append(_load_hand(A, B, n, c, tk, to)); self._check(job, deadline)
                runs["ab"].append(_load(gw, cfg["group_alias"], k_open, n, c, tk, to)); self._check(job, deadline)
            ok = all(r["ok"] == r["n"] for k in runs for r in runs[k])
            med = lambda k, f: st.median(r[f] for r in runs[k])
            ra, rb, rh, rg = ({"wall_s": med(k, "wall_s"), "tok_s": med(k, "tok_s")} for k in ("a", "b", "hand", "ab"))
            sp = ra["wall_s"] / rg["wall_s"] if rg["wall_s"] else 0
            res["speed"] = {"median_s": {"a": round(ra["wall_s"], 2), "b": round(rb["wall_s"], 2), "hand": round(rh["wall_s"], 2), "ab": round(rg["wall_s"], 2)},
                            "tok_s": {"a": round(ra["tok_s"], 1), "b": round(rb["tok_s"], 1), "hand": round(rh["tok_s"], 1), "ab": round(rg["tok_s"], 1)},
                            "speedup_vs_a": round(sp, 2), "vs_hand": round(rh["wall_s"] / rg["wall_s"], 2) if rg["wall_s"] else 0, "all_ok": ok, "pass": ok and sp >= CRIT["speedup_min"]}
            self._step(job, 1, "ok" if res["speed"]["pass"] else "fail", "%.2fx vs %s" % (sp, A["name"]) if ok else "some requests failed")

        # 2 Cost
        self._check(job, deadline)
        self._step(job, 2, "run", "measuring")
        d_s, g_s, errs = [], [], 0
        for _ in range(L["cost_pairs"]):
            d = _chat(A["url"], A["model"], "說一個字", 10, timeout=to); g = _chat(gw, cfg["single_alias"], "說一個字", 10, k_open, to)
            if d["code"] == 200 and g["code"] == 200:
                d_s.append(d["s"]); g_s.append(g["s"])
            else:
                errs += 1
            self._check(job, deadline)
        if d_s:
            added = st.median(g - d for g, d in zip(g_s, d_s))
            res["cost"] = {"direct_s": round(st.median(d_s), 3), "gateway_s": round(st.median(g_s), 3), "added_s": round(added, 3), "errors": errs,
                           "pass": errs == 0 and added <= CRIT["overhead_max_s"]}
        else:
            res["cost"] = {"direct_s": 0, "gateway_s": 0, "added_s": 0, "errors": errs, "pass": False}
        self._step(job, 2, "ok" if res["cost"]["pass"] else "fail", "%+.2f s" % res["cost"]["added_s"] if d_s else "requests failed")

        # 3 Control
        self._check(job, deadline)
        self._step(job, 3, "run", "checking keys")
        own = _chat(gw, cfg["limited_alias"], "hi", 20, k_lim, to)["code"]
        other = _chat(gw, cfg["other_model"], "hi", 20, k_lim, to)["code"]
        opn = _chat(gw, cfg["other_model"], "hi", 20, k_open, to)["code"]
        ctl_ok = own == 200 and other in (401, 403) and opn == 200
        res["control"] = {"own": own, "other": other, "open": opn, "pass": ctl_ok}
        self._step(job, 3, "ok" if ctl_ok else "fail", "%s on other model" % other)

        parts = [res[k]["pass"] for k in ("speed", "cost", "control") if res[k]]
        res["all_pass"] = bool(parts) and all(parts) and not res["skipped"]
        res["finished"] = time.strftime("%H:%M:%S")
        return res
