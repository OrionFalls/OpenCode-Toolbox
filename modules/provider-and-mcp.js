/**
 * Provider and MCP policy transforms.
 *
 * Toolbox only disables providers explicitly listed by the user. When a
 * provider is not in that list, the transform does not touch its activation
 * property, preserving the native OpenCode configuration.
 */
export async function registerProviderDisabler(ctx, getSettings) {
  return ctx.provider.transform((editor) => {
    const settings = getSettings();
    const disabled = new Set(settings.disabledProviders || []);
    for (const record of editor.list()) {
      const id = record.provider.id;
      if (!disabled.has(id)) continue;
      editor.update(id, (provider) => {
        provider.activation = "disabled";
      });
    }
  });
}

export async function registerMcpPolicy(ctx, getSettings) {
  return ctx.mcp.transform((editor) => {
    const disabled = new Set(getSettings().disabledMcpServers || []);
    for (const [name] of editor.list()) {
      editor.update(name, (server) => {
        // MCP-GUI's opencode.jsonc mcp.servers[*].disabled remains authoritative.
        // This legacy transform is intentionally a no-op unless a Toolbox
        // override is explicitly provided in settings.
        if (disabled.has(name)) server.disabled = true;
      });
    }
  });
}

export async function setProviderDisabled(ctx, providerID, disabled, runtimeSettings) {
  const current = await ctx.storage.get("settings") || {};
  const ids = new Set(current.disabledProviders || []);
  if (disabled) ids.add(providerID);
  else ids.delete(providerID);
  const next = { ...current, disabledProviders: [...ids] };
  if (runtimeSettings) Object.assign(runtimeSettings, next);
  await ctx.storage.set("settings", next);
  await ctx.provider.reload();
}

export async function setMcpDisabled(ctx, name, disabled, runtimeSettings) {
  const current = await ctx.storage.get("settings") || {};
  const names = new Set(current.disabledMcpServers || []);
  if (disabled) names.add(name);
  else names.delete(name);
  const next = { ...current, disabledMcpServers: [...names] };
  if (runtimeSettings) Object.assign(runtimeSettings, next);
  await ctx.storage.set("settings", next);
  await ctx.mcp.reload();
}
