import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { registerProviderDisabler, setProviderDisabled } from "../modules/provider-and-mcp.js";
import { registerBulkModelToggle, setProviderModelsEnabled } from "../modules/bulk-model-toggle.js";
import { getAllowedModels, resolveDesktopDatabasePath, registerTrueModelDisabler } from "../modules/true-model-disabler.js";
import { normalizeSettings, resolveConfigDir } from "../modules/settings.js";

function storage(initial = {}) {
  let value = structuredClone(initial);
  return {
    async get(key) { return key === "settings" ? structuredClone(value) : undefined; },
    async set(key, next) { if (key === "settings") value = structuredClone(next); },
    read() { return structuredClone(value); },
  };
}

test("Provider Disabler changes activation without deleting provider records", async () => {
  const providers = [
    { provider: { id: "alpha", activation: "enabled" } },
    { provider: { id: "beta", activation: "enabled" } },
  ];
  let transform;
  const ctx = { provider: { transform: async (fn) => { transform = fn; return { dispose() {} }; } } };
  const settings = { modules: { providerDisabler: true }, disabledProviders: ["beta"] };
  await registerProviderDisabler(ctx, () => settings);
  const updates = [];
  await transform({
    list: () => providers,
    update: (id, fn) => { const p = providers.find(x => x.provider.id === id); fn(p.provider); updates.push(id); },
  });
  assert.equal(providers.length, 2);
  assert.equal(providers[0].provider.activation, "enabled");
  assert.equal(providers[1].provider.activation, "disabled");
  assert.deepEqual(updates, ["beta"]);
});

test("setProviderDisabled persists IDs and reloads provider catalog", async () => {
  const store = storage({ modules: {}, disabledProviders: [] });
  let reloaded = 0;
  const ctx = { storage: store, provider: { async reload() { reloaded++; } } };
  await setProviderDisabled(ctx, "alpha", true);
  assert.deepEqual(store.read().disabledProviders, ["alpha"]);
  assert.equal(reloaded, 1);
});

test("Bulk Model Toggle applies persistent per-model overrides", async () => {
  let transform;
  const ctx = { model: { transform: async (fn) => { transform = fn; return { dispose() {} }; } } };
  const settings = { modules: { bulkModelToggle: true }, modelEnabledOverrides: { alpha: { one: false } } };
  await registerBulkModelToggle(ctx, () => settings);
  const models = [{ id: "one", enabled: true }, { id: "two", enabled: true }];
  await transform({ update: (_provider, id, fn) => fn(models.find(m => m.id === id)) });
  assert.equal(models[0].enabled, false);
  assert.equal(models[1].enabled, true);
});

test("setProviderModelsEnabled persists all provider models and reloads catalog", async () => {
  const store = storage({ modules: {}, modelEnabledOverrides: {} });
  let reloaded = 0;
  const ctx = {
    storage: store,
    model: {
      async list() { return [{ providerID: "alpha", id: "one" }, { providerID: "alpha", id: "two" }, { providerID: "beta", id: "three" }]; },
      async reload() { reloaded++; },
    },
  };
  const result = await setProviderModelsEnabled(ctx, "alpha", false);
  assert.equal(result.changed, 2);
  assert.deepEqual(store.read().modelEnabledOverrides.alpha, { one: false, two: false });
  assert.equal(reloaded, 1);
});

test("Provider Disabler leaves unrelated native disabled state untouched", async () => {
  const providers = [{ provider: { id: "native-disabled", activation: "disabled" } }];
  let transform;
  const ctx = { provider: { transform: async fn => { transform = fn; return { dispose() {} }; } } };
  await registerProviderDisabler(ctx, () => ({ modules: { providerDisabler: true }, disabledProviders: [] }));
  await transform({ list: () => providers, update: (id, fn) => fn(providers[0].provider) });
  assert.equal(providers[0].provider.activation, "disabled");
});


test("True Model Disabler resolves the Desktop database path lazily", () => {
  const resolved = resolveDesktopDatabasePath({ APPDATA: "/profile/appdata" });
  assert.equal(resolved, path.join("/profile/appdata", "ai.opencode.desktop", "drafts.sqlite"));
});

test("True Model Disabler explicit show/hide overrides include speed variants", () => {
  const models = [
    { providerID: "p", id: "old", family: "f", time: { released: 1 } },
    { providerID: "p", id: "speed", family: "f", time: { released: 1 }, experimental: { speed: { base: "old" } } },
    { providerID: "p", id: "forced", family: "f", time: { released: 1 } },
  ];
  const policy = { ready: true, overrides: new Map([["p:old", "show"], ["p:forced", "hide"]]) };
  const allowed = getAllowedModels(models, policy, 2_000_000_000_000);
  assert.equal(allowed.has("p:old"), true);
  assert.equal(allowed.has("p:speed"), true);
  assert.equal(allowed.has("p:forced"), false);
});

test("True Model Disabler preserves free and recently released models", () => {
  const now = 2_000_000_000_000, old = now - 400 * 86400000;
  const models = [
    { providerID: "opencode", id: "free", family: "free", cost: [], time: { released: old } },
    { providerID: "p", id: "recent", family: "family", cost: [{ input: 1 }], time: { released: now - 7 * 86400000 } },
    { providerID: "p", id: "stale", family: "family", cost: [{ input: 1 }], time: { released: old } },
  ];
  const allowed = getAllowedModels(models, { ready: true, overrides: new Map() }, now);
  assert.equal(allowed.has("opencode:free"), true);
  assert.equal(allowed.has("p:recent"), true);
  assert.equal(allowed.has("p:stale"), false);
});


test("Shared settings normalization preserves MCP state and unrelated fields", () => {
  const value = normalizeSettings({
    modules: { providerDisabler: true },
    disabledProviders: ["alpha", "alpha", "", 4],
    disabledMcpServers: ["ssh", "ssh", null],
    modelEnabledOverrides: { alpha: { m1: false } },
    futureOption: "keep",
  });
  assert.equal(value.modules.providerDisabler, true);
  assert.equal(value.modules.trueModelDisabler, true);
  assert.deepEqual(value.disabledProviders, ["alpha"]);
  assert.deepEqual(value.disabledMcpServers, ["ssh"]);
  assert.deepEqual(value.modelEnabledOverrides, { alpha: { m1: false } });
  assert.equal(value.futureOption, "keep");
});

test("Shared settings normalization rejects malformed nested collections", () => {
  const value = normalizeSettings({
    modules: [],
    disabledProviders: "alpha",
    disabledMcpServers: {},
    modelEnabledOverrides: [],
  });
  assert.equal(value.modules.providerDisabler, false);
  assert.deepEqual(value.disabledProviders, []);
  assert.deepEqual(value.disabledMcpServers, []);
  assert.deepEqual(value.modelEnabledOverrides, {});
});

test("Config directory resolver honours OPENCODE_CONFIG_DIR and falls back predictably", () => {
  assert.equal(resolveConfigDir({ OPENCODE_CONFIG_DIR: "./custom" }, "/home/test"), path.resolve("./custom"));
  assert.equal(resolveConfigDir({}, "/home/test"), path.join("/home/test", ".config", "opencode"));
});


test("MCP-GUI settings can disable and re-enable a single server without losing others", async () => {
  const { setMcpServerDisabled } = await import("../modules/settings.js");
  const initial = { modules: {}, disabledMcpServers: ["ssh", "figma"], disabledProviders: ["alpha"] };
  const withoutSsh = setMcpServerDisabled(initial, "ssh", false);
  assert.deepEqual(withoutSsh.disabledMcpServers, ["figma"]);
  assert.deepEqual(withoutSsh.disabledProviders, ["alpha"]);
  const withBrowser = setMcpServerDisabled(withoutSsh, "browser", true);
  assert.deepEqual(withBrowser.disabledMcpServers, ["figma", "browser"]);
});

test("MCP and Custom Providers modules default to disabled", () => {
  const value = normalizeSettings({});
  assert.equal(value.modules.mcpGui, false);
  assert.equal(value.modules.customProviders, false);
  assert.deepEqual(value.disabledMcpServers, []);
});


test("Provider Disabler leaves unrelated providers untouched and only applies explicit disables", async () => {
  const records = [
    { provider: { id: "alpha", activation: "enabled" } },
    { provider: { id: "beta", activation: "disabled" } },
    { provider: { id: "gamma", activation: "enabled" } },
  ];
  let transform;
  const ctx = { provider: { transform: async fn => { transform = fn; return { dispose() {} }; } } };
  await registerProviderDisabler(ctx, () => ({ modules: { providerDisabler: true }, disabledProviders: ["gamma"] }));
  await transform({ list: () => records, update: (id, fn) => fn(records.find(r => r.provider.id === id).provider) });
  assert.equal(records.find(r => r.provider.id === "alpha").provider.activation, "enabled");
  assert.equal(records.find(r => r.provider.id === "beta").provider.activation, "disabled");
  assert.equal(records.find(r => r.provider.id === "gamma").provider.activation, "disabled");
});

test("Bulk Model Toggle leaves native model states untouched when module is disabled", async () => {
  let transform;
  const ctx = { model: { transform: async fn => { transform = fn; return { dispose() {} }; } } };
  const settings = { modules: { bulkModelToggle: false }, modelEnabledOverrides: { alpha: { one: false } } };
  await registerBulkModelToggle(ctx, () => settings);
  const model = { id: "one", enabled: true };
  await transform({ update: (_provider, _id, fn) => fn(model) });
  assert.equal(model.enabled, true);
});

test("Bulk Model Toggle ignores malformed provider override containers", async () => {
  let transform;
  const ctx = { model: { transform: async fn => { transform = fn; return { dispose() {} }; } } };
  await registerBulkModelToggle(ctx, () => ({ modules: { bulkModelToggle: true }, modelEnabledOverrides: { alpha: [] } }));
  let updated = false;
  await transform({ update: () => { updated = true; } });
  assert.equal(updated, false);
});

test("True Model Disabler coalesces concurrent policy reads and caches short-lived results", async () => {
  let readCount = 0, hook;
  const models = [{ id: "m", providerID: "p", family: "f", time: { released: 1 }, cost: [] }];
  const ctx = {
    model: { transform: async fn => { fn({ list: () => models }); return { dispose() {} }; } },
    aisdk: { hook: async (_name, fn) => { hook = fn; return { dispose() {} }; } },
  };
  const policy = { ready: true, overrides: new Map([["p:m", "show"]]) };
  await registerTrueModelDisabler(ctx, () => true, { cacheMs: 30_000, readPolicy: async () => { readCount++; await new Promise(resolve => setImmediate(resolve)); return policy; } });
  await Promise.all([hook({ model: { id: "m", providerID: "p" } }), hook({ model: { id: "m", providerID: "p" } })]);
  assert.equal(readCount, 1);
  await hook({ model: { id: "m", providerID: "p" } });
  assert.equal(readCount, 1);
});

test("True Model Disabler rejects hidden models through the SDK hook", async () => {
  let hook;
  const models = [{ id: "hidden", providerID: "p", family: "f", time: { released: 1 }, cost: [] }];
  const ctx = {
    model: { transform: async fn => { fn({ list: () => models }); return { dispose() {} }; } },
    aisdk: { hook: async (_name, fn) => { hook = fn; return { dispose() {} }; } },
  };
  await registerTrueModelDisabler(ctx, () => true, { readPolicy: async () => ({ ready: true, overrides: new Map([["p:hidden", "hide"]]) }) });
  await assert.rejects(() => hook({ model: { id: "hidden", providerID: "p" } }), /disabled in OpenCode Settings/);
});
