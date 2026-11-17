"""LiteLLM smoke test for the local platform: one small benchmark, with and without LiteLLM.

Question answered: how does a LiteLLM gateway in front of two machines change TTFT, TPOT and TPS?
  Without LiteLLM  the app talks straight to one machine (machine A, today's setup)
  With LiteLLM     the app talks to the gateway, which spreads the requests over machine A and machine B
The same four numbers as the platform's own benchmarks are measured for three input sizes:
  TTFT              time to the first token (seconds)
  TPOT              time per output token after the first (milliseconds)
  TPS Normalized    output tokens per second, one request  (= Aggregate / NP)
  TPS Aggregate     output tokens per second, all requests together
NP is the number of requests in flight at once. Tokens are counted as streamed pieces (one piece = one token).

Pass criterion, fixed here before any run: LiteLLM raises the mean Aggregate TPS across the three sizes by at least 1.3x.
Only inference requests are sent; nothing on any machine is started, stopped or changed. The key is read from the environment or a
key file outside the repository and never appears in a result or a log. The launcher exposes this under /api/litellm/
(localhost only, one-time test-password ticket to start).
"""
from __future__ import annotations

import json
import os
import re
import statistics as st
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

CONFIG_NAME = "litellm.local.json"                       # next to launcher.py, git-ignored (machines.local.json style)
KEY_FILE = Path("~/.config/aiso/litellm_smoke.env")      # KEY=VALUE lines, outside the repository
CRIT = {"gain_min": 1.3}
LOAD = {"requests": 8, "concurrency": 4, "tokens": 100, "repeats": 2, "request_timeout_s": 60, "job_timeout_s": 200, "pace_s": 0.7}   # pace_s: a short pause between the quick preflight checks so people can follow them on screen
STEP_NAMES = ("Preflight", "Benchmark")
# The input text is taken from the web at the start of every run: one real article per language (Wikipedia, CC BY-SA 4.0), nothing repeated.
# Sentence = the first sentence, Paragraph / Long passage = the first sentences of the same article up to about 100 / 1000 input tokens
# (the length is fitted against the model's own token count, and the real token and character counts are reported with the result).
# Every request starts with a different number, so no machine can answer it from a cached prompt.
SOURCES = {"en": {"api": "https://en.wikipedia.org/w/api.php", "title": "Night market", "page": "https://en.wikipedia.org/wiki/Night_market", "ask": "Summarize the text above in about 80 words.", "per_token": 4.2, "min_line": 40},
           "zh": {"api": "https://zh.wikipedia.org/w/api.php", "title": "夜市", "page": "https://zh.wikipedia.org/wiki/%E5%A4%9C%E5%B8%82", "ask": "請用約 80 字摘要上面的文章。", "per_token": 1.2, "min_line": 20}}
LANGS = tuple(SOURCES)
LICENSE = "CC BY-SA 4.0"
TARGET_TOKENS = {"mid": 100, "long": 1000}
SIZES = (("short", "Sentence", "一句話"), ("mid", "Paragraph (about 100 input tokens)", "一段文字（約 100 input tokens）"), ("long", "Long passage (about 1000 input tokens)", "長篇文字（約 1000 input tokens）"))
_uid = iter(range(1, 10 ** 9))


def bench_prompt(text, ask):
    return "[%d] %s\n\n%s" % (next(_uid), text, ask)


def fetch_article(lang):
    """Plain text of the article for this language, straight from the web -> {title, url, text}."""
    src = SOURCES[lang]
    q = urllib.parse.urlencode({"action": "query", "prop": "extracts", "explaintext": 1, "redirects": 1, "format": "json", "titles": src["title"]})
    url, ua = src["api"] + "?" + q, "AISO-smoke-test/1.0"
    raw = None
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": ua}), timeout=10) as r:
            raw = r.read()
    except Exception:
        try:       # some Python builds have no CA bundle: the system curl uses the OS trust store (certificates are still verified)
            raw = subprocess.run(["curl", "-sS", "-m", "10", "-A", ua, url], capture_output=True, timeout=15, check=True).stdout
        except Exception:
            raw = None
    try:
        page = next(iter(json.loads(raw)["query"]["pages"].values()))
        text = page.get("extract") or ""
    except Exception:
        text = ""
    return {"title": src["title"], "url": src["page"], "text": text}


def sentences(text, lang):
    """Article text -> clean sentences (headings, one-word list lines and reference marks dropped)."""
    keep = [ln.strip() for ln in text.splitlines() if ln.strip() and not ln.strip().startswith("=") and len(ln.strip()) >= SOURCES[lang]["min_line"]]
    t = re.sub(r"\[\d+\]", "", ("" if lang == "zh" else " ").join(keep))
    t = re.sub(r"[ \t]+", " ", t)
    parts = re.split(r"(?<=[。！？])", t) if lang == "zh" else re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\"“(])", t)
    return [x.strip() for x in parts if len(x.strip()) >= (8 if lang == "zh" else 25)]


def char_count(text, lang):
    return len(re.sub(r"\s", "", text)) if lang == "zh" else len(text)


def fit_text(sents, target, per_token, measure, lang):
    """Whole sentences from the start of the article, chosen so the model's own count lands close to `target` tokens."""
    join = "" if lang == "zh" else " "
    goal, best = target * per_token, None
    for _ in range(4):
        acc, n = [], 0
        for x in sents:
            if acc and n + len(x) > goal:
                break
            acc.append(x); n += len(x) + 1
        text = join.join(acc); tok = measure(text)
        if tok and (best is None or abs(tok - target) < abs(best[1] - target)):
            best = (text, tok)
        if not tok or abs(tok - target) <= 0.1 * target or len(acc) == len(sents):
            break
        goal *= target / tok
    return best or (join.join(sents[:1]), 0)


def plan(cfg=None, load=None):
    """What the test does, as data: the UI draws it as ticking checklists, and the run below reports each item with the same indexes."""
    L = dict(LOAD, **(load or {}))
    a = (cfg or {}).get("machine_a", {}).get("name", "Machine A"); b = (cfg or {}).get("machine_b", {}).get("name", "Machine B")
    it = lambda en, zh: {"label": en, "zh": zh}
    return {"load": {k: L[k] for k in ("requests", "concurrency", "tokens", "repeats")}, "criteria": CRIT, "machines": [a, b], "steps": [
        {"name": "Preflight", "zh": "檢查", "sends": [], "items": [it("Gateway reachable", "閘道可連線"), it("Machines reachable", "主機可連線"), it("No other test in progress", "無其他測試進行中"), it("Test key and model available", "測試金鑰與模型可用"), it("Input text taken from the web", "自網路擷取輸入文字")]},
        {"name": "Benchmark", "zh": "速度", "sends": [{"prompt": "Excerpt of a web article (a sentence, a paragraph or a long passage) + a summary request", "tokens": L["tokens"], "meta": "%d requests, %d at once, x %d" % (L["requests"], L["concurrency"], L["repeats"])}],
         "items": [it("Sentence (one line of text)", "一句話"), it("Paragraph (about 100 input tokens)", "一段文字（約 100 input tokens）"), it("Long passage (about 1000 input tokens)", "長篇文字（約 1000 input tokens）"),
                   it("Mean Aggregate TPS gain with LiteLLM at least %.1fx" % CRIT["gain_min"], "經 LiteLLM 後 Aggregate TPS 平均提升至少 %.1f 倍" % CRIT["gain_min"])]}]}


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


def load_key(cfg):
    """The test key; the environment wins over the key file."""
    name = cfg.get("open_key_env", "LITELLM_SMOKE_OPEN_KEY")
    return os.environ.get(name, "").strip() or _read_key_file().get(name, "")


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


def _prompt_tokens(base, model, content, bearer=None, timeout=60):
    """How many input tokens the model counts for this text (one tiny request)."""
    body = {"model": model, "messages": [{"role": "user", "content": content}], "max_tokens": 1, "chat_template_kwargs": {"enable_thinking": False}}
    status, _, data = _http("POST", base.rstrip("/") + "/v1/chat/completions", body, bearer, timeout)
    return ((data or {}).get("usage") or {}).get("prompt_tokens", 0) if status == 200 else 0


def _stream(base, model, content, tokens, bearer=None, timeout=60):
    """One streamed request -> {code, ttft, total, n}. n counts streamed pieces that carry text (one piece is one token)."""
    body = {"model": model, "messages": [{"role": "user", "content": content}], "max_tokens": tokens, "stream": True, "chat_template_kwargs": {"enable_thinking": False}}
    headers = {"Content-Type": "application/json"}
    if bearer:
        headers["Authorization"] = "Bearer " + bearer
    t = time.time(); first = None; n = 0
    try:
        with urllib.request.urlopen(urllib.request.Request(base.rstrip("/") + "/v1/chat/completions", json.dumps(body).encode(), headers), timeout=timeout) as r:
            for raw in r:
                line = raw.decode("utf-8", "ignore").strip()
                if not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if payload == "[DONE]":
                    break
                try:
                    d = json.loads(payload)
                except ValueError:
                    continue
                delta = ((d.get("choices") or [{}])[0].get("delta")) or {}
                if delta.get("content") or delta.get("reasoning_content"):
                    n += 1
                    if first is None:
                        first = time.time() - t
        total = time.time() - t
        return {"code": 200, "ttft": first if first is not None else total, "total": total, "n": n}
    except urllib.error.HTTPError as e:
        return {"code": e.code, "ttft": 0, "total": time.time() - t, "n": 0}
    except Exception:
        return {"code": 0, "ttft": 0, "total": time.time() - t, "n": 0}


def _load(base, model, bearer, text, ask, n, conc, tokens, timeout):
    """n streamed requests, `conc` at a time -> TTFT / TPOT / TPS of the whole run. NP is the number of requests in flight at once."""
    t0 = time.time()
    with ThreadPoolExecutor(conc) as ex:
        rs = list(ex.map(lambda _: _stream(base, model, bench_prompt(text, ask), tokens, bearer, timeout), range(n)))
    wall = time.time() - t0
    ok = [r for r in rs if r["code"] == 200 and r["n"] > 0]
    tpots = [(r["total"] - r["ttft"]) / (r["n"] - 1) for r in ok if r["n"] > 1]
    agg = sum(r["n"] for r in ok) / wall if wall else 0
    return {"wall_s": wall, "ok": len(ok), "n": n, "ttft_s": st.median(r["ttft"] for r in ok) if ok else 0, "tpot_s": st.median(tpots) if tpots else 0,
            "agg_tps": agg, "norm_tps": agg / conc}


class SmokeService:
    def __init__(self, base_dir, busy_check=None, config=None, keys=None, load=None, fetch=None):
        self.base_dir = Path(base_dir)
        self.fetch = fetch or fetch_article
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

    def key(self, cfg):
        return self._keys if self._keys is not None else load_key(cfg)

    def health(self):
        """One light per thing the test needs. A red light says why: no connection, an HTTP error, or a missing key."""
        cfg = self.config()
        if not cfg:
            return {"configured": False, "checks": []}
        gw, A, B = cfg["gateway"].rstrip("/"), cfg["machine_a"], cfg["machine_b"]
        key = self.key(cfg)

        def probe(name, url, bearer=None):
            code = _http("GET", url, bearer=bearer, timeout=4)[0]
            return {"name": name, "ok": code == 200, "detail": "" if code == 200 else ("no connection" if code == 0 else "HTTP %d" % code)}

        def key_check():
            if not key:
                return {"name": "Test key", "ok": False, "detail": "not set"}
            r = probe("Test key", gw + "/v1/models", key)
            if not r["ok"]:
                r["detail"] = "gateway unreachable" if r["detail"] == "no connection" else ("refused by the gateway" if r["detail"] in ("HTTP 401", "HTTP 403") else r["detail"])
            return r

        def idle_check():
            reason = self.busy_check()
            return {"name": "Platform idle", "ok": not reason, "detail": reason or ""}
        jobs = [lambda: probe("Gateway", gw + "/health/liveliness"), lambda: probe(A["name"], A["url"].rstrip("/") + "/v1/models"),
                lambda: probe(B["name"], B["url"].rstrip("/") + "/v1/models"), key_check, idle_check]
        with ThreadPoolExecutor(len(jobs)) as ex:
            checks = list(ex.map(lambda f: f(), jobs))
        return {"configured": True, "checks": checks}

    def plan(self):
        return plan(self.config(), self.load)

    def script(self):
        """The source of this very module, so the UI can show exactly what is run."""
        return {"name": "benchmark/litellm_smoke.py", "text": Path(__file__).read_text(encoding="utf-8")}

    def status(self):
        cfg = self.config()
        if not cfg:
            return {"ok": False, "reason": "not configured (litellm.local.json is missing)"}
        if not self.key(cfg):
            return {"ok": False, "reason": "test key is not set"}
        code, _, _ = _http("GET", cfg["gateway"].rstrip("/") + "/health/liveliness", timeout=4)
        if code != 200:
            return {"ok": False, "reason": "gateway is not reachable"}
        return {"ok": True, "machines": [cfg["machine_a"]["name"], cfg["machine_b"]["name"]], "load": {k: self.load[k] for k in ("requests", "concurrency", "tokens", "repeats")}}

    # ---- jobs ----
    def start(self, lang="en"):
        if lang not in LANGS:
            raise SmokeError("Unknown input language.", 400)
        st_ = self.status()
        if not st_["ok"]:
            raise SmokeError("Smoke test is not available: " + st_["reason"], 503)
        with self.lock:
            running = next((j for j in self.jobs.values() if j["state"] == "running"), None)
            if running:
                raise SmokeError("A smoke test is already running; it was not interrupted.", 409)
            job = {"job_id": uuid.uuid4().hex[:12], "state": "running", "started": time.time(), "lang": lang,
                   "steps": [{"state": "wait", "detail": ""} for _ in STEP_NAMES], "items": [[{"state": "wait", "value": ""} for _ in s_["items"]] for s_ in plan(self.config(), self.load)["steps"]],
                   "result": None, "partial": [], "error": "", "cancel": False, "log": [], "input": None, "texts": {}}
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
            out = {k: j[k] for k in ("job_id", "state", "steps", "items", "result", "partial", "error", "input")}
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
        """Terminal lines for the UI. Only machine names, timings and counts: never addresses, keys or request text."""
        with self.lock:
            if len(job["log"]) < 600:
                job["log"].append(time.strftime("%H:%M:%S") + "  " + text)

    def _item(self, job, i, j, state, value=""):
        with self.lock:
            job["items"][i][j] = {"state": state, "value": value}

    def _step(self, job, i, state, detail=""):
        with self.lock:
            job["steps"][i] = {"state": state, "detail": detail}

    def _pace(self):
        time.sleep(self.load["pace_s"])

    def _prepare_text(self, job, gw, alias, key, to, lang):
        """Take the article from the web, cut it into the three input sizes and fit each to the model's own token count."""
        art = self.fetch(lang)
        sents = sentences(art.get("text", ""), lang)
        if len(sents) < 3:
            self._item(job, 0, 4, "fail", "no text"); self._step(job, 0, "fail", "article not fetched")
            raise SmokeError("Not started: the input article could not be taken from the web.")
        src, ask = SOURCES[lang], SOURCES[lang]["ask"]
        measure = lambda t: _prompt_tokens(gw, alias, bench_prompt(t, ask), key, to)
        texts, info = {"short": sents[0]}, []
        texts["mid"], tok_mid = fit_text(sents, TARGET_TOKENS["mid"], src["per_token"], measure, lang)
        texts["long"], tok_long = fit_text(sents, TARGET_TOKENS["long"], src["per_token"], measure, lang)
        toks = {"short": measure(texts["short"]), "mid": tok_mid, "long": tok_long}
        for k, _, _ in SIZES:
            info.append({"key": k, "tokens": int(toks[k]), "chars": char_count(texts[k], lang), "preview": texts[k] if len(texts[k]) <= 90 else texts[k][:50].rstrip() + " … " + texts[k][-34:].lstrip()})
        with self.lock:
            job["texts"] = texts
            job["input"] = {"lang": lang, "title": art.get("title", src["title"]), "url": art.get("url", src["page"]), "license": LICENSE, "sizes": info}
        self._log(job, "  input text: web article \"%s\" (%s), %s" % (job["input"]["title"], LICENSE, "; ".join("%s %d tokens / %d characters" % (x["key"], x["tokens"], x["chars"]) for x in info)))

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
        key = self.key(cfg)
        to, n, c, tk, reps = L["request_timeout_s"], L["requests"], L["concurrency"], L["tokens"], L["repeats"]
        lang = job["lang"]
        self._log(job, "$ smoke test start  input language: %s  load: %d requests, %d at once, up to %d output tokens, %d repeats" % ({"en": "English", "zh": "Chinese"}[lang], n, c, tk, reps))

        # 0 Preflight: nothing is asked of a model until every check has passed
        self._log(job, "[1/2] Preflight")
        self._step(job, 0, "run", "checking")
        for j in range(5):
            self._item(job, 0, j, "wait")
        self._item(job, 0, 0, "run")
        if _http("GET", gw + "/health/liveliness", timeout=5)[0] != 200:
            self._item(job, 0, 0, "fail", "down"); self._step(job, 0, "fail", "gateway down")
            raise SmokeError("Not started: the gateway is not reachable.")
        self._item(job, 0, 0, "ok"); self._pace(); self._item(job, 0, 1, "run")
        for m in (A, B):
            if _http("GET", m["url"].rstrip("/") + "/v1/models", timeout=5)[0] != 200:
                self._item(job, 0, 1, "fail", m["name"]); self._step(job, 0, "fail", m["name"] + " unreachable")
                raise SmokeError("Not started: %s is not reachable." % m["name"])
        self._item(job, 0, 1, "ok", "%s + %s" % (A["name"], B["name"])); self._pace(); self._item(job, 0, 2, "run")
        reason = self.busy_check()
        if reason:
            self._item(job, 0, 2, "fail", "busy"); self._step(job, 0, "fail", reason)
            raise SmokeError("Not started: " + reason)
        self._item(job, 0, 2, "ok"); self._pace(); self._item(job, 0, 3, "run")
        code, _, models = _http("GET", gw + "/v1/models", bearer=key, timeout=5)
        have = {x.get("id") for x in (models or {}).get("data", [])} if code == 200 else set()
        if code != 200 or cfg["group_alias"] not in have:
            self._item(job, 0, 3, "fail", "missing"); self._step(job, 0, "fail", "model missing" if code == 200 else "test key refused")
            raise SmokeError("Not started: the gateway does not offer the model this test needs.")
        self._pace(); self._item(job, 0, 3, "ok"); self._pace(); self._item(job, 0, 4, "run")
        self._log(job, "  gateway up, %s and %s reachable, nothing else running, test key accepted  -> OK" % (A["name"], B["name"]))
        self._prepare_text(job, gw, cfg["group_alias"], key, to, lang)
        self._item(job, 0, 4, "ok", "%s · %d texts" % (job["input"]["title"], len(job["input"]["sizes"])))
        self._step(job, 0, "ok", "gateway up")

        # 1 Benchmark: for each input size, Without (machine A straight) and With (the gateway over both machines), repeats interleaved
        self._check(job, deadline)
        self._step(job, 1, "run", "measuring")
        for j in range(4):
            self._item(job, 1, j, "wait")
        self._log(job, "[2/2] Benchmark  (%s straight  vs  both machines through LiteLLM; TTFT, TPOT, TPS)" % A["name"])
        _stream(A["url"], A["model"], "hi", 5, timeout=to); _stream(gw, cfg["group_alias"], "hi", 5, key, to)   # warm-up
        sizes = []
        for si, (skey, en, zh) in enumerate(SIZES):
            self._item(job, 1, si, "run", "")
            text, ask = job["texts"][skey], SOURCES[lang]["ask"]
            ptok = job["input"]["sizes"][si]["tokens"]
            runs = {"a": [], "ab": []}
            for rep in range(reps):
                for mk, label, fn in (("a", "%s only (without LiteLLM)" % A["name"], lambda: _load(A["url"], A["model"], None, text, ask, n, c, tk, to)),
                                      ("ab", "both machines via LiteLLM", lambda: _load(gw, cfg["group_alias"], key, text, ask, n, c, tk, to))):
                    r_ = fn(); runs[mk].append(r_); self._check(job, deadline)
                    self._log(job, "  %-22s repeat %d/%d  %-30s TTFT %5.2f s  TPOT %5.1f ms  TPS %6.1f agg / %5.1f norm   %d/%d ok"
                              % (en, rep + 1, reps, label, r_["ttft_s"], r_["tpot_s"] * 1000, r_["agg_tps"], r_["norm_tps"], r_["ok"], r_["n"]))
                self._item(job, 1, si, "run", "%d/%d" % (rep + 1, reps))
            med = lambda mk, f: st.median(x[f] for x in runs[mk])
            sz = {"key": skey, "tokens": int(ptok), "chars": job["input"]["sizes"][si]["chars"]}
            for mk in ("a", "ab"):
                sz[mk] = {"ttft_s": round(med(mk, "ttft_s"), 3), "tpot_ms": round(med(mk, "tpot_s") * 1000, 1), "agg_tps": round(med(mk, "agg_tps"), 1), "norm_tps": round(med(mk, "norm_tps"), 1),
                          "ok": all(x["ok"] == x["n"] for x in runs[mk])}
            sz["gain_agg"] = round(sz["ab"]["agg_tps"] / sz["a"]["agg_tps"], 2) if sz["a"]["agg_tps"] else 0
            sizes.append(sz)
            with self.lock:
                job["partial"] = [dict(x) for x in sizes]            # the page shows a row as soon as its size is done
            good = sz["a"]["ok"] and sz["ab"]["ok"]
            self._item(job, 1, si, "ok" if good else "fail", "%.2fx · %d tok" % (sz["gain_agg"], sz["tokens"]))
            self._log(job, "  %-22s input %d tokens: Aggregate TPS %.1f -> %.1f  (%.2fx)" % (en, sz["tokens"], sz["a"]["agg_tps"], sz["ab"]["agg_tps"], sz["gain_agg"]))
        gain = st.mean(x["gain_agg"] for x in sizes)
        allok = all(x["a"]["ok"] and x["ab"]["ok"] for x in sizes)
        passed = allok and gain >= CRIT["gain_min"]
        self._item(job, 1, 3, "ok" if passed else "fail", "%.2fx" % gain)
        self._step(job, 1, "ok" if passed else "fail", "%.2fx Aggregate TPS" % gain)
        self._log(job, "  mean Aggregate TPS gain %.2fx  (need >= %.1fx)  %s" % (gain, CRIT["gain_min"], "PASS" if passed else "FAIL"))
        res = {"bench": {"lang": lang, "input": job["input"], "np": c, "requests": n, "output_tokens": tk, "repeats": reps, "sizes": sizes, "gain_agg": round(gain, 2), "pass": passed},
               "machines": [A["name"], B["name"]], "all_pass": passed, "criteria": CRIT, "finished": time.strftime("%H:%M:%S")}
        self._log(job, "RESULT: %s" % ("ALL PASS" if passed else "SOME CHECKS FAILED"))
        return res
