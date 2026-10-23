"""Result schema, status rules and aggregation for Benchmark by Machine.

Rules enforced here (not in the UI):
* PASS is derived from evidence, never accepted from a CSV or an importer.
* Mock data can never be PASS.
* Missing values stay None; nothing is zero-filled or interpolated.
"""
from __future__ import annotations

from statistics import mean

STATUSES = ("RUNNING", "PASS", "FAIL", "PARTIAL", "NOT_RUN", "BLOCKED", "UNVERIFIED")
SOURCES = ("mock", "imported", "measured")
INPUT_TOKENS = (4096, 8192, 16384, 32768, 65536)
NPS = (2, 4)
METRICS = ("ttft_s", "tpot_ms", "decode_tps", "aggregate_tps", "e2e_s")


def derive_status(row):
    """Return (status, reason) from the evidence carried by a result row."""
    reported = row.get("reported_status")
    source = row.get("source")
    if source not in SOURCES:
        return "UNVERIFIED", "Unknown data source."
    if reported in ("RUNNING", "NOT_RUN", "BLOCKED", "FAIL"):
        return reported, row.get("error_message") or "Recorded " + reported
    if reported == "UNVERIFIED":
        return "UNVERIFIED", row.get("note") or "Recorded as unverified."
    if source == "mock":
        return "UNVERIFIED", "Simulated data; not a real measurement."
    expected, ok = row.get("expected_requests"), row.get("successful_requests")
    if isinstance(expected, int) and isinstance(ok, int) and 0 < ok < expected:
        return "PARTIAL", f"{ok}/{expected} requests succeeded."
    if reported == "PASS":
        if not row.get("log_path") or not row.get("log_verified"):
            return "UNVERIFIED", "Recorded as PASS but no verified log is attached."
        if not (isinstance(expected, int) and expected > 0 and ok == expected):
            return "UNVERIFIED", "Request counts do not confirm completion."
        if not row.get("output_tokens_verified"):
            return "UNVERIFIED", "Output token counts were not verified."
        return "PASS", "Complete requests, verified output tokens and log."
    return "UNVERIFIED", "No result evidence."


def normalized(aggregate_tps, np, gpu_count):
    """Per-request and per-GPU normalized TPS; kept as two separate values."""
    if aggregate_tps is None or not np or not gpu_count:
        return None, None
    return aggregate_tps / np, aggregate_tps / gpu_count


def finalize_row(row, gpu_count):
    """Attach derived status and normalized TPS without mutating the input."""
    out = dict(row)
    status, reason = derive_status(row)
    out["status"], out["status_reason"] = status, reason
    out["norm_tps_per_request"], out["norm_tps_per_gpu"] = normalized(row.get("aggregate_tps"), row.get("np"), gpu_count)
    return out


def roll_up(statuses):
    """Combine cell statuses into one label without hiding failures."""
    found = set(statuses)
    if not found:
        return "NOT_RUN"
    if len(found) == 1:
        return next(iter(found))
    if "RUNNING" in found:
        return "RUNNING"
    if found <= {"BLOCKED", "NOT_RUN"}:
        return "BLOCKED"
    if found <= {"UNVERIFIED", "NOT_RUN"}:
        return "UNVERIFIED"
    if found <= {"FAIL", "NOT_RUN"}:
        return "FAIL"
    return "PARTIAL"


def mean_or_none(values):
    present = [v for v in values if isinstance(v, (int, float))]
    return mean(present) if present else None


def validate_row(row):
    """Structural validation used by tests and importers."""
    problems = []
    for key in ("run_id", "machine_id", "framework", "model", "np", "input_tokens", "output_tokens"):
        if row.get(key) in (None, ""):
            problems.append(f"missing {key}")
    if row.get("source") not in SOURCES:
        problems.append("invalid source")
    for key in METRICS:
        value = row.get(key)
        if value is not None and (not isinstance(value, (int, float)) or isinstance(value, bool) or value < 0):
            problems.append(f"invalid {key}")
        if value == 0:
            problems.append(f"{key} is zero; missing values must be null")
    if row.get("reported_status") == "FAIL" and any(row.get(k) is not None for k in METRICS):
        problems.append("FAIL rows must not carry metrics")
    return problems
