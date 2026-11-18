import secrets
import sys
from pathlib import Path as _P

sys.path.insert(0, str(_P(__file__).resolve().parent.parent))
import tempfile
import unittest
from pathlib import Path

from benchmark.applog import AppLog, should_log

SECRET = secrets.token_urlsafe(9)      # generated per run: no password-looking literal in the repository


class AppLogTest(unittest.TestCase):
    def test_noise_is_dropped_errors_are_kept(self):
        self.assertFalse(should_log('127.0.0.1 - - [11/Nov/2026 20:53:56] "GET /api/v1/benchmark/live/jobs HTTP/1.1" 200 -'))
        self.assertFalse(should_log('127.0.0.1 - - [x] "GET /run-wizard.js?v=7 HTTP/1.1" 304 -'))
        self.assertFalse(should_log('127.0.0.1 - - [x] "GET /api/terminal/status HTTP/1.1" 200 -'))
        self.assertTrue(should_log('127.0.0.1 - - [x] "GET /api/benchmark/executor/models?machine=aiso1 HTTP/1.1" 404 -'))
        self.assertTrue(should_log('127.0.0.1 - - [x] "POST /api/v1/benchmark/live/discover HTTP/1.1" 400 -'))
        self.assertTrue(should_log('127.0.0.1 - - [x] "POST /api/benchmark/executor/smoke HTTP/1.1" 202 -'))

    def test_secrets_are_masked_and_file_written(self):
        with tempfile.TemporaryDirectory() as d:
            log = AppLog(Path(d) / "logs" / "x.log")
            line = log.event("run_auth.denied", password=SECRET, reason="bad", X_Run_Ticket="t")
            self.assertNotIn(SECRET, line)
            self.assertIn("password=***", line)
            self.assertIn("reason=bad", (Path(d) / "logs" / "x.log").read_text())

    def test_rotation(self):
        with tempfile.TemporaryDirectory() as d:
            log = AppLog(Path(d) / "x.log", max_bytes=100)
            for _ in range(10):
                log.write("x" * 50)
            self.assertTrue((Path(d) / "x.log.1").exists())


if __name__ == "__main__":
    unittest.main()
