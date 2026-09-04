# Ryzen AI MAX+ 392 llama.cpp Vulkan Benchmark Report

Generated: 2026-08-28 09:41:39 +08:00

## Formal comparison metrics

- TTFT (ms): request start to first non-empty streamed output token; lower is better.
- TPOT (ms/token): (end-to-end latency - TTFT) / (output tokens - 1); lower is better.
- Throughput Aggregate (tokens/s): total output tokens across the measured requests / total wall-clock request duration; higher is better.
- Throughput Normalized (tokens/s/user): Throughput Aggregate / NP; higher is better.

At NP=1, Throughput Aggregate equals Throughput Normalized, matching the 70B/120B benchmark definition.

## Fixed protocol

| Variable | Value |
|---|---|
| llama.cpp | b10615 Windows x64 Vulkan |
| Threads | 24 (all Windows logical processors) |
| GPU offload | -ngl 999 |
| Actual input tokens | 1024, 2048, 4096, 8192, 16384, 32768 |
| Output tokens | 300 |
| Batch / ubatch | 2048 / 512 |
| Repetitions | 3 |
| Server context policy / parallel slots | 1024=4096, 2048=4096, 4096=6144, 8192=10240, 16384=18432, 32768=34816 / 1 |
| Prompt cache | disabled |
| Sampling | temperature 0; seed 1234; EOS ignored until output target |

## Environment

| Field | Value |
|---|---|
| MachineLabel | Ryzen AI MAX+ 392 |
| ComputerName | TPIUSER |
| CapturedAt | 2026-08-28 09:41:39 +08:00 |
| Manufacturer | ASUS |
| Model | TUF Gaming A14 FA401EA |
| OperatingSystem | Microsoft Windows 11 家用版 |
| OSVersion | 10.0.26200 |
| OSBuild | 26200 |
| CPU | AMD RYZEN AI MAX+ 392 w/ Radeon 8060S           |
| PhysicalCores | 12 |
| LogicalProcessors | 24 |
| MaxClockMHz | 3199 |
| TotalPhysicalMemoryGiB | 7.65 |
| MemoryModules | 4 GiB @ configured 8000 MT/s (reported 8532 MT/s); 4 GiB @ configured 8000 MT/s (reported 8532 MT/s); 4 GiB @ configured 8000 MT/s (reported 8532 MT/s); 4 GiB @ configured 8000 MT/s (reported 8532 MT/s); 4 GiB @ configured 8000 MT/s (reported 8532 MT/s); 4 GiB @ configured 8000 MT/s (reported 8532 MT/s); 4 GiB @ configured 8000 MT/s (reported 8532 MT/s); 4 GiB @ configured 8000 MT/s (reported 8532 MT/s) |
| VideoControllers | AMD Radeon(TM) 8060S Graphics; driver=32.0.22032.3003; adapterRAM=4 GiB |
| ActivePowerPlan | 電源配置 GUID: 27fa6203-3987-4dcc-918d-748559d549ec  (Performance) |
| LlamaCppVersion | version: 0.2.0-dev (build 10615, commit f280b2698)<br>built with Clang 20.1.8 for Windows x86_64 |
| LlamaCppPath | C:\AIMAX392_Benchmark\llama.cpp |
| LlamaDevices | Available devices:<br>  Vulkan0: AMD Radeon(TM) 8060S Graphics (28491 MiB, 27067 MiB free) |
| BenchmarkBackend | Vulkan |
| BenchmarkThreads | 24 |
| GPUOffloadLayers | 999 |
| BatchSize | 2048 |
| UBatchSize | 512 |
| Repetitions | 3 |
| DelaySeconds | 3 |
| InputTokenSizes | 1024,2048,4096,8192,16384,32768 |
| GeneratedTokens | 300 |
| ParallelSlots | 1 |
| ContextSize | 1024=4096, 2048=4096, 4096=6144, 8192=10240, 16384=18432, 32768=34816 |
| RandomSeed | 1234 |

## Models

| Model | File | Size GiB | SHA256 |
|---|---|---:|---|
| Gemma 4 26B A4B | gemma-4-26B-A4B-it-UD-Q4_K_M.gguf | 15.784 | F2C28B3DC4776931AC6F879E11F203DEC637EA0F14267A86EC8F6165F63F293F |
| GPT-OSS 20B | gpt-oss-20b-Q4_K_M.gguf | 10.826 | C27536640E410032865DC68781D80A08B98F8DB5E93575919AF8CCC0568AEB4F |

## Formal NP1 API results

Each row is one model/input test. Values are aggregated from the completed trials shown in the Trials column.

| Model | Input | Output | Context | Trials | TTFT (ms) | TPOT (ms/token) | Throughput Aggregate (tokens/s) | Throughput Normalized (tokens/s/user) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Gemma 4 26B A4B | 1024 | 300 | 4096 | 3 | 3164.566633 | 21.2143 | 31.553564 | 31.553564 |
| Gemma 4 26B A4B | 2048 | 300 | 4096 | 3 | 5087.161333 | 21.60662 | 25.979558 | 25.979558 |
| Gemma 4 26B A4B | 4096 | 300 | 6144 | 3 | 8076.678533 | 22.164609 | 20.402755 | 20.402755 |
| Gemma 4 26B A4B | 8192 | 300 | 10240 | 3 | 17657.960533 | 23.266489 | 12.187868 | 12.187868 |
| Gemma 4 26B A4B | 16384 | 300 | 18432 | 3 | 54474.5445 | 25.765617 | 4.824822 | 4.824822 |
| Gemma 4 26B A4B | 32768 | 300 | 34816 | 3 | 202914.765267 | 31.231335 | 1.413408 | 1.413408 |
| GPT-OSS 20B | 1024 | 300 | 4096 | 3 | 832.8524 | 12.501142 | 65.635546 | 65.635546 |
| GPT-OSS 20B | 2048 | 300 | 4096 | 3 | 1485.435333 | 12.327534 | 58.01173 | 58.01173 |
| GPT-OSS 20B | 4096 | 300 | 6144 | 3 | 2817.1352 | 12.221843 | 46.357346 | 46.357346 |
| GPT-OSS 20B | 8192 | 300 | 10240 | 3 | 5841.464033 | 13.352223 | 30.507093 | 30.507093 |
| GPT-OSS 20B | 16384 | 300 | 18432 | 3 | 13559.434867 | 14.467332 | 16.773676 | 16.773676 |
| GPT-OSS 20B | 32768 | 300 | 34816 | 3 | 35558.6241 | 16.243203 | 7.422924 | 7.422924 |

## Validity checks

1. Compare only the same model, input length, output length, server context, and NP.
2. All model SHA256 values must match between machines.
3. Both machines must report build 10615, Vulkan, and Radeon 8060S.
4. Match AC power, Windows power mode, AMD driver, BIOS/UMA, and cooling.
5. Disclose RAM capacity/speed and unavoidable configuration differences.