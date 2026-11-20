# B60 · Preflight (runner and manifest)

*Generated 2026-11-20. Read from the platform repository and the evidence files on the Mac (`TPISoftware`); no machine was contacted.*

## 1. What this folder holds
| Path | Content |
|---|---|
| `manifests/` | no platform manifest exists in the repository for this machine; manifests / environment files extracted from the evidence archives |
| `runners/` | the runner scripts found for this machine |
| `sha256_check.csv` | each recorded hash against the actual file |
| `platform_preflight/` | the platform's preflight code and its 17 checks (the same for every machine) |

## 2. Hash check
21 comparisons: **2 OK**, 0 different, 19 recorded without a reference hash.

## 3. Notes
- No platform manifest for B60 exists in the repository: the B60 runner is registered only through the evidence archive and the hand-off notes.
- `B60_llamacpp_B1024_NPX_rebuild.py` is the NP6/8/10 rebuild runner of the active B60 campaign; the copy here is a copy, the original stays in `NEW-Benchmark/INTEL/` where the B60 session expects it.

## 4. Preflight in the platform
Before any run the platform executes 17 checks (ssh login, GPU model, no other GPU workload, model files and sha256, runner registered and unchanged, runtime pinned, free memory, disk and RAM, no unfinished campaign overwritten, launch flags match the protocol, hardware snapshot). A FAIL blocks the run. The list with the real bug behind each check is in `platform_preflight/preflight_checks.md`.

