# Unified Mini-Workstation Benchmark

A local control plane for **already running** model services. It does not install frameworks, download models, start Docker/SSH services, or assume every hardware/framework combination works.

## Benchmark by Machine P0

`benchmark.html` is the P0 evidence UI for Intel Arc Pro B70 + vLLM XPU. `machines.example.json` contains public-safe machine metadata only; credentials and private keys are never stored in the repository or browser. `api.py`, `jobs.py`, `schema.py` and `reports.py` provide the versioned API, Mock Job contract, evidence policy and reports. Mock Jobs always remain `UNVERIFIED`, never `PASS`.

Local management endpoints require both loopback access and `Authorization: Bearer <token>`. Set `AISO_BENCHMARK_BEARER_TOKEN` privately before `make run`, or use the temporary token printed in the local Terminal. P0 does not open SSH. P1 will add a whitelisted SSH Executor using Key Authentication and Host Key verification after real Runner, Client, CSV and Server Logs are exported from the B70 machine.

The B70 SGLang Adapter is reserved as `RUNTIME_UNVERIFIED`; execution remains disabled until real runtime logs are reviewed. Fixture metrics without imported logs remain `UNVERIFIED`. Gemma31 64K remains `FAIL` with the original missing-first-token/usage error; its root cause is not classified as OOM.

## Run from the Portal

1. Install repository dependencies: `python3 -m pip install -r requirements.txt`.
2. Copy `targets.example.json` to `~/.aiso/benchmark-targets.json` (or set `AISO_BENCHMARK_TARGETS` to a private file outside the served Portal directory).
3. Configure a target for each exact platform/framework/model/profile. Enter the service's `/v1` endpoint, served model ID, runtime, format, framework version, model repository/revision and model or model-file-manifest SHA256. Record the machine's hardware/environment in `machine`.
4. Supply five fixed UTF-8 completion prompts with exact token lengths 4096/8192/16384/32768/65536 for that model/tokenizer. Use identical fixtures for equivalent model comparisons. The runner checks the actual server-reported prompt tokens, hashes each prompt and never stores prompt content in results.
5. Verify the running server's cache and context/batching/memory settings, then set `verified: true`. These values are **operator attestations**, not automatically read from the server. For other frameworks, verify and record equivalent effective settings; do not assume vLLM flags can be passed to llama.cpp/SGLang/OpenVINO.
6. Start `make run`, open `http://localhost:8765`, select Benchmark, then **檢查執行條件 → 開始測試**. The preflight checks local configuration and fixtures only. The first real batch tests endpoint compatibility; failures stop further scheduling.

The localhost admin can reach configured model endpoints on the LAN. LAN visitors and the public static site can view the baseline matrix and download a manifest but cannot start jobs or see private job records. Restart the Portal process after upgrading backend code.

## CLI

```sh
python3 AISO_Platform_Portal/benchmark/benchmark_runner.py \
  --config AISO_Platform_Portal/benchmark/mini_workstation_benchmark.yaml \
  --validate-only

python3 AISO_Platform_Portal/benchmark/benchmark_runner.py \
  --config AISO_Platform_Portal/benchmark/mini_workstation_benchmark.yaml
```

Optional `--targets /private/path/targets.json` and `--output /private/path/results` override local storage. Defaults are `~/.aiso/benchmark-targets.json` and `~/.aiso/benchmark-results`. Portal results may also be configured via `AISO_BENCHMARK_RESULTS`. Keep these outside the web-served repository. API keys are read only from the configured environment variable, never from the browser/YAML.

## Contract and measurements

- Platform → Inference Framework → Runtime → Model Format are separate fields. Runtime/format come from the verified target, not a guessed compatibility matrix.
- NP2 and NP4 × five input lengths × three repeats = 30 batches / 90 requests per model. Each batch releases concurrent requests through a barrier. No warm-up is silently excluded.
- Output 1024, context 69632, batched tokens 4096, memory utilization 0.9. Formal cache OFF; `production-cache` ON has a separate target/profile and result record. Cache-hit rates and controlled warm/cold experiments are not yet measured.
- Adapters use streaming `/v1/completions` and require usage plus `[DONE]`. vLLM/SGLang/llama.cpp request `ignore_eos`; llama.cpp also sets `cache_prompt`. OpenVINO requires an OpenAI-compatible gateway implementing this streaming contract; there is no native OpenVINO runtime launcher. Its short output is invalid, not padded or estimated.
- A Full-valid request has exact input tokens, exactly 1024 completion tokens, `finish_reason=length`, nonempty output and a complete stream. A failed batch stops the job and has no Aggregate TPS. A job completes only after all 90 requests pass.
- TTFT is request-start to first nonempty text chunk; E2E is request-start through stream completion. TPOT is (last text − first text)/(output tokens − 1); Decode TPS is its reciprocal. Both are **client-observed estimates**, especially with multi-token chunks. Prompt TPS is deliberately not inferred from TTFT. Aggregate TPS is total valid output tokens / complete batch wall time, including client dispatch overhead.
- Stop prevents new batches; in-flight requests exit on the next SSE line or socket timeout (default 300 seconds, capped at 600). Interrupted process jobs display `interrupted` on restart; they are not resumed or labeled complete.
- JSON preserves manifest and evidence; CSV exports run labels plus measurements. Raw generated text and credentials are not saved. Review before publishing results manually; jobs never automatically overwrite baseline statuses or export private results.

The status matrix is a user-provided snapshot dated 2026-10-19: Gemma26/Gemma31/Nemotron need NP2/NP4 Full @4096 reruns on both platforms; only B70 Gemma31 has DS @4096 verified. Laguna is excluded for Intel/AMD vLLM; this is not a blanket exclusion for other frameworks.

Protocol reference: [vLLM OpenAI-compatible server](https://docs.vllm.ai/en/stable/serving/openai_compatible_server/). Adapter contract must be tested against the actual installed service/version; mock tests do not certify hardware support.
