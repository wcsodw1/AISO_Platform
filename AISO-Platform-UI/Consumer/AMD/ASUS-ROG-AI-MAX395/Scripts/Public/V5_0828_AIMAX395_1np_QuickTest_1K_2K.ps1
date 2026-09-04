<#
.SYNOPSIS
  Ryzen AI MAX+ 395 V5 quick llama.cpp Vulkan NP1 validation for 1K and 2K actual input tokens.

.DESCRIPTION
  Quick validation variant aligned with the V5 AI MAX+ 395 OneNP rerun. It uses
  Gemma 4 26B A4B and GPT-OSS 20B with actual 1K/2K input tokens,
  300 output tokens, NP=1, and the same formal metric definitions.

  1. Prepare
     - Creates the benchmark folder structure.
     - Installs llama.cpp b10615 from the official Windows Vulkan ZIP already
       downloaded to the current user's Downloads folder, or copies an existing
       b10615 installation from %USERPROFILE%\llama.cpp.
     - Downloads the fixed Gemma GGUF file with Hugging Face CLI (hf), or uvx
       when hf is not installed.
     - Verifies llama.cpp build, Vulkan device, model presence, and SHA256.

  2. RunServer (default)
     - Captures OS, CPU, memory, GPU driver, power plan, llama.cpp build, and
       Vulkan device information.
     - Runs the real llama-server NP1 API matrix for actual 1K/2K inputs.
     - Produces raw JSON/stderr logs, environment.json, model_hashes.csv,
       benchmark_summary.csv, and benchmark_report.md.

  3. RunBench / Run
     - RunBench executes only PP/TG diagnostics; Run executes both suites.

  4. Compare
     - Compares this machine's latest_summary.csv with the other machine's CSV.
     - Produces a Markdown comparison report with percentage differences.

  Test matrix (fixed on both machines):
    Backend          Vulkan
    llama.cpp        b10615
    GPU offload      -ngl 999
    Threads          all Windows logical processors
    Input tokens     1K and 2K actual prompt tokens
    Generated tokens 300
    Batch / ubatch   2048 / 512
    Repetitions      3
    Server context   4096 for both 1K and 2K inputs
    Windows power    High performance enforced by script
    OEM power mode   Performance/Turbo must be selected manually (not Silent)
    AMD driver       unchanged; current version is logged only
    VGM/Vulkan memory unchanged; current runtime state is logged only
    Server parallel  np=1
    Inter-test delay 3 seconds
    Warmup           llama-bench default warmup (enabled)

  Important scope:
    llama-bench reports raw prompt-processing and generation throughput.
    llama-server streams exact-length token-array prompts and reports TTFT,
    TPOT, Throughput Aggregate, and Throughput Normalized. Vulkan tests
    the Radeon GPU/CPU memory path, not the NPU.

.RUNNING COMMANDS
  Prepare llama.cpp and models:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\V5_0828_AIMAX395_1np_QuickTest_1K_2K.ps1 -Action Prepare

  Run the formal four-metric quick test:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\V5_0828_AIMAX395_1np_QuickTest_1K_2K.ps1 -Action RunServer

  Run one suite only:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\V5_0828_AIMAX395_1np_QuickTest_1K_2K.ps1 -Action RunBench
    powershell -NoProfile -ExecutionPolicy Bypass -File .\V5_0828_AIMAX395_1np_QuickTest_1K_2K.ps1 -Action RunServer

  Compare after copying the other machine's latest_summary.csv locally:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\V5_0828_AIMAX395_1np_QuickTest_1K_2K.ps1 -Action Compare -CompareCsv "D:\Transfer\MAX392_latest_summary.csv"

  Official references:
    https://github.com/ggml-org/llama.cpp/releases/tag/b10615
    https://github.com/ggml-org/llama.cpp/tree/master/tools/llama-bench
    https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md
    https://huggingface.co/unsloth/gemma-4-26B-A4B-it-GGUF
#>

[CmdletBinding()]
param(
    [ValidateSet("Prepare", "Run", "RunBench", "RunServer", "Compare")]
    [string]$Action = "RunServer",

    [string]$CompareCsv = "",

    [string]$BenchmarkRoot = "C:\AIMAX395_Benchmark",

    [string]$MachineName = "Ryzen AI MAX+ 395",

    # Driver and VGM/Vulkan memory are intentionally NOT changed in this V5 quick test.
    # OEM Silent/Performance mode is separate and must still be set to Performance/Turbo manually.
    [switch]$SkipWindowsHighPerformance
)

$ErrorActionPreference = "Stop"

# These are the only machine-specific settings.
$Root = $BenchmarkRoot
$MachineLabel = $MachineName
$ModelsDir = Join-Path $Root "models"
$LlamaFolderName = "llama-b10615-bin-win-vulkan-x64"
$LlamaDir = Join-Path $Root $LlamaFolderName
$ResultsRoot = Join-Path $Root "quick_results_1k_2k"
$LlamaBench = Join-Path $LlamaDir "llama-bench.exe"
$LlamaServer = Join-Path $LlamaDir "llama-server.exe"
$LlamaCli = Join-Path $LlamaDir "llama-cli.exe"
$ExpectedBuild = 10615
$LlamaZipName = "$LlamaFolderName.zip"
$LlamaZip = Join-Path (Join-Path $env:USERPROFILE "Downloads") $LlamaZipName
$ExistingLlamaDir = Join-Path $env:USERPROFILE "llama.cpp"

$Threads = [int]$env:NUMBER_OF_PROCESSORS
$InputTokenSizes = @(1024, 2048)
$GeneratedTokens = 300
$GpuLayers = 999
$BatchSize = 2048
$UBatchSize = 512
$Repetitions = 3
$DelaySeconds = 3
$ParallelSlots = 1
$ContextSize = 4096
$ServerPort = 8080
$ServerReadyTimeoutSeconds = 600
$RandomSeed = 1234
$WindowsHighPerformanceGuid = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"

$Models = @(
    [PSCustomObject]@{
        Name = "Gemma 4 26B A4B"
        Repo = "unsloth/gemma-4-26B-A4B-it-GGUF"
        File = "gemma-4-26B-A4B-it-UD-Q4_K_M.gguf"
    },
    [PSCustomObject]@{
        Name = "GPT-OSS 20B"
        Repo = "unsloth/gpt-oss-20b-GGUF"
        File = "gpt-oss-20b-Q4_K_M.gguf"
    }
)

function Write-Step {
    param([string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Write-Utf8Bom {
    param(
        [string]$Path,
        [string]$Content
    )
    $encoding = New-Object System.Text.UTF8Encoding($true)
    [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Ensure-Directories {
    foreach ($path in @($Root, $ModelsDir, $LlamaDir, $ResultsRoot)) {
        if (-not (Test-Path -LiteralPath $path)) {
            New-Item -ItemType Directory -Path $path -Force | Out-Null
        }
    }
}

function Invoke-NativeCapture {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,

        [string[]]$Arguments = @()
    )

    # Windows PowerShell 5.1 can turn native stderr output into a terminating
    # NativeCommandError when $ErrorActionPreference is Stop. llama.cpp prints
    # informational version/device lines to stderr, so capture both streams
    # directly and only fail when the native process returns a non-zero code.
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $FilePath
    $startInfo.Arguments = ($Arguments -join " ")
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.CreateNoWindow = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    [void]$process.Start()
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()

    $text = (($stdout, $stderr) -join [Environment]::NewLine).Trim()
    if ($process.ExitCode -ne 0) {
        throw "Native command failed with exit code $($process.ExitCode): $FilePath $($Arguments -join ' '). Output: $text"
    }

    return $text
}

function Get-LlamaVersionText {
    if (-not (Test-Path -LiteralPath $LlamaCli)) {
        return ""
    }
    return (Invoke-NativeCapture -FilePath $LlamaCli -Arguments @("--version"))
}

function Test-ExpectedLlamaBuild {
    $versionText = Get-LlamaVersionText
    return ($versionText -match ("build\s+" + $ExpectedBuild + "\b"))
}

function Install-LlamaCpp {
    Write-Step "Preparing llama.cpp b$ExpectedBuild (Windows x64 Vulkan)"

    if (Test-ExpectedLlamaBuild) {
        Write-Host "llama.cpp b$ExpectedBuild already exists at $LlamaDir"
        return
    }

    $existingCli = Join-Path $ExistingLlamaDir "llama-cli.exe"
    if (Test-Path -LiteralPath $existingCli) {
        $existingVersion = Invoke-NativeCapture -FilePath $existingCli -Arguments @("--version")
        if ($existingVersion -match ("build\s+" + $ExpectedBuild + "\b")) {
            Write-Host "Copying the existing verified b$ExpectedBuild installation from $ExistingLlamaDir"
            Copy-Item -Path (Join-Path $ExistingLlamaDir "*") -Destination $LlamaDir -Recurse -Force
        }
    }

    if (-not (Test-ExpectedLlamaBuild)) {
        if (-not (Test-Path -LiteralPath $LlamaZip)) {
            throw "Missing $LlamaZipName. Download the official Windows x64 Vulkan ZIP and place it in $LlamaZip"
        }
        Write-Host "Extracting $LlamaZip"
        Expand-Archive -LiteralPath $LlamaZip -DestinationPath $LlamaDir -Force
    }

    if (-not (Test-ExpectedLlamaBuild)) {
        throw "llama.cpp setup completed, but the detected build is not b$ExpectedBuild. Remove $LlamaDir and use the exact $LlamaZipName archive."
    }

    foreach ($exe in @($LlamaBench, $LlamaServer, $LlamaCli)) {
        if (-not (Test-Path -LiteralPath $exe)) {
            throw "Required executable was not found: $exe"
        }
    }

    Write-Host (Get-LlamaVersionText) -ForegroundColor Green
}

function Invoke-HfDownload {
    param([PSCustomObject]$Model)

    $destination = Join-Path $ModelsDir $Model.File
    if (Test-Path -LiteralPath $destination) {
        Write-Host "Model already exists: $($Model.File)"
        return
    }

    Write-Step "Downloading $($Model.Name)"
    $hfArgs = @("download", $Model.Repo, $Model.File, "--local-dir", $ModelsDir)

    if (Get-Command "hf" -ErrorAction SilentlyContinue) {
        & hf @hfArgs
    }
    elseif (Get-Command "uvx" -ErrorAction SilentlyContinue) {
        $uvArgs = @("--from", "huggingface_hub", "hf") + $hfArgs
        & uvx @uvArgs
    }
    else {
        throw "Neither hf nor uvx is installed. Install uv first with: winget install --id astral-sh.uv -e"
    }

    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $destination)) {
        throw "Download failed or the expected file was not created: $destination"
    }
}

function Get-ModelInventory {
    $rows = @()
    foreach ($model in $Models) {
        $path = Join-Path $ModelsDir $model.File
        if (-not (Test-Path -LiteralPath $path)) {
            throw "Missing model: $path. Run this script with -Action Prepare first."
        }
        $file = Get-Item -LiteralPath $path
        $hash = Get-FileHash -LiteralPath $path -Algorithm SHA256
        $rows += [PSCustomObject]@{
            Machine = $MachineLabel
            ModelName = $model.Name
            Repository = $model.Repo
            FileName = $model.File
            FullPath = $path
            SizeBytes = $file.Length
            SizeGiB = [math]::Round($file.Length / 1GB, 3)
            SHA256 = $hash.Hash
        }
    }
    return $rows
}

function Set-WindowsBenchmarkPowerPlan {
    if ($SkipWindowsHighPerformance) {
        Write-Warning "Skipping Windows High performance power-plan enforcement by request."
        return
    }

    Write-Step "Setting Windows power plan to High performance"
    & powercfg /setactive $WindowsHighPerformanceGuid | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to activate the Windows High performance power plan. Run PowerShell as Administrator or set the power plan manually."
    }

    $active = ((powercfg /GETACTIVESCHEME 2>&1 | Out-String).Trim())
    Write-Host "Windows power plan: $active" -ForegroundColor Green
    Write-Warning "OEM thermal/performance mode is independent of Windows powercfg. Before the quick test, set the machine vendor's mode to Performance/Turbo, not Silent."
}

function Get-EnvironmentRecord {
    $os = Get-CimInstance Win32_OperatingSystem
    $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
    $computer = Get-CimInstance Win32_ComputerSystem
    $memory = Get-CimInstance Win32_PhysicalMemory
    $gpus = Get-CimInstance Win32_VideoController
    $powerPlan = ((powercfg /GETACTIVESCHEME 2>&1 | Out-String).Trim())
    $deviceText = Invoke-NativeCapture -FilePath $LlamaCli -Arguments @("--list-devices")
    $versionText = Get-LlamaVersionText

    $memoryModules = @($memory | ForEach-Object {
        "{0} GiB @ configured {1} MT/s (reported {2} MT/s)" -f ([math]::Round($_.Capacity / 1GB, 2)), $_.ConfiguredClockSpeed, $_.Speed
    }) -join "; "

    $gpuRecords = @($gpus | ForEach-Object {
        "{0}; driver={1}; adapterRAM={2} GiB" -f $_.Name, $_.DriverVersion, ([math]::Round($_.AdapterRAM / 1GB, 2))
    }) -join " | "

    return [PSCustomObject][ordered]@{
        MachineLabel = $MachineLabel
        ComputerName = $env:COMPUTERNAME
        CapturedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz")
        Manufacturer = $computer.Manufacturer
        Model = $computer.Model
        OperatingSystem = $os.Caption
        OSVersion = $os.Version
        OSBuild = $os.BuildNumber
        CPU = $cpu.Name
        PhysicalCores = $cpu.NumberOfCores
        LogicalProcessors = $cpu.NumberOfLogicalProcessors
        MaxClockMHz = $cpu.MaxClockSpeed
        TotalPhysicalMemoryGiB = [math]::Round($computer.TotalPhysicalMemory / 1GB, 2)
        MemoryModules = $memoryModules
        VideoControllers = $gpuRecords
        ActivePowerPlan = $powerPlan
        DriverPolicy = "unchanged; logged only"
        VgmVulkanMemoryPolicy = "unchanged; runtime device report logged only"
        LlamaCppVersion = $versionText
        LlamaCppPath = $LlamaDir
        LlamaDevices = $deviceText
        BenchmarkBackend = "Vulkan"
        BenchmarkThreads = $Threads
        GPUOffloadLayers = $GpuLayers
        BatchSize = $BatchSize
        UBatchSize = $UBatchSize
        Repetitions = $Repetitions
        DelaySeconds = $DelaySeconds
        InputTokenSizes = ($InputTokenSizes -join ",")
        GeneratedTokens = $GeneratedTokens
        ParallelSlots = $ParallelSlots
        ContextSize = $ContextSize
        RandomSeed = $RandomSeed
    }
}

function Assert-BenchmarkReady {
    Ensure-Directories

    foreach ($exe in @($LlamaBench, $LlamaServer, $LlamaCli)) {
        if (-not (Test-Path -LiteralPath $exe)) {
            throw "llama.cpp executable is missing: $exe. Run -Action Prepare first."
        }
    }

    if (-not (Test-ExpectedLlamaBuild)) {
        throw "Wrong llama.cpp build. This protocol requires b$ExpectedBuild exactly. Detected: $(Get-LlamaVersionText)"
    }

    $devices = Invoke-NativeCapture -FilePath $LlamaCli -Arguments @("--list-devices")
    if ($devices -notmatch "Vulkan") {
        throw "No Vulkan device was detected by llama.cpp. Output: $devices"
    }
    if ($devices -notmatch "8060S") {
        Write-Warning "Vulkan was detected, but Radeon 8060S was not found. Verify the target hardware before comparing results."
    }
    if ($Threads -le 0) {
        throw "NUMBER_OF_PROCESSORS did not return a valid logical processor count."
    }

    foreach ($model in $Models) {
        $modelPath = Join-Path $ModelsDir $model.File
        if (-not (Test-Path -LiteralPath $modelPath)) {
            throw "Missing model: $modelPath. Run this script with -Action Prepare first."
        }
    }
}

function Get-Mean {
    param([double[]]$Values)
    if ($Values.Count -eq 0) { return 0.0 }
    return [double](($Values | Measure-Object -Average).Average)
}

function Get-SampleStdDev {
    param([double[]]$Values)
    if ($Values.Count -lt 2) { return 0.0 }
    $mean = Get-Mean $Values
    $sum = 0.0
    foreach ($value in $Values) {
        $sum += [math]::Pow($value - $mean, 2)
    }
    return [math]::Sqrt($sum / ($Values.Count - 1))
}

function New-SummaryRow {
    param(
        [string]$Suite,
        [PSCustomObject]$ModelRecord,
        [string]$Test,
        [int]$InputTokens,
        [int]$OutputTokens,
        [string]$Metric,
        [double]$Average,
        [double]$StdDev,
        [string]$Unit,
        [double[]]$Samples
    )
    return [PSCustomObject][ordered]@{
        Machine = $MachineLabel
        Suite = $Suite
        ModelName = $ModelRecord.ModelName
        ModelFile = $ModelRecord.FileName
        ModelSHA256 = $ModelRecord.SHA256
        Test = $Test
        InputTokens = $InputTokens
        OutputTokens = $OutputTokens
        Metric = $Metric
        Average = [math]::Round($Average, 6)
        StdDev = [math]::Round($StdDev, 6)
        Unit = $Unit
        Samples = (@($Samples) | ForEach-Object { [math]::Round([double]$_, 6) }) -join ";"
        Threads = $Threads
        NP = $ParallelSlots
        ContextSize = $ContextSize
        GPULayers = $GpuLayers
        Batch = $BatchSize
        UBatch = $UBatchSize
        LlamaBuild = $ExpectedBuild
    }
}

function Convert-BenchmarkRows {
    param([object[]]$RawRows, [PSCustomObject]$ModelRecord)
    $converted = @()
    foreach ($row in $RawRows) {
        $prompt = [int]$row.n_prompt
        $gen = [int]$row.n_gen
        $depth = 0
        if ($null -ne $row.n_depth) { $depth = [int]$row.n_depth }
        $samples = @($row.samples_ts | ForEach-Object { [double]$_ })

        if ($prompt -gt 0 -and $gen -eq 0) {
            $testName = "pp$prompt"
            $metric = "PromptProcessingTokensPerSecond"
            $input = $prompt
        }
        elseif ($gen -gt 0 -and $depth -gt 0) {
            $testName = "tg$gen@d$depth"
            $metric = "GenerationTokensPerSecond"
            $input = $depth
        }
        elseif ($gen -gt 0) {
            $testName = "tg$gen"
            $metric = "GenerationTokensPerSecond"
            $input = $prompt
        }
        else {
            continue
        }

        $rowArgs = @{
            Suite = "llama-bench-diagnostic"
            ModelRecord = $ModelRecord
            Test = $testName
            InputTokens = $input
            OutputTokens = $gen
            Metric = $metric
            Average = [double]$row.avg_ts
            StdDev = [double]$row.stddev_ts
            Unit = "tokens/s"
            Samples = $samples
        }
        $converted += New-SummaryRow @rowArgs
    }
    return $converted
}

function Invoke-LlamaBenchSuite {
    param([string]$RunDir, [object[]]$ModelInventory)
    $summary = @()
    $tokenCsv = $InputTokenSizes -join ","

    foreach ($model in $Models) {
        $modelRecord = $ModelInventory | Where-Object FileName -eq $model.File | Select-Object -First 1
        $modelPath = Join-Path $ModelsDir $model.File
        $safeName = $model.File -replace "\.gguf$", ""
        $cases = @(
            [PSCustomObject]@{ Name = "prompt_processing"; Args = @("-p", $tokenCsv, "-n", "0") },
            [PSCustomObject]@{ Name = "generation_by_context_depth"; Args = @("-p", "0", "-n", "$GeneratedTokens", "-d", $tokenCsv) }
        )

        foreach ($case in $cases) {
            Write-Step "llama-bench diagnostic: $($model.Name) / $($case.Name)"
            $jsonPath = Join-Path $RunDir ($safeName + "_bench_" + $case.Name + ".json")
            $stderrPath = Join-Path $RunDir ($safeName + "_bench_" + $case.Name + "_stderr.txt")
            $benchArgs = @("-m", $modelPath) + $case.Args + @(
                "-ngl", "$GpuLayers", "-t", "$Threads", "-b", "$BatchSize",
                "-ub", "$UBatchSize", "-r", "$Repetitions",
                "--delay", "$DelaySeconds", "-o", "json"
            )
            $jsonText = (& $LlamaBench @benchArgs 2> $stderrPath | Out-String)
            $exitCode = $LASTEXITCODE
            Write-Utf8Bom -Path $jsonPath -Content $jsonText
            if ($exitCode -ne 0) {
                throw "llama-bench failed for $($model.Name), $($case.Name). See $stderrPath"
            }
            try { $rawRows = @($jsonText | ConvertFrom-Json) }
            catch { throw "Could not parse llama-bench JSON: $jsonPath" }
            $summary += @(Convert-BenchmarkRows -RawRows $rawRows -ModelRecord $modelRecord)
        }
    }
    return $summary
}

function Wait-ServerReady {
    param([int]$Port, [System.Diagnostics.Process]$Process)
    $deadline = (Get-Date).AddSeconds($ServerReadyTimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if ($Process.HasExited) {
            throw "llama-server exited before it became ready. Exit code: $($Process.ExitCode)"
        }
        try {
            $health = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 5
            if ($health.status -eq "ok") { return }
        }
        catch { Start-Sleep -Seconds 2 }
    }
    throw "llama-server did not become ready within $ServerReadyTimeoutSeconds seconds."
}

function Get-ExactPromptTokens {
    param([int]$Port)
    $maxTokens = ($InputTokenSizes | Measure-Object -Maximum).Maximum
    $unit = "Deterministic benchmark input used only for repeatable performance measurement. "
    $repeatCount = [math]::Ceiling(($maxTokens * 8) / $unit.Length)
    $content = $unit * $repeatCount

    while ($true) {
        $body = @{ content = $content; add_special = $false } | ConvertTo-Json -Compress
        $invokeArgs = @{
            Method = "Post"
            Uri = "http://127.0.0.1:$Port/tokenize"
            ContentType = "application/json"
            Body = $body
            TimeoutSec = 600
        }
        $response = Invoke-RestMethod @invokeArgs
        $tokens = @($response.tokens)
        if ($tokens.Count -ge $maxTokens) {
            return $tokens[0..($maxTokens - 1)]
        }
        $content += $content
    }
}

function Invoke-StreamingCompletion {
    param([int]$Port, [int[]]$PromptTokens, [string]$RawPath)
    $payload = [ordered]@{
        prompt = $PromptTokens
        n_predict = $GeneratedTokens
        stream = $true
        cache_prompt = $false
        ignore_eos = $true
        temperature = 0
        seed = $RandomSeed
        timings_per_token = $false
    } | ConvertTo-Json -Compress -Depth 5

    $request = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$Port/completion")
    $request.Method = "POST"
    $request.ContentType = "application/json"
    $request.Timeout = 3600000
    $request.ReadWriteTimeout = 3600000
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
    $request.ContentLength = $bytes.Length
    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    $requestStream = $request.GetRequestStream()
    try { $requestStream.Write($bytes, 0, $bytes.Length) }
    finally { $requestStream.Dispose() }

    $response = $request.GetResponse()
    $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
    $rawLines = New-Object System.Collections.Generic.List[string]
    $firstTokenMs = $null
    $finalObject = $null

    try {
        while (-not $reader.EndOfStream) {
            $line = $reader.ReadLine()
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            [void]$rawLines.Add($line)
            $jsonLine = $line.Trim()
            if ($jsonLine.StartsWith("data:")) { $jsonLine = $jsonLine.Substring(5).Trim() }
            if ($jsonLine -eq "[DONE]") { continue }
            try { $chunk = $jsonLine | ConvertFrom-Json }
            catch { continue }
            if ($null -eq $firstTokenMs -and -not [string]::IsNullOrEmpty([string]$chunk.content)) {
                $firstTokenMs = $watch.Elapsed.TotalMilliseconds
            }
            if ($null -ne $chunk.timings) { $finalObject = $chunk }
        }
    }
    finally {
        $watch.Stop()
        $reader.Dispose()
        $response.Dispose()
        Write-Utf8Bom -Path $RawPath -Content ($rawLines -join [Environment]::NewLine)
    }

    if ($null -eq $firstTokenMs) { throw "No streamed output token was received. See $RawPath" }
    if ($null -eq $finalObject -or $null -eq $finalObject.timings) {
        throw "No final timings object was received. See $RawPath"
    }

    $predictedN = [int]$finalObject.timings.predicted_n
    $e2eMs = [double]$watch.Elapsed.TotalMilliseconds
    if ($predictedN -le 1 -or $e2eMs -le [double]$firstTokenMs) {
        throw "Insufficient output for TPOT calculation. See $RawPath"
    }
    $tpotMs = ($e2eMs - [double]$firstTokenMs) / ($predictedN - 1)
    $aggregateTps = $predictedN / ($e2eMs / 1000.0)
    $normalizedTps = ($predictedN - 1) / (($e2eMs - [double]$firstTokenMs) / 1000.0)

    return [PSCustomObject][ordered]@{
        TTFTms = [double]$firstTokenMs
        TPOTms = [double]$tpotMs
        EndToEndMs = $e2eMs
        AggregateThroughput = [double]$aggregateTps
        NormalizedThroughput = [double]$normalizedTps
        PromptN = [int]$finalObject.timings.prompt_n
        CacheN = [int]$finalObject.timings.cache_n
        PromptMs = [double]$finalObject.timings.prompt_ms
        ServerPrefillTokensPerSecond = [double]$finalObject.timings.prompt_per_second
        PredictedN = $predictedN
        PredictedMs = [double]$finalObject.timings.predicted_ms
        ServerGenerationTokensPerSecond = [double]$finalObject.timings.predicted_per_second
    }
}

function Convert-ServerTrials {
    param([object[]]$Trials, [PSCustomObject]$ModelRecord)
    $summary = @()
    foreach ($inputSize in $InputTokenSizes) {
        $caseRows = @($Trials | Where-Object InputTokens -eq $inputSize)
        $ttft = @($caseRows | ForEach-Object { [double]$_.TTFTms })
        $tpot = @($caseRows | ForEach-Object { [double]$_.TPOTms })
        $aggregateSamples = @($caseRows | ForEach-Object { [double]$_.AggregateThroughput })
        $normalized = @($caseRows | ForEach-Object { [double]$_.NormalizedThroughput })
        $totalTokens = ($caseRows | Measure-Object -Property PredictedN -Sum).Sum
        $totalMeasuredMs = ($caseRows | Measure-Object -Property EndToEndMs -Sum).Sum
        $officialAggregate = [double]$totalTokens / ([double]$totalMeasuredMs / 1000.0)
        $testName = "input" + $inputSize + "_output" + $GeneratedTokens
        $definitions = @(
            [PSCustomObject]@{ Metric = "TTFT"; Average = (Get-Mean $ttft); StdDev = (Get-SampleStdDev $ttft); Unit = "ms"; Samples = $ttft },
            [PSCustomObject]@{ Metric = "TPOT"; Average = (Get-Mean $tpot); StdDev = (Get-SampleStdDev $tpot); Unit = "ms/token"; Samples = $tpot },
            [PSCustomObject]@{ Metric = "ThroughputAggregate"; Average = $officialAggregate; StdDev = (Get-SampleStdDev $aggregateSamples); Unit = "tokens/s"; Samples = $aggregateSamples },
            [PSCustomObject]@{ Metric = "ThroughputNormalized"; Average = (Get-Mean $normalized); StdDev = (Get-SampleStdDev $normalized); Unit = "tokens/s/user"; Samples = $normalized }
        )
        foreach ($definition in $definitions) {
            $rowArgs = @{
                Suite = "llama-server-np1"
                ModelRecord = $ModelRecord
                Test = $testName
                InputTokens = $inputSize
                OutputTokens = $GeneratedTokens
                Metric = $definition.Metric
                Average = $definition.Average
                StdDev = $definition.StdDev
                Unit = $definition.Unit
                Samples = $definition.Samples
            }
            $summary += New-SummaryRow @rowArgs
        }
    }
    return $summary
}

function Invoke-LlamaServerSuite {
    param([string]$RunDir, [object[]]$ModelInventory)
    $summary = @()
    foreach ($model in $Models) {
        $modelRecord = $ModelInventory | Where-Object FileName -eq $model.File | Select-Object -First 1
        $modelPath = Join-Path $ModelsDir $model.File
        $safeName = $model.File -replace "\.gguf$", ""
        $stdoutPath = Join-Path $RunDir ($safeName + "_server_stdout.txt")
        $stderrPath = Join-Path $RunDir ($safeName + "_server_stderr.txt")
        $serverArgs = @(
            "-m", $modelPath, "-c", "$ContextSize", "-np", "$ParallelSlots",
            "-ngl", "$GpuLayers", "-t", "$Threads", "-b", "$BatchSize",
            "-ub", "$UBatchSize", "--host", "127.0.0.1", "--port", "$ServerPort"
        )

        Write-Step "Starting llama-server np1: $($model.Name)"
        $startArgs = @{
            FilePath = $LlamaServer
            ArgumentList = $serverArgs
            PassThru = $true
            RedirectStandardOutput = $stdoutPath
            RedirectStandardError = $stderrPath
            WindowStyle = "Hidden"
        }
        $process = Start-Process @startArgs
        try {
            Wait-ServerReady -Port $ServerPort -Process $process
            $allTokens = @(Get-ExactPromptTokens -Port $ServerPort)
            $trials = @()
            foreach ($inputSize in $InputTokenSizes) {
                $promptTokens = [int[]]$allTokens[0..($inputSize - 1)]
                for ($trial = 1; $trial -le $Repetitions; $trial++) {
                    Write-Host "API $($model.Name): input=$inputSize, output=$GeneratedTokens, NP=$ParallelSlots, trial=$trial/$Repetitions"
                    $rawPath = Join-Path $RunDir ($safeName + "_server_input" + $inputSize + "_trial" + $trial + ".jsonl")
                    $result = Invoke-StreamingCompletion -Port $ServerPort -PromptTokens $promptTokens -RawPath $rawPath
                    $trials += [PSCustomObject][ordered]@{
                        Machine = $MachineLabel
                        ModelName = $model.Name
                        ModelFile = $model.File
                        InputTokens = $inputSize
                        OutputTokensRequested = $GeneratedTokens
                        Trial = $trial
                        TTFTms = [math]::Round($result.TTFTms, 6)
                        TPOTms = [math]::Round($result.TPOTms, 6)
                        EndToEndMs = [math]::Round($result.EndToEndMs, 6)
                        AggregateThroughput = [math]::Round($result.AggregateThroughput, 6)
                        NormalizedThroughput = [math]::Round($result.NormalizedThroughput, 6)
                        PromptN = $result.PromptN
                        CacheN = $result.CacheN
                        PromptMs = [math]::Round($result.PromptMs, 6)
                        ServerPrefillTokensPerSecond = [math]::Round($result.ServerPrefillTokensPerSecond, 6)
                        PredictedN = $result.PredictedN
                        PredictedMs = [math]::Round($result.PredictedMs, 6)
                        ServerGenerationTokensPerSecond = [math]::Round($result.ServerGenerationTokensPerSecond, 6)
                    }
                    Start-Sleep -Seconds $DelaySeconds
                }
            }
            $trials | Export-Csv -Path (Join-Path $RunDir ($safeName + "_server_trials.csv")) -NoTypeInformation -Encoding UTF8
            $summary += @(Convert-ServerTrials -Trials $trials -ModelRecord $modelRecord)
        }
        finally {
            if ($null -ne $process -and -not $process.HasExited) {
                Stop-Process -Id $process.Id -Force
                $process.WaitForExit()
            }
        }
    }
    return $summary
}
function New-BenchmarkReport {
    param(
        [string]$Path,
        [PSCustomObject]$Environment,
        [object[]]$ModelInventory,
        [object[]]$Summary
    )

    $formalRows = @($Summary | Where-Object Suite -eq "llama-server-np1")
    $diagnosticRows = @($Summary | Where-Object Suite -eq "llama-bench-diagnostic")
    $lines = New-Object System.Collections.Generic.List[string]
    [void]$lines.Add("# $MachineLabel V5 Quick llama.cpp Vulkan NP1 Benchmark Report")
    [void]$lines.Add("")
    [void]$lines.Add("Generated: $($Environment.CapturedAt)")
    [void]$lines.Add("")
    [void]$lines.Add("## Formal comparison metrics")
    [void]$lines.Add("")
    [void]$lines.Add("- TTFT (ms): request start to first non-empty streamed output token; lower is better.")
    [void]$lines.Add("- TPOT (ms/token): (end-to-end latency - TTFT) / (output tokens - 1); lower is better.")
    [void]$lines.Add("- Throughput Aggregate (tokens/s): all measured output tokens / sum of measured end-to-end request durations; higher is better.")
    [void]$lines.Add("- Throughput Normalized (tokens/s/user): per-user generation rate excluding TTFT and the first token, approximately 1000 / TPOT; higher is better.")
    [void]$lines.Add("")
    [void]$lines.Add("At NP=1, Aggregate and Normalized still differ: Aggregate includes prefill/TTFT; Normalized isolates streamed generation.")
    [void]$lines.Add("")
    [void]$lines.Add("## Fixed protocol")
    [void]$lines.Add("")
    [void]$lines.Add("| Variable | Value |")
    [void]$lines.Add("|---|---|")
    [void]$lines.Add("| llama.cpp | b$ExpectedBuild Windows x64 Vulkan |")
    [void]$lines.Add("| Threads | $Threads (all Windows logical processors) |")
    [void]$lines.Add("| Windows power plan | $($Environment.ActivePowerPlan) |")
    [void]$lines.Add("| AMD driver | current installed version; unchanged for this V5 quick test |")
    [void]$lines.Add("| VGM / Vulkan memory | unchanged from current system configuration |")
    [void]$lines.Add("| GPU offload | -ngl $GpuLayers |")
    [void]$lines.Add("| Actual input tokens | $($InputTokenSizes -join ', ') |")
    [void]$lines.Add("| Output tokens | $GeneratedTokens |")
    [void]$lines.Add("| Batch / ubatch | $BatchSize / $UBatchSize |")
    [void]$lines.Add("| Repetitions | $Repetitions |")
    [void]$lines.Add("| Server context / parallel slots | $ContextSize (1K/2K) / $ParallelSlots |")
    [void]$lines.Add("| Prompt cache | disabled |")
    [void]$lines.Add("| Sampling | temperature 0; seed $RandomSeed; EOS ignored until output target |")
    [void]$lines.Add("")
    [void]$lines.Add("## Environment")
    [void]$lines.Add("")
    [void]$lines.Add("| Field | Value |")
    [void]$lines.Add("|---|---|")
    foreach ($property in $Environment.PSObject.Properties) {
        $value = ([string]$property.Value).Replace("|", "\|").Replace([Environment]::NewLine, "<br>")
        [void]$lines.Add("| $($property.Name) | $value |")
    }
    [void]$lines.Add("")
    [void]$lines.Add("## Models")
    [void]$lines.Add("")
    [void]$lines.Add("| Model | File | Size GiB | SHA256 |")
    [void]$lines.Add("|---|---|---:|---|")
    foreach ($model in $ModelInventory) {
        [void]$lines.Add("| $($model.ModelName) | $($model.FileName) | $($model.SizeGiB) | $($model.SHA256) |")
    }
    [void]$lines.Add("")
    [void]$lines.Add("## Formal NP1 API results")
    [void]$lines.Add("")
    [void]$lines.Add("| Model | Input | Output | Metric | Average | StdDev | Unit |")
    [void]$lines.Add("|---|---:|---:|---|---:|---:|---|")
    foreach ($row in $formalRows) {
        [void]$lines.Add("| $($row.ModelName) | $($row.InputTokens) | $($row.OutputTokens) | $($row.Metric) | $($row.Average) | $($row.StdDev) | $($row.Unit) |")
    }
    [void]$lines.Add("")
    [void]$lines.Add("## llama-bench diagnostics")
    [void]$lines.Add("")
    [void]$lines.Add("These PP/TG rows are low-level diagnostics and are not substitutes for the four formal API metrics.")
    [void]$lines.Add("")
    [void]$lines.Add("| Model | Test | Diagnostic metric | Average | StdDev | Unit |")
    [void]$lines.Add("|---|---|---|---:|---:|---|")
    foreach ($row in $diagnosticRows) {
        [void]$lines.Add("| $($row.ModelName) | $($row.Test) | $($row.Metric) | $($row.Average) | $($row.StdDev) | $($row.Unit) |")
    }
    [void]$lines.Add("")
    [void]$lines.Add("## Validity checks")
    [void]$lines.Add("")
    [void]$lines.Add("1. Compare only the same model, input length, output length, and metric.")
    [void]$lines.Add("2. All model SHA256 values must match between machines.")
    [void]$lines.Add("3. Both machines must report build $ExpectedBuild, Vulkan, and Radeon 8060S.")
    [void]$lines.Add("4. Use AC power and Performance/Turbo mode on the AI MAX+ 395; this script enforces Windows High performance.")
    [void]$lines.Add("5. Driver and VGM/Vulkan memory are intentionally unchanged in this V5 quick rerun; disclose them when comparing results.")
    [void]$lines.Add("6. Inspect server trial CSV if PromptN or PredictedN differs from the target.")

    Write-Utf8Bom -Path $Path -Content ($lines -join [Environment]::NewLine)
}

function Invoke-BenchmarkRun {
    param([bool]$RunBench, [bool]$RunServer)
    Set-WindowsBenchmarkPowerPlan
    Assert-BenchmarkReady
    $stamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $runDir = Join-Path $ResultsRoot $stamp
    New-Item -ItemType Directory -Path $runDir -Force | Out-Null

    Write-Step "Capturing environment and model hashes"
    $environment = Get-EnvironmentRecord
    Write-Utf8Bom -Path (Join-Path $runDir "environment.json") -Content ($environment | ConvertTo-Json -Depth 6)
    $modelInventory = @(Get-ModelInventory)
    $modelInventory | Export-Csv -Path (Join-Path $runDir "model_hashes.csv") -NoTypeInformation -Encoding UTF8

    $summary = @()
    if ($RunBench) { $summary += @(Invoke-LlamaBenchSuite -RunDir $runDir -ModelInventory $modelInventory) }
    if ($RunServer) { $summary += @(Invoke-LlamaServerSuite -RunDir $runDir -ModelInventory $modelInventory) }

    $summaryPath = Join-Path $runDir "benchmark_summary.csv"
    $reportPath = Join-Path $runDir "benchmark_report.md"
    $summary | Export-Csv -Path $summaryPath -NoTypeInformation -Encoding UTF8
    New-BenchmarkReport -Path $reportPath -Environment $environment -ModelInventory $modelInventory -Summary $summary

    Copy-Item -LiteralPath $summaryPath -Destination (Join-Path $ResultsRoot "latest_summary.csv") -Force
    Copy-Item -LiteralPath $reportPath -Destination (Join-Path $ResultsRoot "latest_report.md") -Force
    Copy-Item -LiteralPath (Join-Path $runDir "environment.json") -Destination (Join-Path $ResultsRoot "latest_environment.json") -Force
    Copy-Item -LiteralPath (Join-Path $runDir "model_hashes.csv") -Destination (Join-Path $ResultsRoot "latest_model_hashes.csv") -Force

    Write-Host ([Environment]::NewLine + "Benchmark completed.") -ForegroundColor Green
    Write-Host "Report : $reportPath"
    Write-Host "CSV    : $summaryPath"
}
function Get-SafeFileName {
    param([string]$Name)
    return ($Name -replace '[^A-Za-z0-9._-]', '_')
}

function New-ComparisonReport {
    param([string]$LocalCsv, [string]$OtherCsv)
    if (-not (Test-Path -LiteralPath $LocalCsv)) { throw "Missing local CSV: $LocalCsv" }
    if (-not (Test-Path -LiteralPath $OtherCsv)) { throw "Missing comparison CSV: $OtherCsv" }

    $localRows = @(Import-Csv -LiteralPath $LocalCsv)
    $otherRows = @(Import-Csv -LiteralPath $OtherCsv)
    if ($localRows.Count -eq 0 -or $otherRows.Count -eq 0) { throw "A comparison CSV is empty." }

    $localMachine = $localRows[0].Machine
    $otherMachine = $otherRows[0].Machine
    $lines = New-Object System.Collections.Generic.List[string]
    [void]$lines.Add("# MAX+ 395 vs MAX+ 392 Benchmark Comparison")
    [void]$lines.Add("")
    [void]$lines.Add("Local: **$localMachine**; Other: **$otherMachine**")
    [void]$lines.Add("")
    [void]$lines.Add("For TTFT/TPOT, lower is better. For both Throughput metrics and diagnostics, higher is better.")
    [void]$lines.Add("")
    [void]$lines.Add("| Suite | Model | Test | Metric | Local | Other | Difference | Better | Hash match |")
    [void]$lines.Add("|---|---|---|---|---:|---:|---:|---|---|")

    foreach ($local in $localRows) {
        $other = $otherRows | Where-Object {
            $_.Suite -eq $local.Suite -and $_.ModelName -eq $local.ModelName -and
            $_.Test -eq $local.Test -and $_.Metric -eq $local.Metric
        } | Select-Object -First 1
        if ($null -eq $other) {
            [void]$lines.Add("| $($local.Suite) | $($local.ModelName) | $($local.Test) | $($local.Metric) | $($local.Average) | missing | n/a | n/a | n/a |")
            continue
        }

        $localValue = [double]$local.Average
        $otherValue = [double]$other.Average
        $deltaText = "n/a"
        if ($otherValue -ne 0) {
            $delta = (($localValue - $otherValue) / $otherValue) * 100
            $deltaText = ("{0:+0.00;-0.00;0.00}%" -f $delta)
        }

        $lowerIsBetter = ($local.Metric -eq "TTFT" -or $local.Metric -eq "TPOT")
        if ($localValue -eq $otherValue) {
            $better = "Tie"
        }
        elseif (($lowerIsBetter -and $localValue -lt $otherValue) -or (-not $lowerIsBetter -and $localValue -gt $otherValue)) {
            $better = $localMachine
        }
        else {
            $better = $otherMachine
        }

        $hashMatch = ($local.ModelSHA256 -eq $other.ModelSHA256)
        [void]$lines.Add("| $($local.Suite) | $($local.ModelName) | $($local.Test) | $($local.Metric) | $localValue | $otherValue | $deltaText | $better | $hashMatch |")
    }

    [void]$lines.Add("")
    [void]$lines.Add("Do not interpret rows with mismatched hashes. Review both environment JSON files before attributing differences to the processor.")
    $safeOther = Get-SafeFileName $otherMachine
    $outputPath = Join-Path $ResultsRoot ("comparison_vs_" + $safeOther + ".md")
    Write-Utf8Bom -Path $outputPath -Content ($lines -join [Environment]::NewLine)
    Write-Host "Comparison report: $outputPath" -ForegroundColor Green
}
function Invoke-Prepare {
    Ensure-Directories
    Install-LlamaCpp

    foreach ($model in $Models) {
        Invoke-HfDownload -Model $model
    }

    Assert-BenchmarkReady
    Write-Step "Calculating model SHA256 hashes"
    $inventory = @(Get-ModelInventory)
    $inventory | Format-Table ModelName, FileName, SizeGiB, SHA256 -AutoSize

    $scriptName = Split-Path -Leaf $PSCommandPath
    $commands = @"
PREPARE
powershell -NoProfile -ExecutionPolicy Bypass -File "$PSCommandPath" -Action Prepare

RUN FORMAL QUICK TEST (recommended)
powershell -NoProfile -ExecutionPolicy Bypass -File "$PSCommandPath" -Action RunServer

RUN LLAMA-BENCH DIAGNOSTIC ONLY
powershell -NoProfile -ExecutionPolicy Bypass -File "$PSCommandPath" -Action RunBench

RUN FORMAL LLAMA-SERVER NP1 ONLY
powershell -NoProfile -ExecutionPolicy Bypass -File "$PSCommandPath" -Action RunServer

COMPARE
powershell -NoProfile -ExecutionPolicy Bypass -File "$PSCommandPath" -Action Compare -CompareCsv "D:\Transfer\OTHER_latest_summary.csv"
"@
    Write-Utf8Bom -Path (Join-Path $Root "RUNNING_CMD.txt") -Content $commands

    Write-Host "`nPreparation completed for $MachineLabel." -ForegroundColor Green
    Write-Host "Logical processors used: $Threads"
    Write-Host "Run: powershell -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Action RunServer"
}

Ensure-Directories

switch ($Action) {
    "Prepare" {
        Invoke-Prepare
    }
    "Run" {
        Invoke-BenchmarkRun -RunBench $true -RunServer $true
    }
    "RunBench" {
        Invoke-BenchmarkRun -RunBench $true -RunServer $false
    }
    "RunServer" {
        Invoke-BenchmarkRun -RunBench $false -RunServer $true
    }
    "Compare" {
        if ([string]::IsNullOrWhiteSpace($CompareCsv)) {
            throw "-CompareCsv is required for -Action Compare."
        }
        $localCsv = Join-Path $ResultsRoot "latest_summary.csv"
        New-ComparisonReport -LocalCsv $localCsv -OtherCsv $CompareCsv
    }
}
