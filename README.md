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

## Install

Open the OpenCode terminal/CLI and run:

```bash
opencode plugin add github:OrionFalls/OpenCode-Toolbox#main
```

Then restart OpenCode Desktop (or reload its server). The plugin should appear under:

**Settings → Extensions → Plugins → OpenCode Toolbox**

Open the plugin's settings page from the settings navigation, or run the `/toolbox` command.

The command above installs the GitHub `main` branch. To update later:

```bash
opencode plugin update opencode-toolbox
```

To remove:

```bash
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

## Compatibility

The Desktop GUI plugin API is experimental and may change between OpenCode releases. The first prototype targets the current OpenCode Desktop GUI plugin API.

## License

No license has been selected yet. Until a license is added, the repository is publicly viewable but reuse, redistribution, and modification are not granted by an open-source license.
