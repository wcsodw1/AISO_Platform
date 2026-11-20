# GB10 · Preflight (runner and manifest)

*Generated 2026-11-20. Everything here was read from the platform repository and from the machine (read-only); nothing was changed on either side.*

## 1. What this folder holds
| Path | Content |
|---|---|
| `manifests/` | the two platform manifests for GB10: `gb10_matrix` (the long-context matrix) and `gb10_platform_smoke` (smoke and standard test), with the pinned sha256 of each runner |
| `runners_repo/` | the runner files as they are in the platform repository (`benchmark/runners/`) plus `GB10_README.md` |
| *(machine scripts)* | the scripts as they were on the machine (matrix script, long-context server module, `env.sh`, every `run_*.sh` queue script, `stopped_containers.txt`) are kept once in `../benchmark_Result/raw_backup/scripts/`; they are not duplicated here |
| `sha256_check.csv` | manifest sha256 vs repository file vs machine file |
| `longctx_machine_vs_repo.diff` | the one script that differs between the repository and the machine |
| `preflight_in_run_logs.csv` | the preflight output recorded in each of the 47 logs |
| `../../Preflight/` | the platform's own preflight code and the list of its 17 checks (shared by every machine, in `NEW-Benchmark/Preflight/`) |

## 2. Manifest and runner check
| Item | Manifest = repository | Repository = machine | Result |
|---|---|---|---|
| gb10-matrix manifest | True | True | OK: all three equal |
| gb10-platform-smoke manifest | True | — | not deployed on the machine (copied there only when a platform run starts) |
| (no manifest) long-context server module | — | False | DIFFERENT: machine copy was edited after the repo copy (see longctx_machine_vs_repo.diff) |

- **gb10_matrix**: the manifest, the repository file `benchmark/runners/gb10_vllm_matrix.py` and the script on the machine (`~/gb10_benchmark/GB10_vllm_gemma26_matrix.py`) have the same sha256 (`dbc47ee7…`). The platform refuses to start it if the machine copy ever differs.
- **gb10_platform_smoke**: manifest and repository file agree (`8e033f42…`). The runner is copied to `~/aiso_platform_runs/` only when a platform run starts, so there is no copy on the machine now.
- **Long-context server module** (`GB10_vllm_gemma26_5user_longctx.py`, imported by the matrix script): **not pinned by any manifest, and the machine copy differs from the repository copy.** The machine copy was edited on 2026-11-19 for the NVFP4 KV / MTP / QAT tests: `KV_DTYPE` read from the environment (fp8 default, `auto` for full precision), `PROMPT_MODE=natural` (real English text instead of one repeated block), and an optional `JIT_CACHE_DIR` to keep compiled GPU kernels between runs. The default behaviour is unchanged. The diff is in `longctx_machine_vs_repo.diff`. **Action for the platform:** either commit the machine version to `benchmark/runners/` or add a manifest for it, so the repository and the machine agree again (not done here).

## 3. Preflight output in the run logs
- 47 logs were backed up: **32 are benchmark (matrix) logs and every one of them contains `PREFLIGHT_OK`**; the other 15 are queue / runner wrapper logs (`quant_queue*.log`, `runner*.log`) that do not run a benchmark themselves.
- GPU line seen: NVIDIA GB10, [N/A], [N/A]
- Container image: lmcache/vllm-openai:nightly-2026-11-02 sha256:2aefd4be5090 (one image for all runs)
- What the matrix script prints before a run: GPU model, container image id (sha256 prefix), model and settings (served name, KV cache dtype), then `PREFLIGHT_OK`. Per log details (model, weights, KV dtype, cases PASS / FAIL, DONE, first error) are in `preflight_in_run_logs.csv`.
- Runs that stopped before any case ran (failed starts) still passed this preflight; they failed later when vLLM started (see section 9 of the summary in `../benchmark_Result/`).

## 4. The platform's preflight (Step 1 of the Run flow)
`NEW-Benchmark/Preflight/preflight.py` (shared by every machine) runs 17 checks before any benchmark starts (ssh login, GPU model, no other GPU workload, model files and sha256, runner registered and unchanged (sha256), runtime image pinned, enough free GPU memory, disk and RAM, no unfinished campaign overwritten, launch flags match the protocol, hardware snapshot). A FAIL blocks the run. The full list with the real bug behind each check is in `NEW-Benchmark/Preflight/preflight_checks.md`. Several checks were written for the Intel and AMD machines (llama.cpp, SYCL); on GB10 the relevant ones are the ssh login, the GPU and workload checks, the runner sha256 and the image pin.

## 5. Hand-over notes
- The model weights and the Docker image are not copied (they can be downloaded again); `../benchmark_Result/raw_backup/scripts/env.sh` holds only paths and settings, no secrets (checked).
- Other services that were stopped on the machine to free memory for the tests are listed in `../benchmark_Result/raw_backup/scripts/stopped_containers.txt`; they are still stopped and must be started by their owner.
- The benchmark data of the same machine is in `../benchmark_Result/`.

