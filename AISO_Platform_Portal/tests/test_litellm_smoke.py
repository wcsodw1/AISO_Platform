"""LiteLLM smoke test: runs the real module against small fake HTTP servers (gateway, machine A, machine B). No network, no keys."""
import json
import sys
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from benchmark.litellm_smoke import SmokeError, SmokeService

OPEN, LIMITED = "open-key-for-test-1234", "limited-key-for-test-5678"


def make_server(kind, log, limited_allows_other=False):
    """kind: 'A' | 'B' | 'GW'. Machine A is slow, B is a little faster, the gateway group answers fastest (two machines share the load)."""
    delays = {"A": 0.15, "B": 0.10}

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def reply(self, code, obj=None):
            raw = json.dumps(obj if obj is not None else {}).encode()
            self.send_response(code); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(raw))); self.end_headers(); self.wfile.write(raw)

        def do_GET(self):
            if self.path == "/health/liveliness":
                return self.reply(200, "I'm alive!")
            if self.path == "/v1/models":
                if kind == "GW" and self.headers.get("Authorization") != "Bearer " + OPEN:
                    return self.reply(401)
                ids = ["gemma26-q4", "gemma26-multi", "gemma-26b", "qwen36-35b"] if kind == "GW" else ["m"]
                return self.reply(200, {"data": [{"id": i} for i in ids]})
            self.reply(404)

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))) or b"{}")
            model, auth = body.get("model"), self.headers.get("Authorization", "")
            log.append((kind, model))
            if kind == "GW":
                if auth == "Bearer " + LIMITED and model != "gemma-26b" and not limited_allows_other:
                    return self.reply(403, {"error": "not allowed"})
                time.sleep(0.06 if model == "gemma26-multi" else 0.16)
            else:
                time.sleep(delays[kind])
            self.reply(200, {"usage": {"completion_tokens": 10}})

    srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, "http://127.0.0.1:%d" % srv.server_address[1]


class SmokeTests(unittest.TestCase):
    def setUp(self):
        self.log = []
        self.servers = []

    def tearDown(self):
        for s in self.servers:
            s.shutdown(); s.server_close()

    def service(self, busy=None, limited_allows_other=False, gateway_up=True, **kw):
        a, ua = make_server("A", self.log); b, ub = make_server("B", self.log); g, ug = make_server("GW", self.log, limited_allows_other)
        self.servers += [a, b, g]
        if not gateway_up:
            ug = "http://127.0.0.1:9"
        cfg = {"gateway": ug, "machine_a": {"name": "AISO1", "url": ua, "model": "m"}, "machine_b": {"name": "PRO6000", "url": ub, "model": "m"},
               "group_alias": "gemma26-multi", "single_alias": "gemma26-q4", "limited_alias": "gemma-26b", "other_model": "qwen36-35b"}
        return SmokeService("/nonexistent", busy_check=busy, config=cfg, keys=(OPEN, LIMITED), load={"requests": 8, "concurrency": 4, "repeats": 2, "cost_pairs": 3, **kw})

    def finish(self, svc, include_b, timeout=30):
        jid = svc.start(include_b)["job_id"]
        end = time.time() + timeout
        while time.time() < end:
            j = svc.get(jid)
            if j["state"] != "running":
                return j
            time.sleep(0.05)
        self.fail("smoke test did not finish")

    def test_all_pass_with_both_machines(self):
        j = self.finish(self.service(), True)
        self.assertEqual(j["state"], "done", j)
        r = j["result"]
        self.assertTrue(r["all_pass"], r)
        self.assertGreaterEqual(r["speed"]["speedup_vs_a"], 1.3)
        self.assertIn("hand", r["speed"]["median_s"])           # the fair baseline: the app splits between both machines itself
        self.assertGreater(r["speed"]["vs_hand"], 0)
        self.assertEqual(r["control"], {"own": 200, "other": 403, "open": 200, "direct_other": 200, "pass": True})
        self.assertEqual([s["state"] for s in j["steps"]], ["ok"] * 4)
        self.assertLess(r["cost"]["added_s"], 0.10)

    def test_log_lines_stream_with_since_and_contain_no_secrets(self):
        svc = self.service()
        j = self.finish(svc, True)
        jid = j["job_id"]
        full = svc.get(jid)
        self.assertGreater(len(full["log"]), 10)
        self.assertTrue(any("RESULT: ALL PASS" in x for x in full["log"]))
        later = svc.get(jid, since=len(full["log"]) - 2)
        self.assertEqual(len(later["log"]), 2)
        self.assertEqual(later["log_next"], full["log_next"])
        blob = "\n".join(full["log"])
        for bad in (OPEN, LIMITED, "127.0.0.1", "http"):
            self.assertNotIn(bad, blob)

    def test_without_machine_b_speed_is_skipped_and_never_confirmed(self):
        j = self.finish(self.service(), False)
        self.assertEqual(j["state"], "done")
        self.assertEqual(j["steps"][1]["state"], "skip")
        self.assertIsNone(j["result"]["speed"])
        self.assertFalse(j["result"]["all_pass"])
        self.assertNotIn(("B", "m"), self.log)        # machine B was not touched
        self.assertNotIn(("GW", "gemma26-multi"), self.log)

    def test_busy_platform_sends_no_model_request(self):
        j = self.finish(self.service(busy=lambda: "A benchmark job is running"), True)
        self.assertEqual(j["state"], "failed")
        self.assertEqual(j["steps"][0]["state"], "fail")
        self.assertFalse([x for x in self.log if x[1] in ("m", "gemma26-multi", "gemma26-q4", "gemma-26b", "qwen36-35b")])

    def test_gateway_down_refuses_to_start(self):
        with self.assertRaises(SmokeError) as cm:
            self.service(gateway_up=False).start(True)
        self.assertEqual(cm.exception.status, 503)

    def test_not_configured(self):
        svc = SmokeService("/nonexistent", keys=(OPEN, LIMITED))
        self.assertFalse(svc.status()["ok"])
        with self.assertRaises(SmokeError):
            svc.start(True)

    def test_missing_keys(self):
        svc = self.service()
        svc._keys = ("", "")
        self.assertFalse(svc.status()["ok"])

    def test_only_one_run_at_a_time(self):
        svc = self.service()
        first = svc.start(True)["job_id"]
        with self.assertRaises(SmokeError) as cm:
            svc.start(True)
        self.assertEqual(cm.exception.status, 409)
        svc.cancel(first)
        end = time.time() + 30
        while svc.get(first)["state"] == "running" and time.time() < end:
            time.sleep(0.05)
        self.assertIn(svc.get(first)["state"], ("cancelled", "done"))

    def test_limited_key_not_refused_means_control_fails(self):
        j = self.finish(self.service(limited_allows_other=True), True)
        self.assertFalse(j["result"]["control"]["pass"])
        self.assertFalse(j["result"]["all_pass"])
        self.assertEqual(j["steps"][3]["state"], "fail")

    def test_job_timeout_stops_the_run(self):
        j = self.finish(self.service(job_timeout_s=0), True)
        self.assertEqual(j["state"], "failed")
        self.assertIn("longer than", j["error"])

    def test_no_key_in_results_or_status(self):
        svc = self.service()
        j = self.finish(svc, True)
        blob = json.dumps([j, svc.status()])
        self.assertNotIn(OPEN, blob)
        self.assertNotIn(LIMITED, blob)
        self.assertNotIn("127.0.0.1", blob)            # no addresses either

    def test_unknown_job(self):
        with self.assertRaises(SmokeError) as cm:
            self.service().get("nope")
        self.assertEqual(cm.exception.status, 404)


if __name__ == "__main__":
    unittest.main()
