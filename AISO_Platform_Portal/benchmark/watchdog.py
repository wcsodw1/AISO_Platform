"""Liveness watchdog for long benchmark rounds (Step 2b: Full benchmark).

Polls the machine every `poll_s` (60 s). A round (one model x NP x input x repeat) that runs longer than `round_limit_s` (30 min = 30 polls) raises a
notification with the evidence and three choices: continue / skip to the next NP / skip to the next model. Nothing is ever killed automatically:
legitimate rounds can be very slow (AISO1 NP4: TTFT 2600-3200 s), so a silent log alone is not a failure.
Verdicts: running (process alive and log or GPU active) | quiet (alive, no log growth, GPU busy) | stalled (alive, no log, GPU idle) | dead (process gone).
"""
from __future__ import annotations

CHOICES = ("continue", "skip_np", "skip_model")


def verdict(alive, log_age_s, gpu_busy, poll_s=60):
    if not alive:
        return "dead"
    if log_age_s is not None and log_age_s <= 2 * poll_s:
        return "running"
    if gpu_busy:
        return "quiet"
    return "stalled"


class Watchdog:
    def __init__(self, round_limit_s=1800, poll_s=60, history=30):
        self.round_limit_s, self.poll_s, self.history_n = round_limit_s, poll_s, history
        self.round_key = None
        self.round_start = None
        self.next_notice = None
        self.history = []
        self.pending = None
        self.actions = []

    def start_round(self, now, key):
        self.round_key, self.round_start, self.next_notice = key, now, now + self.round_limit_s
        self.history, self.pending = [], None

    def poll(self, now, alive, log_age_s=None, gpu_busy=None):
        """One 60-second poll. Returns a notice dict when the user has to decide, else None."""
        if self.round_key is None:
            return None
        v = verdict(alive, log_age_s, gpu_busy, self.poll_s)
        self.history = (self.history + [v])[-self.history_n:]
        elapsed = now - self.round_start
        if self.pending:
            return None                                              # already waiting for the user's answer
        trigger = v == "dead" or (v == "stalled" and len(self.history) >= self.history_n and all(x == "stalled" for x in self.history)) or now >= self.next_notice
        if not trigger:
            return None
        self.pending = {"kind": "dead" if v == "dead" else ("stalled" if v == "stalled" else "long_round"), "round": self.round_key, "verdict": v,
                        "elapsed_s": int(elapsed), "recent_verdicts": list(self.history), "options": list(CHOICES) if v != "dead" else ["skip_np", "skip_model", "continue"],
                        "message": {"running": "This round is still running (log is active).", "quiet": "No log output, but the GPU is busy: the round looks slow, not stuck.",
                                    "stalled": "The process is alive but the log and the GPU have been idle for 30 minutes: it may be hung.",
                                    "dead": "The benchmark process is gone: the round did not finish."}[v]}
        return self.pending

    def answer(self, choice, now):
        """Record the user's decision. 'continue' keeps the round and asks again after another limit; the skips tell the runner what to do next."""
        if choice not in CHOICES:
            raise ValueError("choice must be one of " + ", ".join(CHOICES))
        if not self.pending:
            raise ValueError("nothing to decide")
        if choice == "continue":
            self.next_notice = now + self.round_limit_s
            self.history = []
        else:
            self.actions.append({"action": choice, "round": self.round_key})
        self.pending = None
        return {"action": choice, "round": self.round_key}
