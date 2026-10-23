"""Job service with a Mock executor. Every row it produces is source=mock and can never be PASS.

The SSH executor (P1) will implement the same start/stop/log/retry surface.
"""
from __future__ import annotations

import io
import threading
import time
import uuid
import zipfile
from datetime import datetime, timezone

from .frameworks import ADAPTER_CLASSES, TEST_MODES, params_for
from .schema import INPUT_TOKENS, NPS, finalize_row, roll_up, validate_row

MOCK_NOTE = "MOCK - simulated numbers, not a measurement."


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class JobError(ValueError):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def normalize_config(machine, framework, raw):
    """Validate user input against the parameter registry; unknown keys are rejected."""
    spec = machine["frameworks"].get(framework)
    if not spec:
        raise JobError("Framework is not defined for this machine.")
    if spec["status"] != "verified":
        raise JobError(f"{ADAPTER_CLASSES[framework].label} is {spec['status'].replace('_', ' ')} on this machine; execution is disabled.", 409)
    allowed = {p["key"]: p for p in params_for(framework)}
    allowed.update({"model": None, "test_mode": None, "mock_fail_cells": None})
    unknown = set(raw) - set(allowed)
    if unknown:
        raise JobError(f"Unknown parameters: {sorted(unknown)}")
    mode = raw.get("test_mode", "full")
    if mode not in TEST_MODES:
        raise JobError("Invalid test_mode.")
    config = {k: TEST_MODES[mode][k] for k in ("np", "input_tokens", "output_tokens", "repeat")}
    config.update({p["key"]: p["default"] for p in params_for(framework) if p["key"] not in config})
    config.update({k: v for k, v in raw.items() if k not in ("model", "test_mode", "mock_fail_cells")})
    for key, param in allowed.items():
        if param is None or key not in config:
            continue
        value = config[key]
        if param["kind"] == "multi":
            if not isinstance(value, list) or not value or not all(isinstance(v, int) and not isinstance(v, bool) and param["min"] <= v <= param["max"] for v in value):
                raise JobError(f"{key} must be a non-empty list of integers in range.")
            config[key] = sorted(set(value))
        elif param["kind"] in ("int", "float"):
            if isinstance(value, bool) or not isinstance(value, (int, float)) or (param["kind"] == "int" and not isinstance(value, int)):
                raise JobError(f"{key} has the wrong type.")
            if not (param["min"] <= value <= param["max"]):
                raise JobError(f"{key} must be between {param['min']} and {param['max']}.")
        elif param["kind"] == "bool" and not isinstance(value, bool):
            raise JobError(f"{key} must be true or false.")
        elif param["kind"] == "choice" and value not in param["choices"]:
            raise JobError(f"{key} has an invalid choice.")
    model = raw.get("model")
    if model not in spec.get("models", []):
        raise JobError("Model is not approved for this machine and framework.")
    tp = config.get("tp")
    if tp and tp > machine["gpu_count"]:
        raise JobError("TP cannot exceed the GPU count.")
    if "max_model_len" in config and max(config["input_tokens"]) + config["output_tokens"] > config["max_model_len"]:
        raise JobError("max_model_len must cover the largest input plus the output.")
    preset = TEST_MODES["full"]
    formal = (mode == "full" and not config.get("prefix_caching", False)
              and all(config[k] == preset[k] for k in ("np", "input_tokens", "output_tokens", "repeat")))
    return model, config, {"test_mode": mode, "profile": "formal" if formal else "non-formal"}


class JobService:
    def __init__(self, delay=0.08):
        self.jobs, self.lock, self.delay = {}, threading.RLock(), delay
        self.events = {}

    def active(self, machine_id=None):
        with self.lock:
            return next((j for j in self.jobs.values() if j["state"] == "running" and (machine_id in (None, j["machine_id"]))), None)

    def start(self, machine, framework, raw, only_cells=None, retry_of=None):
        model, config, meta = normalize_config(machine, framework, raw)
        fail_cells = {tuple(c) for c in raw.get("mock_fail_cells", []) if isinstance(c, (list, tuple)) and len(c) == 2}
        with self.lock:
            busy = self.active(machine["machine_id"])
            if busy:
                raise JobError(f"Job {busy['job_id']} is already running on this machine; it was not interrupted.", 409)
            cases = [(np, t, r) for np in config["np"] for t in config["input_tokens"] for r in range(1, config["repeat"] + 1)]
            if only_cells is not None:
                cases = [c for c in cases if (c[0], c[1]) in only_cells]
            job_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:6]
            job = {"job_id": job_id, "machine_id": machine["machine_id"], "framework": framework, "model": model, "executor": "mock",
                   "mock": True, "state": "running", "result_status": "RUNNING", "pid": None, "exit_code": None, "retry_of": retry_of,
                   "started_at": _now(), "ended_at": None, "progress": {"done": 0, "total": len(cases)}, "config_snapshot": config, **meta,
                   "hardware_snapshot": {"gpu_count": machine["gpu_count"], "vram_gb_each": machine["vram_gb"], "ram_gb": machine["ram_gb"], "os": machine["os"]},
                   "rows": [], "log": []}
            self.jobs[job_id], self.events[job_id] = job, threading.Event()
            self._log(job, f"MOCK job {job_id} started - no remote connection is made and no real benchmark runs.")
        threading.Thread(target=self._run, args=(job, machine, cases, fail_cells), daemon=True).start()
        return self.summary(job)

    def _log(self, job, text):
        job["log"].append({"seq": len(job["log"]), "t": _now(), "text": text})

    def _run(self, job, machine, cases, fail_cells):
        stop, failed = self.events[job["job_id"]], False
        for index, (np, tokens, repeat) in enumerate(cases):
            if stop.is_set():
                for np2, t2, r2 in cases[index:]:
                    job["rows"].append(self._row(job, machine, np2, t2, r2, "NOT_RUN"))
                self._log(job, "Stopped by user; remaining cases marked NOT_RUN.")
                break
            time.sleep(self.delay)
            failing = (np, tokens) in fail_cells
            job["rows"].append(self._row(job, machine, np, tokens, repeat, "FAIL" if failing else "UNVERIFIED"))
            failed = failed or failing
            job["progress"]["done"] = index + 1
            self._log(job, f"NP{np} input={tokens} repeat={repeat}: " + ("simulated FAILURE" if failing else "simulated result recorded (MOCK)"))
        with self.lock:
            statuses = [r["status"] for r in job["rows"]]
            job["state"] = "stopped" if stop.is_set() else ("failed" if failed else "completed")
            job["result_status"] = roll_up(statuses)
            job["exit_code"] = 0 if job["state"] == "completed" else 1
            job["ended_at"] = _now()
            self._log(job, f"MOCK job finished: {job['state']}.")

    def _row(self, job, machine, np, tokens, repeat, status):
        row = {"run_id": f"{job['job_id']}-np{np}-{tokens}-r{repeat}", "machine_id": job["machine_id"], "framework": job["framework"],
               "model": job["model"], "model_repo": None, "quantization": "mock", "model_format": "Safetensors", "source_verified": False,
               "source_compliance": "unknown", "np": np, "tp": job["config_snapshot"].get("tp"), "input_tokens": tokens,
               "output_tokens": job["config_snapshot"]["output_tokens"], "repeat": repeat, "expected_requests": np, "successful_requests": None,
               "ttft_s": None, "tpot_ms": None, "decode_tps": None, "aggregate_tps": None, "e2e_s": None, "source": "mock", "mock": True,
               "log_path": None, "log_verified": False, "output_tokens_verified": False, "reported_status": status, "note": MOCK_NOTE,
               "start_time": _now(), "end_time": _now(), "hardware_snapshot": job["hardware_snapshot"], "config_snapshot": job["config_snapshot"],
               "error_type": None, "error_message": None}
        if status == "UNVERIFIED":
            ttft = round(tokens / 1000 * (0.8 + 0.1 * np), 3)
            tpot = round(25 + 12 * np + tokens / 2000, 3)
            row.update(ttft_s=ttft, tpot_ms=tpot, aggregate_tps=round(np * 1000 / tpot * 0.8, 3), e2e_s=round(ttft + job["config_snapshot"]["output_tokens"] * tpot / 1000, 3), successful_requests=np)
        elif status == "FAIL":
            row.update(error_type="simulated_failure", error_message="Simulated failure (mock); not a real error.", successful_requests=0)
        problems = validate_row(row)
        if problems:
            raise AssertionError(problems)
        return finalize_row(row, machine["gpu_count"])

    def summary(self, job):
        return {k: v for k, v in job.items() if k not in ("rows", "log")} | {"rows_count": len(job["rows"]), "log_lines": len(job["log"])}

    def list(self):
        with self.lock:
            return [self.summary(j) for j in sorted(self.jobs.values(), key=lambda j: j["started_at"], reverse=True)]

    def get(self, job_id):
        job = self.jobs.get(job_id)
        if not job:
            raise JobError("Job not found.", 404)
        return job

    def stop(self, job_id):
        job = self.get(job_id)
        if job["state"] != "running":
            raise JobError("Job is not running.", 409)
        self.events[job_id].set()
        return {"ok": True, "message": "Stop requested for this job only."}

    def retry_failed(self, job_id, machine):
        job = self.get(job_id)
        failed = {(r["np"], r["input_tokens"]) for r in job["rows"] if r["status"] == "FAIL"}
        if not failed:
            raise JobError("No failed cases to retry.", 409)
        raw = {"model": job["model"], "test_mode": "custom", **{k: v for k, v in job["config_snapshot"].items()}}
        return self.start(machine, job["framework"], raw, only_cells=failed, retry_of=job_id)

    def log_since(self, job_id, start=0):
        job = self.get(job_id)
        return {"job_id": job_id, "state": job["state"], "lines": job["log"][start:], "next": len(job["log"])}

    def rows(self, machine_id, framework):
        """Latest mock row per (model, np, input, repeat); a retry replaces the earlier failed row."""
        latest = {}
        with self.lock:
            for job in sorted(self.jobs.values(), key=lambda j: j["started_at"]):
                if job["machine_id"] == machine_id and job["framework"] == framework:
                    for row in job["rows"]:
                        if row["status"] != "NOT_RUN":
                            latest[(row["model"], row["np"], row["input_tokens"], row["repeat"])] = row
        return list(latest.values())

    def logs_zip(self, job_id):
        job = self.get(job_id)
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(f"{job_id}.log", "\n".join(f"{l['t']} {l['text']}" for l in job["log"]) + "\n")
            archive.writestr("README.txt", "MOCK job log archive. Contains simulated output only.\n")
        return buffer.getvalue()
