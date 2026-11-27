import os from "node:os";
import path from "node:path";

export const DEFAULT_SETTINGS = Object.freeze({
  modules: Object.freeze({
    trueModelDisabler: true,
    providerDisabler: true,
    bulkModelToggle: true,
    mcpGui: true,
    customProviders: true,
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
      providerDisabler: true,
      bulkModelToggle: true,
      mcpGui: true,
      customProviders: true,
    },
    disabledProviders: Array.isArray(value.disabledProviders) ? [...new Set(value.disabledProviders.filter(id => typeof id === "string" && id.trim()))] : [],
    disabledMcpServers: Array.isArray(value.disabledMcpServers) ? [...new Set(value.disabledMcpServers.filter(id => typeof id === "string" && id.trim()))] : [],
    modelEnabledOverrides: modelOverrides,
  };
}
export function setMcpServerDisabled(settings, serverID, disabled) {
  const ids = new Set(settings.disabledMcpServers || []);
  if (disabled) ids.add(serverID);
  else ids.delete(serverID);
  return { ...settings, disabledMcpServers: [...ids] };
}
