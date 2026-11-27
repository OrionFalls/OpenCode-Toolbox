/**
 * Persistent bulk model policy.
 *
 * Model enabled state is applied to provider source definitions. This keeps
 * disabled models in the native Models settings so their switches remain
 * visible and can be turned back on.
 */
export async function registerBulkModelToggle(ctx, getSettings) {
  return ctx.provider.transform((editor) => {
    const settings = getSettings();
    const providerOverrides = settings.providerEnabledOverrides || {};
    const legacyOverrides = settings.modelEnabledOverrides || {};

    for (const record of editor.list()) {
      const providerID = record.provider.id;
      const models = record.models;
      if (!(models instanceof Map)) continue;

      if (Object.prototype.hasOwnProperty.call(providerOverrides, providerID)) {
        const enabled = Boolean(providerOverrides[providerID]);
        for (const modelID of models.keys()) {
          editor.models.update(providerID, modelID, (draft) => {
            draft.enabled = enabled;
          });
        }
        continue;
      }

      // Backward compatibility with per-model overrides saved by versions <= 0.2.39.
      const perModel = legacyOverrides[providerID];
      if (!perModel || typeof perModel !== "object" || Array.isArray(perModel)) continue;
      for (const [modelID, enabled] of Object.entries(perModel)) {
        if (!models.has(modelID)) continue;
        editor.models.update(providerID, modelID, (draft) => {
          draft.enabled = Boolean(enabled);
        });
      }
    }
  });
}

export async function setProviderModelsEnabled(ctx, providerID, enabled, runtimeSettings) {
  if (!providerID) throw new Error("providerID is required");
  const current = await ctx.storage.get("settings") || {};
  const providerEnabledOverrides = {
    ...(current.providerEnabledOverrides || {}),
    [providerID]: Boolean(enabled),
  };
  const next = { ...current, providerEnabledOverrides };
  if (runtimeSettings) Object.assign(runtimeSettings, next);
  await ctx.storage.set("settings", next);
  await ctx.provider.reload();
  return { providerID, enabled: Boolean(enabled) };
}

export async function resetProviderModelOverrides(ctx, providerID, runtimeSettings) {
  const current = await ctx.storage.get("settings") || {};
  const providerEnabledOverrides = { ...(current.providerEnabledOverrides || {}) };
  const legacyOverrides = { ...(current.modelEnabledOverrides || {}) };
  const hadProviderOverride = Object.prototype.hasOwnProperty.call(providerEnabledOverrides, providerID);
  const removedLegacy = legacyOverrides[providerID] && typeof legacyOverrides[providerID] === "object"
    ? Object.keys(legacyOverrides[providerID]).length
    : 0;
  delete providerEnabledOverrides[providerID];
  delete legacyOverrides[providerID];
  const next = { ...current, providerEnabledOverrides, modelEnabledOverrides: legacyOverrides };
  if (runtimeSettings) Object.assign(runtimeSettings, next);
  await ctx.storage.set("settings", next);
  if (hadProviderOverride || removedLegacy > 0) await ctx.provider.reload();
  return { removed: (hadProviderOverride ? 1 : 0) + removedLegacy, providerID };
}
