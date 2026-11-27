/**
 * Provider and MCP policy transforms.
 * Provider and MCP definitions remain intact; only activation/disabled state changes.
 */
export async function registerProviderDisabler(ctx, getSettings) {
  return ctx.provider.transform((editor) => {
    const disabled = new Set(getSettings().disabledProviders || []);
    for (const record of editor.list()) {
      const id = record.provider.id;
      if (!id) continue;
      editor.update(id, (provider) => {
        if (disabled.has(id)) provider.activation = "disabled";
        else if (provider.activation === "disabled") provider.activation = "enabled";
      });
    }
  });
}

export async function registerMcpPolicy(ctx, getSettings) {
  return ctx.mcp.transform((editor) => {
    const disabled = new Set(getSettings().disabledMcpServers || []);
    for (const [name] of editor.list()) {
      editor.update(name, (server) => {
        server.disabled = disabled.has(name);
      });
    }
  });
}

export async function setProviderDisabled(ctx, providerID, disabled) {
  const current = await ctx.storage.get("settings") || {};
  const ids = new Set(current.disabledProviders || []);
  if (disabled) ids.add(providerID);
  else ids.delete(providerID);
  await ctx.storage.set("settings", { ...current, disabledProviders: [...ids] });
  await ctx.provider.reload();
}

export async function setMcpDisabled(ctx, name, disabled) {
  const current = await ctx.storage.get("settings") || {};
  const names = new Set(current.disabledMcpServers || []);
  if (disabled) names.add(name);
  else names.delete(name);
  await ctx.storage.set("settings", { ...current, disabledMcpServers: [...names] });
  await ctx.mcp.reload();
}
