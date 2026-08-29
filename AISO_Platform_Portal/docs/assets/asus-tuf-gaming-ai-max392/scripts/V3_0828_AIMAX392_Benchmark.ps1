<#
.SYNOPSIS
  Controlled llama.cpp Vulkan benchmark for Ryzen AI MAX+ 392.

.DESCRIPTION
  This file provides four actions:

  1. Prepare
     - Creates the benchmark folder structure.
     - Installs llama.cpp b10615 from the official Windows Vulkan ZIP already
       downloaded to the current user's Downloads folder, or copies an existing
       b10615 installation from %USERPROFILE%\llama.cpp.
     - Downloads the three fixed GGUF files with Hugging Face CLI (hf), or uvx
       when hf is not installed.
     - Verifies llama.cpp build, Vulkan device, model presence, and SHA256.

  2. Run (default)
     - Captures OS, CPU, memory, GPU driver, power plan, llama.cpp build, and
       Vulkan device information.
     - Runs the real llama-server np1 API matrix.
     - Produces benchmark_summary.csv and benchmark_report.md.
     - Keeps request/server diagnostics only when a case fails.

  3. RunServer
     - Runs the same four-metric API matrix when troubleshooting or resuming work.

  4. Compare
     - Compares this machine's latest_summary.csv with the other machine's CSV.
     - Produces a Markdown comparison report with percentage differences.

  Test matrix (fixed on both machines):
    Backend          Vulkan
    llama.cpp        b10615
    GPU offload      -ngl 999
    Threads          all Windows logical processors
    Input tokens     1K, 2K, 4K, 8K, 16K, and 32K
    Generated tokens 300
    Batch / ubatch   2048 / 512
    Repetitions      3
    Server context   dynamic by input: 4096, 4096, 6144, 10240, 18432, 34816
    Server parallel  np=1
    Inter-test delay 3 seconds

  Important scope:
    llama-server streams exact-length token-array prompts and reports only TTFT,
    TPOT, Throughput Aggregate, and Throughput Normalized. Vulkan tests the
    Radeon GPU/CPU memory path, not the NPU.

.RUNNING COMMANDS
  Prepare llama.cpp and models:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\V3_0828_AIMAX392_Benchmark.ps1 -Action Prepare

  Run the benchmark:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\V3_0828_AIMAX392_Benchmark.ps1 -Action Run

  Run the formal API suite only:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\V3_0828_AIMAX392_Benchmark.ps1 -Action RunServer

  Compare after copying the other machine's latest_summary.csv locally:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\V3_0828_AIMAX392_Benchmark.ps1 -Action Compare -CompareCsv "D:\Transfer\MAX395_latest_summary.csv"

  Official references:
    https://github.com/ggml-org/llama.cpp/releases/tag/b10615
    https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md
    https://huggingface.co/unsloth/gemma-4-26B-A4B-it-GGUF
    https://huggingface.co/unsloth/gpt-oss-20b-GGUF
    https://huggingface.co/unsloth/Ornith-1.0-9B-GGUF
#>

[CmdletBinding()]
param(
    [ValidateSet("Prepare", "Run", "RunServer", "Compare")]
    [string]$Action = "Run",

    [string]$CompareCsv = ""
)

$ErrorActionPreference = "Stop"

# These are the only machine-specific settings.
$Root = "C:\AIMAX392_Benchmark"
$MachineLabel = "Ryzen AI MAX+ 392"
$ModelsDir = Join-Path $Root "models"
$LlamaFolderName = "llama-b10615-bin-win-vulkan-x64"
$LlamaDir = Join-Path $Root $LlamaFolderName
$ResultsRoot = Join-Path $Root "results"
$LlamaServer = Join-Path $LlamaDir "llama-server.exe"
$LlamaCli = Join-Path $LlamaDir "llama-cli.exe"
$ExpectedBuild = 10615
$LlamaZipName = "$LlamaFolderName.zip"
$LlamaZip = Join-Path (Join-Path $env:USERPROFILE "Downloads") $LlamaZipName
$ExistingLlamaDir = Join-Path $env:USERPROFILE "llama.cpp"

$Threads = [int]$env:NUMBER_OF_PROCESSORS
$InputTokenSizes = @(1024, 2048, 4096, 8192, 16384, 32768)
$GeneratedTokens = 300
$GpuLayers = 999
$BatchSize = 2048
$UBatchSize = 512
$Repetitions = 3
$DelaySeconds = 3
$ParallelSlots = 1
$ContextSizeByInput = [ordered]@{
    "1024" = 4096
    "2048" = 4096
    "4096" = 6144
    "8192" = 10240
    "16384" = 18432
    "32768" = 34816
}
$ServerPort = 8080
$ServerReadyTimeoutSeconds = 600
$RandomSeed = 1234

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
    },
    [PSCustomObject]@{
        Name = "Ornith 1.0 9B"
        Repo = "unsloth/Ornith-1.0-9B-GGUF"
        File = "Ornith-1.0-9B-Q4_K_M.gguf"
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

function Get-ContextSizeForInput {
    param([int]$InputTokens)

    $key = [string]$InputTokens
    if (-not $ContextSizeByInput.Contains($key)) {
        throw "No server context is configured for input size $InputTokens."
    }

    $contextSize = [int]$ContextSizeByInput[$key]
    $minimumRequired = $InputTokens + $GeneratedTokens
    if ($contextSize -lt $minimumRequired) {
        throw "Configured context $contextSize is too small for input=$InputTokens and output=$GeneratedTokens."
    }
    return $contextSize
}

function Get-ContextPolicyText {
    return (($InputTokenSizes | ForEach-Object {
        "$_=$(Get-ContextSizeForInput -InputTokens $_)"
    }) -join ", ")
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

    foreach ($exe in @($LlamaServer, $LlamaCli)) {
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
        ContextSize = (Get-ContextPolicyText)
        RandomSeed = $RandomSeed
    }
}

function Assert-BenchmarkReady {
    Ensure-Directories

    foreach ($exe in @($LlamaServer, $LlamaCli)) {
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

function Get-Median {
    param([double[]]$Values)
    if ($Values.Count -eq 0) { return 0.0 }
    $sorted = @($Values | Sort-Object)
    $middle = [int][math]::Floor($sorted.Count / 2)
    if (($sorted.Count % 2) -eq 1) {
        return [double]$sorted[$middle]
    }
    return [double](($sorted[$middle - 1] + $sorted[$middle]) / 2.0)
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
    param([int]$Port, [int]$RequiredTokens)
    $maxTokens = $RequiredTokens
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
    catch {
        if ($rawLines.Count -gt 0) {
            Write-Utf8Bom -Path $RawPath -Content ($rawLines -join [Environment]::NewLine)
        }
        throw
    }
    finally {
        $watch.Stop()
        $reader.Dispose()
        $response.Dispose()
    }

    if ($null -eq $firstTokenMs) {
        Write-Utf8Bom -Path $RawPath -Content ($rawLines -join [Environment]::NewLine)
        throw "No streamed output token was received. See $RawPath"
    }
    if ($null -eq $finalObject -or $null -eq $finalObject.timings) {
        Write-Utf8Bom -Path $RawPath -Content ($rawLines -join [Environment]::NewLine)
        throw "No final timings object was received. See $RawPath"
    }

    $predictedN = [int]$finalObject.timings.predicted_n
    $e2eMs = [double]$watch.Elapsed.TotalMilliseconds
    if ($predictedN -le 1 -or $e2eMs -le [double]$firstTokenMs) {
        Write-Utf8Bom -Path $RawPath -Content ($rawLines -join [Environment]::NewLine)
        throw "Insufficient output for TPOT calculation. See $RawPath"
    }
    $tpotMs = ($e2eMs - [double]$firstTokenMs) / ($predictedN - 1)
    $aggregateTps = $predictedN / ($e2eMs / 1000.0)
    $normalizedTps = $aggregateTps / $ParallelSlots

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
        if ($caseRows.Count -eq 0) { continue }
        $caseContextSize = [int]$caseRows[0].ContextSize
        $ttft = @($caseRows | ForEach-Object { [double]$_.TTFTms })
        $tpot = @($caseRows | ForEach-Object { [double]$_.TPOTms })
        $totalTokens = ($caseRows | Measure-Object -Property PredictedN -Sum).Sum
        $totalMeasuredMs = ($caseRows | Measure-Object -Property EndToEndMs -Sum).Sum
        $officialAggregate = [double]$totalTokens / ([double]$totalMeasuredMs / 1000.0)
        $officialNormalized = $officialAggregate / $ParallelSlots

        $summary += [PSCustomObject][ordered]@{
            Machine = $MachineLabel
            Suite = "llama-server-np1"
            ModelName = $ModelRecord.ModelName
            ModelFile = $ModelRecord.FileName
            ModelSHA256 = $ModelRecord.SHA256
            Test = "input" + $inputSize + "_output" + $GeneratedTokens
            InputTokens = $inputSize
            OutputTokens = $GeneratedTokens
            ContextSize = $caseContextSize
            Trials = $caseRows.Count
            Requests = $caseRows.Count
            TTFT_ms = [math]::Round((Get-Mean $ttft), 6)
            TPOT_ms_per_token = [math]::Round((Get-Median $tpot), 6)
            Throughput_Aggregate_tokens_per_s = [math]::Round($officialAggregate, 6)
            Throughput_Normalized_tokens_per_s_per_user = [math]::Round($officialNormalized, 6)
            Threads = $Threads
            NP = $ParallelSlots
            GPULayers = $GpuLayers
            Batch = $BatchSize
            UBatch = $UBatchSize
            LlamaBuild = $ExpectedBuild
        }
    }
    return $summary
}

function Invoke-LlamaServerSuite {
    param([string]$RunDir, [object[]]$ModelInventory)
    $summary = @()
    $allTrials = @()
    $allFailures = @()
    foreach ($model in $Models) {
        $modelRecord = $ModelInventory | Where-Object FileName -eq $model.File | Select-Object -First 1
        $modelPath = Join-Path $ModelsDir $model.File
        $safeName = $model.File -replace "\.gguf$", ""
        $trials = @()
        $failures = @()

        foreach ($inputSize in $InputTokenSizes) {
            $caseContextSize = Get-ContextSizeForInput -InputTokens $inputSize
            $stdoutPath = Join-Path $RunDir ($safeName + "_server_input" + $inputSize + "_ctx" + $caseContextSize + "_stdout.txt")
            $stderrPath = Join-Path $RunDir ($safeName + "_server_input" + $inputSize + "_ctx" + $caseContextSize + "_stderr.txt")
            $serverArgs = @(
                "-m", $modelPath, "-c", "$caseContextSize", "-np", "$ParallelSlots",
                "-ngl", "$GpuLayers", "-t", "$Threads", "-b", "$BatchSize",
                "-ub", "$UBatchSize", "--host", "127.0.0.1", "--port", "$ServerPort"
            )

            Write-Step "Starting llama-server np1: $($model.Name), input=$inputSize, context=$caseContextSize"
            $process = $null
            $caseSucceeded = $false
            $caseTrials = @()
            try {
                $startArgs = @{
                    FilePath = $LlamaServer
                    ArgumentList = $serverArgs
                    PassThru = $true
                    RedirectStandardOutput = $stdoutPath
                    RedirectStandardError = $stderrPath
                    WindowStyle = "Hidden"
                }
                $process = Start-Process @startArgs
                Wait-ServerReady -Port $ServerPort -Process $process
                $allTokens = @(Get-ExactPromptTokens -Port $ServerPort -RequiredTokens $inputSize)
                $promptTokens = [int[]]$allTokens[0..($inputSize - 1)]
                for ($trial = 1; $trial -le $Repetitions; $trial++) {
                    Write-Host "API $($model.Name): input=$inputSize, output=$GeneratedTokens, context=$caseContextSize, NP=$ParallelSlots, trial=$trial/$Repetitions"
                    $rawPath = Join-Path $RunDir ($safeName + "_server_input" + $inputSize + "_trial" + $trial + ".jsonl")
                    $result = Invoke-StreamingCompletion -Port $ServerPort -PromptTokens $promptTokens -RawPath $rawPath
                    $caseTrials += [PSCustomObject][ordered]@{
                        Machine = $MachineLabel
                        ModelName = $model.Name
                        ModelFile = $model.File
                        InputTokens = $inputSize
                        OutputTokensRequested = $GeneratedTokens
                        ContextSize = $caseContextSize
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
                $trials += $caseTrials
                $caseSucceeded = $true
            }
            catch {
                $message = $_.Exception.Message
                Write-Warning "Skipping $($model.Name), input=$inputSize, context=$caseContextSize: $message"
                $failures += [PSCustomObject][ordered]@{
                    Machine = $MachineLabel
                    ModelName = $model.Name
                    ModelFile = $model.File
                    InputTokens = $inputSize
                    OutputTokensRequested = $GeneratedTokens
                    ContextSize = $caseContextSize
                    Error = $message
                    StdoutLog = $stdoutPath
                    StderrLog = $stderrPath
                }
            }
            finally {
                if ($null -ne $process -and -not $process.HasExited) {
                    Stop-Process -Id $process.Id -Force
                    $process.WaitForExit()
                }
                if ($caseSucceeded) {
                    Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
                }
                Start-Sleep -Seconds 2
            }
        }

        if ($trials.Count -gt 0) {
            $allTrials += $trials
            $summary += @(Convert-ServerTrials -Trials $trials -ModelRecord $modelRecord)
        }
        if ($failures.Count -gt 0) {
            $allFailures += $failures
        }
    }

    if ($allFailures.Count -gt 0) {
        $allFailures | Export-Csv -Path (Join-Path $RunDir "benchmark_failures.csv") -NoTypeInformation -Encoding UTF8
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
    $lines = New-Object System.Collections.Generic.List[string]
    [void]$lines.Add("# $MachineLabel llama.cpp Vulkan Benchmark Report")
    [void]$lines.Add("")
    [void]$lines.Add("Generated: $($Environment.CapturedAt)")
    [void]$lines.Add("")
    [void]$lines.Add("## Metrics")
    [void]$lines.Add("")
    [void]$lines.Add("- TTFT (ms): mean across all completed requests; lower is better.")
    [void]$lines.Add("- TPOT (ms/token): median across all completed requests of (E2E - TTFT) / (output tokens - 1); lower is better.")
    [void]$lines.Add("- Throughput Aggregate (tokens/s): total output tokens / total measured request duration; higher is better.")
    [void]$lines.Add("- Throughput Normalized (tokens/s/user): Throughput Aggregate / NP; higher is better.")
    [void]$lines.Add("")
    [void]$lines.Add("At NP=1, Throughput Aggregate equals Throughput Normalized, matching the 70B/120B benchmark definition.")
    [void]$lines.Add("")
    [void]$lines.Add("## Test setup")
    [void]$lines.Add("")
    [void]$lines.Add("| Variable | Value |")
    [void]$lines.Add("|---|---|")
    [void]$lines.Add("| llama.cpp | b$ExpectedBuild Windows x64 Vulkan |")
    [void]$lines.Add("| Threads | $Threads (all Windows logical processors) |")
    [void]$lines.Add("| GPU offload | -ngl $GpuLayers |")
    [void]$lines.Add("| Actual input tokens | $($InputTokenSizes -join ', ') |")
    [void]$lines.Add("| Output tokens | $GeneratedTokens |")
    [void]$lines.Add("| Batch / ubatch | $BatchSize / $UBatchSize |")
    [void]$lines.Add("| Repetitions | $Repetitions |")
    [void]$lines.Add("| Server context policy / parallel slots | $(Get-ContextPolicyText) / $ParallelSlots |")
    [void]$lines.Add("| Prompt cache | disabled |")
    [void]$lines.Add("| Sampling | temperature 0; seed $RandomSeed; EOS ignored until output target |")
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
    [void]$lines.Add("Each row is one model/input result aggregated from all completed requests.")
    [void]$lines.Add("")
    [void]$lines.Add("| Model | Input | Output | Context | Requests | TTFT Mean (ms) | TPOT Median (ms/token) | Aggregate (tokens/s) | Normalized (tokens/s/user) |")
    [void]$lines.Add("|---|---:|---:|---:|---:|---:|---:|---:|---:|")
    foreach ($row in $formalRows) {
        [void]$lines.Add("| $($row.ModelName) | $($row.InputTokens) | $($row.OutputTokens) | $($row.ContextSize) | $($row.Requests) | $($row.TTFT_ms) | $($row.TPOT_ms_per_token) | $($row.Throughput_Aggregate_tokens_per_s) | $($row.Throughput_Normalized_tokens_per_s_per_user) |")
    }

    $failureFiles = @(Get-ChildItem -LiteralPath (Split-Path -Parent $Path) -Filter "benchmark_failures.csv" -File -ErrorAction SilentlyContinue)
    if ($failureFiles.Count -gt 0) {
        [void]$lines.Add("")
        [void]$lines.Add("## Skipped API cases")
        [void]$lines.Add("")
        [void]$lines.Add("Cases listed here failed to complete all repetitions and are excluded from the formal summary.")
        [void]$lines.Add("")
        [void]$lines.Add("| Model | Input | Output | Context | Error |")
        [void]$lines.Add("|---|---:|---:|---:|---|")
        foreach ($failureFile in $failureFiles) {
            foreach ($failure in @(Import-Csv -LiteralPath $failureFile.FullName)) {
                $errorText = ([string]$failure.Error).Replace("|", "\|").Replace([Environment]::NewLine, "<br>")
                [void]$lines.Add("| $($failure.ModelName) | $($failure.InputTokens) | $($failure.OutputTokensRequested) | $($failure.ContextSize) | $errorText |")
            }
        }
    }

    Write-Utf8Bom -Path $Path -Content ($lines -join [Environment]::NewLine)
}

function Invoke-BenchmarkRun {
    Assert-BenchmarkReady
    $stamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $runDir = Join-Path $ResultsRoot $stamp
    New-Item -ItemType Directory -Path $runDir -Force | Out-Null

    Write-Step "Capturing benchmark metadata"
    $environment = Get-EnvironmentRecord
    $modelInventory = @(Get-ModelInventory)

    $summary = @(Invoke-LlamaServerSuite -RunDir $runDir -ModelInventory $modelInventory)

    $summaryPath = Join-Path $runDir "benchmark_summary.csv"
    $reportPath = Join-Path $runDir "benchmark_report.md"
    $summary | Export-Csv -Path $summaryPath -NoTypeInformation -Encoding UTF8
    New-BenchmarkReport -Path $reportPath -Environment $environment -ModelInventory $modelInventory -Summary $summary

    Copy-Item -LiteralPath $summaryPath -Destination (Join-Path $ResultsRoot "latest_summary.csv") -Force
    Copy-Item -LiteralPath $reportPath -Destination (Join-Path $ResultsRoot "latest_report.md") -Force

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
    [void]$lines.Add("Difference is (Local - Other) / Other. Negative is better for TTFT/TPOT; positive is better for Throughput.")
    [void]$lines.Add("")
    [void]$lines.Add("| Model | Input | Output | Context | TTFT L/O/Delta | TPOT L/O/Delta | Aggregate L/O/Delta | Normalized L/O/Delta | Hash match |")
    [void]$lines.Add("|---|---:|---:|---:|---|---|---|---|---|")

    foreach ($local in $localRows) {
        $other = $otherRows | Where-Object {
            $_.Suite -eq $local.Suite -and $_.ModelName -eq $local.ModelName -and
            $_.InputTokens -eq $local.InputTokens -and $_.OutputTokens -eq $local.OutputTokens -and
            $_.ContextSize -eq $local.ContextSize -and $_.NP -eq $local.NP
        } | Select-Object -First 1
        if ($null -eq $other) {
            [void]$lines.Add("| $($local.ModelName) | $($local.InputTokens) | $($local.OutputTokens) | $($local.ContextSize) | missing | missing | missing | missing | n/a |")
            continue
        }

        $cells = @()
        foreach ($metric in @("TTFT_ms", "TPOT_ms_per_token", "Throughput_Aggregate_tokens_per_s", "Throughput_Normalized_tokens_per_s_per_user")) {
            $localValue = [double]$local.$metric
            $otherValue = [double]$other.$metric
            $deltaText = "n/a"
            if ($otherValue -ne 0) {
                $delta = (($localValue - $otherValue) / $otherValue) * 100
                $deltaText = ("{0:+0.00;-0.00;0.00}%" -f $delta)
            }
            $cells += "$localValue / $otherValue / $deltaText"
        }

        $hashMatch = ($local.ModelSHA256 -eq $other.ModelSHA256)
        [void]$lines.Add("| $($local.ModelName) | $($local.InputTokens) | $($local.OutputTokens) | $($local.ContextSize) | $($cells[0]) | $($cells[1]) | $($cells[2]) | $($cells[3]) | $hashMatch |")
    }

    [void]$lines.Add("")
    [void]$lines.Add("Do not interpret rows with mismatched hashes. Match the test setup before attributing differences to the processor.")
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

RUN
powershell -NoProfile -ExecutionPolicy Bypass -File "$PSCommandPath" -Action Run

RUN FORMAL LLAMA-SERVER NP1 ONLY
powershell -NoProfile -ExecutionPolicy Bypass -File "$PSCommandPath" -Action RunServer

COMPARE
powershell -NoProfile -ExecutionPolicy Bypass -File "$PSCommandPath" -Action Compare -CompareCsv "D:\Transfer\OTHER_latest_summary.csv"
"@
    Write-Utf8Bom -Path (Join-Path $Root "RUNNING_CMD.txt") -Content $commands

    Write-Host "`nPreparation completed for $MachineLabel." -ForegroundColor Green
    Write-Host "Logical processors used: $Threads"
    Write-Host "Run: powershell -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Action Run"
}

Ensure-Directories

switch ($Action) {
    "Prepare" {
        Invoke-Prepare
    }
    "Run" {
        Invoke-BenchmarkRun
    }
    "RunServer" {
        Invoke-BenchmarkRun
    }
    "Compare" {
        if ([string]::IsNullOrWhiteSpace($CompareCsv)) {
            throw "-CompareCsv is required for -Action Compare."
        }
        $localCsv = Join-Path $ResultsRoot "latest_summary.csv"
        New-ComparisonReport -LocalCsv $localCsv -OtherCsv $CompareCsv
    }
}
