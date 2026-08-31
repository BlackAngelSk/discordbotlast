#Requires -Version 5.1
<#
.SYNOPSIS
    Auto-update and audit fix for discordbotlast (Windows).
.DESCRIPTION
    Runs npm update + npm audit fix, logs results.
    Works on native Windows PowerShell / PowerShell 7+.
.PARAMETER Action
    run        - execute update now (default)
    install    - set up daily scheduled task
    uninstall  - remove the scheduled task
    status     - show task info
.PARAMETER ScheduleHour
    Hour of day for scheduled run (default: 4)
.PARAMETER ScheduleMinute
    Minute of hour for scheduled run (default: 30)
#>
param(
    [ValidateSet("run", "install", "uninstall", "status")]
    [string]$Action = "run",
    [int]$ScheduleHour = 4,
    [int]$ScheduleMinute = 30
)

$ErrorActionPreference = "Continue"
$TaskName = "npm-autoupdate-discordbotlast"

# --- Detect bot directory ---
function Find-BotDir {
    # 1. Env override
    if ($env:BOT_DIR -and (Test-Path "$env:BOT_DIR\package.json")) {
        return $env:BOT_DIR
    }
    # 2. Walk up from script directory
    $dir = Split-Path -Parent $MyInvocation.ScriptName
    if (-not $dir) { $dir = Get-Location }
    while ($dir -and $dir -ne [System.IO.Path]::GetPathRoot($dir)) {
        if ((Test-Path "$dir\package.json") -and (Select-String -Path "$dir\package.json" -Pattern '"discord-bot"' -Quiet)) {
            return $dir
        }
        $dir = Split-Path -Parent $dir
    }
    # 3. Fallback: parent of script dir
    $scriptDir = Split-Path -Parent $MyInvocation.ScriptName
    if ($scriptDir) {
        $fallback = Split-Path -Parent $scriptDir
        if (Test-Path "$fallback\package.json") {
            return $fallback
        }
    }
    return $null
}

# --- Helper: get vulnerability count ---
function Get-VulnCount {
    try {
        $output = npm audit 2>&1 | Out-String
        $match = [regex]::Match($output, "(\d+) vulnerabilities")
        if ($match.Success) {
            return "$($match.Groups[1].Value) vulnerabilities"
        }
    } catch {}
    return "0 vulnerabilities"
}

# --- Helper: count outdated packages ---
function Get-OutdatedCount {
    try {
        $output = npm outdated 2>&1 | Out-String
        $lines = $output -split "`n" | Where-Object { $_ -match "^[a-z]" }
        return $lines.Count
    } catch {}
    return 0
}

# ============================================================
# run: execute the update
# ============================================================
function Invoke-Update {
    $botDir = Find-BotDir
    if (-not $botDir) {
        Write-Error "Cannot find bot directory. Set BOT_DIR env var or run from the repo."
        exit 1
    }

    $logDir = Join-Path $botDir "logs"
    $logFile = Join-Path $logDir "npm-autoupdate.log"
    $maxLogSize = 1MB

    New-Item -ItemType Directory -Path $logDir -Force | Out-Null

    # Rotate log if too big
    if ((Test-Path $logFile) -and ((Get-Item $logFile).Length -gt $maxLogSize)) {
        Move-Item $logFile "$logFile.1" -Force
    }

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $lines = @()
    $lines += "=== npm autoupdate $timestamp ==="
    $lines += ""

    Push-Location $botDir
    try {
        $beforeVulns = Get-VulnCount
        $beforeOutdated = Get-OutdatedCount
        $lines += "Before: $beforeVulns | $beforeOutdated outdated"

        $lines += ""
        $lines += "--- npm update ---"
        $updateOutput = (npm update 2>&1 | Out-String) -split "`n" | Select-Object -Last 5
        $lines += $updateOutput

        $lines += ""
        $lines += "--- npm audit fix ---"
        $auditOutput = (npm audit fix 2>&1 | Out-String) -split "`n" | Select-Object -Last 5
        $lines += $auditOutput

        $afterVulns = Get-VulnCount
        $afterOutdated = Get-OutdatedCount
        $lines += ""
        $lines += "After:  $afterVulns | $afterOutdated outdated"

        if ($beforeVulns -eq $afterVulns -and $beforeOutdated -eq $afterOutdated) {
            $lines += "No changes."
        } else {
            $lines += "Changes applied."
        }
    } finally {
        Pop-Location
    }

    $lines += ""
    $lines += ""
    $lines -join "`n" | Out-File -Append -FilePath $logFile -Encoding utf8
}

# ============================================================
# install: set up Windows Task Scheduler
# ============================================================
function Install-Scheduler {
    $scriptPath = $MyInvocation.ScriptCommand.Path
    if (-not $scriptPath) {
        $scriptPath = $PSCommandPath
    }

    # Build action: run PowerShell with this script
    $action = New-ScheduledTaskAction `
        -Execute "pwsh.exe" `
        -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" run" `
        -WorkingDirectory (Split-Path -Parent $scriptPath)

    # Trigger: daily at specified time
    $trigger = New-ScheduledTaskTrigger -Daily -At ([datetime]::Today.AddHours($ScheduleHour).AddMinutes($ScheduleMinute))

    # Settings
    $settings = New-ScheduledTaskSettingsSet `
        -StartWhenAvailable `
        -DontStopOnIdleEnd `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 1)

    # Remove existing task if any
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

    # Register
    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Description "Auto-update npm packages for discordbotlast" `
        -RunLevel Highest | Out-Null

    Write-Host "Installed scheduled task '$TaskName' (daily ${ScheduleHour}:${ScheduleMinute})."
    Write-Host "Logs: $((Find-BotDir))\logs\npm-autoupdate.log"
}

# ============================================================
# uninstall: remove the scheduled task
# ============================================================
function Uninstall-Scheduler {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    if ($?) {
        Write-Host "Removed scheduled task '$TaskName'."
    } else {
        Write-Host "Task '$TaskName' not found."
    }
}

# ============================================================
# status: show task info
# ============================================================
function Show-Status {
    $botDir = Find-BotDir
    $scriptPath = $MyInvocation.ScriptCommand.Path
    if (-not $scriptPath) { $scriptPath = $PSCommandPath }

    Write-Host "OS:       Windows $($PSVersionTable.OS)"
    Write-Host "PowerShell: $($PSVersionTable.PSVersion)"
    Write-Host "Bot:      $botDir"
    Write-Host "Script:   $scriptPath"
    Write-Host "Log:      $botDir\logs\npm-autoupdate.log"
    Write-Host ""

    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($task) {
        $info = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue
        Write-Host "Scheduled task: $TaskName"
        Write-Host "  State:  $($task.State)"
        Write-Host "  Next run: $($info.NextRunTime)"
        Write-Host "  Last run: $($info.LastRunTime)"
    } else {
        Write-Host "Scheduled task not installed."
    }

    Write-Host ""
    $logFile = Join-Path $botDir "logs\npm-autoupdate.log"
    if (Test-Path $logFile) {
        Write-Host "Last 5 lines of log:"
        Get-Content $logFile -Tail 5
    } else {
        Write-Host "No log file yet."
    }
}

# ============================================================
# main
# ============================================================
switch ($Action) {
    "run"       { Invoke-Update }
    "install"   { Install-Scheduler }
    "uninstall" { Uninstall-Scheduler }
    "status"    { Show-Status }
}
