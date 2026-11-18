# GB10 benchmark scripts

| File | Runs where | What it does |
|---|---|---|
| `GB10_vllm_gemma26_5user_longctx.py` | on GB10 (`~/gb10_benchmark`) | Long-context test (preflight / smoke / run): starts its own vLLM container, sends NP requests at once, writes `summary.csv` + `case_*.json`. |
| `gb10_vllm_matrix.py` | on GB10 (copy of `GB10_vllm_gemma26_matrix.py`) | NP x Input x Output matrix on ONE server start (64K/128K Ryan set, 8K set, weight quantization). Imports the file above, so keep them in the same folder. |

Rules that came out of the GB10 work: a case is always sent, never skipped from a KV estimate; GB10 has one 128 GB pool shared with other services, so check free memory first; the scripts never stop other services.
Manifest with the expected sha256: `../manifests/gb10_matrix.manifest.json`. Result import: `scripts/ingest_gb10_longctx.py`, terminal page: `scripts/build_gb10_terminal.py`.
