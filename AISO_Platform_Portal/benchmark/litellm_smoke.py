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
PROMPTS = {"speed": "用約80字介紹台北的夜市文化", "cost": "說一個字", "control": "hi", "warmup": "hi"}   # the exact questions sent to the models


def plan(cfg=None, load=None):
    """What the test does, as data: the UI draws it as ticking checklists, and the run below reports each item with the same indexes."""
    L = dict(LOAD, **(load or {}))
    a = (cfg or {}).get("machine_a", {}).get("name", "Machine A"); b = (cfg or {}).get("machine_b", {}).get("name", "Machine B")
    n, r = L["requests"], L["repeats"]
    it = lambda en, zh: {"label": en, "zh": zh}
    return {"load": {k: L[k] for k in ("requests", "concurrency", "tokens", "repeats", "cost_pairs")}, "criteria": CRIT, "steps": [
        {"name": "Preflight", "zh": "檢查", "sends": [], "items": [it("Gateway is up", "閘道正常"), it("Machines reachable", "機器連得到"), it("Nothing else is running", "沒有其他測試在跑"), it("Test keys and models present", "測試金鑰與模型都在")]},
        {"name": "Speed", "zh": "速度", "sends": [{"prompt": PROMPTS["speed"], "tokens": L["tokens"], "meta": "%d requests x %d" % (n, r)}],
         "items": [it(a + " only (one machine, today)", "只接 " + a + "（現況）"), it(b + " only", "只接 " + b), it("Both, the app splits by hand", "兩台，應用自己分流"), it("Both, via LiteLLM", "兩台，經 LiteLLM"),
                   it("LiteLLM at least %.1fx faster than %s only" % (CRIT["speedup_min"], a), "LiteLLM 比只接 %s 快至少 %.1f 倍" % (a, CRIT["speedup_min"]))]},
        {"name": "Cost", "zh": "延遲", "sends": [{"prompt": PROMPTS["cost"], "tokens": 10, "meta": "%d pairs" % L["cost_pairs"]}],
         "items": [it("Pairs sent: direct and via LiteLLM", "直連與經 LiteLLM 各送一次"), it("Extra delay at most %.2f s" % CRIT["overhead_max_s"], "額外延遲不超過 %.2f 秒" % CRIT["overhead_max_s"])]},
        {"name": "Control", "zh": "管控", "sends": [{"prompt": PROMPTS["control"], "tokens": 20, "meta": "4 requests"}],
         "items": [it("Limited key, its own model (expect 200)", "限定金鑰，自己的模型（預期 200）"), it("Limited key, another model (expect 403)", "限定金鑰，別的模型（預期 403）"),
                   it("Open key, another model (expect 200)", "不設限金鑰，別的模型（預期 200）"), it("No gateway, another model (200: nothing stops it)", "不經閘道，別的模型（200：沒人擋）")]}]}


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
        rs = list(ex.map(lambda _: _chat(base, model, PROMPTS["speed"], tokens, bearer, timeout), range(n)))
    wall = time.time() - t
    ok = [r for r in rs if r["code"] == 200]
    return {"wall_s": wall, "ok": len(ok), "n": n, "tok_s": sum(r["tok"] for r in ok) / wall if wall else 0}


def _load_hand(a, b, n, conc, tokens, timeout):
    """What an app has to do WITHOUT a gateway to use both machines: alternate between them itself."""
    t = time.time()
    pick = lambda i: a if i % 2 == 0 else b
    with ThreadPoolExecutor(conc) as ex:
        rs = list(ex.map(lambda i: _chat(pick(i)["url"], pick(i)["model"], PROMPTS["speed"], tokens, None, timeout), range(n)))
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

    def plan(self):
        return plan(self.config(), self.load)

    def script(self):
        """The source of this very module, so the UI can show exactly what is run."""
        return {"name": "benchmark/litellm_smoke.py", "text": Path(__file__).read_text(encoding="utf-8")}

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
                   "steps": [{"state": "wait", "detail": ""} for _ in STEP_NAMES], "items": [[{"state": "wait", "value": ""} for _ in st_["items"]] for st_ in plan(self.config(), self.load)["steps"]],
                   "result": None, "error": "", "cancel": False, "log": []}
            self.jobs[job["job_id"]] = job
            for old in sorted(self.jobs.values(), key=lambda j: j["started"])[:-10]:
                self.jobs.pop(old["job_id"], None)
        threading.Thread(target=self._run, args=(job,), daemon=True).start()
        return {"job_id": job["job_id"]}

    def get(self, job_id, since=0):
        with self.lock:
            j = self.jobs.get(job_id)
            if not j:
                raise SmokeError("Unknown smoke test.", 404)
            since = max(0, int(since or 0))
            out = {k: j[k] for k in ("job_id", "state", "steps", "items", "result", "error")}
            out["log"], out["log_next"] = j["log"][since:], len(j["log"])
            return out

    def cancel(self, job_id):
        with self.lock:
            j = self.jobs.get(job_id)
            if not j:
                raise SmokeError("Unknown smoke test.", 404)
            j["cancel"] = True
        return {"ok": True}

    # ---- the run ----
    def _log(self, job, text):
        """Terminal lines for the UI. Only machine names, timings and status codes: never addresses, keys or request text."""
        with self.lock:
            if len(job["log"]) < 600:
                job["log"].append(time.strftime("%H:%M:%S") + "  " + text)

    def _item(self, job, i, j, state, value=""):
        with self.lock:
            job["items"][i][j] = {"state": state, "value": value}

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
        self._log(job, "$ smoke test start  (%s machine B)  load: %d requests, %d at once, %d repeats" % ("with" if include_b else "without", L["requests"], L["concurrency"], L["repeats"]))
        self._log(job, "[1/4] Preflight")
        self._step(job, 0, "run", "checking")
        for j in range(4):
            self._item(job, 0, j, "wait")
        self._item(job, 0, 0, "run")
        if _http("GET", gw + "/health/liveliness", timeout=5)[0] != 200:
            self._item(job, 0, 0, "fail", "down"); self._step(job, 0, "fail", "gateway down")
            raise SmokeError("Not started: the gateway is not reachable.")
        self._item(job, 0, 0, "ok"); self._item(job, 0, 1, "run")
        for m in [A] + ([B] if include_b else []):
            if _http("GET", m["url"].rstrip("/") + "/v1/models", timeout=5)[0] != 200:
                self._item(job, 0, 1, "fail", m["name"]); self._step(job, 0, "fail", m["name"] + " unreachable")
                raise SmokeError("Not started: %s is not reachable." % m["name"])
        self._item(job, 0, 1, "ok", " + ".join(x["name"] for x in ([A] + ([B] if include_b else [])))); self._item(job, 0, 2, "run")
        reason = self.busy_check()
        if reason:
            self._item(job, 0, 2, "fail", "busy"); self._step(job, 0, "fail", reason)
            raise SmokeError("Not started: " + reason)
        self._item(job, 0, 2, "ok"); self._item(job, 0, 3, "run")
        code, _, models = _http("GET", gw + "/v1/models", bearer=k_open, timeout=5)
        have = {x.get("id") for x in (models or {}).get("data", [])} if code == 200 else set()
        need = {cfg["single_alias"], cfg["group_alias"], cfg["limited_alias"], cfg["other_model"]}
        if code != 200 or not need <= have:
            self._item(job, 0, 3, "fail", "missing"); self._step(job, 0, "fail", "aliases missing" if code == 200 else "test key refused")
            raise SmokeError("Not started: the gateway does not offer the aliases this test needs.")
        self._item(job, 0, 3, "ok")
        self._step(job, 0, "ok", "gateway up")
        self._log(job, "  gateway up, %s%s reachable, test keys accepted, aliases present  -> OK" % (A["name"], " and " + B["name"] if include_b else ""))

        # 1 Speed
        self._check(job, deadline)
        if not include_b:
            self._step(job, 1, "skip", "%s not included" % B["name"])
            for j in range(5):
                self._item(job, 1, j, "skip", "tick %s to measure" % B["name"])
            self._log(job, "[2/4] Speed  skipped: %s is not included, so two machines cannot be compared" % B["name"])
            res["skipped"].append("speed")
        else:
            self._step(job, 1, "run", "measuring")
            for j in range(5):
                self._item(job, 1, j, "wait")
            self._log(job, "[2/4] Speed  (same load, four ways)")
            n, c, tk = L["requests"], L["concurrency"], L["tokens"]
            _chat(A["url"], A["model"], PROMPTS["warmup"], 5, timeout=to); _chat(gw, cfg["group_alias"], PROMPTS["warmup"], 5, k_open, to)   # warm-up
            runs = {"a": [], "b": [], "hand": [], "ab": []}
            for _ in range(L["repeats"]):                      # one pass of each mode per repeat; the median of the repeats is reported
                rep_no = len(runs["a"]) + 1
                for key, label, fn in (("a", "%s only (app wired to one machine)" % A["name"], lambda: _load(A["url"], A["model"], None, n, c, tk, to)),
                                       ("b", "%s only" % B["name"], lambda: _load(B["url"], B["model"], None, n, c, tk, to)),
                                       ("hand", "both, app splits by hand", lambda: _load_hand(A, B, n, c, tk, to)),
                                       ("ab", "both, via LiteLLM", lambda: _load(gw, cfg["group_alias"], k_open, n, c, tk, to))):
                    j_ = ("a", "b", "hand", "ab").index(key)
                    self._item(job, 1, j_, "run", "")
                    r_ = fn(); runs[key].append(r_); self._check(job, deadline)
                    self._item(job, 1, j_, "run", "%.1f s · %d/%d" % (r_["wall_s"], rep_no, L["repeats"]))
                    self._log(job, "  repeat %d/%d  %-38s %5.2f s   %d/%d ok" % (rep_no, L["repeats"], label, r_["wall_s"], r_["ok"], r_["n"]))
            ok = all(r["ok"] == r["n"] for k in runs for r in runs[k])
            med = lambda k, f: st.median(r[f] for r in runs[k])
            ra, rb, rh, rg = ({"wall_s": med(k, "wall_s"), "tok_s": med(k, "tok_s")} for k in ("a", "b", "hand", "ab"))
            sp = ra["wall_s"] / rg["wall_s"] if rg["wall_s"] else 0
            res["speed"] = {"median_s": {"a": round(ra["wall_s"], 2), "b": round(rb["wall_s"], 2), "hand": round(rh["wall_s"], 2), "ab": round(rg["wall_s"], 2)},
                            "tok_s": {"a": round(ra["tok_s"], 1), "b": round(rb["tok_s"], 1), "hand": round(rh["tok_s"], 1), "ab": round(rg["tok_s"], 1)},
                            "speedup_vs_a": round(sp, 2), "vs_hand": round(rh["wall_s"] / rg["wall_s"], 2) if rg["wall_s"] else 0, "all_ok": ok, "pass": ok and sp >= CRIT["speedup_min"]}
            for j_, key in enumerate(("a", "b", "hand", "ab")):
                self._item(job, 1, j_, "ok" if ok else "fail", "%.1f s" % med(key, "wall_s"))
            self._item(job, 1, 4, "ok" if res["speed"]["pass"] else "fail", "%.2fx" % sp)
            self._step(job, 1, "ok" if res["speed"]["pass"] else "fail", "%.2fx vs %s" % (sp, A["name"]) if ok else "some requests failed")
            m_ = res["speed"]["median_s"]
            self._log(job, "  median: %s %.2f s | %s %.2f s | by hand %.2f s | LiteLLM %.2f s  ->  %.2fx vs %s  (need >= %.1fx)  %s" % (A["name"], m_["a"], B["name"], m_["b"], m_["hand"], m_["ab"], sp, A["name"], CRIT["speedup_min"], "PASS" if res["speed"]["pass"] else "FAIL"))

        # 2 Cost
        self._check(job, deadline)
        self._step(job, 2, "run", "measuring")
        self._log(job, "[3/4] Cost  (%d short requests, direct and via LiteLLM, interleaved)" % L["cost_pairs"])
        self._item(job, 2, 0, "run", "0 / %d" % L["cost_pairs"]); self._item(job, 2, 1, "wait")
        d_s, g_s, errs = [], [], 0
        for _ in range(L["cost_pairs"]):
            d = _chat(A["url"], A["model"], PROMPTS["cost"], 10, timeout=to); g = _chat(gw, cfg["single_alias"], PROMPTS["cost"], 10, k_open, to)
            if d["code"] == 200 and g["code"] == 200:
                d_s.append(d["s"]); g_s.append(g["s"])
                self._log(job, "  pair %d  direct %.3f s   via LiteLLM %.3f s   (%+.3f s)" % (len(d_s), d["s"], g["s"], g["s"] - d["s"]))
                self._item(job, 2, 0, "run", "%d / %d" % (len(d_s), L["cost_pairs"]))
            else:
                errs += 1
            self._check(job, deadline)
        if d_s:
            added = st.median(g - d for g, d in zip(g_s, d_s))
            res["cost"] = {"direct_s": round(st.median(d_s), 3), "gateway_s": round(st.median(g_s), 3), "added_s": round(added, 3), "errors": errs,
                           "pass": errs == 0 and added <= CRIT["overhead_max_s"]}
        else:
            res["cost"] = {"direct_s": 0, "gateway_s": 0, "added_s": 0, "errors": errs, "pass": False}
        self._item(job, 2, 0, "ok" if errs == 0 else "fail", "%d / %d" % (len(d_s), L["cost_pairs"]))
        self._item(job, 2, 1, "ok" if res["cost"]["pass"] else "fail", "%+.2f s" % res["cost"]["added_s"])
        self._step(job, 2, "ok" if res["cost"]["pass"] else "fail", "%+.2f s" % res["cost"]["added_s"] if d_s else "requests failed")
        self._log(job, "  added delay (median) %+.3f s  (need <= %.2f s)  %s" % (res["cost"]["added_s"], CRIT["overhead_max_s"], "PASS" if res["cost"]["pass"] else "FAIL"))

        # 3 Control
        self._check(job, deadline)
        self._step(job, 3, "run", "checking keys")
        self._log(job, "[4/4] Control  (a key limited to one model)")
        for j in range(4):
            self._item(job, 3, j, "wait")
        self._item(job, 3, 0, "run")
        own = _chat(gw, cfg["limited_alias"], PROMPTS["control"], 20, k_lim, to)["code"]
        self._item(job, 3, 0, "ok" if own == 200 else "fail", str(own)); self._item(job, 3, 1, "run")
        other = _chat(gw, cfg["other_model"], PROMPTS["control"], 20, k_lim, to)["code"]
        self._item(job, 3, 1, "ok" if other in (401, 403) else "fail", str(other)); self._item(job, 3, 2, "run")
        opn = _chat(gw, cfg["other_model"], PROMPTS["control"], 20, k_open, to)["code"]
        self._item(job, 3, 2, "ok" if opn == 200 else "fail", str(opn)); self._item(job, 3, 3, "run")
        # "without": the same other-model request sent straight to the machine (no key, nothing to stop it)
        direct_other = _chat(A["url"], cfg.get("other_direct_model", "qwen36-35b-q4"), PROMPTS["control"], 20, None, to)["code"]
        self._item(job, 3, 3, "ok" if direct_other == 200 else "fail", str(direct_other))
        self._log(job, "  limited key -> its own model      HTTP %s  (expect 200)" % own)
        self._log(job, "  limited key -> another model      HTTP %s  (expect 403, refused)" % other)
        self._log(job, "  open key    -> another model      HTTP %s  (expect 200)" % opn)
        self._log(job, "  no gateway  -> another model      HTTP %s  (straight to the machine: nothing stops it)" % direct_other)
        ctl_ok = own == 200 and other in (401, 403) and opn == 200
        res["control"] = {"own": own, "other": other, "open": opn, "direct_other": direct_other, "pass": ctl_ok}
        self._step(job, 3, "ok" if ctl_ok else "fail", "%s on other model" % other)
        self._log(job, "  control  %s" % ("PASS" if ctl_ok else "FAIL"))

        parts = [res[k]["pass"] for k in ("speed", "cost", "control") if res[k]]
        res["all_pass"] = bool(parts) and all(parts) and not res["skipped"]
        res["finished"] = time.strftime("%H:%M:%S")
        self._log(job, "RESULT: %s" % ("ALL PASS" if res["all_pass"] else ("NOT CONFIRMED (speed was skipped)" if res["skipped"] else "SOME CHECKS FAILED")))
        return res
