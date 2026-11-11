# Automation status (updated by Claude after each step)

| Step | What | Status | Tests |
|---|---|---|---|
| 0 | Test-password gate before every Run (`run_auth.py`, `/api/run-auth`, `run-gate.js`); Stress Test picks vendor → machine first; Run is per machine (button in the machine row for now) | **Done** | `tests/test_run_auth.py` (11): single-use ticket, expiry, lockout, disabled, gated routes, HTTP gate |
| 1 | Run orchestration + live status + **runner registry & automatic manifest** (spec/parity, progress parser, executors, RunService, Terminal view) | Not started | — |
| 2 | Auto-ingest per condition into L3 + export | Not started | — |
| 3 | Present + conclusions + report/slide PDF | Not started | — |
| — | End-to-end with a fake runner, then real machines | Not started | — |

Blocking decision for real runs: SSH key login (A) or on-machine agent (B) — see AUTOMATION_PLAN.md, Step 1.
