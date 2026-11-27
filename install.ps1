# OpenCode Toolbox - friendly Windows installer (PowerShell 5.1+)
# Run from PowerShell:
# irm https://raw.githubusercontent.com/OrionFalls/OpenCode-Toolbox/main/install.ps1 | iex

[CmdletBinding()]
param([switch]$ValidateOnly)

$ErrorActionPreference = "Stop"
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
        step3 = "Installing / updating Toolbox"
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
        firstInstall = "OpenCode Toolbox is not installed yet. Starting installation..."
        checkingUpdate = "Checking the installed version against GitHub..."
        updateStart = "A new version is available. Updating OpenCode Toolbox..."
        noUpdates = "OpenCode Toolbox is up to date. No updates are available."
        updatedBody = "OpenCode Toolbox has been updated successfully."
        updateFailed = "The update failed. Your previous configuration has been restored."
        updateCheckFailed = "Could not check GitHub for updates. Please try again later."
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

$Text.ru | Add-Member -NotePropertyName step3 -NotePropertyValue ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("0KPRgdGC0LDQvdC+0LLQutCwIC8g0L7QsdC90L7QstC70LXQvdC40LUgVG9vbGJveA=="))) -Force
$Text.ru | Add-Member -NotePropertyName firstInstall -NotePropertyValue ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("T3BlbkNvZGUgVG9vbGJveCDQtdGJ0ZEg0L3QtSDRg9GB0YLQsNC90L7QstC70LXQvS4g0J3QsNGH0LjQvdCw0LXQvCDRg9GB0YLQsNC90L7QstC60YMuLi4="))) -Force
$Text.ru | Add-Member -NotePropertyName checkingUpdate -NotePropertyValue ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("0KHQstC10YDRj9C10Lwg0YPRgdGC0LDQvdC+0LLQu9C10L3QvdGD0Y4g0LLQtdGA0YHQuNGOINGBIEdpdEh1Yi4uLg=="))) -Force
$Text.ru | Add-Member -NotePropertyName updateStart -NotePropertyValue ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("0J3QsNC50LTQtdC90LAg0L3QvtCy0LDRjyDQstC10YDRgdC40Y8uINCe0LHQvdC+0LLQu9GP0LXQvCBPcGVuQ29kZSBUb29sYm94Li4u"))) -Force
$Text.ru | Add-Member -NotePropertyName noUpdates -NotePropertyValue ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("0KPRgdGC0LDQvdC+0LLQu9C10L3QsCDQv9C+0YHQu9C10LTQvdGP0Y8g0LLQtdGA0YHQuNGPIE9wZW5Db2RlIFRvb2xib3guINCe0LHQvdC+0LLQu9C10L3QuNC5INC90LXRgi4="))) -Force
$Text.ru | Add-Member -NotePropertyName updatedBody -NotePropertyValue ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("T3BlbkNvZGUgVG9vbGJveCDRg9GB0L/QtdGI0L3QviDQvtCx0L3QvtCy0LvRkdC9Lg=="))) -Force
$Text.ru | Add-Member -NotePropertyName updateFailed -NotePropertyValue ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("0J3QtSDRg9C00LDQu9C+0YHRjCDQstGL0L/QvtC70L3QuNGC0Ywg0L7QsdC90L7QstC70LXQvdC40LUuINCf0YDQtdC00YvQtNGD0YnQsNGPINC60L7QvdGE0LjQs9GD0YDQsNGG0LjRjyDQstC+0YHRgdGC0LDQvdC+0LLQu9C10L3QsC4="))) -Force
$Text.ru | Add-Member -NotePropertyName updateCheckFailed -NotePropertyValue ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("0J3QtSDRg9C00LDQu9C+0YHRjCDQv9GA0L7QstC10YDQuNGC0Ywg0L7QsdC90L7QstC70LXQvdC40Y8g0L3QsCBHaXRIdWIuINCf0L7Qv9GA0L7QsdGD0LnRgtC1INC/0L7Qt9C20LUu"))) -Force
function T([string]$Key) {
    $entry = $Text[$script:Language]
    if ($entry -is [hashtable]) { return $entry[$Key] }
    return $entry.PSObject.Properties[$Key].Value
}
function Write-Step([int]$Number, [string]$Message) {
    Write-Host ""
    Write-Host ("  {0}/3  {1}" -f $Number, $Message) -ForegroundColor Cyan
}
function Write-Ok([string]$Message) { Write-Host ("  " + $Message) -ForegroundColor Green }
function Write-Warn([string]$Message) { Write-Host ("  [!]   " + $Message) -ForegroundColor Yellow }
function Write-Fail([string]$Message) { Write-Host ("  [X]   " + $Message) -ForegroundColor Red }

function Show-Logo {
    $logo = @(
        '.                                          __   '
        '  ____  ____  ___  ____  _________  ____/ /__ '
        ' / __ \/ __ \/ _ \/ __ \/ ___/ __ \/ __  / _ \'
        '/ /_/ / /_/ /  __/ / / / /__/ /_/ / /_/ /  __/'
        '\____/ .___/\___/_/ /_/\___/\____/\__,_/\___/ '
        '    /_/                        T O O L B O X'
    )
    foreach ($line in $logo) {
        Write-Host $line -ForegroundColor Cyan
    }
}

function Show-Banner {
    Clear-Host
    Write-Host ""
    Show-Logo
    Write-Host ""
    Write-Host ("  " + (T "welcome")) -ForegroundColor White
    Write-Host ("  " + (T "intro")) -ForegroundColor Gray
    Write-Host ""
}

function Test-OpenCodeCli([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path) -or $Path -notmatch '(?i)\.exe$' -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
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
        foreach ($command in $commands) {
            if ($command.Source -and $command.Source -match '(?i)\.exe$' -and
                -not [string]::Equals($command.Source, $ShimPath, [StringComparison]::OrdinalIgnoreCase)) {
                $candidates.Add($command.Source)
            }
        }
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
        $dialog.Filter = 'OpenCode CLI (opencode.exe;opencode-cli.exe)|opencode.exe;opencode-cli.exe|Executable files (*.exe)|*.exe'
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

function Get-ToolboxConfigPath {
    $candidates = @(
        (Join-Path $env:USERPROFILE ".config\opencode\opencode.json"),
        (Join-Path $env:USERPROFILE ".config\opencode\opencode.jsonc"),
        (Join-Path $env:APPDATA "opencode\opencode.json"),
        (Join-Path $env:APPDATA "opencode\opencode.jsonc")
    )
    $knownSpecs = @(
        "git+https://github.com/OrionFalls/OpenCode-Toolbox.git#main",
        "https://github.com/OrionFalls/OpenCode-Toolbox.git#main",
        "github:OrionFalls/OpenCode-Toolbox#main"
    )
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            $raw = Get-Content -LiteralPath $candidate -Raw
            foreach ($spec in $knownSpecs) {
                if ($raw.Contains($spec)) { return $candidate }
            }
        }
    }
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }
    return $candidates[0]
}

function Get-ConfiguredToolboxSpec([string]$ConfigPath) {
    if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) { return $null }
    $raw = Get-Content -LiteralPath $ConfigPath -Raw
    $knownSpecs = @(
        "git+https://github.com/OrionFalls/OpenCode-Toolbox.git#main",
        "https://github.com/OrionFalls/OpenCode-Toolbox.git#main",
        "github:OrionFalls/OpenCode-Toolbox#main"
    )
    foreach ($candidate in $knownSpecs) {
        if ($raw.Contains($candidate)) { return $candidate }
    }
    return $null
}

function Get-LocalToolboxCommit([string]$PluginDirectory) {
    $marker = Join-Path $PluginDirectory ".toolbox-commit"
    if (Test-Path -LiteralPath $marker -PathType Leaf) {
        return (Get-Content -LiteralPath $marker -Raw).Trim()
    }
    return $null
}

function Get-RemoteToolboxCommit {
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $response = Invoke-RestMethod -Uri "https://api.github.com/repos/OrionFalls/OpenCode-Toolbox/commits/main" -Headers @{ "User-Agent" = "OpenCode-Toolbox-Installer" } -TimeoutSec 15
        return [string]$response.sha
    } catch {
        return $null
    }
}

function Download-ToolboxFile([string]$Uri, [string]$Destination) {
    $downloadError = $null
    $curl = Get-Command "curl.exe" -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1

    # Primary path: raw.githubusercontent.com. Force HTTP/1.1 because some
    # Windows Schannel/proxy combinations fail while decrypting HTTP/2 streams.
    if ($curl) {
        try {
            & $curl.Source --http1.1 -L --fail --silent --show-error --retry 2 --connect-timeout 15 --output $Destination $Uri
            if ($LASTEXITCODE -ne 0) { throw "curl.exe exited with code $LASTEXITCODE" }
        } catch {
            $downloadError = $_.Exception.Message
        }
    } else {
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest -UseBasicParsing -Uri $Uri -OutFile $Destination -TimeoutSec 30
        } catch {
            $downloadError = $_.Exception.Message
        }
    }

    $downloaded = (Test-Path -LiteralPath $Destination -PathType Leaf) -and (Get-Item -LiteralPath $Destination).Length -gt 0
    if (-not $downloaded) {
        # Fallback: use the GitHub Contents API (api.github.com), which is
        # already used by the installer to resolve the current commit.
        if ($Uri -match '^https://raw\.githubusercontent\.com/([^/]+)/([^/]+)/([^/]+)/(.+)

function Invoke-ToolboxInstallOrUpdate([string]$CliPath, [string]$ConfiguredSpec, [string]$ConfigPath, [string]$Commit) {
    $pluginParent = Join-Path $env:USERPROFILE ".config\opencode\plugins"
    $pluginDirectory = Join-Path $pluginParent "opencode-toolbox"
    $stagingDirectory = Join-Path $pluginParent ("opencode-toolbox.staging-" + [guid]::NewGuid().ToString("N"))
    $backupDirectory = Join-Path $pluginParent ("opencode-toolbox.backup-" + [guid]::NewGuid().ToString("N"))
    $configBackup = $ConfigPath + ".toolbox-backup-" + [guid]::NewGuid().ToString("N")
    $hadConfig = Test-Path -LiteralPath $ConfigPath -PathType Leaf
    $originalPath = $env:Path

    # Prevent the user's opencode.cmd shim from being found by child processes.
    $env:Path = (($env:Path -split ";") | Where-Object {
        $_ -and -not [string]::Equals($_.TrimEnd([char]92), $ShimDirectory.TrimEnd([char]92), [StringComparison]::OrdinalIgnoreCase)
    }) -join ";"

    if ($hadConfig) { Copy-Item -LiteralPath $ConfigPath -Destination $configBackup -Force }
    New-Item -ItemType Directory -Path $stagingDirectory -Force | Out-Null
    New-Item -ItemType Directory -Path $pluginParent -Force | Out-Null

    try {
        if ($ConfiguredSpec) {
            & $CliPath plugin remove $ConfiguredSpec
            if ($LASTEXITCODE -ne 0) { throw "OpenCode could not remove the previous package-based Toolbox entry." }
        }

        $baseUrl = "https://raw.githubusercontent.com/OrionFalls/OpenCode-Toolbox/$Commit"
        foreach ($file in @("package.json", "index.js", "gui-experimental.cjs")) {
            Download-ToolboxFile ($baseUrl + "/" + $file) (Join-Path $stagingDirectory $file)
        }

        $package = Get-Content -LiteralPath (Join-Path $stagingDirectory "package.json") -Raw | ConvertFrom-Json
        if ($package.name -ne "opencode-toolbox" -or -not (Test-Path -LiteralPath (Join-Path $stagingDirectory "gui-experimental.cjs"))) {
            throw "Downloaded Toolbox package did not pass validation."
        }
        Set-Content -LiteralPath (Join-Path $stagingDirectory ".toolbox-commit") -Value $Commit -Encoding ASCII

        if (Test-Path -LiteralPath $pluginDirectory) {
            Move-Item -LiteralPath $pluginDirectory -Destination $backupDirectory
        }
        Move-Item -LiteralPath $stagingDirectory -Destination $pluginDirectory

        if (Test-Path -LiteralPath $backupDirectory) { Remove-Item -LiteralPath $backupDirectory -Recurse -Force -ErrorAction SilentlyContinue }
        if (Test-Path -LiteralPath $configBackup) { Remove-Item -LiteralPath $configBackup -Force }
        return $true
    } catch {
        if (Test-Path -LiteralPath $pluginDirectory -PathType Container) {
            Remove-Item -LiteralPath $pluginDirectory -Recurse -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path -LiteralPath $backupDirectory) {
            Move-Item -LiteralPath $backupDirectory -Destination $pluginDirectory -ErrorAction SilentlyContinue
        }
        if (Test-Path -LiteralPath $stagingDirectory) {
            Remove-Item -LiteralPath $stagingDirectory -Recurse -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path -LiteralPath $configBackup) {
            Copy-Item -LiteralPath $configBackup -Destination $ConfigPath -Force
            Remove-Item -LiteralPath $configBackup -Force
        }
        throw
    } finally {
        $env:Path = $originalPath
    }
}

function Show-Success([bool]$WasUpdate = $false) {
    Write-Host ""
    Write-Host ""
    Write-Host ("       " + (T "successTitle")) -ForegroundColor Green
    if ($WasUpdate) {
        Write-Host ("       " + (T "updatedBody")) -ForegroundColor White
    } else {
        Write-Host ("       " + (T "successBody")) -ForegroundColor White
    }
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
$configPath = Get-ToolboxConfigPath
$configuredSpec = Get-ConfiguredToolboxSpec $configPath
$pluginDirectory = Join-Path $env:USERPROFILE ".config\opencode\plugins\opencode-toolbox"
$localCommit = Get-LocalToolboxCommit $pluginDirectory
$wasUpdate = [bool]($configuredSpec -or (Test-Path -LiteralPath $pluginDirectory -PathType Container))

Write-Host ("  " + (T "checkingUpdate")) -ForegroundColor Gray
$remoteCommit = Get-RemoteToolboxCommit
if (-not $remoteCommit) {
    Write-Fail (T "updateCheckFailed")
    Write-Host ("  " + (T "installHelp")) -ForegroundColor Yellow
    return
}

if ($wasUpdate -and -not $configuredSpec -and $localCommit -and ($localCommit -eq $remoteCommit)) {
    Write-Ok (T "noUpdates")
    return
}

if ($wasUpdate) {
    Write-Host ("  " + (T "updateStart")) -ForegroundColor Gray
} else {
    Write-Host ("  " + (T "firstInstall")) -ForegroundColor Gray
}

try {
    $null = Invoke-ToolboxInstallOrUpdate $cliPath $configuredSpec $configPath $remoteCommit
} catch {
    Write-Host ""
    if ($wasUpdate) {
        Write-Fail (T "updateFailed")
    } else {
        Write-Fail (T "installFailed")
    }
    Write-Host ("  " + (T "errorDetails") + ": " + $_.Exception.Message) -ForegroundColor DarkGray
    Write-Host ("  " + (T "installHelp")) -ForegroundColor Yellow
    Write-Host ""
    return
}

Show-Success -WasUpdate:$wasUpdate
) {
            $owner = $Matches[1]
            $repository = $Matches[2]
            $gitRef = $Matches[3]
            $relativePath = $Matches[4]
            try {
                [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
                $apiUri = "https://api.github.com/repos/$owner/$repository/contents/$relativePath" +
                    "?ref=$([Uri]::EscapeDataString($gitRef))"
                $response = Invoke-RestMethod -Uri $apiUri -Headers @{
                    "User-Agent" = "OpenCode-Toolbox-Installer"
                    "Accept" = "application/vnd.github+json"
                } -TimeoutSec 30
                if ($response.encoding -ne "base64" -or [string]::IsNullOrWhiteSpace($response.content)) {
                    throw "GitHub Contents API returned no base64 file content."
                }
                $bytes = [Convert]::FromBase64String(($response.content -replace '\s', ''))
                [IO.File]::WriteAllBytes($Destination, $bytes)
                $downloaded = $bytes.Length -gt 0
            } catch {
                $apiError = $_.Exception.Message
                if (Test-Path -LiteralPath $Destination -PathType Leaf) {
                    Remove-Item -LiteralPath $Destination -Force -ErrorAction SilentlyContinue
                }
                throw "Download failed from raw.githubusercontent.com ($downloadError); GitHub API fallback also failed ($apiError)."
            }
        } else {
            throw "Download failed: $Uri. $downloadError"
        }
    }

    if (-not $downloaded -or -not (Test-Path -LiteralPath $Destination -PathType Leaf) -or (Get-Item -LiteralPath $Destination).Length -eq 0) {
        throw "Downloaded file is missing or empty: $Destination"
    }
}

function Invoke-ToolboxInstallOrUpdate([string]$CliPath, [string]$ConfiguredSpec, [string]$ConfigPath, [string]$Commit) {
    $pluginParent = Join-Path $env:USERPROFILE ".config\opencode\plugins"
    $pluginDirectory = Join-Path $pluginParent "opencode-toolbox"
    $stagingDirectory = Join-Path $pluginParent ("opencode-toolbox.staging-" + [guid]::NewGuid().ToString("N"))
    $backupDirectory = Join-Path $pluginParent ("opencode-toolbox.backup-" + [guid]::NewGuid().ToString("N"))
    $configBackup = $ConfigPath + ".toolbox-backup-" + [guid]::NewGuid().ToString("N")
    $hadConfig = Test-Path -LiteralPath $ConfigPath -PathType Leaf
    $originalPath = $env:Path

    # Prevent the user's opencode.cmd shim from being found by child processes.
    $env:Path = (($env:Path -split ";") | Where-Object {
        $_ -and -not [string]::Equals($_.TrimEnd([char]92), $ShimDirectory.TrimEnd([char]92), [StringComparison]::OrdinalIgnoreCase)
    }) -join ";"

    if ($hadConfig) { Copy-Item -LiteralPath $ConfigPath -Destination $configBackup -Force }
    New-Item -ItemType Directory -Path $stagingDirectory -Force | Out-Null
    New-Item -ItemType Directory -Path $pluginParent -Force | Out-Null

    try {
        if ($ConfiguredSpec) {
            & $CliPath plugin remove $ConfiguredSpec
            if ($LASTEXITCODE -ne 0) { throw "OpenCode could not remove the previous package-based Toolbox entry." }
        }

        $baseUrl = "https://raw.githubusercontent.com/OrionFalls/OpenCode-Toolbox/$Commit"
        foreach ($file in @("package.json", "index.js", "gui-experimental.cjs")) {
            Download-ToolboxFile ($baseUrl + "/" + $file) (Join-Path $stagingDirectory $file)
        }

        $package = Get-Content -LiteralPath (Join-Path $stagingDirectory "package.json") -Raw | ConvertFrom-Json
        if ($package.name -ne "opencode-toolbox" -or -not (Test-Path -LiteralPath (Join-Path $stagingDirectory "gui-experimental.cjs"))) {
            throw "Downloaded Toolbox package did not pass validation."
        }
        Set-Content -LiteralPath (Join-Path $stagingDirectory ".toolbox-commit") -Value $Commit -Encoding ASCII

        if (Test-Path -LiteralPath $pluginDirectory) {
            Move-Item -LiteralPath $pluginDirectory -Destination $backupDirectory
        }
        Move-Item -LiteralPath $stagingDirectory -Destination $pluginDirectory

        if (Test-Path -LiteralPath $backupDirectory) { Remove-Item -LiteralPath $backupDirectory -Recurse -Force -ErrorAction SilentlyContinue }
        if (Test-Path -LiteralPath $configBackup) { Remove-Item -LiteralPath $configBackup -Force }
        return $true
    } catch {
        if (Test-Path -LiteralPath $pluginDirectory -PathType Container) {
            Remove-Item -LiteralPath $pluginDirectory -Recurse -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path -LiteralPath $backupDirectory) {
            Move-Item -LiteralPath $backupDirectory -Destination $pluginDirectory -ErrorAction SilentlyContinue
        }
        if (Test-Path -LiteralPath $stagingDirectory) {
            Remove-Item -LiteralPath $stagingDirectory -Recurse -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path -LiteralPath $configBackup) {
            Copy-Item -LiteralPath $configBackup -Destination $ConfigPath -Force
            Remove-Item -LiteralPath $configBackup -Force
        }
        throw
    } finally {
        $env:Path = $originalPath
    }
}

function Show-Success([bool]$WasUpdate = $false) {
    Write-Host ""
    Write-Host ""
    Write-Host ("       " + (T "successTitle")) -ForegroundColor Green
    if ($WasUpdate) {
        Write-Host ("       " + (T "updatedBody")) -ForegroundColor White
    } else {
        Write-Host ("       " + (T "successBody")) -ForegroundColor White
    }
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
$configPath = Get-ToolboxConfigPath
$configuredSpec = Get-ConfiguredToolboxSpec $configPath
$pluginDirectory = Join-Path $env:USERPROFILE ".config\opencode\plugins\opencode-toolbox"
$localCommit = Get-LocalToolboxCommit $pluginDirectory
$wasUpdate = [bool]($configuredSpec -or (Test-Path -LiteralPath $pluginDirectory -PathType Container))

Write-Host ("  " + (T "checkingUpdate")) -ForegroundColor Gray
$remoteCommit = Get-RemoteToolboxCommit
if (-not $remoteCommit) {
    Write-Fail (T "updateCheckFailed")
    Write-Host ("  " + (T "installHelp")) -ForegroundColor Yellow
    return
}

if ($wasUpdate -and -not $configuredSpec -and $localCommit -and ($localCommit -eq $remoteCommit)) {
    Write-Ok (T "noUpdates")
    return
}

if ($wasUpdate) {
    Write-Host ("  " + (T "updateStart")) -ForegroundColor Gray
} else {
    Write-Host ("  " + (T "firstInstall")) -ForegroundColor Gray
}

try {
    $null = Invoke-ToolboxInstallOrUpdate $cliPath $configuredSpec $configPath $remoteCommit
} catch {
    Write-Host ""
    if ($wasUpdate) {
        Write-Fail (T "updateFailed")
    } else {
        Write-Fail (T "installFailed")
    }
    Write-Host ("  " + (T "errorDetails") + ": " + $_.Exception.Message) -ForegroundColor DarkGray
    Write-Host ("  " + (T "installHelp")) -ForegroundColor Yellow
    Write-Host ""
    return
}

Show-Success -WasUpdate:$wasUpdate
