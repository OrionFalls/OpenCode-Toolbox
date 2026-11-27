import { existsSync } from "node:fs";
import path from "node:path";

const SIX_MONTHS = 6 * 30.436875 * 86400000;
const POLICY_CACHE_MS = 1500;
const modelKey = (model) => model.providerID + ":" + model.id;

export function resolveDesktopDatabasePath(env = process.env, homeDir = env.USERPROFILE || env.HOME || "") {
  const appData = env.APPDATA || (homeDir ? path.join(homeDir, "AppData", "Roaming") : "");
  return appData ? path.join(appData, "ai.opencode.desktop", "drafts.sqlite") : null;
}

export async function readVisibilityPolicy(options = {}) {
  const dbPath = options.dbPath || resolveDesktopDatabasePath(options.env, options.homeDir);
  if (!dbPath || !existsSync(dbPath)) return { ready: false, overrides: new Map(), reason: "database-not-found" };
  let db;
  try {
    const { Database } = await import("bun:sqlite");
    db = new Database(dbPath, { readonly: true, create: false });
    const row = db.query("SELECT value FROM state WHERE name = ? AND key = ?").get("opencode.global.dat", "model");
    if (!row?.value) return { ready: false, overrides: new Map(), reason: "visibility-state-not-found" };
    const data = JSON.parse(row.value);
    const overrides = new Map();
    for (const item of Array.isArray(data.user) ? data.user : []) {
      if (item?.providerID && item?.modelID && ["show", "hide"].includes(item.visibility)) {
        overrides.set(item.providerID + ":" + item.modelID, item.visibility);
      }
    }
    return { ready: true, overrides };
  } catch (error) {
    return { ready: false, overrides: new Map(), reason: "visibility-read-failed", error: error instanceof Error ? error.message : String(error) };
  } finally { db?.close(); }
}

export function getAllowedModels(models, policy, now = Date.now()) {
  if (!policy?.ready) return new Set();
  const free = new Set(), latest = new Map();
  for (const model of models) {
    const key = modelKey(model);
    const costs = Array.isArray(model.cost) ? model.cost : [];
    const isFree = model.providerID === "opencode" && (costs.length === 0 || costs.every(cost => Number(cost.input) === 0));
    if (isFree) free.add(key);
    const released = Number(model.time?.released);
    if (!Number.isFinite(released) || released <= 0) continue;
    const group = model.providerID + ":" + (model.family || "") + ":" + isFree;
    if (!latest.has(group) || released > latest.get(group).released) latest.set(group, { key, released });
  }
  const recent = new Set([...latest.values()].filter(item => now - item.released < SIX_MONTHS).map(item => item.key));
  const byKey = new Map(models.map(model => [modelKey(model), model]));
  const allowed = new Set();
  for (const model of models) {
    const base = model.experimental?.speed?.base;
    const standard = base ? byKey.get(model.providerID + ":" + base) || model : model;
    const key = modelKey(standard), override = policy.overrides.get(key), released = Number(standard.time?.released);
    const visible = override === "show" ? true : override === "hide" ? false : free.has(key) || recent.has(key) || !Number.isFinite(released) || released <= 0;
    if (visible) allowed.add(modelKey(model));
  }
  return allowed;
}

/**
 * Enforces Desktop visibility policy at request time, including subagents.
 * The policy is cached briefly to avoid opening the private SQLite database
 * for each model call. If the private database is unavailable, the module
 * fails open with one warning rather than unexpectedly disabling all models.
 */
export async function registerTrueModelDisabler(ctx, isEnabled, options = {}) {
  let catalog = [], warnedUnavailable = false;
  let policyCache = null, policyCacheAt = 0, policyInFlight = null;
  const cacheMs = Number.isFinite(options.cacheMs) ? Math.max(0, options.cacheMs) : POLICY_CACHE_MS;
  const readPolicy = options.readPolicy || readVisibilityPolicy;

  const getPolicy = async () => {
    const now = Date.now();
    if (policyCache && now - policyCacheAt < cacheMs) return policyCache;
    if (policyInFlight) return policyInFlight;
    policyInFlight = Promise.resolve().then(() => readPolicy()).then(policy => {
      policyCache = policy;
      policyCacheAt = Date.now();
      return policy;
    }).finally(() => { policyInFlight = null; });
    return policyInFlight;
  };

  const transform = await ctx.model.transform(editor => {
    catalog = editor.list().map(model => ({
      id: model.id, providerID: model.providerID, family: model.family,
      time: { released: model.time?.released },
      cost: (model.cost || []).map(cost => ({ input: cost.input })),
      experimental: model.experimental?.speed?.base ? { speed: { base: model.experimental.speed.base } } : undefined,
    }));
  });

  const hook = await ctx.aisdk.hook("sdk", async ({ model }) => {
    if (!isEnabled()) return;
    const policy = await getPolicy();
    if (!policy.ready) {
      if (!warnedUnavailable) {
        warnedUnavailable = true;
        console.warn("[opencode-toolbox] True Model Disabler temporarily inactive: " + (policy.reason || "visibility policy unavailable") + ". Check OpenCode Desktop database/runtime.");
      }
      return;
    }
    warnedUnavailable = false;
    if (!getAllowedModels(catalog, policy).has(modelKey(model))) {
      throw new Error("True Model Disabler: " + model.providerID + "/" + model.id + " is disabled in OpenCode Settings > Models. This also applies to subagents.");
    }
  });
  console.info("[opencode-toolbox] True Model Disabler registered");
  return async () => { await hook.dispose(); await transform.dispose(); };
}
