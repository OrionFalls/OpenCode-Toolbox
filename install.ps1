# OpenCode Toolbox — friendly Windows installer (PowerShell 5.1+)
# Run from PowerShell:
# irm https://raw.githubusercontent.com/OrionFalls/OpenCode-Toolbox/main/install.ps1 | iex

[CmdletBinding()]
param([switch]$ValidateOnly)

$ErrorActionPreference = "Stop"
$PluginSpec = "github:OrionFalls/OpenCode-Toolbox#main"
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
        error = "Something went wrong"
        errorDetails = "Details"
    }
    ru = @{
        subtitle = "Простая установка для OpenCode Desktop"
        welcome = "Добро пожаловать!"
        intro = "Мастер найдёт OpenCode, проверит его и установит Toolbox."
        step1 = "Поиск OpenCode"
        step2 = "Подготовка команды"
        step3 = "Установка Toolbox"
        found = "OpenCode найден."
        version = "Версия"
        pathAdded = "Команда будет доступна в новых окнах терминала."
        pathExists = "Каталог команды уже добавлен в пользовательский PATH."
        locating = "Не удалось автоматически найти OpenCode."
        choose = "Выберите opencode.exe или opencode-cli.exe в окне проводника."
        pickerUnavailable = "Окно выбора файла недоступно. Ниже можно указать полный путь вручную."
        enterPath = "Полный путь к OpenCode CLI (Enter — отмена)"
        invalidPath = "Не удалось запустить этот файл как OpenCode CLI. Попробуйте ещё раз."
        cancelled = "Установка отменена. Плагин не устанавливался."
        installStart = "Устанавливаем OpenCode Toolbox. Это может занять несколько минут..."
        installFailed = "Не удалось установить Toolbox."
        installHelp = "Проверьте подключение к интернету и GitHub, затем запустите эту команду ещё раз."
        diagnostics = "Для диагностики скопируйте эту команду"
        successTitle = "Всё готово!"
        successBody = "OpenCode Toolbox успешно установлен."
        next = "Что делать дальше"
        next1 = "Закройте и заново откройте OpenCode Desktop."
        next2 = "Откройте Настройки > Расширения > Плагины."
        next3 = "Найдите OpenCode Toolbox в списке."
        close = "Установка завершена. Это окно можно закрыть."
        newTerminal = "Чтобы использовать команду opencode, откройте новое окно PowerShell."
        footer = "Права администратора не нужны. Существующие настройки OpenCode не изменяются."
        error = "Что-то пошло не так"
        errorDetails = "Подробности"
    }
}

function T([string]$Key) { return $Text[$script:Language][$Key] }
function Write-Rule { Write-Host "  ----------------------------------------------------------------" -ForegroundColor DarkGray }
function Write-Step([int]$Number, [string]$Message) {
    Write-Host ""
    Write-Host ("  {0}/3  {1}" -f $Number, $Message) -ForegroundColor Cyan
}
function Write-Ok([string]$Message) { Write-Host ("  [OK]  " + $Message) -ForegroundColor Green }
function Write-Warn([string]$Message) { Write-Host ("  [!]   " + $Message) -ForegroundColor Yellow }
function Write-Fail([string]$Message) { Write-Host ("  [X]   " + $Message) -ForegroundColor Red }

function Show-Banner {
    Clear-Host
    Write-Host ""
    Write-Host "       ____                  ____          _        " -ForegroundColor Cyan
    Write-Host "      / __ \____  ___  ____  / / /___  ____| |__     " -ForegroundColor Cyan
    Write-Host "     / / / / __ \/ _ \/ __ \/ / / __ \/ ___/ //_/ " -ForegroundColor Cyan
    Write-Host "    / /_/ / /_/ /  __/ / / / / / /_/ / /__/ ,<      " -ForegroundColor Cyan
    Write-Host "    \____/ .___/\___/_/ /_/_/_/\____/\___/_/|_|     " -ForegroundColor Cyan
    Write-Host "        /_/       TOOLBOX                           " -ForegroundColor Cyan
    Write-Host ""
    Write-Host ("  " + (T "subtitle")) -ForegroundColor Gray
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
    Write-Host ("  [OK] " + (T "close")) -ForegroundColor Green
    Write-Host ("  " + (T "newTerminal")) -ForegroundColor Gray
    Write-Host ""
    Write-Host ("  " + (T "footer")) -ForegroundColor DarkGray
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
    Write-Ok (T "found")
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
