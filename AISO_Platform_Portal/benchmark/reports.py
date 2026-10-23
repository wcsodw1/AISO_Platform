"""Report A (overview), Report B (by model), chart series and CSV/JSON exports."""
from __future__ import annotations

import csv
import io
import json

from . import fixtures
from .schema import INPUT_TOKENS, NPS, finalize_row, mean_or_none, roll_up

SERIES_METRICS = [("ttft_s", "TTFT", "s"), ("tpot_ms", "TPOT", "ms/token"), ("aggregate_tps", "Aggregate TPS", "tok/s"),
                  ("norm_tps_per_request", "Normalized TPS per request (Aggregate / NP)", "tok/s"),
                  ("norm_tps_per_gpu", "Normalized TPS per GPU (Aggregate / GPU count)", "tok/s"), ("e2e_s", "E2E latency", "s")]
CSV_FIELDS = ["run_id", "machine_id", "framework", "model", "model_repo", "quantization", "model_format", "source", "source_compliance",
              "np", "tp", "input_tokens", "output_tokens", "repeat", "expected_requests", "successful_requests", "ttft_s", "tpot_ms",
              "decode_tps", "aggregate_tps", "norm_tps_per_request", "norm_tps_per_gpu", "e2e_s", "status", "status_reason",
              "error_type", "error_message", "log_path", "start_time", "end_time"]


def recorded_rows(machine, framework):
    if machine["machine_id"] == fixtures.MACHINE_ID and framework == fixtures.FRAMEWORK:
        return [finalize_row(r, machine["gpu_count"]) for r in fixtures.build_rows(machine)]
    if machine["machine_id"] == fixtures.MACHINE_ID and framework == "sglang":
        return [finalize_row(r, machine["gpu_count"]) for r in fixtures.build_sglang_rows(machine)]
    return []


def models_for(machine_id, framework):
    if machine_id == fixtures.MACHINE_ID and framework == fixtures.FRAMEWORK:
        return fixtures.MODELS
    if machine_id == fixtures.MACHINE_ID and framework == "sglang":
        return fixtures.SGLANG_MODELS
    return []


def _cells(rows):
    """Group rows into (np, input) cells; raw repeats win over a recorded mean."""
    grouped = {}
    for row in rows:
        grouped.setdefault((row["np"], row["input_tokens"]), []).append(row)
    cells = {}
    for key, items in grouped.items():
        raw = [r for r in items if r.get("repeat") is not None]
        agg = [r for r in items if r.get("repeat") is None]
        basis = raw or agg
        status = roll_up([r["status"] for r in basis])
        cell = {"np": key[0], "input_tokens": key[1], "status": status, "reason": basis[0]["status_reason"] if len(basis) == 1 else None,
                "raw": sorted(raw, key=lambda r: r["repeat"]), "repeats_recorded": basis[0].get("repeats_recorded"),
                "error_type": next((r.get("error_type") for r in basis if r.get("error_type")), None),
                "error_message": next((r.get("error_message") for r in basis if r.get("error_message")), None),
                "raw_error_pending": any(r.get("raw_error_pending") for r in basis), "note": next((r.get("note") for r in basis if r.get("note")), None),
                "reported_status": basis[0].get("reported_status")}
        for metric in ("ttft_s", "tpot_ms", "aggregate_tps", "e2e_s", "norm_tps_per_request", "norm_tps_per_gpu"):
            cell[metric] = mean_or_none([r.get(metric) for r in basis if r["status"] != "FAIL"])
        cells[key] = cell
    return cells


def overview(rows, models, filters=None):
    filters = filters or {}
    out, totals = [], {"models": 0, "pass": 0, "fail": 0, "partial": 0, "unverified": 0, "not_run": 0, "blocked": 0, "other": 0, "cells": 0}
    for model in models:
        if filters.get("format") and model["model_format"] != filters["format"]:
            continue
        mrows = [r for r in rows if r["model"] == model["id"]]
        cells = _cells(mrows)
        by_np = {np: roll_up([c["status"] for k, c in cells.items() if k[0] == np]) for np in NPS}
        statuses = [c["status"] for c in cells.values()]
        verified = [k[1] for k, c in cells.items() if c["status"] == "PASS"]
        recorded = [k[1] for k, c in cells.items() if c["reported_status"] == "PASS" or c["status"] == "PASS"]
        counts = {s: statuses.count(s) for s in set(statuses)}
        for status, key in (("PASS", "pass"), ("FAIL", "fail"), ("PARTIAL", "partial"), ("UNVERIFIED", "unverified"), ("NOT_RUN", "not_run"), ("BLOCKED", "blocked")):
            totals[key] += counts.get(status, 0)
        totals["other"] += sum(v for s, v in counts.items() if s not in ("PASS", "FAIL", "PARTIAL", "UNVERIFIED", "NOT_RUN", "BLOCKED"))
        totals["cells"] += len(statuses)
        totals["models"] += 1
        out.append({"model": model["id"], "name": model["name"], "model_format": model["model_format"], "quantization": model["quantization"],
                    "source_compliance": model["source_compliance"], "source_note": model["source_note"], "summary": model["summary"],
                    "np2": by_np[2], "np4": by_np[4], "overall": roll_up(statuses), "counts": counts, "cells": len(statuses),
                    "max_verified_pass_input": max(verified) if verified else None, "max_recorded_ok_input": max(recorded) if recorded else None,
                    "np_compare": [{"input_tokens": t, "np2": cells.get((2, t), {}).get("aggregate_tps"), "np4": cells.get((4, t), {}).get("aggregate_tps")} for t in INPUT_TOKENS]})
    return {"models": out, "totals": totals}


def model_report(rows, model, machine, framework):
    cells = _cells([r for r in rows if r["model"] == model["id"]])
    matrix = [cells.get((np, t)) or {"np": np, "input_tokens": t, "status": "NOT_RUN", "reason": "No record.", "raw": []} for t in INPUT_TOKENS for np in NPS]
    series = []
    for key, label, unit in SERIES_METRICS:
        series.append({"metric": key, "label": label, "unit": unit, "lines": [
            {"np": np, "points": [{"x": t, "y": (cells.get((np, t)) or {}).get(key), "status": (cells.get((np, t)) or {}).get("status", "NOT_RUN")} for t in INPUT_TOKENS]}
            for np in NPS]})
    sample = next((r for r in rows if r["model"] == model["id"]), {})
    return {"model": model, "machine": {k: machine[k] for k in ("machine_id", "display_name", "vendor", "gpu_model", "gpu_count", "vram_gb", "ram_gb", "os", "memory_note")},
            "framework": framework, "framework_spec": {k: v for k, v in machine["frameworks"][framework].items() if k != "models"},
            "config_snapshot": sample.get("config_snapshot"), "hardware_snapshot": sample.get("hardware_snapshot"), "matrix": matrix, "series": series,
            "integrity": fixtures.integrity_report() if (framework == "sglang" and sample.get("source") == "imported") else None,
            "evidence_pending": ((fixtures.SGLANG_EVIDENCE_PENDING if framework == "sglang" else fixtures.EVIDENCE_PENDING) if sample.get("source") == "imported" else []),
            "definitions": {"norm_tps_per_request": "Aggregate TPS / NP", "norm_tps_per_gpu": "Aggregate TPS / GPU count",
                            "aggregate_tps": "Total output tokens of a concurrent batch / batch wall-clock seconds"}}


def to_csv(rows):
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=CSV_FIELDS, extrasaction="ignore", lineterminator="\n")
    writer.writeheader()
    for row in rows:
        writer.writerow({k: ("" if row.get(k) is None else row.get(k)) for k in CSV_FIELDS})
    return buffer.getvalue()


def to_json(rows, machine, framework):
    return json.dumps({"machine": machine["machine_id"], "framework": framework, "rows": rows}, ensure_ascii=False, indent=2)
