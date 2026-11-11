"""Interactive local terminal for the Benchmark pages (PTY shell behind a second password).

SECURITY MODEL (read before changing anything)
- This gives a real shell on the machine running the launcher. It exists ONLY behind the loopback boundary:
  the launcher must refuse every non-loopback client and every non-loopback Host header before calling in here.
- It is disabled unless AISO_TERMINAL_PASSWORD is set (a second layer, separate from the site access code and the
  Benchmark bearer token). The password is never passed to the child shell.
- Login is rate limited, tokens are random and short-lived, one shell at a time, idle shells are killed.
- It is never exported to the public static site (docs/ only carries the UI, which stays inert without this backend).
"""
from __future__ import annotations

import fcntl
import hmac
import os
import select
import secrets
import signal
import struct
import subprocess
import re
import socket
import termios
import threading
import time

PASSWORD_ENV = "AISO_TERMINAL_PASSWORD"
MAX_WRITE = 4096
MAX_BUFFER = 1 << 20          # keep the last 1 MiB of output per session
TOKEN_TTL = 30 * 60
LOCK_AFTER_FAILS = 5
LOCK_SECONDS = 60


class TerminalError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


class _Session:
    def __init__(self, proc, fd):
        self.proc, self.fd = proc, fd
        self.buf = bytearray()
        self.base = 0                      # absolute offset of buf[0]
        self.lock = threading.Lock()
        self.last = time.time()
        self.alive = True
        threading.Thread(target=self._pump, daemon=True).start()

    def _pump(self):
        while True:
            try:
                ready, _, _ = select.select([self.fd], [], [], 0.5)
                if ready:
                    chunk = os.read(self.fd, 4096)
                    if not chunk:
                        break
                    with self.lock:
                        self.buf += chunk
                        if len(self.buf) > MAX_BUFFER:
                            cut = len(self.buf) - MAX_BUFFER
                            del self.buf[:cut]
                            self.base += cut
                elif self.proc.poll() is not None:
                    break
            except OSError:
                break
        self.alive = False

    def read(self, since):
        with self.lock:
            start = max(since, self.base)
            data = bytes(self.buf[start - self.base:])
            return data.decode("utf-8", "replace"), self.base + len(self.buf)

    def kill(self):
        self.alive = False
        try:
            os.killpg(self.proc.pid, signal.SIGHUP)
        except (ProcessLookupError, PermissionError):
            pass
        try:
            self.proc.wait(timeout=2)
        except Exception:
            try:
                os.killpg(self.proc.pid, signal.SIGKILL)
            except (ProcessLookupError, PermissionError):
                pass
        try:
            os.close(self.fd)
        except OSError:
            pass


class TerminalService:
    def __init__(self, cwd, idle_seconds=900, shell=None):
        self.cwd, self.idle_seconds = str(cwd), idle_seconds
        self.shell = shell or ("/bin/bash" if os.path.exists("/bin/bash") else "/bin/sh")
        self._tokens = {}                  # token -> expiry
        self._session = None
        self._sid = None
        self._fails, self._locked_until = 0, 0.0
        self._lock = threading.Lock()

    # ---- state -------------------------------------------------------------------------------------------------
    @staticmethod
    def enabled():
        return bool(os.environ.get(PASSWORD_ENV, "").strip())

    def status(self):
        return {"enabled": self.enabled(), "targets": self.ssh_targets(), "message": "" if self.enabled() else f"Terminal disabled: set {PASSWORD_ENV} before starting the launcher."}

    def _reap(self):
        now = time.time()
        for t in [t for t, e in self._tokens.items() if e < now]:
            self._tokens.pop(t, None)
        if self._session and (not self._session.alive and self._session.proc.poll() is not None or now - self._session.last > self.idle_seconds):
            self._session.kill()
            self._session, self._sid = None, None

    # ---- auth --------------------------------------------------------------------------------------------------
    def login(self, password):
        if not self.enabled():
            raise TerminalError("Terminal is disabled on this launcher.", 503)
        with self._lock:
            now = time.time()
            if now < self._locked_until:
                raise TerminalError(f"Too many attempts. Try again in {int(self._locked_until - now) + 1}s.", 429)
            ok = hmac.compare_digest(str(password or "").encode(), os.environ[PASSWORD_ENV].encode())
            if not ok:
                self._fails += 1
                if self._fails >= LOCK_AFTER_FAILS:
                    self._fails, self._locked_until = 0, now + LOCK_SECONDS
                raise TerminalError("Wrong password.", 401)
            self._fails = 0
            token = secrets.token_urlsafe(32)
            self._tokens[token] = now + TOKEN_TTL
            return {"token": token, "expires_in": TOKEN_TTL}

    def _auth(self, token):
        if not self.enabled():
            raise TerminalError("Terminal is disabled on this launcher.", 503)
        with self._lock:
            self._reap()
            exp = self._tokens.get(token or "")
            if not exp or exp < time.time():
                raise TerminalError("Login required.", 401)
            self._tokens[token] = time.time() + TOKEN_TTL

    # ---- session -----------------------------------------------------------------------------------------------
    def _env(self):
        keep = {k: v for k, v in os.environ.items() if k in {"PATH", "HOME", "LANG", "LC_ALL", "USER", "LOGNAME", "SSH_AUTH_SOCK"}}
        keep.update({"TERM": "dumb", "PS1": "\\w $ ", "HISTFILE": "/dev/null", "BASH_SILENCE_DEPRECATION_WARNING": "1"})
        return keep           # AISO_* (password, bearer token) are deliberately not inherited

    # ---- ssh targets (aliases from ~/.ssh/config only; nothing else can be typed into a host field) ---------------------
    @staticmethod
    def ssh_targets(config=None):
        path = config or os.path.expanduser("~/.ssh/config")
        try:
            text = open(path, encoding="utf-8", errors="ignore").read()
        except OSError:
            return []
        out = []
        for m in re.finditer(r"^\s*Host\s+(.+)$", text, re.M | re.I):
            for a in m.group(1).split():
                if re.fullmatch(r"[A-Za-z0-9._-]+", a) and not a.lower().startswith("github") and a not in out:
                    out.append(a)
        return out

    def probe(self, token, config=None):
        """Which configured machines answer on their SSH port right now (TCP connect only, no login)."""
        self._auth(token)
        res = []
        for a in self.ssh_targets(config):
            info = {"name": a, "reachable": False}
            try:
                g = subprocess.run(["ssh", "-G", a], capture_output=True, text=True, timeout=5).stdout
                kv = {l.split(" ", 1)[0]: l.split(" ", 1)[1] for l in g.splitlines() if " " in l}
                host, port, user = kv.get("hostname", ""), int(kv.get("port", "22")), kv.get("user", "")
                info.update(host=host, port=port, user=user)
                with socket.create_connection((host, port), timeout=3):
                    info["reachable"] = True
            except (OSError, ValueError, subprocess.SubprocessError):
                pass
            res.append(info)
        return {"targets": res, "reachable": sum(1 for r in res if r["reachable"]), "total": len(res)}

    def open(self, token, target=None):
        self._auth(token)
        if target and target not in self.ssh_targets():
            raise TerminalError("Unknown SSH target.", 400)
        with self._lock:
            if self._session:
                self._session.kill()
            master, slave = os.openpty()
            fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 32, 120, 0, 0))
            argv = ["ssh", "-tt", "-o", "ConnectTimeout=10", target] if target else [self.shell] + (["--noprofile", "--norc", "-i"] if self.shell.endswith("bash") else ["-i"])
            proc = subprocess.Popen(argv, stdin=slave, stdout=slave, stderr=slave, cwd=self.cwd, env=self._env(),
                                    start_new_session=True, close_fds=True,
                                    preexec_fn=lambda: fcntl.ioctl(0, termios.TIOCSCTTY, 0))
            os.close(slave)
            self._session, self._sid = _Session(proc, master), secrets.token_hex(8)
            return {"sid": self._sid, "cwd": target or self.cwd}

    def _get(self, sid):
        if not self._session or sid != self._sid:
            raise TerminalError("No such terminal session.", 404)
        self._session.last = time.time()
        return self._session

    def read(self, token, sid, since=0):
        self._auth(token)
        data, nxt = self._get(sid).read(max(0, int(since)))
        return {"data": data, "next": nxt, "alive": self._session.alive}

    def write(self, token, sid, data):
        self._auth(token)
        data = str(data)
        if len(data.encode()) > MAX_WRITE:
            raise TerminalError("Input too large.", 413)
        s = self._get(sid)
        if not s.alive:
            raise TerminalError("Terminal has ended.", 410)
        os.write(s.fd, data.encode())
        return {"ok": True}

    def close(self, token, sid=None):
        self._auth(token)
        with self._lock:
            if self._session:
                self._session.kill()
            self._session, self._sid = None, None
        return {"ok": True}
