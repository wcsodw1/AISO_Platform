# Benchmark data flow (AISO Platform)

```
Machines (Intel sparkle: B60 / B70 · AISO1 · future)
 └─ runner + manifest + raw results + logs
      ▼  L0 Evidence  (private, immutable, never cleaned in place)
      Buffer/Benchmark/<machine>_evidence/…   *.tar.gz (+ .sha256)
        ├─ RunnerManifest_<ts>_B60|B70.tar.gz   runner snapshots, per framework/model manifest.json, checkpoints
        ├─ Intel_Benchmark_<date>/              audit.json, *_cases.csv, *_waves.csv, evidence.tar.gz
        └─ Intel_Debug_Archive_<date>.tar.gz    debug scripts + logs (not published)
      ▼  L1 Manifest  (private)   machine · runner file + sha256 · model file + sha256 · launch flags · date
      ▼  Validate     case / repeat / request counts, flag parity (batch 1024), metric definition v4-pdf-e2e,
      │               runner binding: PASS_RECORDED vs RUNNER_EXECUTION_BINDING_PENDING / UNVERIFIED_RUNNER_MAPPING
      ▼  L2 Normalized  one row per machine × framework × model × NP × input
      │                 ttft_s, tpot_ms, aggregate_tps, normalized_tps, repeats[], status, consistency_note
      ▼  L3 Platform  (in git)  AISO_Platform_Portal/data/benchmark-<machine>/AISO_<M>_<fw>_<date>.json
      │                          data/benchmark-registry.json   (machine × framework → file)
      │                          data/terminal/<machine>.json  (runner, manifest, past-run transcript)
      ▼  L4 Public export  make export → docs/  (GitHub Pages): only approved summaries, never raw logs / evidence
           ├─ stress-test-b60.html / -b70.html / -aiso1.html   per machine (+ Terminal)
           ├─ stress-test-pair.html?pair=…  stress-test-compare.html   cross-machine, same framework+model only
           └─ benchmark.html   Run benchmark (Terminal live shell: localhost only)
```

Rules
1. Evidence is append-only; normalisation writes new files and never overwrites L0.
2. A value reaches L3 only with a campaign id, source file name and a comparability level (`retest_unverified` etc.).
3. Missing metrics stay `null` (shown as "—"); nothing is estimated or filled with defaults.
4. Only L3/L4 content is committed. L0/L1 stay under `Buffer/` (and the machines' own archives).
5. Intel B60/B70 hosts are being retired: the archive above is the only copy of their runner/manifest evidence.

Current gaps: B60 runner binding (vLLM, llama.cpp) unverified; B70 runner file and its manifest not yet imported to L3; AISO1 runner/manifest pending; B70 and AISO1 llama.cpp have Aggregate only (no TTFT/TPOT).
