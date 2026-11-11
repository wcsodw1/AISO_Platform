import http.client
import json
import os
import secrets
import sys
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from benchmark.run_auth import LOCK_AFTER_FAILS, PASSWORD_ENV, RUN_TICKET_TTL, RunAuth, RunAuthError, is_run_request  # noqa: E402

PW = secrets.token_urlsafe(12)       # generated per run: no password literal in the repository
BAD = secrets.token_urlsafe(12)      # a different random value for the "wrong password" cases (also no literal)


class Clock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


class RunAuthUnitTest(unittest.TestCase):
    def setUp(self):
        self._saved = os.environ.get(PASSWORD_ENV)
        os.environ[PASSWORD_ENV] = PW
        self.clock = Clock()
        self.auth = RunAuth(clock=self.clock)

    def tearDown(self):
        if self._saved is None:
            os.environ.pop(PASSWORD_ENV, None)
        else:
            os.environ[PASSWORD_ENV] = self._saved

    def test_ticket_is_single_use(self):
        t = self.auth.issue(PW)["ticket"]
        self.assertTrue(self.auth.consume(t))
        self.assertFalse(self.auth.consume(t))

    def test_ticket_expires(self):
        t = self.auth.issue(PW)["ticket"]
        self.clock.t += RUN_TICKET_TTL + 1
        self.assertFalse(self.auth.consume(t))

    def test_each_run_needs_its_own_password_entry(self):
        first = self.auth.issue(PW)["ticket"]
        self.assertTrue(self.auth.consume(first))
        self.assertFalse(self.auth.consume(first))            # a second Run cannot reuse the first ticket
        self.assertTrue(self.auth.consume(self.auth.issue(PW)["ticket"]))

    def test_wrong_password_and_lockout(self):
        for _ in range(LOCK_AFTER_FAILS):
            with self.assertRaises(RunAuthError) as c:
                self.auth.issue(BAD)
            self.assertEqual(c.exception.status, 401)
        with self.assertRaises(RunAuthError) as c:
            self.auth.issue(PW)                                # even the right one is refused while locked
        self.assertEqual(c.exception.status, 429)
        self.clock.t += 61
        self.assertTrue(self.auth.issue(PW)["ticket"])

    def test_disabled_without_password(self):
        os.environ.pop(PASSWORD_ENV)
        with self.assertRaises(RunAuthError) as c:
            self.auth.issue(BAD)
        self.assertEqual(c.exception.status, 503)
        self.assertFalse(self.auth.consume("whatever"))

    def test_garbage_tickets_rejected(self):
        for t in ("", None, "x" * 5, "../etc"):
            self.assertFalse(self.auth.consume(t))

    def test_which_requests_are_gated(self):
        p = "/api/v1/benchmark"
        gated = [("POST", "/api/benchmark/start"), ("POST", p + "/jobs"), ("POST", p + "/live/start"), ("POST", p + "/jobs/abc/retry-failed")]
        free = [("GET", "/api/benchmark/start"), ("POST", "/api/benchmark/preflight"), ("POST", "/api/benchmark/cancel"), ("POST", p + "/live/stop"),
                ("POST", p + "/live/discover"), ("POST", p + "/jobs/abc/stop"), ("GET", p + "/jobs"), ("POST", "/api/terminal/login")]
        for m, path in gated:
            self.assertTrue(is_run_request(m, path), path)
        for m, path in free:
            self.assertFalse(is_run_request(m, path), path)


class RunAuthHttpTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._saved = os.environ.get(PASSWORD_ENV)
        os.environ[PASSWORD_ENV] = PW
        import launcher
        cls.launcher = launcher
        launcher.RUN_AUTH = RunAuth()
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), launcher.Handler)
        cls.port = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        if cls._saved is None:
            os.environ.pop(PASSWORD_ENV, None)
        else:
            os.environ[PASSWORD_ENV] = cls._saved

    def call(self, path, body, headers=None, host=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        h = {"Host": host or f"127.0.0.1:{self.port}", "Content-Type": "application/json", "Authorization": "Bearer " + self.launcher.BENCHMARK_BEARER_TOKEN}   # the Benchmark bearer layer is separate from the run-password layer
        h.update(headers or {})
        c.request("POST", path, json.dumps(body), h)
        r = c.getresponse()
        data = r.read().decode()
        c.close()
        try:
            return r.status, json.loads(data)
        except ValueError:
            return r.status, data

    def test_start_without_ticket_is_refused(self):
        for path in ("/api/benchmark/start", "/api/v1/benchmark/jobs", "/api/v1/benchmark/live/start"):
            st, body = self.call(path, {})
            self.assertEqual(st, 401, path)
            self.assertEqual(body.get("code"), "run-password-required")

    def test_wrong_password_gives_no_ticket(self):
        st, body = self.call("/api/run-auth", {"password": BAD})
        self.assertEqual(st, 401)
        self.assertNotIn("ticket", body)

    def test_ticket_passes_the_gate_exactly_once(self):
        st, body = self.call("/api/run-auth", {"password": PW})
        self.assertEqual(st, 200)
        t = body["ticket"]
        st, body = self.call("/api/benchmark/start", {}, {"X-Run-Ticket": t})
        self.assertNotEqual((st, body.get("code") if isinstance(body, dict) else None), (401, "run-password-required"))   # got past the gate (later layers may still refuse the body)
        st, body = self.call("/api/benchmark/start", {}, {"X-Run-Ticket": t})
        self.assertEqual((st, body.get("code")), (401, "run-password-required"))                                           # the same ticket cannot start a second run

    def test_non_loopback_host_cannot_request_a_ticket(self):
        st, _ = self.call("/api/run-auth", {"password": PW}, host="evil.example.com")
        self.assertIn(st, (400, 403))


if __name__ == "__main__":
    unittest.main()
