import { Plugin } from "@opencode/plugin";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { registerTrueModelDisabler } from "./modules/true-model-disabler.js";
import { registerProviderDisabler } from "./modules/provider-and-mcp.js";
import { registerBulkModelToggle } from "./modules/bulk-model-toggle.js";
import { normalizeSettings, resolveConfigDir } from "./modules/settings.js";
import { watchSettingsFile } from "./modules/settings-watcher.js";

export { DEFAULT_SETTINGS, normalizeSettings, resolveConfigDir } from "./modules/settings.js";

export function readSettingsFile(filePath = path.join(resolveConfigDir(), "opencode-toolbox.json")) {
  try {
    if (!existsSync(filePath)) return normalizeSettings();
    return normalizeSettings(JSON.parse(readFileSync(filePath, "utf8")));
  } catch (error) {
    console.error("[opencode-toolbox] Cannot read shared settings:", error);
    return normalizeSettings();
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
    const stopWatchingSettings = watchSettingsFile(ctx, settingsPath);
    console.info("[opencode-toolbox] v0.2.41 loaded");
    return async () => {
      stopWatchingSettings();
      for (const registration of disposers.reverse()) await registration.dispose?.();
    };
  },
});
