"""HTTP surface for Benchmark by Machine: /api/v1/benchmark/*.

Pure routing logic so it can be tested without a server. The launcher enforces loopback access;
`authorized` additionally enforces the optional Bearer token (AISO_BENCHMARK_TOKEN).
"""
from __future__ import annotations

import hmac
import os
from urllib.parse import parse_qs, urlparse

from . import reports, live
from .frameworks import ADAPTER_CLASSES, FRAMEWORK_STATUS, PARAMS, TEST_MODES
from .jobs import JobError, JobService
from .machines import VENDORS, load_machines, mock_preflight, public_profile

PREFIX = "/api/v1/benchmark"
SERVICE = JobService()


def authorized(authorization_header):
    token = os.environ.get("AISO_BENCHMARK_TOKEN", "")
    if not token:
        return True
    supplied = (authorization_header or "")[7:] if (authorization_header or "").startswith("Bearer ") else ""
    return hmac.compare_digest(supplied.encode(), token.encode())


def auth_mode():
    return "loopback + bearer token" if os.environ.get("AISO_BENCHMARK_TOKEN") else "loopback only (no token configured)"


class Result:
    def __init__(self, body, status=200, content_type="application/json", filename=None):
        self.body, self.status, self.content_type, self.filename = body, status, content_type, filename


def _machine(machines, machine_id):
    if machine_id not in machines:
        raise JobError("Machine not found.", 404)
    return machines[machine_id]


def _rows(machine, framework, source):
    if framework not in machine["frameworks"]:
        raise JobError("Framework not defined for this machine.", 404)
    if source == "mock":
        return SERVICE.rows(machine["machine_id"], framework)
    if source in ("recorded", None, ""):
        return reports.recorded_rows(machine, framework)
    raise JobError("source must be recorded or mock.")


def handle(method, raw_path, body=None, authorization=None, machines=None, service=None):
    service = service or SERVICE
    machines = machines or load_machines()
    url = urlparse(raw_path)
    query = {k: v[0] for k, v in parse_qs(url.query).items()}
    parts = [p for p in url.path[len(PREFIX):].split("/") if p]
    body = {} if body is None else body
    try:
        if not isinstance(body, dict):
            raise JobError("JSON body must be an object.")
        if not authorized(authorization):
            return Result({"error": "Bearer token required."}, 401)
        if parts[:1] == ["live"]:
            try:
                if method == "GET" and parts == ["live", "jobs"]:
                    return Result(live.SERVICE.snapshot())
                if method == "POST" and parts == ["live", "stop"]:
                    return Result(live.SERVICE.cancel())
                if method == "POST" and parts in (["live", "discover"], ["live", "start"]):
                    machine = _machine(machines, body.get("machine_id"))
                    framework = body.get("framework")
                    if parts[-1] == "discover":
                        return Result({"models": live.discover(machine, framework, body.get("service"))})
                    if not isinstance(body.get("config"), dict):
                        raise ValueError("config must be an object.")
                    return Result(live.SERVICE.start(machine, framework, body["config"]), 202)
            except ValueError as error:
                return Result({"error": str(error)}, 400)
        if method == "GET" and parts == ["status"]:
            active = service.active()
            return Result({"api_version": 1, "executor": "mock", "auth": auth_mode(), "ssh_executor": "not implemented (P1)",
                           "active_job": active["job_id"] if active else None})
        if method == "GET" and parts == ["frameworks"]:
            return Result({"vendors": [{"id": v, "label": l} for v, l in VENDORS], "statuses": FRAMEWORK_STATUS, "test_modes": TEST_MODES,
                           "frameworks": [c.describe() for c in ADAPTER_CLASSES.values()], "params": PARAMS})
        if method == "GET" and parts == ["machines"]:
            return Result({"machines": [public_profile(m) for m in machines.values()]})
        if parts[:1] == ["machines"] and len(parts) >= 2:
            machine = _machine(machines, parts[1])
            if method == "GET" and len(parts) == 2:
                return Result(public_profile(machine))
            if method == "POST" and parts[2:] == ["preflight"]:
                framework = body.get("framework")
                if framework not in machine["frameworks"]:
                    raise JobError("Framework not defined for this machine.")
                return Result(mock_preflight(machine, framework))
        if method == "GET" and parts == ["jobs"]:
            return Result({"jobs": service.list()})
        if method == "POST" and parts == ["jobs"]:
            machine = _machine(machines, body.get("machine_id"))
            if not isinstance(body.get("config", {}), dict):
                raise JobError("config must be an object.")
            return Result(service.start(machine, body.get("framework"), body.get("config", {})), 202)
        if parts[:1] == ["jobs"] and len(parts) >= 2:
            job_id = parts[1]
            if method == "GET" and len(parts) == 2:
                job = service.get(job_id)
                return Result(service.summary(job) | {"rows": job["rows"]})
            if method == "GET" and parts[2:] == ["log"]:
                try:
                    start = max(0, int(query.get("from", 0)))
                except ValueError:
                    raise JobError("from must be an integer.")
                return Result(service.log_since(job_id, start))
            if method == "POST" and parts[2:] == ["stop"]:
                return Result(service.stop(job_id))
            if method == "POST" and parts[2:] == ["retry-failed"]:
                return Result(service.retry_failed(job_id, _machine(machines, service.get(job_id)["machine_id"])), 202)
        if method == "GET" and parts[:1] == ["reports"] and len(parts) == 2:
            machine = _machine(machines, query.get("machine"))
            framework, source = query.get("framework"), query.get("source", "recorded")
            rows = _rows(machine, framework, source)
            models = reports.models_for(machine["machine_id"], framework) if source != "mock" else [
                m for m in reports.models_for(machine["machine_id"], framework) if any(r["model"] == m["id"] for r in rows)]
            if parts[1] == "overview":
                return Result(reports.overview(rows, models, {"format": query.get("format")}) | {"source": source, "machine_id": machine["machine_id"], "framework": framework})
            if parts[1] == "model":
                model = next((m for m in models if m["id"] == query.get("model")), None)
                if not model:
                    raise JobError("Model not found for this source.", 404)
                return Result(reports.model_report(rows, model, machine, framework) | {"source": source})
        if method == "GET" and parts[:1] == ["exports"] and len(parts) == 2:
            if parts[1] == "logs":
                return Result(service.logs_zip(query.get("job_id", "")), content_type="application/zip", filename=f"{query.get('job_id', 'job')}-logs.zip")
            machine = _machine(machines, query.get("machine"))
            rows = _rows(machine, query.get("framework"), query.get("source", "recorded"))
            if query.get("model"):
                rows = [r for r in rows if r["model"] == query["model"]]
            if parts[1] == "csv":
                return Result(reports.to_csv(rows).encode(), content_type="text/csv; charset=utf-8", filename="benchmark-results.csv")
            if parts[1] == "json":
                return Result(reports.to_json(rows, machine, query.get("framework")).encode(), content_type="application/json", filename="benchmark-results.json")
        return Result({"error": "Not found."}, 404)
    except JobError as error:
        return Result({"error": str(error)}, error.status)
