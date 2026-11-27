import { Plugin } from "@opencode/plugin";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { registerTrueModelDisabler } from "./modules/true-model-disabler.js";
import { registerProviderDisabler } from "./modules/provider-and-mcp.js";
import { registerBulkModelToggle } from "./modules/bulk-model-toggle.js";

export const DEFAULT_SETTINGS = Object.freeze({
  modules: Object.freeze({
    trueModelDisabler: true,
    providerDisabler: false,
    bulkModelToggle: false,
    mcpGui: false,
    customProviders: false,
  }),
  disabledProviders: [],
  disabledMcpServers: [],
  modelEnabledOverrides: {},
});

export function resolveConfigDir(env = process.env, homeDir = os.homedir()) {
  if (env.OPENCODE_CONFIG_DIR) return path.resolve(env.OPENCODE_CONFIG_DIR);
  return path.join(homeDir, ".config", "opencode");
}

export function normalizeSettings(input = {}) {
  const value = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const modules = value.modules && typeof value.modules === "object" && !Array.isArray(value.modules) ? value.modules : {};
  const modelOverrides = value.modelEnabledOverrides && typeof value.modelEnabledOverrides === "object" && !Array.isArray(value.modelEnabledOverrides) ? value.modelEnabledOverrides : {};
  return {
    ...value,
    modules: {
      trueModelDisabler: modules.trueModelDisabler !== false,
      providerDisabler: Boolean(modules.providerDisabler),
      bulkModelToggle: Boolean(modules.bulkModelToggle),
      mcpGui: Boolean(modules.mcpGui),
      customProviders: Boolean(modules.customProviders),
    },
    disabledProviders: Array.isArray(value.disabledProviders) ? [...new Set(value.disabledProviders.filter(id => typeof id === "string" && id.trim()))] : [],
    disabledMcpServers: Array.isArray(value.disabledMcpServers) ? [...new Set(value.disabledMcpServers.filter(id => typeof id === "string" && id.trim()))] : [],
    modelEnabledOverrides: modelOverrides,
  };
}

export function readSettingsFile(filePath = path.join(resolveConfigDir(), "opencode-toolbox.json")) {
  try {
    if (!existsSync(filePath)) return normalizeSettings(DEFAULT_SETTINGS);
    return normalizeSettings(JSON.parse(readFileSync(filePath, "utf8")));
  } catch (error) {
    console.error("[opencode-toolbox] Cannot read shared settings:", error);
    return normalizeSettings(DEFAULT_SETTINGS);
  }
}

export default Plugin.define({
  id: "opencode-toolbox",
  async setup(ctx) {
    const settingsPath = path.join(resolveConfigDir(), "opencode-toolbox.json");
    const getSettings = () => readSettingsFile(settingsPath);
    const disposers = [];
    disposers.push(await registerTrueModelDisabler(ctx, () => getSettings().modules.trueModelDisabler));
    disposers.push(await registerProviderDisabler(ctx, getSettings));
    disposers.push(await registerBulkModelToggle(ctx, getSettings));
    console.info("[opencode-toolbox] v0.2.23 loaded");
    return async () => {
      for (const registration of disposers.reverse()) await registration.dispose?.();
    };
  },
});
