/**
 * Persistent provider-wide model enable/disable operations.
 * One long-lived transform applies the saved overrides after every catalog refresh.
 */
export async function registerBulkModelToggle(ctx, getSettings) {
  return ctx.model.transform((editor) => {
    const overrides = getSettings().modelEnabledOverrides || {};
    for (const model of editor.list()) {
      const key = model.providerID + ":" + model.id;
      if (!Object.prototype.hasOwnProperty.call(overrides, key)) continue;
      editor.update(model.providerID, model.id, (draft) => {
        draft.enabled = Boolean(overrides[key]);
      });
    }
  });
}

export async function setProviderModelsEnabled(ctx, providerID, enabled) {
  const models = await ctx.model.list();
  const targets = models.filter((model) => model.providerID === providerID);
  if (!targets.length) return { changed: 0, providerID };

  const current = await ctx.storage.get("settings") || {};
  const overrides = { ...(current.modelEnabledOverrides || {}) };
  for (const model of targets) {
    overrides[model.providerID + ":" + model.id] = Boolean(enabled);
  }
  await ctx.storage.set("settings", { ...current, modelEnabledOverrides: overrides });
  await ctx.model.reload();
  return { changed: targets.length, providerID, enabled: Boolean(enabled) };
}
