#!/usr/bin/env python3
"""GB10 Ryan matrix: Gemma 4 26B MoE on vLLM, KV cache fp8, NP x Input x Output in ONE server start.
Input tokens are exact (65536 / 131072); session context = input + output. Reuses Server / make_ids / wave from
GB10_vllm_gemma26_5user_longctx.py (same metric definitions). Every case is sent (never skipped on a KV estimate);
a case that does not fit is recorded with what vLLM really did."""
import argparse, csv, datetime, json, statistics, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import GB10_vllm_gemma26_5user_longctx as g

COLS = ["np", "input_tokens", "output_tokens", "status", "ttft_mean_s", "ttft_max_s", "tpot_mean_ms", "tps_aggregate",
        "tps_normalized", "wall_s", "kv_cache_tokens", "kv_needed_tokens", "error"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nps", default="1,3,5")
    ap.add_argument("--inputs", default="65536,131072")
    ap.add_argument("--outputs", default="256,512")
    ap.add_argument("--timeout", type=int, default=7200)
    ap.add_argument("--tag", default="matrix")
    a = ap.parse_args()
    nps = [int(x) for x in a.nps.split(",")]
    inputs = [int(x) for x in a.inputs.split(",")]
    outputs = [int(x) for x in a.outputs.split(",")]
    max_np = max(nps)
    max_len = max(inputs) + max(outputs) + 512
    stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    out = g.ROOT / "results" / f"gemma26_vllm_fp8_{a.tag}_{stamp}"
    out.mkdir(parents=True, exist_ok=True)
    g.preflight(argparse.Namespace(attach=None))
    (out / "parameters.json").write_text(json.dumps(dict(
        model=g.MODEL, framework="vLLM", kv_cache_dtype=g.KV_DTYPE, weights=g.os.environ.get("WEIGHTS_LABEL","bf16 (not quantized)"), nps=nps, inputs=inputs,
        outputs=outputs, repeats=1, prefix_caching=False, chunked_prefill=True, max_model_len=max_len, max_num_seqs=max_np,
        max_num_batched_tokens=int(g.MAX_BATCHED), gpu_memory_utilization=float(g.GPU_MEM_UTIL), image=g.IMAGE,
        extra_vllm_args=g.EXTRA_ARGS, request="ignore_eos, min_tokens=max_tokens, temperature 0, seed 42",
        order="NP ascending, then input, then output; every case sent, none skipped from a KV estimate",
        metrics=dict(ttft="first_content - start (s)", tpot="(done - first_content)/(output_tokens-1) (ms)",
                     aggregate="sum output tokens / (last done - first start)", normalized="aggregate / NP"),
        comparability="NEW_GB10_INPUT_EXACT_NOT_COMPARABLE_WITH_TOTAL_CONTEXT_RUNS"), indent=2))
    server, rows_csv = g.Server(out, max_len, max_np), []
    try:
        g.say("starting vLLM (own container", g.CONTAINER + ") max-model-len", max_len, "max-num-seqs", max_np)
        server.start()
        base, kv = server.base, server.kv_tokens
        g.say("KV cache capacity:", f"{kv} tokens" if kv else "unknown")
        prompts = {}
        for n_in in inputs:
            g.say(f"[input {n_in}] building {max_np} prompts")
            prompts[n_in] = [g.make_ids(base, g.SERVED, n_in, f"{stamp}-{n_in}-{i + 1}") for i in range(max_np)]
            g.say(f"[input {n_in}] warm-up", g.wave(base, g.SERVED, [prompts[n_in][0][:2048]], 8, 600)[1]["status"])
        for np_ in nps:
            for n_in in inputs:
                for n_out in outputs:
                    need = np_ * (n_in + n_out)
                    tight = kv is not None and need > kv
                    g.say(f"CASE NP{np_} input {n_in} output {n_out}" + (f"  KV_TIGHT need {need} > {kv}, sending anyway" if tight else ""))
                    rows, res = g.wave(base, g.SERVED, prompts[n_in][:np_], n_out, a.timeout)
                    (out / f"case_np{np_}_in{n_in}_out{n_out}.json").write_text(json.dumps(
                        dict(np=np_, input_tokens=n_in, output_tokens=n_out, result=res, requests=rows), ensure_ascii=False, indent=2))
                    row = dict(np=np_, input_tokens=n_in, output_tokens=n_out, kv_cache_tokens=kv or "", kv_needed_tokens=need if tight else "")
                    if res["status"] == "PASS":
                        tt = [r["ttft_s"] for r in rows]
                        tp = [r["tpot_ms"] for r in rows if r["tpot_ms"] is not None]
                        row.update(status="PASS", ttft_mean_s=round(statistics.mean(tt), 3), ttft_max_s=round(max(tt), 3),
                                   tpot_mean_ms=round(statistics.mean(tp), 2) if tp else "", tps_aggregate=round(res["tps_aggregate"], 3),
                                   tps_normalized=round(res["tps_normalized"], 3), wall_s=round(res["wall_s"], 2))
                        g.say(f"  PASS NP{np_} in{n_in} out{n_out}  TTFT mean {row['ttft_mean_s']}s max {row['ttft_max_s']}s  TPOT {row['tpot_mean_ms']} ms  "
                              f"TPS agg {row['tps_aggregate']} / norm {row['tps_normalized']}")
                    else:
                        errs = sorted({r["error"] for r in rows if r["error"]})
                        row.update(status="FAIL", error="; ".join(errs)[:300])
                        g.say(f"  FAIL NP{np_} in{n_in} out{n_out} {res['successful']}/{np_} ok; {errs[:2]}")
                    rows_csv.append(row)
                    with (out / "summary.csv").open("w", newline="") as f:
                        w = csv.DictWriter(f, fieldnames=COLS)
                        w.writeheader(); w.writerows(rows_csv)
                    if not g.healthy(base):
                        g.say("SERVER_DOWN after this case; stopping"); raise SystemExit(2)
    finally:
        server.close()
    g.say("SUMMARY_CSV", out / "summary.csv"); g.say("DONE", out)


if __name__ == "__main__":
    main()
