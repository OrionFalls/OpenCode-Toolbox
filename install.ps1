# OpenCode Toolbox bootstrap installer for Windows PowerShell 5.1+
# Run: irm https://raw.githubusercontent.com/OrionFalls/OpenCode-Toolbox/main/install.ps1 | iex

[CmdletBinding()]
param([switch]$ValidateOnly)

$ErrorActionPreference = "Stop"
$PluginSpec = "github:OrionFalls/OpenCode-Toolbox#main"
$ShimDirectory = Join-Path $env:LOCALAPPDATA "OpenCode\bin"
$ShimPath = Join-Path $ShimDirectory "opencode.cmd"
$script:DetectedVersion = $null

function Write-Info([string]$Message) { Write-Host "[Toolbox] $Message" -ForegroundColor Cyan }
function Write-Ok([string]$Message) { Write-Host "[Toolbox] $Message" -ForegroundColor Green }
function Write-Warn([string]$Message) { Write-Host "[Toolbox] $Message" -ForegroundColor Yellow }
function Write-Fail([string]$Message) { Write-Host "[Toolbox] $Message" -ForegroundColor Red }

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
    Write-Warn "OpenCode CLI was not found automatically."
    Write-Host "Select opencode.exe or opencode-cli.exe in the file picker."
    try {
        Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
        $dialog = New-Object System.Windows.Forms.OpenFileDialog
        $dialog.Title = "Locate the OpenCode CLI executable"
        $dialog.Filter = "OpenCode CLI (opencode.exe;opencode-cli.exe)|opencode.exe;opencode-cli.exe|Executable files (*.exe)|*.exe"
        $dialog.CheckFileExists = $true
        $dialog.Multiselect = $false
        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { return $dialog.FileName }
    } catch { Write-Warn "The file picker is unavailable in this session." }

    $manual = Read-Host "Enter the full path to opencode.exe or opencode-cli.exe (Enter to cancel)"
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
        Write-Ok "Added to the user PATH: $Directory"
    }
    if (($env:Path -split ";") -notcontains $Directory) { $env:Path = $env:Path.TrimEnd(";") + ";" + $Directory }
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
    Add-UserPath $ShimDirectory
}

Write-Host ""
Write-Host "  OPENCODE TOOLBOX - WINDOWS INSTALLER" -ForegroundColor White
Write-Host "  ------------------------------------" -ForegroundColor DarkGray
Write-Host ""

$cliPath = Find-OpenCodeCli
while (-not $cliPath) {
    $manualPath = Request-ManualCliPath
    if (-not $manualPath) {
        Write-Fail "Installation cancelled. No changes were made."
        return
    }
    if (Test-OpenCodeCli $manualPath) {
        $cliPath = (Resolve-Path -LiteralPath $manualPath).Path
    } else {
        Write-Fail "The selected file is missing or is not a working OpenCode CLI: $manualPath"
        Write-Host "Please try again."
    }
}

Write-Ok "Found OpenCode CLI: $cliPath"
if ($script:DetectedVersion) { Write-Info "Version: $script:DetectedVersion" }

if ($ValidateOnly) {
    Write-Ok "Validation complete. Installation and PATH changes were skipped."
    return
}

try {
    Install-CommandShim $cliPath
    Write-Ok "The opencode command is now available through the user PATH."
} catch {
    Write-Warn "Could not update PATH/shim: $($_.Exception.Message)"
    Write-Warn "Continuing by calling the CLI through its full path."
}

Write-Info "Installing OpenCode Toolbox from GitHub..."
try {
    & $cliPath plugin add $PluginSpec
    $installExitCode = $LASTEXITCODE
} catch {
    $installExitCode = 1
    Write-Fail $_.Exception.Message
}

if ($installExitCode -ne 0) {
    Write-Fail "OpenCode CLI returned installation exit code $installExitCode."
    Write-Host "Check your GitHub connection and Git installation, then run the installer again."
    Write-Host "Diagnostics: $cliPath plugin list"
    return
}

Write-Host ""
Write-Ok "OpenCode Toolbox installed successfully."
Write-Host "Restart OpenCode Desktop and open Settings > Extensions > Plugins."
Write-Host "If opencode is not available in existing terminals, open a new PowerShell window."
