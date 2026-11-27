import { existsSync } from "node:fs";
import path from "node:path";

const SIX_MONTHS = 6 * 30.436875 * 86400000;
// Read the local visibility policy at every model execution; only concurrent reads are coalesced.
const POLICY_CACHE_MS = 0;
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
 * Wrap the cached AI SDK language model so the policy is checked for every
 * generation/stream call, not only when OpenCode first constructs the SDK.
 *
 * OpenCode caches language model instances by model configuration. A hook on
 * the "sdk" event therefore does not run again for old dialogs or later
 * subagent calls that reuse the same adapter.
 */
export function guardLanguageModel(language, assertAllowed) {
  const methods = new Map();
  return new Proxy(language, {
    get(target, property) {
      if (property !== "doGenerate" && property !== "doStream") {
        return Reflect.get(target, property, target);
      }
      if (methods.has(property)) return methods.get(property);
      const original = Reflect.get(target, property, target);
      if (typeof original !== "function") return original;
      const guarded = async (...args) => {
        await assertAllowed();
        return original.apply(target, args);
      };
      methods.set(property, guarded);
      return guarded;
    },
  });
}

/**
 * Enforces Desktop visibility policy at the actual model execution boundary.
 * The language adapter remains guarded after OpenCode caches it, so existing
 * sessions and subagents cannot bypass a later visibility change.
 *
 * The local SQLite read is fresh for each generation by default. Concurrent
 * calls share one in-flight read; an optional cache can be configured for tests
 * or deployments that explicitly prefer a short staleness window.
 */
export async function registerTrueModelDisabler(ctx, isEnabled, options = {}) {
  let catalog = [], warnedUnavailable = false;
  let policyCache = null, policyCacheAt = 0, policyInFlight = null;
  const cacheMs = Number.isFinite(options.cacheMs) ? Math.max(0, options.cacheMs) : POLICY_CACHE_MS;
  const readPolicy = options.readPolicy || readVisibilityPolicy;

  const getPolicy = async () => {
    const now = Date.now();
    if (cacheMs > 0 && policyCache && now - policyCacheAt < cacheMs) return policyCache;
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

  const assertAllowed = async model => {
    // Keep the wrapper installed even while disabled. Turning the module back
    // on must also protect a language adapter OpenCode has already cached.
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
  };

  const hook = await ctx.aisdk.hook("language", async event => {
    const source = event.language || event.sdk.languageModel(event.model.modelID ?? event.model.id);
    event.language = guardLanguageModel(source, () => assertAllowed(event.model));
  });
  console.info("[opencode-toolbox] True Model Disabler registered");
  return async () => { await hook.dispose(); await transform.dispose(); };
}
