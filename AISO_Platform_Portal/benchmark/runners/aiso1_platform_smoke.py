#!/usr/bin/env python3
"""AISO platform smoke runner for AISO1 (llama.cpp, B1024 protocol). Owned by the platform: it is copied to the machine by the executor, verified by sha256 and started there.

One request per model: NP1, Input 4096, Output 1024, 1 repeat (SMOKE_ONLY_NOT_FORMAL). It reuses the machine's own B1024 runner module (same server flags, tokenizer and wave logic)
but writes ONLY into its own folder  ~/aiso1_benchmark/platform_runs/<run_id>/  - never into an existing campaign.

Usage:  aiso1_platform_smoke.py --models gemma26,laguna      (or --models all)      smoke test (default)
        aiso1_platform_smoke.py --mode standard --models gemma26 --inputs 4096,8192,16384 --nps 1,2,4 --repeats 3      standard test: every Input x NP x Repeat, same wave logic, output 1024
Standard progress lines:  STANDARD_PLAN: {...} | llamacpp/<model> NP=<n> input=<i> R=<r> PASS|FAIL agg=<tok/s> ttft_ms=<ms> tpot_ms=<ms> | STANDARD_STATUS: {...}
Progress lines on stdout (the platform reads them):  LOADING: <model> | llamacpp/<model> NP=1 input=4096 R=1 PASS|FAIL agg=<tok/s> | SMOKE_STATUS: {...}
"""
import argparse
import fcntl
import hashlib
import importlib.util
import json
import os
import signal
import sys
import traceback
from datetime import datetime
from pathlib import Path

ALL = ("gemma26", "gemma31", "laguna", "nemotron")
NP, INPUT, OUTPUT, REPEAT, PORT, PER_MODEL_LIMIT_S = 1, 4096, 1024, 1, 18082, 1800
ROOT = Path.home() / "aiso1_benchmark"
CASE_LIMIT_S = 2400          # one wave (all repeats of one Input x NP case run as separate waves)
MAX_CASES = 120
SOURCE = ROOT / "retest_B1024_20261110" / "AISO1_B1024.py"


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def atomic_json(path, value):
    tmp = Path(str(path) + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=1) + "\n")
    os.replace(tmp, path)


def on_alarm(signum, frame):
    raise TimeoutError(f"model smoke exceeded {PER_MODEL_LIMIT_S} s")


def on_term(signum, frame):
    raise SystemExit("stopped from the platform")      # the finally blocks run: the llama-server is closed, the manifest says "stopped"


def ints(text, lo, hi, most=4):
    v = [int(x) for x in str(text).split(",") if x.strip()]
    assert v and len(v) <= most and len(set(v)) == len(v) and all(lo <= x <= hi for x in v), "parameter outside the allowed range"
    return v


def mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def run_standard(runner, plan, dest, manifest, models, inputs, nps, repeats):
    """Every Input x NP x Repeat of each model. A llama-server is started once per (model, NP) because the slots/context depend on NP. Output is 1024 (the machine's own protocol)."""
    total = len(models) * len(nps) * len(inputs) * repeats
    assert total <= MAX_CASES, f"too many cases ({total} > {MAX_CASES})"
    print("STANDARD_PLAN: " + json.dumps({"models": models, "inputs": inputs, "nps": nps, "repeats": repeats, "cases": total}), flush=True)
    manifest["cases"] = []
    summary = {}

    def emit(model, np_, inp, rep, status, agg, ttft_ms, tpot_ms):
        manifest["cases"].append({"model": model, "np": np_, "input": inp, "repeat": rep, "status": status, "aggregate_tps": agg, "ttft_ms": ttft_ms, "tpot_ms": tpot_ms})
        atomic_json(dest / "manifest.json", manifest)
        summary.setdefault(model, {"pass": 0, "fail": 0})["pass" if status == "PASS" else "fail"] += 1
        line = f"llamacpp/{model} NP={np_} input={inp} R={rep} {'PASS' if status == 'PASS' else 'FAIL'}"
        if agg is not None:
            line += f" agg={agg:.2f}"
        if ttft_ms is not None:
            line += f" ttft_ms={ttft_ms:.2f}"
        if tpot_ms is not None:
            line += f" tpot_ms={tpot_ms:.2f}"
        print(line, flush=True)

    for model in models:
        mdir = dest / model
        mdir.mkdir()
        print(f"LOADING: {model}", flush=True)
        for np_ in nps:
            server = None
            try:
                signal.alarm(PER_MODEL_LIMIT_S)
                server = runner.Server(plan, model, np_, mdir / f"server_np{np_}", PORT)
                server.start()
                signal.alarm(0)
            except (TimeoutError, Exception):
                signal.alarm(0)
                (mdir / f"error_np{np_}.log").write_text(traceback.format_exc())
                if server is not None:
                    server.close()
                for inp in inputs:
                    for rep in range(1, repeats + 1):
                        emit(model, np_, inp, rep, "FAIL", None, None, None)
                continue
            try:
                for inp in inputs:
                    ids = server.tokens(inp)
                    for rep in range(1, repeats + 1):
                        status, agg, ttft, tpot = "FAIL", None, None, None
                        signal.alarm(CASE_LIMIT_S)
                        try:
                            reqs, w = runner.b.wave(server, ids, np_, rep, 1800)
                            status, agg = w["status"], w.get("tps_aggregate")
                            good = [r for r in reqs if r.get("status") == "PASS"]
                            ttft = mean([r.get("ttft_s") for r in good])
                            ttft = ttft * 1000 if ttft is not None else None
                            tpot = mean([r.get("tpot_ms") for r in good])
                            runner.b.dump(mdir / f"np{np_}_in{inp}_r{rep}.json", {"scope": "PLATFORM_STANDARD", "model": model, "np": np_, "input_tokens": inp, "output_tokens": OUTPUT,
                                                                                  "repeat": rep, "prompt_sha256": runner.b.hash_obj(ids), "wave": w, "requests": reqs})
                        except TimeoutError:
                            status = "TIMEOUT"
                        except Exception:
                            (mdir / f"error_np{np_}_in{inp}_r{rep}.log").write_text(traceback.format_exc())
                        finally:
                            signal.alarm(0)
                        emit(model, np_, inp, rep, status, agg, ttft, tpot)
            finally:
                server.close()
        manifest["results"][model] = summary.get(model, {"pass": 0, "fail": 0})
    return summary


def main():
    global NP, INPUT, REPEAT
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", default="all")
    ap.add_argument("--np", type=int, default=NP)               # adjustable by the operator inside the limits below (output tokens are fixed to 1024 by the machine's own B1024 protocol)
    ap.add_argument("--input", type=int, default=INPUT)
    ap.add_argument("--repeat", type=int, default=REPEAT)
    ap.add_argument("--mode", choices=("smoke", "standard"), default="smoke")
    ap.add_argument("--inputs", default="4096,8192,16384")       # standard only
    ap.add_argument("--nps", default="1,2,4")
    ap.add_argument("--repeats", type=int, default=3)
    a = ap.parse_args()
    assert 1 <= a.np <= 4 and 256 <= a.input <= 16384 and 1 <= a.repeat <= 3, "parameter outside the allowed range"
    standard = a.mode == "standard"
    if standard:
        inputs, nps = ints(a.inputs, 256, 16384), ints(a.nps, 1, 4)
        assert 1 <= a.repeats <= 3, "parameter outside the allowed range"
    NP, INPUT, REPEAT = a.np, a.input, a.repeat
    models = list(ALL) if a.models == "all" else [m for m in a.models.split(",") if m]
    assert models and all(m in ALL for m in models), f"unknown model in {models}"
    spec = importlib.util.spec_from_file_location("aiso1_b1024", SOURCE)
    runner = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = runner
    spec.loader.exec_module(runner)
    run_id = ("standard_" if standard else "smoke_") + datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = ROOT / "platform_runs" / run_id
    dest.mkdir(parents=True)
    signal.signal(signal.SIGALRM, on_alarm)
    signal.signal(signal.SIGTERM, on_term)
    manifest = {"run_id": run_id, "kind": "standard" if standard else "smoke", "scope": "PLATFORM_STANDARD_NOT_INGESTED" if standard else "SMOKE_ONLY_NOT_FORMAL", "protocol": "B1024", "machine": "AISO1", "framework": "llama.cpp",
                "models": models, "np": NP, "input_tokens": INPUT, "output_tokens": OUTPUT, "repeat": REPEAT,
                "runner_sha256": sha256(__file__), "b1024_runner_sha256": sha256(SOURCE), "started_at": datetime.now().isoformat(timespec="seconds"), "results": {}}
    atomic_json(dest / "manifest.json", manifest)
    results = {}
    with (ROOT / "benchmark_retest_v4.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)      # same lock as every other benchmark on this machine: refuses to start when one is running
        plan = runner.load_plan()
        runner.b.dump(dest / "profile.json", plan)
        if standard:
            manifest.update(inputs=inputs, nps=nps, repeats=a.repeats, output_tokens=OUTPUT)
            atomic_json(dest / "manifest.json", manifest)
            try:
                summary = run_standard(runner, plan, dest, manifest, models, inputs, nps, a.repeats)
            except SystemExit:
                manifest["stopped"] = True
                raise
            finally:
                manifest["finished_at"] = datetime.now().isoformat(timespec="seconds")
                atomic_json(dest / "manifest.json", manifest)
            print("STANDARD_STATUS: " + json.dumps(summary), flush=True)
            return 0 if all(v["fail"] == 0 for v in summary.values()) else 1
        for model in models:
            mdir = dest / model
            mdir.mkdir()
            server, status, agg = None, "FAIL", None
            print(f"LOADING: {model}", flush=True)
            signal.alarm(PER_MODEL_LIMIT_S)
            try:
                server = runner.Server(plan, model, NP, mdir / "server", PORT)
                server.start()
                ids = server.tokens(INPUT)
                requests, waves = [], []
                for rep in range(1, REPEAT + 1):        # one wave of NP parallel requests per repeat
                    r, w = runner.b.wave(server, ids, NP, rep, 7200)
                    requests += r; waves.append(w)
                wave = waves[0] if len(waves) == 1 else {"waves": waves}
                status = "PASS" if all(w["status"] == "PASS" for w in waves) else "FAIL"
                tps = [w["tps_aggregate"] for w in waves if w.get("tps_aggregate") is not None]
                agg = (sum(tps) / len(tps)) if tps else None
                runner.b.dump(mdir / "smoke.json", {"scope": "SMOKE_ONLY_NOT_FORMAL", "model": model, "np": NP, "input_tokens": INPUT, "output_tokens": OUTPUT, "repeat": REPEAT,
                                                  "prompt_sha256": runner.b.hash_obj(ids), "wave": wave, "requests": requests})
            except TimeoutError:
                status = "TIMEOUT"
                (mdir / "error.log").write_text(traceback.format_exc())
            except Exception:
                status = "FAIL"
                (mdir / "error.log").write_text(traceback.format_exc())
            finally:
                signal.alarm(0)
                if server is not None:
                    server.close()
            results[model] = status
            manifest["results"][model] = {"status": status, "aggregate_tps": agg}
            atomic_json(dest / "manifest.json", manifest)
            line = f"llamacpp/{model} NP={NP} input={INPUT} R={REPEAT} {'PASS' if status == 'PASS' else 'FAIL'}"
            print(line + (f" agg={agg}" if agg is not None else ""), flush=True)
    manifest["finished_at"] = datetime.now().isoformat(timespec="seconds")
    atomic_json(dest / "manifest.json", manifest)
    print("SMOKE_STATUS:", json.dumps(results), flush=True)
    return 0 if all(v == "PASS" for v in results.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
