# Benchmark automation — plan and design (2026-11-11)

Goal (David): set parameters → press **Run** inside **Stress Test** → the Terminal shows live status → results are added to the platform one condition at a time (for the machine being tested, e.g. AISO1, and in the comparisons) → numbers, charts and the written conclusions update by themselves. Built in three steps; each step is finished and unit-tested on its own, then chained.

## Where it lives in the UI
- **Stress Test is the single entry, and you pick the machine first**: vendor (NVIDIA / AMD / Intel) → machine (H200, B300, AI MAX 395, B60, B70 …). The old home card "Run benchmark 實測" is gone. **Every machine runs its own benchmark from its own page**: results, Run, live status, runner and manifest all sit under the selected machine. Until the per-machine Run panel exists (Step 1 UI), a "Run 實測" button in the machine row opens the current Run page.
- **Every Run asks for the test password first** (done, Step 0): `POST /api/run-auth` → one-time ticket (60 s, single use) → the start request carries `X-Run-Ticket`. Nothing is remembered; wrong passwords are rate limited; localhost only; password = `AISO_TERMINAL_PASSWORD`, never in git (tests generate a random one).

## Data flow (extends benchmark/DATA_FLOW.md)
Run spec → **[Step 1] Run orchestration** → runner on the machine → live log + L0 result files → **[Step 2] auto-ingest** (validate → L2 → L3 dataset, per condition) → `make export` → **[Step 3] present + analyse** (charts, summary sentences, parity flags, gap list, report/slide PDF).

## Step 1 — Run orchestration and live status
- `RunSpec` (one machine per spec, chosen on that machine's page): machine, framework, models, NP, inputs, repeat + the protocol parameters. **Parity check** against the B1024 protocol (batch 1024, ubatch 512, 18432 ctx/slot, 10 slots, KV f16, prefix cache off, output 1024, repeat 3); any deviation is shown and the run is labelled non-formal.
- Runner command templates are an **allowlist per machine** (no free-form commands): AISO1 `AISO1_B1024.py` (+ the fastlane / NP4-only variants), B70 `B70_V4_B1024_llamacpp.py`, B60 matrix runner.
- `ProgressParser` turns runner log lines into events (`RUN: laguna NP4 4096 R 1`, `RESULT: PASS AGG: …`, `llamacpp/laguna NP=1 input=4096 R=1 PASS agg=…`, `CHECKPOINT: 19 /48 cases…`, `AISO1 llama.cpp B1024：6/48 PASS…`, `LOADING:`, `SMOKE_STATUS`, `STOP:`/`BLOCKED:`) and a tracker (done / total, current condition, ETA, duplicates ignored).
- Executors share one interface: `LocalProcessExecutor` (tests and a launcher running on the machine), `SshExecutor` (key auth, `BatchMode=yes`, aliases only from `~/.ssh/config`, host key checking).
- `RunService`: states queued → running → ingesting → done / failed / stopped; one active job per machine; log ring buffer; `GET …?since=` polling for the Terminal view; stop button. Reuses the existing `benchmark/jobs.py` surface (its mock executor stays for demos).
- **Decision needed from David:** how the launcher reaches the machines. AISO1 currently asks for an ssh **password**, which automation cannot type. Options: (A) set up SSH key login Mac → AISO1 / B60 / B70 (`ssh-copy-id`, one time, David enters the password himself); (B) a small agent on each machine that pulls job specs (no inbound ssh). Recommendation: A.
- Unit tests: parser on the real logs pasted so far (AISO1 original/fastlane/NP4-only, B70), spec validation + parity, allowlist (no injection through model/NP values), state machine, end-to-end with a **fake runner** script that prints the same log format and writes the same result files (no GPU needed).

## Runner and manifest are part of the automation (per machine)
- **Runner registry**: each machine has its own pinned runner set (`AISO1_B1024.py` + fastlane / remaining / NP4-only variants, `B70_V4_B1024_llamacpp.py`, B60 matrix runner). Each is recorded with its sha256; Run refuses to start if the file on the machine differs from the registry (or asks to register the new version). Runner files stay private (L0), never in the public site.
- **Manifest generated automatically** at Run start and completed at the end: run spec, protocol parameters + parity result, runner name/sha, launch command per NP (`command.json`), device / driver / image / commit, model sha256, start/end time, per-condition status. Packaged as `RunnerManifest_<timestamp>_<machine>.tar.gz` (the same pattern as today) into `Buffer/Benchmark/<machine>_evidence/`; only the reviewed public subset (parameters, hashes, no paths/host names) feeds the platform datasets and the "GPU 型號佐證" / parameter tables.
- This replaces today's manual handoff packaging (`aiso1_handoff_packager.py`, tar commands pasted by hand).

## Step 2 — Auto-ingest, one condition at a time
- Collector pulls only small result files (summary/waves/raw CSV, command, environment — never server logs, models or paths) after each completed condition or at the end.
- Validators are the existing ones generalised (`ingest_*` scripts): 3 PASS repeats per condition, aggregate cross-check, protocol flags vs `command.json`, hashes recorded; hard stop on mismatch.
- Merges into the machine's L3 dataset (`data/benchmark-<machine>/…`) idempotently, updates `DATA_GAPS.md`, runs the privacy scan, then `make export`. Pages already read the registry, so new conditions appear on refresh.
- Unit tests: golden fixtures from the real B70 `sb_full` and AISO1 repeats CSV must reproduce the current datasets exactly.

## Step 3 — Present and conclude
- Live refresh of the compare / machine pages when new data lands.
- Conclusions generated from numbers only (no free text): per-metric one-sentence summary vs the AISO1 baseline, parity flags ("B60 batch 4096 ≠ 1024"), definition warnings (B70 TPOT server-side), outlier / queueing flags (TTFT > 180 s), coverage and next-missing list.
- Report: JSON → HTML → slide PDF (the "Next" item), same sentences as the pages.
- Unit tests: fixed fixtures → expected sentences; no conclusion when parameters differ unless explicitly labelled.

## Integration test
Fake runner → job → live events → ingest → dataset → export → conclusions, asserting each hand-off. Only then connect the real machines.

Status of each step: see `AUTOMATION_STATUS.md`.
