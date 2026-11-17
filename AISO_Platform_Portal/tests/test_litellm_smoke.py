"""LiteLLM smoke test (one benchmark: TTFT, TPOT, TPS with and without LiteLLM): runs the real module against small fake HTTP servers
(gateway, machine A, machine B) that stream like llama.cpp does. No network, no real key."""
import json
import sys
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from benchmark import litellm_smoke as m
from benchmark.litellm_smoke import SmokeError, SmokeService

KEY = "test-key-for-unit-tests-1234"


def make_server(kind, log, slots, delay=0.12):
    """kind: 'A' | 'B' | 'GW'. `slots` = requests served at once; the rest wait, like a llama.cpp server with few slots."""
    sem = threading.Semaphore(slots)

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
                if kind == "GW" and self.headers.get("Authorization") != "Bearer " + KEY:
                    return self.reply(401)
                return self.reply(200, {"data": [{"id": i} for i in (["gemma26-multi"] if kind == "GW" else ["m"])]})
            self.reply(404)

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))) or b"{}")
            content = str((body.get("messages") or [{}])[0].get("content", ""))
            log.append((kind, body.get("model"), bool(body.get("stream"))))
            if not body.get("stream"):
                return self.reply(200, {"usage": {"completion_tokens": 1, "prompt_tokens": len(content) // 4 + 1}})
            with sem:
                time.sleep(delay + len(content) / 60000.0)                      # prompt processing grows with the input
                self.send_response(200); self.send_header("Content-Type", "text/event-stream"); self.end_headers()
                for _ in range(6):
                    self.wfile.write(b"data: " + json.dumps({"choices": [{"delta": {"content": "x"}}]}).encode() + b"\n\n"); self.wfile.flush(); time.sleep(0.01)
                self.wfile.write(b"data: [DONE]\n\n")

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

    def service(self, busy=None, gateway_up=True, b_up=True, gw_slots=4, **kw):
        a, ua = make_server("A", self.log, 2); b, ub = make_server("B", self.log, 2); g, ug = make_server("GW", self.log, gw_slots)
        self.servers += [a, b, g]
        if not gateway_up:
            ug = "http://127.0.0.1:9"
        if not b_up:
            ub = "http://127.0.0.1:9"
        cfg = {"gateway": ug, "machine_a": {"name": "AISO1", "url": ua, "model": "m"}, "machine_b": {"name": "PRO6000", "url": ub, "model": "m"}, "group_alias": "gemma26-multi"}
        return SmokeService("/nonexistent", busy_check=busy, config=cfg, keys=KEY, load={"requests": 8, "concurrency": 4, "repeats": 2, **kw})

    def finish(self, svc, timeout=60):
        jid = svc.start()["job_id"]
        end = time.time() + timeout
        while time.time() < end:
            j = svc.get(jid)
            if j["state"] != "running":
                return j
            time.sleep(0.05)
        self.fail("smoke test did not finish")

    def test_benchmark_reports_the_four_metrics_for_three_sizes(self):
        j = self.finish(self.service())
        self.assertEqual(j["state"], "done", j)
        b = j["result"]["bench"]
        self.assertTrue(j["result"]["all_pass"], b)
        self.assertEqual([s["key"] for s in b["sizes"]], ["short", "mid", "long"])
        self.assertLess(b["sizes"][0]["tokens"], b["sizes"][1]["tokens"]); self.assertLess(b["sizes"][1]["tokens"], b["sizes"][2]["tokens"])
        self.assertGreater(b["sizes"][2]["tokens"], 5 * b["sizes"][0]["tokens"])
        for s in b["sizes"]:
            for mode in ("a", "ab"):
                self.assertEqual(set(s[mode]), {"ttft_s", "tpot_ms", "agg_tps", "norm_tps", "ok"})
                self.assertGreater(s[mode]["ttft_s"], 0); self.assertGreater(s[mode]["tpot_ms"], 0)
                self.assertAlmostEqual(s[mode]["agg_tps"] / b["np"], s[mode]["norm_tps"], delta=0.11)      # Normalized = Aggregate / NP
            self.assertLess(s["ab"]["ttft_s"], s["a"]["ttft_s"])       # fewer requests wait in a queue with more capacity
            self.assertGreater(s["gain_agg"], 1.3)
        self.assertEqual([[x["state"] for x in step] for step in j["items"]], [["ok"] * 4, ["ok"] * 4])

    def test_without_extra_capacity_the_gain_is_not_confirmed(self):
        j = self.finish(self.service(gw_slots=2))                          # the gateway adds no capacity
        self.assertEqual(j["state"], "done")
        self.assertFalse(j["result"]["all_pass"])
        self.assertEqual(j["items"][1][3]["state"], "fail")

    def test_busy_platform_sends_no_model_request(self):
        j = self.finish(self.service(busy=lambda: "A benchmark job is running"))
        self.assertEqual(j["state"], "failed")
        self.assertEqual(j["items"][0][2]["state"], "fail")
        self.assertFalse(self.log)

    def test_machine_b_down_stops_before_any_request(self):
        j = self.finish(self.service(b_up=False))
        self.assertEqual(j["state"], "failed")
        self.assertEqual(j["items"][0][1]["state"], "fail")
        self.assertIn("PRO6000", j["error"])
        self.assertFalse(self.log)

    def test_gateway_down_refuses_to_start(self):
        with self.assertRaises(SmokeError) as cm:
            self.service(gateway_up=False).start()
        self.assertEqual(cm.exception.status, 503)

    def test_not_configured_and_missing_key(self):
        svc = SmokeService("/nonexistent", keys=KEY)
        self.assertFalse(svc.status()["ok"])
        with self.assertRaises(SmokeError):
            svc.start()
        nokey = self.service(); nokey._keys = ""
        self.assertFalse(nokey.status()["ok"])

    def test_only_one_run_at_a_time_and_cancel(self):
        svc = self.service()
        first = svc.start()["job_id"]
        with self.assertRaises(SmokeError) as cm:
            svc.start()
        self.assertEqual(cm.exception.status, 409)
        svc.cancel(first)
        end = time.time() + 40
        while svc.get(first)["state"] == "running" and time.time() < end:
            time.sleep(0.05)
        self.assertIn(svc.get(first)["state"], ("cancelled", "done"))

    def test_job_timeout_stops_the_run(self):
        j = self.finish(self.service(job_timeout_s=0))
        self.assertEqual(j["state"], "failed")
        self.assertIn("longer than", j["error"])

    def test_log_lines_stream_with_since_and_contain_no_secrets(self):
        svc = self.service()
        j = self.finish(svc)
        full = svc.get(j["job_id"])
        self.assertTrue(any("TTFT" in x and "TPOT" in x and "TPS" in x for x in full["log"]))
        self.assertTrue(any("RESULT: ALL PASS" in x for x in full["log"]))
        later = svc.get(j["job_id"], since=len(full["log"]) - 2)
        self.assertEqual(len(later["log"]), 2)
        blob = "\n".join(full["log"]) + json.dumps([j, svc.status(), svc.health()])
        for bad in (KEY, "127.0.0.1", "http://"):
            self.assertNotIn(bad, blob)

    def test_plan_and_script(self):
        svc = self.service()
        pl = svc.plan()
        self.assertEqual([x["name"] for x in pl["steps"]], list(m.STEP_NAMES))
        self.assertEqual([len(x["items"]) for x in pl["steps"]], [4, 4])
        self.assertEqual(pl["machines"], ["AISO1", "PRO6000"])
        sc = svc.script()
        self.assertIn("def _execute", sc["text"])
        self.assertNotIn(KEY, sc["text"])

    def test_health_lights_say_what_is_wrong(self):
        h = self.service().health()
        self.assertEqual([c["name"] for c in h["checks"]], ["Gateway", "AISO1", "PRO6000", "Test key", "Platform idle"])
        self.assertTrue(all(c["ok"] for c in h["checks"]), h)
        bad = self.service(busy=lambda: "A benchmark job is running").health()
        self.assertFalse(bad["checks"][4]["ok"]); self.assertIn("benchmark", bad["checks"][4]["detail"])
        down = self.service(gateway_up=False).health()
        self.assertEqual(down["checks"][0]["detail"], "no connection"); self.assertEqual(down["checks"][3]["detail"], "gateway unreachable")
        self.assertTrue(down["checks"][1]["ok"])
        b_down = self.service(b_up=False).health()
        self.assertFalse(b_down["checks"][2]["ok"]); self.assertTrue(b_down["checks"][1]["ok"])

    def test_unknown_job(self):
        with self.assertRaises(SmokeError) as cm:
            self.service().get("nope")
        self.assertEqual(cm.exception.status, 404)


if __name__ == "__main__":
    unittest.main()
