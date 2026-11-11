# Automation status (updated by Claude after each step)

| Step | What | Status | Tests |
|---|---|---|---|
| 0 | Test-password gate before every Run (`run_auth.py`, `/api/run-auth`, `run-gate.js`); Stress Test picks vendor → machine first; Run is per machine (button in the machine row for now) | **Done** | `tests/test_run_auth.py` (11): single-use ticket, expiry, lockout, disabled, gated routes, HTTP gate |
| 1A | Environment setup: vendor settings + 16 preflight checks | **Done (logic)** | `tests/test_run_flow.py` (18): per-vendor devices, only observed settings verified, every known bug caught |
| 1B | Liveness watchdog policy (60 s polls, 30 min, 3 choices) | **Done (logic)** | same file: verdicts, no kill, continue re-asks after 30 min, skips recorded |
| 1C | Smoke test + generated resumable full-run script | Not started | — |
| 1D | Runner registry + automatic manifest, SSH/local executors, RunService, Terminal view | Not started | — |
| 1 (old row) | Run orchestration + live status + **runner registry & automatic manifest** (spec/parity, progress parser, executors, RunService, Terminal view) | Not started | — |
| 2 | Auto-ingest per condition into L3 + export | Not started | — |
| 3 | Present + conclusions + report/slide PDF | Not started | — |
| — | End-to-end with a fake runner, then real machines | Not started | — |

Blocking decision for real runs: SSH key login (A) or on-machine agent (B) — see AUTOMATION_PLAN.md, Step 1.
