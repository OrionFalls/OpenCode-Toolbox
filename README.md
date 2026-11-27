# OpenCode Toolbox

**A modular enhancement suite for OpenCode Desktop.**

OpenCode Toolbox is a single plugin with its own settings page. Features are organized as independent modules that can be enabled or disabled separately.

> Current status: **0.1.0 — UI prototype.** The settings page and demo switches are implemented. The switches are not persisted and do not activate module functionality yet.

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

The self-healing installer:

1. Checks whether `opencode` is already available.
2. Searches OpenCode Desktop's versioned CLI folders, common installation locations, App Paths registry entries, and Start Menu shortcuts.
3. Verifies a candidate by running `--version`.
4. If the CLI is bundled as `opencode-cli.exe`, creates a user-level `opencode.cmd` shim and adds its folder to the **user PATH** (no administrator rights required).
5. If automatic discovery fails, opens a file picker so you can select `opencode.exe` or `opencode-cli.exe`.
6. Continues with plugin installation using the exact discovered executable path, so the current session does not depend on PATH refresh.

The installer does not change machine-wide settings, does not require administrator privileges, and does not download or execute an installer for OpenCode itself.

After success, restart OpenCode Desktop and open:

**Settings → Extensions → Plugins → OpenCode Toolbox**

You can also open its settings with `/toolbox`.

### Manual install

If you already have the CLI in PATH:

```powershell
opencode plugin add github:OrionFalls/OpenCode-Toolbox#main
```

### Update

```powershell
opencode plugin update opencode-toolbox
```

### Remove

```powershell
opencode plugin remove opencode-toolbox
```

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
