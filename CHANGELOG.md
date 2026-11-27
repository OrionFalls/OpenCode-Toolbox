# Changelog

## 0.2.1 — Policy persistence and upstream source import

- Correct provider transform iteration to use ProviderRecord.provider.id.
- Make bulk model overrides persistent across model catalog reloads.
- Read current model inventory from the OpenCode model API before applying bulk operations.
- Import the upstream Custom Providers GUI source and its original MIT license into `vendor/custom-provider`.
- Update documentation and version metadata.

## 0.2.0 — Modular foundation

- Port the True Model Disabler server-side guard into the Toolbox package.
- Add provider and MCP transform modules with plugin-scoped settings.
- Add the first bulk model operation helper.
- Align package, GUI, and documentation version.

## 0.1.0 — UI prototype

- Add the OpenCode Toolbox package and Desktop GUI entrypoint.
- Add a dedicated Toolbox settings page.
- Add the `/toolbox` command.
