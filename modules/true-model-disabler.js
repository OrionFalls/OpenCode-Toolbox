import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const DB = path.join(
  process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
  "ai.opencode.desktop",
  "drafts.sqlite",
);
const SIX_MONTHS = 6 * 30.436875 * 86400000;
const modelKey = (model) => model.providerID + ":" + model.id;

function readVisibilityPolicy() {
  let db;
  try {
    if (!existsSync(DB)) return { ready: false, overrides: new Map() };
    db = new Database(DB, { readonly: true, create: false });
    const row = db.query("SELECT value FROM state WHERE name = ? AND key = ?")
      .get("opencode.global.dat", "model");
    if (!row?.value) return { ready: false, overrides: new Map() };
    const data = JSON.parse(row.value);
    const overrides = new Map();
    for (const item of data.user || []) {
      if (item?.providerID && item?.modelID && ["show", "hide"].includes(item.visibility)) {
        overrides.set(item.providerID + ":" + item.modelID, item.visibility);
      }
    }
    return { ready: true, overrides };
  } catch (error) {
    return { ready: false, overrides: new Map(), error };
  } finally {
    db?.close();
  }
}

function getAllowedModels(models, policy) {
  if (!policy.ready) return new Set();
  const free = new Set();
  const latest = new Map();

  for (const model of models) {
    const key = modelKey(model);
    const costs = Array.isArray(model.cost) ? model.cost : [];
    const isFree = model.providerID === "opencode" &&
      (costs.length === 0 || costs.every((cost) => Number(cost.input) === 0));
    if (isFree) free.add(key);

    const released = Number(model.time?.released);
    if (!Number.isFinite(released) || released <= 0) continue;
    const group = model.providerID + ":" + model.family + ":" + isFree;
    if (!latest.has(group) || released > latest.get(group).released) {
      latest.set(group, { key, released });
    }
  }

  const recent = new Set(
    [...latest.values()]
      .filter((item) => Date.now() - item.released < SIX_MONTHS)
      .map((item) => item.key),
  );
  const byKey = new Map(models.map((model) => [modelKey(model), model]));
  const allowed = new Set();

  for (const model of models) {
    const base = model.experimental?.speed?.base;
    const standard = base ? byKey.get(model.providerID + ":" + base) || model : model;
    const key = modelKey(standard);
    const override = policy.overrides.get(key);
    const released = Number(standard.time?.released);
    const visible = override === "show" ? true
      : override === "hide" ? false
      : free.has(key) || recent.has(key) || !Number.isFinite(released) || released <= 0;
    if (visible) allowed.add(modelKey(model));
  }
  return allowed;
}

/**
 * Enforces the user's native OpenCode Settings > Models selection at request time.
 * It deliberately does not alter model.enabled or remove catalog entries.
 */
export async function registerTrueModelDisabler(ctx, isEnabled) {
  let catalog = [];
  const transform = await ctx.model.transform((editor) => {
    catalog = editor.list().map((model) => ({
      id: model.id,
      providerID: model.providerID,
      family: model.family,
      time: { released: model.time?.released },
      cost: (model.cost || []).map((cost) => ({ input: cost.input })),
      experimental: model.experimental?.speed?.base
        ? { speed: { base: model.experimental.speed.base } }
        : undefined,
    }));
  });

  const hook = await ctx.aisdk.hook("sdk", async ({ model }) => {
    if (!isEnabled()) return;
    const policy = readVisibilityPolicy();
    if (!policy.ready) {
      throw new Error("True Model Disabler: cannot read OpenCode Settings > Models; request blocked safely.");
    }
    if (!getAllowedModels(catalog, policy).has(modelKey(model))) {
      throw new Error(
        "True Model Disabler: " + model.providerID + "/" + model.id +
        " is disabled in OpenCode Settings > Models. This also applies to subagents.",
      );
    }
  });

  console.info("[opencode-toolbox] True Model Disabler registered");
  return async () => {
    await hook.dispose();
    await transform.dispose();
  };
}
