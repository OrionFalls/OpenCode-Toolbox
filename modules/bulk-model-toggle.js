/**
 * Persistent bulk model policy. Overrides are stored by provider/model ID and
 * replayed on each catalogue transform while the module is enabled.
 */
export async function registerBulkModelToggle(ctx, getSettings) {
  return ctx.model.transform((editor) => {
    const settings = getSettings();
    if (!settings.modules?.bulkModelToggle) return;
    const overrides = settings.modelEnabledOverrides || {};
    for (const [providerID, models] of Object.entries(overrides)) {
      if (!models || typeof models !== "object" || Array.isArray(models)) continue;
      for (const [modelID, enabled] of Object.entries(models)) {
        editor.update(providerID, modelID, (draft) => {
          draft.enabled = Boolean(enabled);
        });
      }
    }
  });
}

export async function setProviderModelsEnabled(ctx, providerID, enabled, runtimeSettings) {
  const models = await ctx.model.list();
  const targets = models.filter((model) => model.providerID === providerID);
  if (!targets.length) return { changed: 0, providerID, enabled: Boolean(enabled) };

  const current = await ctx.storage.get("settings") || {};
  const overrides = { ...(current.modelEnabledOverrides || {}) };
  overrides[providerID] = { ...(overrides[providerID] || {}) };
  for (const model of targets) overrides[providerID][model.id] = Boolean(enabled);

  const next = { ...current, modelEnabledOverrides: overrides };
  if (runtimeSettings) runtimeSettings.modelEnabledOverrides = overrides;
  await ctx.storage.set("settings", next);
  await ctx.model.reload();
  return { changed: targets.length, providerID, enabled: Boolean(enabled) };
}


/**
 * Remove only the saved model-enabled overrides for one provider.
 * Native/catalog defaults become authoritative again after reload.
 */
export async function resetProviderModelOverrides(ctx, providerID, runtimeSettings) {
  const current = await ctx.storage.get("settings") || {};
  const overrides = { ...(current.modelEnabledOverrides || {}) };
  const removed = overrides[providerID] && typeof overrides[providerID] === "object"
    ? Object.keys(overrides[providerID]).length
    : 0;
  delete overrides[providerID];
  const next = { ...current, modelEnabledOverrides: overrides };
  if (runtimeSettings) runtimeSettings.modelEnabledOverrides = overrides;
  await ctx.storage.set("settings", next);
  if (removed > 0) await ctx.model.reload();
  return { removed, providerID };
}
