# OpenCode Toolbox - friendly Windows installer (PowerShell 5.1+)
# Run from PowerShell:
# irm https://raw.githubusercontent.com/OrionFalls/OpenCode-Toolbox/main/install.ps1 | iex

[CmdletBinding()]
param([switch]$ValidateOnly)

$ErrorActionPreference = "Stop"
$PluginSpec = "git+https://github.com/OrionFalls/OpenCode-Toolbox.git#main"
$ShimDirectory = Join-Path $env:LOCALAPPDATA "OpenCode\bin"
$ShimPath = Join-Path $ShimDirectory "opencode.cmd"
$script:DetectedVersion = $null

# Use UTF-8 in Windows PowerShell 5.1 / Windows Terminal.
try {
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    [Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
    $OutputEncoding = [Console]::OutputEncoding
    & $env:ComSpec /d /c chcp 65001 | Out-Null
} catch {}

# Match the Windows display language. Only Russian and English are supported.
$languageCandidates = @($PSUICulture, [Globalization.CultureInfo]::CurrentUICulture.Name, $env:LANG)
$script:Language = "en"
foreach ($candidate in $languageCandidates) {
    if ($candidate -match '^(?i:ru)([-_]|$)') {
        $script:Language = "ru"
        break
    }
}

$Text = @{
    en = @{
        subtitle = "A simple setup wizard for OpenCode Desktop"
        welcome = "Welcome!"
        intro = "This wizard will find OpenCode, check it, and install Toolbox."
        step1 = "Looking for OpenCode"
        step2 = "Preparing the command"
        step3 = "Installing Toolbox"
        found = "OpenCode was found."
        version = "Version"
        pathAdded = "The command is ready to use in new terminal windows."
        pathExists = "The command folder is already in your user PATH."
        locating = "We couldn't find OpenCode automatically."
        choose = "Choose opencode.exe or opencode-cli.exe in the file picker."
        pickerUnavailable = "The file picker is unavailable. You can paste the full path below."
        enterPath = "Full path to the OpenCode CLI (Enter to cancel)"
        invalidPath = "That file could not be started as OpenCode CLI. Please try again."
        cancelled = "Setup was cancelled. No plugin was installed."
        installStart = "Installing OpenCode Toolbox. This may take a moment..."
        installFailed = "Toolbox could not be installed."
        installHelp = "Check your internet connection and GitHub access, then run this command again."
        diagnostics = "For support, copy this diagnostic command"
        successTitle = "You're all set!"
        successBody = "OpenCode Toolbox has been installed successfully."
        next = "Next steps"
        next1 = "Close and reopen OpenCode Desktop."
        next2 = "Open Settings > Extensions > Plugins."
        next3 = "Find OpenCode Toolbox in the list."
        close = "Installation is complete. You can close this window."
        newTerminal = "Open a new PowerShell window to use the opencode command."
        footer = "No administrator rights are required. Your existing OpenCode settings are not changed."
        error = "Could not prepare the command"
        errorDetails = "Details"
    }
    ru = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("eyJzdWJ0aXRsZSI6ItCf0YDQvtGB0YLQsNGPINGD0YHRgtCw0L3QvtCy0LrQsCDQtNC70Y8gT3BlbkNvZGUgRGVza3RvcCIsIndlbGNvbWUiOiLQlNC+0LHRgNC+INC/0L7QttCw0LvQvtCy0LDRgtGMISIsImludHJvIjoi0JzQsNGB0YLQtdGAINC90LDQudC00ZHRgiBPcGVuQ29kZSwg0L/RgNC+0LLQtdGA0LjRgiDQtdCz0L4g0Lgg0YPRgdGC0LDQvdC+0LLQuNGCIFRvb2xib3guIiwic3RlcDEiOiLQn9C+0LjRgdC6IE9wZW5Db2RlIiwic3RlcDIiOiLQn9C+0LTQs9C+0YLQvtCy0LrQsCDQutC+0LzQsNC90LTRiyIsInN0ZXAzIjoi0KPRgdGC0LDQvdC+0LLQutCwIFRvb2xib3giLCJmb3VuZCI6Ik9wZW5Db2RlINC90LDQudC00LXQvS4iLCJ2ZXJzaW9uIjoi0JLQtdGA0YHQuNGPIiwicGF0aEFkZGVkIjoi0JrQvtC80LDQvdC00LAg0LHRg9C00LXRgiDQtNC+0YHRgtGD0L/QvdCwINCyINC90L7QstGL0YUg0L7QutC90LDRhSDRgtC10YDQvNC40L3QsNC70LAuIiwicGF0aEV4aXN0cyI6ItCa0LDRgtCw0LvQvtCzINC60L7QvNCw0L3QtNGLINGD0LbQtSDQtNC+0LHQsNCy0LvQtdC9INCyINC/0L7Qu9GM0LfQvtCy0LDRgtC10LvRjNGB0LrQuNC5IFBBVEguIiwibG9jYXRpbmciOiLQndC1INGD0LTQsNC70L7RgdGMINCw0LLRgtC+0LzQsNGC0LjRh9C10YHQutC4INC90LDQudGC0LggT3BlbkNvZGUuIiwiY2hvb3NlIjoi0JLRi9Cx0LXRgNC40YLQtSBvcGVuY29kZS5leGUg0LjQu9C4IG9wZW5jb2RlLWNsaS5leGUg0LIg0L7QutC90LUg0L/RgNC+0LLQvtC00L3QuNC60LAuIiwicGlja2VyVW5hdmFpbGFibGUiOiLQntC60L3QviDQstGL0LHQvtGA0LAg0YTQsNC50LvQsCDQvdC10LTQvtGB0YLRg9C/0L3Qvi4g0J3QuNC20LUg0LzQvtC20L3QviDRg9C60LDQt9Cw0YLRjCDQv9C+0LvQvdGL0Lkg0L/Rg9GC0Ywg0LLRgNGD0YfQvdGD0Y4uIiwiZW50ZXJQYXRoIjoi0J/QvtC70L3Ri9C5INC/0YPRgtGMINC6IE9wZW5Db2RlIENMSSAoRW50ZXIgLSDQvtGC0LzQtdC90LApIiwiaW52YWxpZFBhdGgiOiLQndC1INGD0LTQsNC70L7RgdGMINC30LDQv9GD0YHRgtC40YLRjCDRjdGC0L7RgiDRhNCw0LnQuyDQutCw0LogT3BlbkNvZGUgQ0xJLiDQn9C+0L/RgNC+0LHRg9C50YLQtSDQtdGJ0ZEg0YDQsNC3LiIsImNhbmNlbGxlZCI6ItCj0YHRgtCw0L3QvtCy0LrQsCDQvtGC0LzQtdC90LXQvdCwLiDQn9C70LDQs9C40L0g0L3QtSDRg9GB0YLQsNC90LDQstC70LjQstCw0LvRgdGPLiIsImluc3RhbGxTdGFydCI6ItCj0YHRgtCw0L3QsNCy0LvQuNCy0LDQtdC8IE9wZW5Db2RlIFRvb2xib3guINCt0YLQviDQvNC+0LbQtdGCINC30LDQvdGP0YLRjCDQvdC10YHQutC+0LvRjNC60L4g0LzQuNC90YPRgi4uLiIsImluc3RhbGxGYWlsZWQiOiLQndC1INGD0LTQsNC70L7RgdGMINGD0YHRgtCw0L3QvtCy0LjRgtGMIFRvb2xib3guIiwiaW5zdGFsbEhlbHAiOiLQn9GA0L7QstC10YDRjNGC0LUg0L/QvtC00LrQu9GO0YfQtdC90LjQtSDQuiDQuNC90YLQtdGA0L3QtdGC0YMg0LggR2l0SHViLCDQt9Cw0YLQtdC8INC30LDQv9GD0YHRgtC40YLQtSDRjdGC0YMg0LrQvtC80LDQvdC00YMg0LXRidGRINGA0LDQty4iLCJkaWFnbm9zdGljcyI6ItCU0LvRjyDQtNC40LDQs9C90L7RgdGC0LjQutC4INGB0LrQvtC/0LjRgNGD0LnRgtC1INGN0YLRgyDQutC+0LzQsNC90LTRgyIsInN1Y2Nlc3NUaXRsZSI6ItCS0YHRkSDQs9C+0YLQvtCy0L4hIiwic3VjY2Vzc0JvZHkiOiJPcGVuQ29kZSBUb29sYm94INGD0YHQv9C10YjQvdC+INGD0YHRgtCw0L3QvtCy0LvQtdC9LiIsIm5leHQiOiLQp9GC0L4g0LTQtdC70LDRgtGMINC00LDQu9GM0YjQtSIsIm5leHQxIjoi0JfQsNC60YDQvtC50YLQtSDQuCDQt9Cw0L3QvtCy0L4g0L7RgtC60YDQvtC50YLQtSBPcGVuQ29kZSBEZXNrdG9wLiIsIm5leHQyIjoi0J7RgtC60YDQvtC50YLQtSDQndCw0YHRgtGA0L7QudC60LggPiDQoNCw0YHRiNC40YDQtdC90LjRjyA+INCf0LvQsNCz0LjQvdGLLiIsIm5leHQzIjoi0J3QsNC50LTQuNGC0LUgT3BlbkNvZGUgVG9vbGJveCDQsiDRgdC/0LjRgdC60LUuIiwiY2xvc2UiOiLQo9GB0YLQsNC90L7QstC60LAg0LfQsNCy0LXRgNGI0LXQvdCwLiDQrdGC0L4g0L7QutC90L4g0LzQvtC20L3QviDQt9Cw0LrRgNGL0YLRjC4iLCJuZXdUZXJtaW5hbCI6ItCn0YLQvtCx0Ysg0LjRgdC/0L7Qu9GM0LfQvtCy0LDRgtGMINC60L7QvNCw0L3QtNGDIG9wZW5jb2RlLCDQvtGC0LrRgNC+0LnRgtC1INC90L7QstC+0LUg0L7QutC90L4gUG93ZXJTaGVsbC4iLCJmb290ZXIiOiLQn9GA0LDQstCwINCw0LTQvNC40L3QuNGB0YLRgNCw0YLQvtGA0LAg0L3QtSDQvdGD0LbQvdGLLiDQodGD0YnQtdGB0YLQstGD0Y7RidC40LUg0L3QsNGB0YLRgNC+0LnQutC4IE9wZW5Db2RlINC90LUg0LjQt9C80LXQvdGP0Y7RgtGB0Y8uIiwiZXJyb3IiOiLQndC1INGD0LTQsNC70L7RgdGMINC/0L7QtNCz0L7RgtC+0LLQuNGC0Ywg0LrQvtC80LDQvdC00YMiLCJlcnJvckRldGFpbHMiOiLQn9C+0LTRgNC+0LHQvdC+0YHRgtC4In0=")) | ConvertFrom-Json
}

function T([string]$Key) {
    $entry = $Text[$script:Language]
    if ($entry -is [hashtable]) { return $entry[$Key] }
    return $entry.PSObject.Properties[$Key].Value
}
function Write-Rule { Write-Host ("  " + ("-" * 108)) -ForegroundColor DarkGray }
function Write-Step([int]$Number, [string]$Message) {
    Write-Host ""
    Write-Host ("  {0}/3  {1}" -f $Number, $Message) -ForegroundColor Cyan
}
function Write-Ok([string]$Message) { Write-Host ("  " + $Message) -ForegroundColor Green }
function Write-Warn([string]$Message) { Write-Host ("  [!]   " + $Message) -ForegroundColor Yellow }
function Write-Fail([string]$Message) { Write-Host ("  [X]   " + $Message) -ForegroundColor Red }

function Show-Logo {
    $glyphs = @{
        O = @("01110","10001","10001","10001","10001","10001","01110")
        P = @("11110","10001","10001","11110","10000","10000","10000")
        E = @("11111","10000","10000","11110","10000","10000","11111")
        N = @("10001","11001","11001","10101","10011","10011","10001")
        C = @("01111","10000","10000","10000","10000","10000","01111")
        D = @("11110","10001","10001","10001","10001","10001","11110")
    }
    $colors = @(
        @(244, 76, 238),
        @(226, 83, 245),
        @(204, 94, 250),
        @(178, 108, 255),
        @(146, 127, 255),
        @(111, 145, 255),
        @(76, 132, 255)
    )
    $esc = [char]27
    $word = "OPENCODE"
    for ($row = 0; $row -lt 7; $row++) {
        $line = " " * ((6 - $row) * 2)
        foreach ($letter in $word.ToCharArray()) {
            $pattern = $glyphs[[string]$letter][$row]
            for ($col = 0; $col -lt 5; $col++) {
                if ($pattern[$col] -eq "1") {
                    $color = $colors[$row]
                    $line += "$esc[1;38;2;$($color[0]);$($color[1]);$($color[2])m██$esc[0m"
                } else {
                    $line += "  "
                }
            }
            $line += "  "
        }
        [Console]::WriteLine($line.TrimEnd())
    }

    $tagline = "T  O  O  L  B  O  X"
    $tagPad = [Math]::Max(0, 108 - $tagline.Length)
    [Console]::Write(" " * $tagPad)
    $tagColors = @(
        @(244, 76, 238), @(224, 89, 245), @(204, 101, 250),
        @(178, 115, 255), @(145, 130, 255), @(105, 145, 255), @(76, 132, 255)
    )
    $tagIndex = 0
    foreach ($letter in $tagline.ToCharArray()) {
        if ($letter -eq " ") {
            [Console]::Write(" ")
        } else {
            $color = $tagColors[$tagIndex]
            [Console]::Write("$esc[1;38;2;$($color[0]);$($color[1]);$($color[2])m$letter$esc[0m")
            $tagIndex++
        }
    }
    [Console]::WriteLine()
}

function Show-Banner {
    Clear-Host
    Write-Host ""
    Show-Logo
    Write-Rule
    Write-Host ""
    Write-Host ("  " + (T "welcome")) -ForegroundColor White
    Write-Host ("  " + (T "intro")) -ForegroundColor Gray
    Write-Host ""
}

function Test-OpenCodeCli([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    try {
        $output = & $Path --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            $script:DetectedVersion = ($output | Out-String).Trim()
            return $true
        }
    } catch { return $false }
    return $false
}

function Get-ShortcutTargets {
    $shell = $null
    try {
        $shell = New-Object -ComObject WScript.Shell
        $roots = @(
            [Environment]::GetFolderPath("Programs"),
            [Environment]::GetFolderPath("CommonPrograms"),
            (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"),
            (Join-Path $env:ProgramData "Microsoft\Windows\Start Menu\Programs")
        ) | Select-Object -Unique
        foreach ($root in $roots) {
            if (-not (Test-Path -LiteralPath $root)) { continue }
            Get-ChildItem -LiteralPath $root -Filter "*.lnk" -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
                try {
                    $shortcut = $shell.CreateShortcut($_.FullName)
                    if ($shortcut.TargetPath) { $shortcut.TargetPath }
                } catch {}
            }
        }
    } catch {}
    finally {
        if ($shell) { try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell) } catch {} }
    }
}

function Find-OpenCodeCli {
    $candidates = New-Object System.Collections.Generic.List[string]
    foreach ($name in @("opencode", "opencode-cli")) {
        $commands = Get-Command $name -CommandType Application -ErrorAction SilentlyContinue
        foreach ($command in $commands) { if ($command.Source) { $candidates.Add($command.Source) } }
    }

    $desktopCliRoot = Join-Path $env:APPDATA "ai.opencode.desktop\cli"
    if (Test-Path -LiteralPath $desktopCliRoot) {
        Get-ChildItem -LiteralPath $desktopCliRoot -Directory -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | ForEach-Object {
                foreach ($file in @("opencode-cli.exe", "opencode.exe")) {
                    $candidate = Join-Path $_.FullName $file
                    if (Test-Path -LiteralPath $candidate -PathType Leaf) { $candidates.Add($candidate) }
                }
            }
    }

    $programFilesX86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
    $knownFiles = @(
        (Join-Path $env:LOCALAPPDATA "Programs\OpenCode\opencode.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\OpenCode\opencode-cli.exe"),
        (Join-Path $env:LOCALAPPDATA "OpenCode\opencode.exe"),
        (Join-Path $env:LOCALAPPDATA "OpenCode\opencode-cli.exe"),
        (Join-Path $env:ProgramFiles "OpenCode\opencode.exe"),
        (Join-Path $env:ProgramFiles "OpenCode\opencode-cli.exe")
    )
    if ($programFilesX86) {
        $knownFiles += @(
            (Join-Path $programFilesX86 "OpenCode\opencode.exe"),
            (Join-Path $programFilesX86 "OpenCode\opencode-cli.exe")
        )
    }
    foreach ($candidate in $knownFiles) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) { $candidates.Add($candidate) }
    }

    $registryKeys = @(
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\opencode.exe",
        "HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths\opencode.exe",
        "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\opencode.exe"
    )
    foreach ($key in $registryKeys) {
        if (Test-Path $key) {
            $value = (Get-Item $key).GetValue("")
            if ($value) { $candidates.Add([string]$value) }
        }
    }

    foreach ($target in (Get-ShortcutTargets)) {
        if ($target -match '(?i)opencode.*\.exe$' -and (Test-Path -LiteralPath $target -PathType Leaf)) {
            $candidates.Add($target)
        }
    }

    $seen = @{}
    foreach ($candidate in $candidates) {
        if (-not $candidate) { continue }
        $full = [Environment]::ExpandEnvironmentVariables($candidate.Trim('"'))
        if ($seen.ContainsKey($full)) { continue }
        $seen[$full] = $true
        if (Test-OpenCodeCli $full) { return $full }
    }
    return $null
}

function Request-ManualCliPath {
    Write-Warn (T "locating")
    Write-Host ("  " + (T "choose")) -ForegroundColor Gray
    try {
        Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
        $dialog = New-Object System.Windows.Forms.OpenFileDialog
        $dialog.Title = T "choose"
        $dialog.Filter = "OpenCode CLI (opencode.exe;opencode-cli.exe)|opencode.exe;opencode-cli.exe|Executable files (*.exe)|*.exe"
        $dialog.CheckFileExists = $true
        $dialog.Multiselect = $false
        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { return $dialog.FileName }
    } catch {
        Write-Host ("  " + (T "pickerUnavailable")) -ForegroundColor Gray
    }
    $manual = Read-Host (T "enterPath")
    if ([string]::IsNullOrWhiteSpace($manual)) { return $null }
    return $manual.Trim().Trim('"')
}

function Add-UserPath([string]$Directory) {
    $currentUserPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $entries = @()
    if ($currentUserPath) { $entries = $currentUserPath -split ";" | Where-Object { $_ } }

    $alreadyPresent = $false
    foreach ($entry in $entries) {
        if ([string]::Equals($entry.TrimEnd([char]92), $Directory.TrimEnd([char]92), [StringComparison]::OrdinalIgnoreCase)) {
            $alreadyPresent = $true
            break
        }
    }
    if (-not $alreadyPresent) {
        [Environment]::SetEnvironmentVariable("Path", ((@($entries) + $Directory) -join ";"), "User")
    }
    if (($env:Path -split ";") -notcontains $Directory) { $env:Path = $env:Path.TrimEnd(";") + ";" + $Directory }
    return (-not $alreadyPresent)
}

function Install-CommandShim([string]$CliPath) {
    New-Item -ItemType Directory -Path $ShimDirectory -Force | Out-Null
    $shim = @"
@echo off
setlocal
set "OPENCODE_CLI=$CliPath"
"%OPENCODE_CLI%" %*
exit /b %ERRORLEVEL%
"@
    Set-Content -LiteralPath $ShimPath -Value $shim -Encoding ASCII
    return (Add-UserPath $ShimDirectory)
}

function Show-Success {
    Write-Host ""
    Write-Rule
    Write-Host ""
    Write-Host ("       " + (T "successTitle")) -ForegroundColor Green
    Write-Host ("       " + (T "successBody")) -ForegroundColor White
    Write-Host ""
    Write-Host ("  " + (T "next")) -ForegroundColor Cyan
    Write-Host ("    1. " + (T "next1")) -ForegroundColor White
    Write-Host ("    2. " + (T "next2")) -ForegroundColor White
    Write-Host ("    3. " + (T "next3")) -ForegroundColor White
    Write-Host ""
    Write-Host ("  " + (T "close")) -ForegroundColor Green
    Write-Host ""
}

Show-Banner
Write-Step 1 (T "step1")
$cliPath = Find-OpenCodeCli
while (-not $cliPath) {
    $manualPath = Request-ManualCliPath
    if (-not $manualPath) {
        Write-Host ""
        Write-Warn (T "cancelled")
        return
    }
    if (Test-OpenCodeCli $manualPath) {
        $cliPath = (Resolve-Path -LiteralPath $manualPath).Path
    } else {
        Write-Fail (T "invalidPath")
    }
}
Write-Ok (T "found")
Write-Host ("  " + (T "version") + ": " + $script:DetectedVersion) -ForegroundColor Gray
if ($ValidateOnly) {
    return
}

Write-Step 2 (T "step2")
try {
    $pathWasAdded = Install-CommandShim $cliPath
    if ($pathWasAdded) { Write-Ok (T "pathAdded") } else { Write-Ok (T "pathExists") }
} catch {
    Write-Warn (T "error")
    Write-Host ("  " + $_.Exception.Message) -ForegroundColor DarkGray
    Write-Host ("  " + (T "newTerminal")) -ForegroundColor Gray
}

Write-Step 3 (T "step3")
Write-Host ("  " + (T "installStart")) -ForegroundColor Gray
try {
    & $cliPath plugin add $PluginSpec
    $installExitCode = $LASTEXITCODE
} catch {
    $installExitCode = 1
    $installError = $_.Exception.Message
}

if ($installExitCode -ne 0) {
    Write-Host ""
    Write-Fail (T "installFailed")
    if ($installError) { Write-Host ("  " + (T "errorDetails") + ": " + $installError) -ForegroundColor DarkGray }
    Write-Host ("  " + (T "installHelp")) -ForegroundColor Yellow
    Write-Host ""
    Write-Host ("  " + (T "diagnostics") + ":") -ForegroundColor Gray
    Write-Host ("  " + $cliPath + " plugin list") -ForegroundColor White
    Write-Host ""
    return
}

Show-Success
