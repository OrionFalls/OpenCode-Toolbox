# OpenCode Toolbox

**A modular enhancement suite for OpenCode Desktop.**

OpenCode Toolbox is a single plugin with its own settings page. Features are organized as independent modules that can be enabled or disabled separately.

> Current status: **0.1.0 — UI prototype.** The settings page and demo switches are implemented. The switches are not persisted and do not activate module functionality yet. The installer and GUI now support Russian and English.

## Modules

| Module | Purpose | Status |
| --- | --- | --- |
| **Model Visibility Guard** | Enforce the enabled/disabled model selection from OpenCode settings without removing hidden models from the catalog. | Planned |
| **Model Group Controls** | Add bulk enable/disable controls for models in a provider group. | Planned |
| **Provider Switcher** | Temporarily disable and re-enable a configured provider without deleting its settings or API key. | Planned |

## Install on Windows

Open PowerShell and run this single command:

```powershell
irm https://raw.githubusercontent.com/OrionFalls/OpenCode-Toolbox/main/install.ps1 | iex
```

The installer automatically selects Russian or English using the Windows display language. The same command handles both first-time installation and future updates: it compares the local Toolbox commit marker with the latest commit on GitHub, reports when no update is available, and refreshes only Toolbox when a newer commit exists. Toolbox is installed as a local OpenCode plugin, downloading its files directly from GitHub over HTTPS. This avoids Git/SSH requirements entirely.

The installer:

1. Checks whether `opencode` is already available.
2. Searches OpenCode Desktop's versioned CLI folders, common installation locations, App Paths registry entries, and Start Menu shortcuts.
3. Verifies a candidate by running `--version`.
4. If the CLI is bundled as `opencode-cli.exe`, creates a user-level `opencode.cmd` shim and adds its folder to the **user PATH** (no administrator rights required).
5. If automatic discovery fails, opens a file picker so you can select `opencode.exe` or `opencode-cli.exe`.
6. Migrates any previous package-based Toolbox installation to the local plugin folder, then downloads the current plugin files directly over HTTPS. No Git client or SSH key is required.

The installer does not change machine-wide settings, does not require administrator privileges, and does not download or execute an installer for OpenCode itself.

The installer supports Windows PowerShell 5.1 and newer. It uses UTF-8 output and preserves Russian text in Windows PowerShell 5.1.

After success, restart OpenCode Desktop and open:

**Settings → Extensions → Plugins → OpenCode Toolbox**

You can also open its settings with `/toolbox`.

## Languages

The GUI uses OpenCode's native plugin localization API (`ctx.t` and `Plugin.define({ i18n })`). It follows the language selected in OpenCode automatically:

- Russian OpenCode interface → Russian Toolbox interface.
- English OpenCode interface → English Toolbox interface.
- Other or unsupported locales → English fallback.

No separate language setting is required.

### Update

Run the exact same PowerShell command shown in **Install on Windows**. It detects the existing local plugin, checks GitHub, and updates Toolbox only when a newer commit is available. You do not need a separate update command.

### Remove

```powershell
Remove-Item "$env:USERPROFILE\.config\opencode\plugins\opencode-toolbox" -Recurse -Force
```

Restart OpenCode Desktop after removing the local plugin.

## Development

Requirements:

- OpenCode Desktop with GUI plugin support
- Node.js 20+
- Bun or npm for local development

Clone the repository:

```bash
git clone https://github.com/OrionFalls/OpenCode-Toolbox.git
cd OpenCode-Toolbox
```

The GUI entrypoint is currently plain CommonJS at `gui-experimental.cjs`. OpenCode provides `@opencode/plugin/gui` and `solid-js` at runtime, so no separate GUI installation step is required.

Run the syntax checks:

```bash
npm run check
```

## Compatibility

The Desktop GUI plugin API is experimental and may change between OpenCode releases. The first prototype targets the current OpenCode Desktop GUI plugin API.

## License

No license has been selected yet. Until a license is added, the repository is publicly viewable but reuse, redistribution, and modification are not granted by an open-source license.
