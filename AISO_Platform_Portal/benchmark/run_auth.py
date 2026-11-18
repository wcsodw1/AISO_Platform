"""Test-password gate for every request that STARTS a benchmark run.

Policy (David, 2026-11-11): each time someone presses Run, the UI first asks for the test password. Nothing is remembered:
- POST /api/run-auth {password} -> one-time ticket (valid RUN_TICKET_TTL seconds, consumed by the very next start request).
- The start request must carry it as header X-Run-Ticket; without a valid ticket the launcher answers 401.
Exception (David, 2026-11-18): the KV cache test is a sequence of steps (preflight, smoke, run ...). POST /api/run-auth {password, scope:"kvcache"} returns a REUSABLE session token
valid RUN_SESSION_TTL seconds that is accepted ONLY by the /api/benchmark/kvcache/* requests (never by any other run request). It lives in memory only, never on disk.
The password is the same AISO_TERMINAL_PASSWORD used by the Terminal (never stored in git, never passed to child processes).
Wrong passwords are rate limited exactly like the Terminal login. Disabled (everything refused) when the variable is not set.
"""
from __future__ import annotations

import hmac
import os
import secrets
import threading
import time

PASSWORD_ENV = "AISO_TERMINAL_PASSWORD"
RUN_TICKET_TTL = 60
RUN_SESSION_TTL = 7200
SESSION_SCOPES = ("kvcache",)
LOCK_AFTER_FAILS = 5
LOCK_SECONDS = 60


class RunAuthError(Exception):
    def __init__(self, message, status=401):
        super().__init__(message)
        self.status = status


class RunAuth:
    def __init__(self, clock=time.time):
        self._clock = clock
        self._tickets = {}
        self._sessions = {}
        self._fails, self._locked_until = 0, 0.0
        self._lock = threading.Lock()

    @staticmethod
    def enabled():
        return bool(os.environ.get(PASSWORD_ENV, "").strip())

    def issue(self, password, scope=None):
        if not self.enabled():
            raise RunAuthError(f"Running benchmarks is disabled: set {PASSWORD_ENV} before starting the launcher.", 503)
        with self._lock:
            now = self._clock()
            if now < self._locked_until:
                raise RunAuthError(f"Too many attempts. Try again in {int(self._locked_until - now) + 1}s.", 429)
            if not hmac.compare_digest(str(password or "").encode(), os.environ[PASSWORD_ENV].encode()):
                self._fails += 1
                if self._fails >= LOCK_AFTER_FAILS:
                    self._fails, self._locked_until = 0, now + LOCK_SECONDS
                raise RunAuthError("Wrong password.", 401)
            self._fails = 0
            for t in [t for t, e in self._tickets.items() if e < now]:
                self._tickets.pop(t, None)
            if scope is not None:
                if scope not in SESSION_SCOPES:
                    raise RunAuthError("Unknown scope.", 400)
                for t in [t for t, (e, _) in self._sessions.items() if e < now]:
                    self._sessions.pop(t, None)
                token = secrets.token_urlsafe(24)
                self._sessions[token] = (now + RUN_SESSION_TTL, scope)
                return {"ticket": token, "expires_in": RUN_SESSION_TTL, "reusable": True, "scope": scope}
            ticket = secrets.token_urlsafe(24)
            self._tickets[ticket] = now + RUN_TICKET_TTL
            return {"ticket": ticket, "expires_in": RUN_TICKET_TTL}

    def consume(self, ticket, scope=None):
        """True exactly once for a valid, unexpired one-time ticket. A session token (see issue) is accepted - and not used up - only when `scope` names its scope."""
        if not self.enabled() or not ticket:
            return False
        with self._lock:
            sess = self._sessions.get(str(ticket))
            if sess is not None:
                return scope is not None and sess[1] == scope and sess[0] >= self._clock()      # never accepted for a request outside its scope; the one-time tickets below are untouched
            exp = self._tickets.pop(str(ticket), None)
            return exp is not None and exp >= self._clock()


def is_run_request(method, path, prefix="/api/v1/benchmark"):
    """Requests that start (or restart) a run on a machine."""
    if method != "POST":
        return False
    p = path.split("?", 1)[0].rstrip("/")
    if p in ("/api/benchmark/start", "/api/benchmark/executor/smoke", "/api/benchmark/executor/stop", "/api/benchmark/kvcache/start", "/api/benchmark/kvcache/stop", "/api/benchmark/gb10matrix/start", "/api/benchmark/gb10matrix/stop"):
        return True
    if p.startswith(prefix + "/"):
        rest = p[len(prefix):]
        return rest in ("/jobs", "/live/start") or (rest.startswith("/jobs/") and rest.endswith("/retry-failed"))
    return False
