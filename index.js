import { Plugin } from "@opencode/plugin";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { registerTrueModelDisabler } from "./modules/true-model-disabler.js";
import { registerProviderDisabler } from "./modules/provider-and-mcp.js";
import { registerBulkModelToggle } from "./modules/bulk-model-toggle.js";

const CONFIG_DIR = process.env.OPENCODE_CONFIG_DIR ? path.resolve(process.env.OPENCODE_CONFIG_DIR) : path.join(os.homedir(), ".config", "opencode");
const SETTINGS_FILE = path.join(CONFIG_DIR, "opencode-toolbox.json");

const DEFAULTS = {
  modules: {
    trueModelDisabler: true,
    providerDisabler: false,
    bulkModelToggle: false,
    mcpGui: false,
    customProviders: false,
  },
  disabledProviders: [],
  disabledMcpServers: [],
  modelEnabledOverrides: {},
};

function readSettingsFile() {
  try {
    if (!existsSync(SETTINGS_FILE)) return DEFAULTS;
    const parsed = JSON.parse(readFileSync(SETTINGS_FILE, "utf8"));
    return { ...DEFAULTS, ...parsed, modules: { ...DEFAULTS.modules, ...(parsed.modules || {}) }, disabledProviders: Array.isArray(parsed.disabledProviders) ? parsed.disabledProviders : [], modelEnabledOverrides: parsed.modelEnabledOverrides && typeof parsed.modelEnabledOverrides === "object" ? parsed.modelEnabledOverrides : {} };
  } catch (error) { console.error("[opencode-toolbox] Cannot read shared settings:", error); return DEFAULTS; }
}

export default Plugin.define({
  id: "opencode-toolbox",
  async setup(ctx) {
    const disposers = [];
    // Register stable transforms; each reads the shared file when replayed.
    disposers.push(await registerTrueModelDisabler(ctx, () => readSettingsFile().modules.trueModelDisabler));
    disposers.push(await registerProviderDisabler(ctx, readSettingsFile));
    disposers.push(await registerBulkModelToggle(ctx, readSettingsFile));
    console.info("[opencode-toolbox] v0.2.21 loaded");
    return async () => {
      for (const registration of disposers.reverse()) {
        await registration.dispose?.();
      }
    };
  },
});
