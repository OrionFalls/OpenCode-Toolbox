import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");

test("Windows installer downloads every local runtime module imported by the server entry", () => {
  const entry = read("../index.js");
  const installer = read("../install.ps1");
  const imports = [...entry.matchAll(/from\s+["'](\.\/[^"']+)["']/g)].map((match) => match[1]);
  for (const specifier of imports) {
    const relativePath = specifier.replace(/^\.\//, "");
    assert.ok(
      installer.includes('"'+relativePath+'"'),
      `install.ps1 download manifest is missing ${relativePath}`,
    );
  }
});

test("Windows installer validates the complete server runtime before replacing the installation", () => {
  const installer = read("../install.ps1");
  for (const file of [
    "modules/true-model-disabler.js",
    "modules/provider-and-mcp.js",
    "modules/bulk-model-toggle.js",
    "modules/settings.js",
    "modules/settings-watcher.js",
  ]) {
    assert.ok(installer.includes('"'+file+'"'), `installer does not include ${file}`);
  }
  assert.match(installer, /\$missingFiles\.Count\s+-gt\s+0/);
});

test("Package exports point to files included by the installer", () => {
  const pkg = JSON.parse(read("../package.json"));
  const installer = read("../install.ps1");
  for (const target of [pkg.main, ...Object.values(pkg.exports)]) {
    const relativePath = target.replace(/^\.\//, "");
    assert.ok(installer.includes('"'+relativePath+'"'), `installer does not include package entry ${relativePath}`);
  }
});

test("GUI module pages call the declared ToolboxIpc method and parse its JSON payload", () => {
  const gui = read("../gui-experimental.cjs");
  assert.doesNotMatch(gui, /getModuleSettings\s*\(/);
  assert.match(gui, /const raw = await ctx\.main\(ToolboxIpc\)\.getSettings\(\)/);
  assert.match(gui, /const rawSettings = await api\(\)\.getSettings\(\)/);
  assert.match(gui, /const ToolboxIpc = Ipc\.define\([\s\S]*?getSettings:\s*\{\s*output:\s*Schema\.String\s*\}/);
});

test("Toolbox hides disabled module panels and registers MCP-GUI when enabled", () => {
  const gui = read("../gui-experimental.cjs");
  assert.match(gui, /settings\(\)\.modules\.providerDisabler\s*\?/);
  assert.match(gui, /settings\(\)\.modules\.bulkModelToggle\s*\?/);
  assert.match(gui, /setupMcpGuiPage\(ctx\)/);
  assert.match(gui, /if\s*\(!settings\.modules\?\.mcpGui\)\s*return/);
  assert.match(gui, /if\s*\(!customProvidersEnabled\)\s*return/);
});

test("Toolbox exposes a native Desktop restart action through main-process IPC", () => {
  const gui = read("../gui-experimental.cjs");
  assert.match(gui, /reloadWindow:\s*\{\s*output:/);
  assert.match(gui, /async reloadWindow\(\)[\s\S]*?BrowserWindow\.getFocusedWindow\(\)[\s\S]*?window\.webContents\.reload\(\)/);
  assert.doesNotMatch(gui, /app\.relaunch\(\)|app\.exit\(0\)/);
  assert.match(gui, /children:"Restart OpenCode"/);
});

test("MCP-GUI reads registration settings from ToolboxIpc, not McpIpc", () => {
  const gui = read("../gui-experimental.cjs");
  const section = gui.slice(gui.indexOf("function setupMcpGuiPage"), gui.indexOf("function setupToolboxPage"));
  assert.match(section, /toolboxApi\(\)\.getSettings\(\)/);
  assert.doesNotMatch(section, /api\(\)\.getSettings\(\)/);
});

test("Toolbox page contains only True Model Disabler, Provider Disabler and compact Bulk controls", () => {
  const gui = read("../gui-experimental.cjs");
  const section = gui.slice(gui.indexOf("function setupToolboxPage"), gui.indexOf("exports.default"));
  assert.doesNotMatch(section, /createComponent\(ui.SettingsSection,\{title:"Modules"/);
  assert.match(section, /title:"True Model Disabler"/);
  assert.match(section, /title:"Provider Disabler"/);
  assert.match(section, /title:"Bulk Model Toggle"/);
  assert.match(section, /children:"Enable all"/);
  assert.match(section, /children:"Disable all"/);
  assert.doesNotMatch(section, /Reset overrides|Models found|Saved overrides/);
});

test("Settings watcher reloads provider and model transforms after shared settings changes", async () => {
  const { watchSettingsFile } = await import("../modules/settings-watcher.js");
  let listener, closed = false, providers = 0, models = 0;
  const stop = watchSettingsFile({
    provider: { async reload() { providers++; } },
    model: { async reload() { models++; } },
  }, "/tmp/opencode/opencode-toolbox.json", (directory, options, callback) => {
    assert.equal(directory, "/tmp/opencode");
    assert.equal(options.persistent, false);
    listener = callback;
    return { close() { closed = true; } };
  });
  listener("rename", "opencode-toolbox.json");
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.equal(providers, 1);
  assert.equal(models, 1);
  stop();
  assert.equal(closed, true);
});
