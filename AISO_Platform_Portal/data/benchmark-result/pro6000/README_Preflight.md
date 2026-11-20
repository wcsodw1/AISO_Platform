# PRO6000 · Preflight (runner and manifest)

*Generated 2026-11-20. Read from the platform repository and the evidence files on the Mac (`TPISoftware`); no machine was contacted.*

## 1. What this folder holds
| Path | Content |
|---|---|
| `manifests/` | the platform manifest(s) pro6000_platform_smoke, pro6000_llamacpp_smoke |
| `runners/` | the runner scripts found for this machine |
| `sha256_check.csv` | each recorded hash against the actual file |
| `platform_preflight/` | the platform's preflight code and its 17 checks (the same for every machine) |

## 2. Hash check
2 comparisons: **2 OK**, 0 different, 0 recorded without a reference hash.

## 3. Notes
- The repository manifests pin the llama.cpp and platform smoke runners; the PRO6000 VIS measurements (vLLM with aiDAPTIV) were run by hand with the original scripts, which are not in the repository.
- PRO6000 evidence on the Mac is limited to three raw text results; no machine was contacted for this hand-over.

## 4. Preflight in the platform
Before any run the platform executes 17 checks (ssh login, GPU model, no other GPU workload, model files and sha256, runner registered and unchanged, runtime pinned, free memory, disk and RAM, no unfinished campaign overwritten, launch flags match the protocol, hardware snapshot). A FAIL blocks the run. The list with the real bug behind each check is in `platform_preflight/preflight_checks.md`.

