import test from "node:test";
import assert from "node:assert/strict";
import { registerProviderDisabler, setProviderDisabled } from "../modules/provider-and-mcp.js";
import { registerBulkModelToggle, setProviderModelsEnabled } from "../modules/bulk-model-toggle.js";

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
  assert.deepEqual(updates, ["alpha", "beta"]);
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
