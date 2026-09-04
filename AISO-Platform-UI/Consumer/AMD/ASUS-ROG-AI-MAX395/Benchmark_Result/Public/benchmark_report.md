# Ryzen AI MAX+ 395 llama.cpp Vulkan Benchmark Report

Generated: 2026-08-28 16:54:10 +08:00

## Metrics

- TTFT (ms): mean across all completed requests; lower is better.
- TPOT (ms/token): median across all completed requests of (E2E - TTFT) / (output tokens - 1); lower is better.
- Throughput Aggregate (tokens/s): total output tokens / total measured request duration; higher is better.
- Throughput Normalized (tokens/s/user): Throughput Aggregate / NP; higher is better.

At NP=1, Throughput Aggregate equals Throughput Normalized, matching the 70B/120B benchmark definition.

## Test setup

| Variable | Value |
|---|---|
| llama.cpp | b10615 Windows x64 Vulkan |
| Threads | 32 (all Windows logical processors) |
| Windows power plan | 電源配置 GUID: 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c  (高效能) |
| AMD driver | 32.0.31035.1003 (unchanged for this rerun) |
| VGM / Vulkan memory | unchanged from current system configuration |
| GPU offload | -ngl 999 |
| Actual input tokens | 1024, 2048, 4096, 8192, 16384, 32768 |
| Output tokens | 300 |
| Batch / ubatch | 2048 / 512 |
| Repetitions | 3 |
| Server context policy / parallel slots | 1024=4096, 2048=4096, 4096=6144, 8192=10240, 16384=18432, 32768=34816 / 1 |
| Prompt cache | disabled |
| Sampling | temperature 0; seed 1234; EOS ignored until output target |

## Models

| Model | File | Size GiB | SHA256 |
|---|---|---:|---|
| Gemma 4 26B A4B | gemma-4-26B-A4B-it-UD-Q4_K_M.gguf | 15.784 | F2C28B3DC4776931AC6F879E11F203DEC637EA0F14267A86EC8F6165F63F293F |
| GPT-OSS 20B | gpt-oss-20b-Q4_K_M.gguf | 10.826 | C27536640E410032865DC68781D80A08B98F8DB5E93575919AF8CCC0568AEB4F |

## Formal NP1 API results

Each row is one model/input result aggregated from all completed requests.

| Model | Input | Output | Context | Requests | TTFT Mean (ms) | TPOT Median (ms/token) | Aggregate (tokens/s) | Normalized (tokens/s/user) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Gemma 4 26B A4B | 1024 | 300 | 4096 | 3 | 3147.573733 | 21.451237 | 31.369098 | 31.369098 |
| Gemma 4 26B A4B | 2048 | 300 | 4096 | 3 | 5255.7062 | 22.536364 | 25.002476 | 25.002476 |
| Gemma 4 26B A4B | 4096 | 300 | 6144 | 3 | 8259.3038 | 22.645757 | 19.924742 | 19.924742 |
| Gemma 4 26B A4B | 8192 | 300 | 10240 | 3 | 19095.468267 | 23.736902 | 11.453172 | 11.453172 |
| Gemma 4 26B A4B | 16384 | 300 | 18432 | 3 | 51733.539367 | 24.938714 | 5.065439 | 5.065439 |
| Gemma 4 26B A4B | 32768 | 300 | 34816 | 3 | 178106.916633 | 27.911843 | 1.608994 | 1.608994 |
| GPT-OSS 20B | 1024 | 300 | 4096 | 3 | 1153.6222 | 12.403059 | 60.820121 | 60.820121 |
| GPT-OSS 20B | 2048 | 300 | 4096 | 3 | 1429.957967 | 12.63772 | 57.629377 | 57.629377 |
| GPT-OSS 20B | 4096 | 300 | 6144 | 3 | 2817.8726 | 12.706571 | 45.26652 | 45.26652 |
| GPT-OSS 20B | 8192 | 300 | 10240 | 3 | 5912.4335 | 13.311167 | 30.423898 | 30.423898 |
| GPT-OSS 20B | 16384 | 300 | 18432 | 3 | 14615.1043 | 13.843074 | 15.962868 | 15.962868 |
| GPT-OSS 20B | 32768 | 300 | 34816 | 3 | 39859.071033 | 15.749575 | 6.728566 | 6.728566 |