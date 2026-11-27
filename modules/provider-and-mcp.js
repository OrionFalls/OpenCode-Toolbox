/**
 * Provider and MCP policy transforms.
 *
 * The UI writes provider IDs and MCP names to the Toolbox settings record.
 * The transforms are replayable and never delete provider credentials or MCP
 * definitions. Call the relevant domain reload after changing these values.
 */
export async function registerProviderDisabler(ctx, getSettings) {
  return ctx.provider.transform((editor) => {
    const disabled = new Set(getSettings().disabledProviders || []);
    for (const [id] of editor.list()) {
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
