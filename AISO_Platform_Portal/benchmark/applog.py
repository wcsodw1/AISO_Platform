"""Backend log for the local launcher.

- Everything that matters goes to logs/launcher.log (rotated at 2 MB): server start, executor calls, smoke start / refusal, run-password results,
  every 4xx / 5xx answer (with the path) and the HTTP lines that are not routine polling.
- Routine polling (the Run page asks for the job lists every second) and 2xx/3xx static files are NOT written: they buried the useful lines.
- Values of keys that look like secrets (password, token, ticket, authorization) are replaced by ***.
"""
from __future__ import annotations

import re
import threading
from datetime import datetime
from pathlib import Path

NOISE = re.compile(r'"GET /(?:api/v1/benchmark/(?:live/)?jobs|api/terminal/status|data/[^ ]+|[A-Za-z0-9_.\-]+\.(?:js|css|png|svg|webp|jpg|ico|woff2?|json|html)(?:\?[^ ]*)?) HTTP/[\d.]+" [23]\d\d ')
SECRET = re.compile(r"(password|token|ticket|authorization|secret)", re.I)


def should_log(line: str) -> bool:
    """Keep errors and anything that is not routine polling / static traffic."""
    m = re.search(r'" (\d{3}) ', line)
    if m and m.group(1)[0] in "45":
        return True
    return not NOISE.search(line)


def _clean(value) -> str:
    return re.sub(r"\s+", " ", str(value))[:300]


class AppLog:
    def __init__(self, path: Path, max_bytes: int = 2_000_000):
        self.path, self.max_bytes, self.lock = Path(path), max_bytes, threading.Lock()

    def write(self, text: str) -> None:
        with self.lock:
            try:
                self.path.parent.mkdir(parents=True, exist_ok=True)
                if self.path.exists() and self.path.stat().st_size > self.max_bytes:
                    self.path.replace(self.path.with_suffix(".log.1"))
                with self.path.open("a", encoding="utf-8") as f:
                    f.write(text.rstrip("\n") + "\n")
            except OSError:
                pass

    def event(self, name: str, **kv) -> str:
        parts = [datetime.now().strftime("%Y-%m-%d %H:%M:%S"), name]
        parts += [f"{k}={'***' if SECRET.search(k) else _clean(v)}" for k, v in kv.items()]
        line = " ".join(parts)
        self.write(line)
        return line
