/**
 * Bulk model operations used by the Models page UI.
 * Model IDs are read from OpenCode at execution time, never from a cached list.
 */
export async function setProviderModelsEnabled(ctx, providerID, enabled) {
  const models = await ctx.model.list({ providerID });
  if (!models.length) return { changed: 0, providerID };
  const registration = await ctx.model.transform((editor) => {
    for (const model of editor.list(providerID)) {
      editor.update(model.providerID, model.id, (draft) => {
        draft.enabled = Boolean(enabled);
      });
    }
  });
  await ctx.model.reload();
  await registration.dispose();
  return { changed: models.length, providerID, enabled: Boolean(enabled) };
}
