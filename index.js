import { Plugin } from "@opencode/plugin";
import { registerTrueModelDisabler } from "./modules/true-model-disabler.js";
import { registerProviderDisabler, registerMcpPolicy } from "./modules/provider-and-mcp.js";

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
};

export default Plugin.define({
  id: "opencode-toolbox",
  async setup(ctx) {
    const stored = await ctx.storage.get("settings") || {};
    const settings = {
      ...DEFAULTS,
      ...stored,
      modules: { ...DEFAULTS.modules, ...(stored.modules || {}) },
      disabledProviders: Array.isArray(stored.disabledProviders) ? stored.disabledProviders : [],
      disabledMcpServers: Array.isArray(stored.disabledMcpServers) ? stored.disabledMcpServers : [],
    };
    await ctx.storage.set("settings", settings);

    const getSettings = () => settings;
    const disposers = [];

    if (settings.modules.trueModelDisabler) {
      disposers.push(await registerTrueModelDisabler(ctx, () => settings.modules.trueModelDisabler));
    }
    if (settings.modules.providerDisabler) {
      disposers.push(await registerProviderDisabler(ctx, getSettings));
    }
    if (settings.modules.mcpGui) {
      disposers.push(await registerMcpPolicy(ctx, getSettings));
    }

    console.info("[opencode-toolbox] v0.2.0 loaded");
    return async () => {
      for (const registration of disposers.reverse()) {
        await registration.dispose?.();
      }
    };
  },
});
