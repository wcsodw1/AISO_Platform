# Benchmark data gaps — what is still missing (tracking list)

Kept up to date by Claude every session. David's standing request (2026-11-11): the "只缺 AISO1" panel is removed from the pages; gaps are tracked here instead, and Claude asks **"AISO1 補測到哪？"** at the start of every task.

_Last updated: 2026-11-11_

## AISO1 llama.cpp B1024 (campaign still running)
- On the platform: Gemma26 NP1/2/4, Gemma31 NP1/2/4, Laguna NP1/2, Nemotron NP1/2 (all with TTFT/TPOT/Aggregate). Laguna and Nemotron NP1/2 came in with handoff 20261111_115737 (the "fastlane" run).
- **Still missing:** Laguna NP4 (4K/8K/16K), Nemotron NP4 (4K/8K/16K).
- **Omitted by decision (2026-11-11):** NP5 cannot run on AISO1 (Gemma26 NP5 4K PASS and Gemma31 NP5 4K partial exist and are kept as-is).
- Per-repeat values: `scripts/ingest_aiso1_repeats.py <aiso1_repeats.csv>` (run it AFTER `ingest_aiso1_handoff.py`, which rewrites the dataset). Received 2026-11-11 13:5x (sha256 ccaee0b8…), 31/31 conditions, means match the platform within 0.001.
- Status 13:44: handoff 20261111_134440 still 31/48 (no new conditions). NP4 TTFT is huge (Gemma26 600–990 s, Gemma31 2600–3200 s: queueing) — real values, flagged red >180 s.
- Needs from David: new handoff (aiso1_platform_cases.csv with TTFT/TPOT) after each batch; final runner + manifest when the campaign ends.

## AISO1 other frameworks
- vLLM: only Gemma31 NP2 (2026-10-15 ROCm historical, unverified). SGLang: none run.

## B70
- Flash Attention not in the launch command → unverified.
- vLLM / SGLang were run at context 69632 (before 10/27, B70 inferred from dates); not re-run at 18432 → not comparable with B60 / AISO1.
- TPOT is the server-reported value (AISO1 / B60: client-side) → different definition.
- Intel RunnerManifest B70 (tar in Buffer/Benchmark/B60_evidence) not yet imported.
- 2026-11-11 14:00: host stopped for a card swap + RAM to 256 GB → record RAM as a parameter for any later run.

## B60
- Legacy campaign batch 4096 (cannot be re-run, hardware returned) → never "identical" to the B1024 machines.
- Flash Attention unknown; vLLM image tag unknown (sha only).

## Platform / data hygiene
- B60 SGLang public JSON line ~622 contains an internal path (`/home/sparkle/b60_benchmark/...log`) — remove? (asked David, no answer yet)
- Questions drafted for the ChatGPT session (vLLM/SGLang details for B70 and AISO1) — answers pending.
- Branch `feat/benchmark-terminal` not merged to main (live site lacks Terminal, Debugging panel, B1024 data, parameter tables, collapsible sections).
