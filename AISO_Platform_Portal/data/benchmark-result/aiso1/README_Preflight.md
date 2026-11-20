# AISO1 · Preflight (runner and manifest)

*Generated 2026-11-20. Read from the platform repository and the evidence files on the Mac (`TPISoftware`); no machine was contacted.*

## 1. What this folder holds
| Path | Content |
|---|---|
| `manifests/` | the platform manifest(s) aiso1_kvcache, aiso1_platform_smoke; manifests / environment files extracted from the evidence archives |
| `runners/` | the runner scripts found for this machine |
| `sha256_check.csv` | each recorded hash against the actual file |
| `../../Preflight/` | the platform's preflight code and its 17 checks (the same for every machine; kept once in `NEW-Benchmark/Preflight/`) |

## 2. Hash check
22 comparisons: **22 OK**, 0 different, 0 recorded without a reference hash.

## 3. Notes
- The hand-off zips (4 versions, 2026-11-11) carry the runner sha256 manifest, the runners, `preflight.json` and the campaign profiles; the latest (115737) is extracted here and every runner hash was checked.
- The repository manifests `aiso1_kvcache` and `aiso1_platform_smoke` pin the KV-cache and smoke runners.

## 4. Preflight in the platform
Before any run the platform executes 17 checks (ssh login, GPU model, no other GPU workload, model files and sha256, runner registered and unchanged, runtime pinned, free memory, disk and RAM, no unfinished campaign overwritten, launch flags match the protocol, hardware snapshot). A FAIL blocks the run. The list with the real bug behind each check is in `NEW-Benchmark/Preflight/preflight_checks.md`.

