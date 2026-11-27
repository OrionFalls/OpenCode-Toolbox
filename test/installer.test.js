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
  assert.match(gui, /restartApp:\s*\{\s*output:/);
  assert.match(gui, /async restartApp\(\)[\s\S]*?app\.relaunch\(\)[\s\S]*?app\.exit\(0\)/);
  assert.match(gui, /children:"Restart OpenCode"/);
});
