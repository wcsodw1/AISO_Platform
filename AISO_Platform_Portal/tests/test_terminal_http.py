import http.client
import json
import os
import sys
import threading
import time
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ["AISO_TERMINAL_PASSWORD"] = "http-test-pass"
import launcher  # noqa: E402


def call(port, method, path, body=None, headers=None, host=None):
    c = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    h = {"Host": host or f"127.0.0.1:{port}"}
    if body is not None:
        h["Content-Type"] = "application/json"
    h.update(headers or {})
    c.request(method, path, json.dumps(body) if body is not None else None, h)
    r = c.getresponse()
    data = r.read().decode()
    c.close()
    try:
        return r.status, json.loads(data)
    except ValueError:
        return r.status, data


class TerminalHttpTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), launcher.Handler)
        cls.port = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        try:
            launcher.TERMINAL._session and launcher.TERMINAL._session.kill()
        except Exception:
            pass
        cls.server.shutdown()

    def test_status_and_host_guard(self):
        st, body = call(self.port, "GET", "/api/terminal/status")
        self.assertEqual(st, 200)
        self.assertTrue(body["enabled"])
        st, _ = call(self.port, "GET", "/api/terminal/status", host="evil.example.com")      # DNS-rebinding style Host
        self.assertEqual(st, 403)

    def test_login_flow_and_shell(self):
        st, _ = call(self.port, "POST", "/api/terminal/login", {"password": "wrong"})
        self.assertEqual(st, 401)
        st, _ = call(self.port, "POST", "/api/terminal/open", {})
        self.assertEqual(st, 401)                        # no token
        st, body = call(self.port, "POST", "/api/terminal/login", {"password": "http-test-pass"})
        self.assertEqual(st, 200)
        tok = {"X-Terminal-Token": body["token"]}
        st, op = call(self.port, "POST", "/api/terminal/open", {}, tok)
        self.assertEqual(st, 200)
        call(self.port, "POST", "/api/terminal/write", {"sid": op["sid"], "data": "echo HTTP_$((20+22))\n"}, tok)
        out, since, end = "", 0, time.time() + 6
        while time.time() < end and "HTTP_42" not in out:
            st, r = call(self.port, "GET", f"/api/terminal/read?sid={op['sid']}&since={since}", None, tok)
            out, since = out + r["data"], r["next"]
            time.sleep(0.1)
        self.assertIn("HTTP_42", out)
        st, _ = call(self.port, "POST", "/api/terminal/close", {"sid": op["sid"]}, tok)
        self.assertEqual(st, 200)

    def test_cross_origin_blocked(self):
        st, _ = call(self.port, "POST", "/api/terminal/login", {"password": "x"}, {"Origin": "http://evil.example.com"})
        self.assertEqual(st, 403)


if __name__ == "__main__":
    unittest.main()
