import os
import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from benchmark.terminal import LOCK_AFTER_FAILS, PASSWORD_ENV, TerminalError, TerminalService  # noqa: E402


def read_until(svc, token, sid, needle, timeout=6.0):
    out, since, end = "", 0, time.time() + timeout
    while time.time() < end:
        r = svc.read(token, sid, since)
        out, since = out + r["data"], r["next"]
        if needle in out:
            return out
        time.sleep(0.1)
    return out


class TerminalServiceTest(unittest.TestCase):
    def setUp(self):
        self._saved = {k: os.environ.get(k) for k in (PASSWORD_ENV, "AISO_BENCHMARK_TOKEN")}
        os.environ[PASSWORD_ENV] = "s3cret-pass"
        os.environ["AISO_BENCHMARK_TOKEN"] = "bearer-secret"
        self.svc = TerminalService(Path(__file__).resolve().parent)

    def tearDown(self):
        try:
            tok = self.svc.login("s3cret-pass")["token"]
            self.svc.close(tok)
        except TerminalError:
            pass
        for k, v in self._saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def test_disabled_without_password(self):
        os.environ.pop(PASSWORD_ENV)
        self.assertFalse(self.svc.status()["enabled"])
        with self.assertRaises(TerminalError) as c:
            self.svc.login("anything")
        self.assertEqual(c.exception.status, 503)

    def test_wrong_password_and_lockout(self):
        for _ in range(LOCK_AFTER_FAILS):
            with self.assertRaises(TerminalError) as c:
                self.svc.login("nope")
            self.assertEqual(c.exception.status, 401)
        with self.assertRaises(TerminalError) as c:
            self.svc.login("s3cret-pass")        # even the right password is refused while locked
        self.assertEqual(c.exception.status, 429)
        self.svc._locked_until = 0                # unlock for tearDown

    def test_token_required(self):
        for call in (lambda: self.svc.open("bad"), lambda: self.svc.read("bad", "x"), lambda: self.svc.write("bad", "x", "ls")):
            with self.assertRaises(TerminalError) as c:
                call()
            self.assertEqual(c.exception.status, 401)

    def test_shell_roundtrip_and_no_secret_leak(self):
        tok = self.svc.login("s3cret-pass")["token"]
        sid = self.svc.open(tok)["sid"]
        self.svc.write(tok, sid, "echo MARK_$((6*7))\n")
        self.assertIn("MARK_42", read_until(self.svc, tok, sid, "MARK_42"))
        self.svc.write(tok, sid, "echo PW=[$AISO_TERMINAL_PASSWORD] BT=[$AISO_BENCHMARK_TOKEN]\n")
        out = read_until(self.svc, tok, sid, "BT=[")
        self.assertIn("PW=[] BT=[]", out)
        self.assertNotIn("s3cret-pass", out.replace("echo", ""))

    def test_single_session_and_close(self):
        tok = self.svc.login("s3cret-pass")["token"]
        first = self.svc.open(tok)["sid"]
        second = self.svc.open(tok)["sid"]
        self.assertNotEqual(first, second)
        with self.assertRaises(TerminalError) as c:
            self.svc.read(tok, first)
        self.assertEqual(c.exception.status, 404)
        self.svc.close(tok)
        with self.assertRaises(TerminalError):
            self.svc.read(tok, second)

    def test_input_size_limit(self):
        tok = self.svc.login("s3cret-pass")["token"]
        sid = self.svc.open(tok)["sid"]
        with self.assertRaises(TerminalError) as c:
            self.svc.write(tok, sid, "x" * 5000)
        self.assertEqual(c.exception.status, 413)


if __name__ == "__main__":
    unittest.main()
