# OpenCode Toolbox - Windows uninstaller (PowerShell 5.1+)
# Run from PowerShell:
# irm https://raw.githubusercontent.com/OrionFalls/OpenCode-Toolbox/main/uninstall.ps1 | iex

[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "Medium")]
param()

$ErrorActionPreference = "Stop"

try {
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    [Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
    $OutputEncoding = [Console]::OutputEncoding
    & $env:ComSpec /d /c chcp 65001 | Out-Null
} catch {}

$languageCandidates = @($PSUICulture, [Globalization.CultureInfo]::CurrentUICulture.Name, $env:LANG)
$language = "en"
foreach ($candidate in $languageCandidates) {
    if ($candidate -match '^(?i:ru)([-_]|$)') { $language = "ru"; break }
}

$messages = @{
    en = @{
        title = "OpenCode Toolbox uninstaller"
        searching = "Searching OpenCode configuration and plugin folders..."
        found = "Found Toolbox installation(s):"
        none = "OpenCode Toolbox was not found. Nothing was changed."
        removed = "Removed"
        skipped = "Skipped"
        complete = "OpenCode Toolbox removal is complete."
        restart = "Close and reopen OpenCode Desktop to refresh the plugin list."
        dryRun = "Preview only: no files were deleted."
        failed = "Could not remove"
        legacy = "Legacy package cache"
        local = "Local plugin"
    }
    ru = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("eyJ0aXRsZSI6ItCj0LTQsNC70LXQvdC40LUgT3BlbkNvZGUgVG9vbGJveCIsInNlYXJjaGluZyI6ItCY0YnQtdC8IFRvb2xib3gg0LIg0LrQsNGC0LDQu9C+0LPQsNGFINC60L7QvdGE0LjQs9GD0YDQsNGG0LjQuCDQuCDQv9C70LDQs9C40L3QvtCyIE9wZW5Db2RlLi4uIiwiZm91bmQiOiLQndCw0LnQtNC10L3RiyDRg9GB0YLQsNC90L7QstC60LggVG9vbGJveDoiLCJub25lIjoiT3BlbkNvZGUgVG9vbGJveCDQvdC1INC90LDQudC00LXQvS4g0JjQt9C80LXQvdC10L3QuNC5INC90LXRgi4iLCJyZW1vdmVkIjoi0KPQtNCw0LvQtdC90L4iLCJza2lwcGVkIjoi0J/RgNC+0L/Rg9GJ0LXQvdC+IiwiY29tcGxldGUiOiLQo9C00LDQu9C10L3QuNC1IE9wZW5Db2RlIFRvb2xib3gg0LfQsNCy0LXRgNGI0LXQvdC+LiIsInJlc3RhcnQiOiLQl9Cw0LrRgNC+0LnRgtC1INC4INC30LDQvdC+0LLQviDQvtGC0LrRgNC+0LnRgtC1IE9wZW5Db2RlIERlc2t0b3AsINGH0YLQvtCx0Ysg0L7QsdC90L7QstC40YLRjCDRgdC/0LjRgdC+0Log0L/Qu9Cw0LPQuNC90L7Qsi4iLCJkcnlSdW4iOiLQn9GA0LXQtNCy0LDRgNC40YLQtdC70YzQvdGL0Lkg0L/RgNC+0YHQvNC+0YLRgDog0YTQsNC50LvRiyDQvdC1INGD0LTQsNC70Y/Qu9C40YHRjC4iLCJmYWlsZWQiOiLQndC1INGD0LTQsNC70L7RgdGMINGD0LTQsNC70LjRgtGMIiwibGVnYWN5Ijoi0KHRgtCw0YDRi9C5INC60Y3RiCDQv9Cw0LrQtdGC0LAiLCJsb2NhbCI6ItCb0L7QutCw0LvRjNC90YvQuSDQv9C70LDQs9C40L0ifQ==")) | ConvertFrom-Json
}

function T([string]$Key) {
    $entry = $messages[$language]
    if ($null -eq $entry) { return $Key }
    if ($entry -is [hashtable]) {
        if ($entry.ContainsKey($Key)) { return [string]$entry[$Key] }
        return $Key
    }
    $property = $entry | Select-Object -ExpandProperty $Key -ErrorAction SilentlyContinue
    if ($null -ne $property) { return [string]$property }
    return $Key
}

function Get-OpenCodeConfigRoots {
    $roots = New-Object System.Collections.Generic.List[string]
    if ($env:XDG_CONFIG_HOME) { $roots.Add((Join-Path $env:XDG_CONFIG_HOME "opencode")) }
    if ($env:USERPROFILE) { $roots.Add((Join-Path $env:USERPROFILE ".config\opencode")) }
    if ($env:APPDATA) { $roots.Add((Join-Path $env:APPDATA "opencode")) }

    # Prefer the active config path reported by OpenCode itself.
    try {
        $command = Get-Command "opencode" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($command) {
            $output = & $command.Source debug paths 2>$null
            foreach ($line in $output) {
                if ([string]$line -match '^\s*config\s+(.+?)\s*$') { $roots.Add($Matches[1].Trim()) }
            }
        }
    } catch {}

    $seen = @{}
    foreach ($root in $roots) {
        if ([string]::IsNullOrWhiteSpace($root)) { continue }
        $full = [Environment]::ExpandEnvironmentVariables($root)
        try { $full = [IO.Path]::GetFullPath($full) } catch {}
        $key = $full.TrimEnd([char]92)
        if (-not $seen.ContainsKey($key)) {
            $seen[$key] = $true
            if (Test-Path -LiteralPath $full -PathType Container) { $full }
        }
    }
}

function Test-ToolboxPluginDirectory([string]$Directory) {
    $packagePath = Join-Path $Directory "package.json"
    if (Test-Path -LiteralPath $packagePath -PathType Leaf) {
        try {
            $package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
            if ($package.name -eq "opencode-toolbox") { return $true }
        } catch {}
    }

    $marker = Join-Path $Directory ".toolbox-commit"
    $entry = Join-Path $Directory "index.js"
    if ((Test-Path -LiteralPath $marker -PathType Leaf) -and (Test-Path -LiteralPath $entry -PathType Leaf)) {
        $source = Get-Content -LiteralPath $entry -Raw
        if ($source -match 'id\s*:\s*["'']opencode-toolbox["'']') { return $true }
    }
    return $false
}

function Find-ToolboxInstallations {
    $results = New-Object System.Collections.Generic.List[object]
    $seen = @{}

    foreach ($configRoot in (Get-OpenCodeConfigRoots)) {
        $pluginsRoot = Join-Path $configRoot "plugins"
        if (-not (Test-Path -LiteralPath $pluginsRoot -PathType Container)) { continue }

        $directories = @()
        $directories += Get-ChildItem -LiteralPath $pluginsRoot -Directory -ErrorAction SilentlyContinue
        $directories += Get-ChildItem -LiteralPath $pluginsRoot -Directory -Recurse -ErrorAction SilentlyContinue

        foreach ($directory in $directories) {
            if (Test-ToolboxPluginDirectory $directory.FullName) {
                $key = $directory.FullName.TrimEnd([char]92)
                if (-not $seen.ContainsKey($key)) {
                    $seen[$key] = $true
                    $results.Add([pscustomobject]@{ Path = $directory.FullName; Kind = (T "local") })
                }
            }
        }
    }

    # Remove a legacy npm/Git cache only after verifying the package name.
    if ($env:USERPROFILE) {
        $npmRoot = Join-Path $env:USERPROFILE ".cache\opencode\npm"
        if (Test-Path -LiteralPath $npmRoot -PathType Container) {
            $legacyDirectories = Get-ChildItem -LiteralPath $npmRoot -Directory -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -like "git-OpenCode-Toolbox-*" }

            foreach ($directory in $legacyDirectories) {
                $isToolbox = $false
                $packageFiles = Get-ChildItem -LiteralPath $directory.FullName -Filter "package.json" -File -Recurse -ErrorAction SilentlyContinue
                foreach ($packageFile in $packageFiles) {
                    try {
                        $package = Get-Content -LiteralPath $packageFile.FullName -Raw | ConvertFrom-Json
                        if ($package.name -eq "opencode-toolbox") { $isToolbox = $true; break }
                    } catch {}
                }

                if ($isToolbox) {
                    $key = $directory.FullName.TrimEnd([char]92)
                    if (-not $seen.ContainsKey($key)) {
                        $seen[$key] = $true
                        $results.Add([pscustomobject]@{ Path = $directory.FullName; Kind = (T "legacy") })
                    }
                }
            }
        }
    }

    return $results
}

Write-Host ""
Write-Host (T "title") -ForegroundColor Cyan
Write-Host (T "searching") -ForegroundColor Gray
Write-Host ""

$installations = @(Find-ToolboxInstallations)
if ($installations.Count -eq 0) {
    Write-Host (T "none") -ForegroundColor Yellow
    return
}

Write-Host (T "found") -ForegroundColor Cyan
foreach ($installation in $installations) {
    Write-Host ("  [{0}] {1}" -f $installation.Kind, $installation.Path) -ForegroundColor White
}

Write-Host ""
$removed = 0
$skipped = 0
$failed = 0

foreach ($installation in $installations) {
    $removeError = $null
    if ($WhatIfPreference) {
        Write-Host ("WhatIf: Would remove {0}" -f $installation.Path) -ForegroundColor Yellow
        $skipped++
        continue
    }

    try {
        if (Test-Path -LiteralPath $installation.Path -PathType Container) {
            [System.IO.Directory]::Delete($installation.Path, $true)
        } elseif (Test-Path -LiteralPath $installation.Path -PathType Leaf) {
            [System.IO.File]::Delete($installation.Path)
        } else {
            throw "The detected installation path no longer exists."
        }
        if (Test-Path -LiteralPath $installation.Path) {
            throw "The installation path still exists after the removal attempt."
        }
    } catch {
        $removeError = $_
    }

    if ($null -ne $removeError) {
        Write-Host ("  {0}: {1}" -f (T "failed"), $installation.Path) -ForegroundColor Red
        $detail = $removeError.Exception.Message
        if ([string]::IsNullOrWhiteSpace($detail)) { $detail = $removeError.ToString() }
        Write-Host ("    " + $detail) -ForegroundColor DarkGray
        $failed++
    } else {
        Write-Host ("  {0}: {1}" -f (T "removed"), $installation.Path) -ForegroundColor Green
        $removed++
    }
}

Write-Host ""
if ($WhatIfPreference) {
    Write-Host (T "dryRun") -ForegroundColor Yellow
} elseif ($removed -gt 0) {
    Write-Host (T "complete") -ForegroundColor Green
    Write-Host (T "restart") -ForegroundColor Gray
}
if ($skipped -gt 0 -or $failed -gt 0) {
    Write-Host ("Removed: {0}; skipped: {1}; failed: {2}" -f $removed, $skipped, $failed) -ForegroundColor Yellow
}
Write-Host ""
