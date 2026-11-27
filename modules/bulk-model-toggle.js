/**
 * Update OpenCode Desktop's native Settings > Models visibility records.
 * The native switches are persisted as show/hide entries in drafts.sqlite,
 * not as Model.Info.enabled flags. No provider or model catalog is changed.
 */
export function updateModelVisibilityState(currentState, providerID, modelIDs, visible) {
  if (typeof providerID !== "string" || !providerID.trim()) {
    throw new TypeError("providerID is required");
  }
  if (!Array.isArray(modelIDs)) throw new TypeError("modelIDs must be an array");
  if (typeof visible !== "boolean") throw new TypeError("visible must be a boolean");

  const ids = [...new Set(modelIDs.filter((id) => typeof id === "string" && id.trim()))];
  const source = currentState && typeof currentState === "object" && !Array.isArray(currentState)
    ? currentState
    : {};
  const user = Array.isArray(source.user) ? source.user : [];
  const targetVisibility = visible ? "show" : "hide";
  const targetIDs = new Set(ids);
  const found = new Set();
  const changedIDs = new Set();

  const nextUser = user.map((item) => {
    if (!item || item.providerID !== providerID || !targetIDs.has(item.modelID)) return item;
    found.add(item.modelID);
    if (item.visibility === targetVisibility) return item;
    changedIDs.add(item.modelID);
    return { ...item, visibility: targetVisibility };
  });

  for (const modelID of ids) {
    if (found.has(modelID)) continue;
    nextUser.push({ providerID, modelID, visibility: targetVisibility });
    changedIDs.add(modelID);
  }

  return {
    state: { ...source, user: nextUser },
    changed: changedIDs.size,
  };
}
