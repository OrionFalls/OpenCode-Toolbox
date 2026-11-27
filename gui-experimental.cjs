"use strict";

/**
 * OpenCode Desktop GUI Plugin: Custom Provider Manager (`custom-provider`).
 *
 * Restores native in-app Custom Provider configuration for OpenCode 2.3.0:
 * - Adds "Custom Providers" tab in Settings + `/custom-provider` slash command & palette action.
 * - Reads & writes `~/.config/opencode/opencode.jsonc` cleanly in OpenCode V2 `providers` format
 *   while preserving all unrelated settings and supporting legacy V1 `provider` import.
 * - Fetches `/models` from OpenAI-compatible and Anthropic-compatible endpoints via Node main process.
 */

const { Schema } = require("effect");
const { Command, Ipc, Plugin, SettingsPage, Style } = require("@opencode/plugin/gui");
const { createSignal, createMemo, createEffect, createComponent, onCleanup, Show, For } = require("solid-js");
const { insert } = require("solid-js/web");

// ---------------------------------------------------------------------------
// Shared Constants & IPC Contract
// ---------------------------------------------------------------------------

const PROTOCOL_PRESETS = [
  {
    id: "openai-compatible",
    label: "OpenAI Compatible (Chat Completions)",
    pkg: "@opencode/ai/providers/openai-compatible",
    placeholderUrl: "https://api.example.com/v1",
  },
  {
    id: "openai-compatible-responses",
    label: "OpenAI Compatible (Responses API)",
    pkg: "@opencode/ai/providers/openai-compatible/responses",
    placeholderUrl: "https://api.example.com/v1",
  },
  {
    id: "anthropic",
    label: "Anthropic Compatible (Messages API)",
    pkg: "@opencode/ai/providers/anthropic",
    placeholderUrl: "https://api.example.com/v1",
  },
  {
    id: "openai",
    label: "OpenAI Official Format",
    pkg: "@opencode/ai/providers/openai",
    placeholderUrl: "https://api.openai.com/v1",
  },
  {
    id: "google",
    label: "Google Gemini Compatible",
    pkg: "@opencode/ai/providers/google",
    placeholderUrl: "https://generativelanguage.googleapis.com/v1beta",
  },
];

const PACKAGE_TO_PROTOCOL = {
  "@opencode/ai/providers/openai-compatible": "openai-compatible",
  "@ai-sdk/openai-compatible": "openai-compatible",
  "@opencode/ai/providers/openai-compatible/responses": "openai-compatible-responses",
  "@opencode/ai/providers/openai-compatible-responses": "openai-compatible-responses",
  "@opencode/ai/providers/anthropic": "anthropic",
  "@opencode/ai/providers/anthropic-compatible": "anthropic",
  "@ai-sdk/anthropic": "anthropic",
  "@opencode/ai/providers/openai": "openai",
  "@opencode/ai/providers/openai/responses": "openai",
  "@ai-sdk/openai": "openai",
  "@opencode/ai/providers/google": "google",
  "@ai-sdk/google": "google",
};

const LEGACY_NPM_TO_V2 = {
  "@ai-sdk/openai-compatible": "@opencode/ai/providers/openai-compatible",
  "@ai-sdk/anthropic": "@opencode/ai/providers/anthropic",
  "@ai-sdk/openai": "@opencode/ai/providers/openai",
  "@ai-sdk/google": "@opencode/ai/providers/google",
  "@ai-sdk/google-vertex": "@opencode/ai/providers/google-vertex",
  "@ai-sdk/google-vertex/anthropic": "@opencode/ai/providers/google-vertex/messages",
  "@ai-sdk/openrouter": "@opencode/ai/providers/openrouter",
  "@openrouter/ai-sdk-provider": "@opencode/ai/providers/openrouter",
  "@ai-sdk/groq": "@opencode/ai/providers/groq",
  "@ai-sdk/mistral": "@opencode/ai/providers/mistral",
  "@ai-sdk/xai": "@opencode/ai/providers/xai",
  "@ai-sdk/cerebras": "@opencode/ai/providers/cerebras",
  "@ai-sdk/deepinfra": "@opencode/ai/providers/deepinfra",
  "@ai-sdk/togetherai": "@opencode/ai/providers/togetherai",
  "@ai-sdk/alibaba": "@opencode/ai/providers/alibaba/chat",
  "@ai-sdk/cohere": "@opencode/ai/providers/cohere",
};

const STANDARD_EFFORT_LEVELS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];
const ALL_EFFORT_OPTIONS = ["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"];
const ULTRA_TARGET_OPTIONS = ["max", "xhigh", "ultra"];

const ModelEntrySchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  modelID: Schema.NullOr(Schema.String),
  contextLimit: Schema.NullOr(Schema.Number),
  outputLimit: Schema.NullOr(Schema.Number),
  protocol: Schema.optional(Schema.NullOr(Schema.String)),
  pkg: Schema.optional(Schema.NullOr(Schema.String)),
  effortLevels: Schema.optional(Schema.Array(Schema.String)),
  ultraTarget: Schema.optional(Schema.NullOr(Schema.String)),
});

const ProviderEntrySchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  protocol: Schema.String,
  pkg: Schema.String,
  baseURL: Schema.String,
  authMode: Schema.String,
  hasKey: Schema.Boolean,
  apiKeyMask: Schema.String,
  envVar: Schema.String,
  envPresent: Schema.Boolean,
  connected: Schema.Boolean,
  headersJson: Schema.String,
  models: Schema.Array(ModelEntrySchema),
});

const DesktopImportCandidateSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  protocol: Schema.String,
  baseURL: Schema.String,
  modelCount: Schema.Number,
  alreadyExists: Schema.Boolean,
});

const DiscoveredModelSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  contextLimit: Schema.NullOr(Schema.Number),
  outputLimit: Schema.optional(Schema.NullOr(Schema.Number)),
});

const FetchModelsResultSchema = Schema.Struct({
  ok: Schema.Boolean,
  url: Schema.String,
  suggestedBaseURL: Schema.optional(Schema.NullOr(Schema.String)),
  status: Schema.Number,
  latencyMs: Schema.Number,
  error: Schema.NullOr(Schema.String),
  models: Schema.Array(DiscoveredModelSchema),
});

const ModelOverrideViewSchema = Schema.Struct({
  providerID: Schema.String,
  modelID: Schema.String,
  contextLimit: Schema.NullOr(Schema.Number),
  outputLimit: Schema.NullOr(Schema.Number),
  effortLevels: Schema.Array(Schema.String),
  ultraTarget: Schema.optional(Schema.NullOr(Schema.String)),
});

const StateSchema = Schema.Struct({
  configPath: Schema.String,
  configExists: Schema.Boolean,
  desktopPath: Schema.NullOr(Schema.String),
  desktopCandidates: Schema.Array(DesktopImportCandidateSchema),
  providers: Schema.Array(ProviderEntrySchema),
  modelOverrides: Schema.optional(Schema.Array(ModelOverrideViewSchema)),
  lastError: Schema.NullOr(Schema.String),
});

const CatalogModelSchema = Schema.Struct({
  providerID: Schema.String,
  providerName: Schema.String,
  id: Schema.String,
  name: Schema.String,
  protocol: Schema.String,
  isCustomProvider: Schema.Boolean,
  contextLimit: Schema.NullOr(Schema.Number),
  outputLimit: Schema.NullOr(Schema.Number),
  effortLevels: Schema.Array(Schema.String),
  hasOverride: Schema.Boolean,
  overrideContextLimit: Schema.optional(Schema.NullOr(Schema.Number)),
  overrideOutputLimit: Schema.optional(Schema.NullOr(Schema.Number)),
  overrideEffortLevels: Schema.optional(Schema.Array(Schema.String)),
  overrideUltraTarget: Schema.optional(Schema.NullOr(Schema.String)),
});

const SaveModelOverrideInputSchema = Schema.Struct({
  providerID: Schema.String,
  modelID: Schema.String,
  protocol: Schema.String,
  contextLimit: Schema.NullOr(Schema.Number),
  outputLimit: Schema.NullOr(Schema.Number),
  effortLevels: Schema.Array(Schema.String),
  ultraTarget: Schema.optional(Schema.NullOr(Schema.String)),
});

const BatchBoostModelsInputSchema = Schema.Struct({
  providerID: Schema.String,
  models: Schema.Array(
    Schema.Struct({
      modelID: Schema.String,
      protocol: Schema.String,
    })
  ),
  effortLevels: Schema.Array(Schema.String),
  ultraTarget: Schema.optional(Schema.NullOr(Schema.String)),
  contextLimit: Schema.optional(Schema.NullOr(Schema.Number)),
  outputLimit: Schema.optional(Schema.NullOr(Schema.Number)),
});

const SaveProviderInputSchema = Schema.Struct({
  originalId: Schema.NullOr(Schema.String),
  id: Schema.String,
  name: Schema.String,
  protocol: Schema.String,
  customPkg: Schema.String,
  baseURL: Schema.String,
  authMode: Schema.String,
  apiKeyInput: Schema.String,
  keepExistingKey: Schema.Boolean,
  envVar: Schema.String,
  headersJson: Schema.String,
  setAsDefaultModel: Schema.Boolean,
  models: Schema.Array(ModelEntrySchema),
});

const ProviderActionResultSchema = Schema.Struct({
  ok: Schema.Boolean,
  message: Schema.String,
  importedCount: Schema.Number,
});

const McpEntrySchema = Schema.Struct({
  id: Schema.String, type: Schema.String, disabled: Schema.Boolean,
  command: Schema.Array(Schema.String), url: Schema.String, cwd: Schema.String,
  environmentJson: Schema.String, headersJson: Schema.String,
});
const McpStateSchema = Schema.Struct({
  configPath: Schema.String, servers: Schema.Array(McpEntrySchema), error: Schema.NullOr(Schema.String),
});
const McpResultSchema = Schema.Struct({ ok: Schema.Boolean, message: Schema.String });
const McpIpc = Ipc.define({
  id: "opencode-toolbox.mcp-gui", state: McpStateSchema,
  methods: {
    refresh: { output: McpStateSchema },
    save: { input: Schema.Struct({
      id: Schema.String, originalId: Schema.NullOr(Schema.String), type: Schema.String,
      commandJson: Schema.String, url: Schema.String, cwd: Schema.String,
      environmentJson: Schema.String, headersJson: Schema.String, disabled: Schema.Boolean,
    }), output: McpResultSchema },
    setDisabled: { input: Schema.Struct({ id: Schema.String, disabled: Schema.Boolean }), output: McpResultSchema },
    remove: { input: Schema.Struct({ id: Schema.String }), output: McpResultSchema },
  },
});

const ToolboxIpc = Ipc.define({ id: "opencode-toolbox.settings", methods: { getSettings: { output: Schema.String }, saveSettings: { input: Schema.String, output: Schema.Struct({ ok: Schema.Boolean, message: Schema.String }) } } });

const CustomProviderIpc = Ipc.define({
  id: "opencode-toolbox.custom-provider",
  state: StateSchema,
  methods: {
    refresh: { output: StateSchema },
    saveProvider: { input: SaveProviderInputSchema, output: ProviderActionResultSchema },
    deleteProvider: { input: Schema.Struct({ id: Schema.String }), output: ProviderActionResultSchema },
    importDesktop: {
      input: Schema.Struct({ onlyMissing: Schema.Boolean }),
      output: ProviderActionResultSchema,
    },
    importJson: {
      input: Schema.Struct({ text: Schema.String, overwrite: Schema.Boolean }),
      output: ProviderActionResultSchema,
    },
    listCatalogModels: {
      output: Schema.Struct({
        ok: Schema.Boolean,
        error: Schema.NullOr(Schema.String),
        models: Schema.Array(CatalogModelSchema),
      }),
    },
    saveModelOverride: { input: SaveModelOverrideInputSchema, output: ProviderActionResultSchema },
    batchBoostModels: { input: BatchBoostModelsInputSchema, output: ProviderActionResultSchema },
    resetModelOverride: {
      input: Schema.Struct({ providerID: Schema.String, modelID: Schema.String }),
      output: ProviderActionResultSchema,
    },
    fetchModels: {
      input: Schema.Struct({
        existingId: Schema.NullOr(Schema.String),
        baseURL: Schema.String,
        protocol: Schema.String,
        authMode: Schema.String,
        apiKeyInput: Schema.String,
        envVar: Schema.String,
        headersJson: Schema.String,
      }),
      output: FetchModelsResultSchema,
    },
    reloadServer: { output: ProviderActionResultSchema },
  },
});

// ---------------------------------------------------------------------------
// Plugin Styles (Using Native OpenCode `--v2-*` Theme Tokens)
// ---------------------------------------------------------------------------

const PLUGIN_CSS = `
.cp-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.cp-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 8px;
  background-color: var(--v2-background-bg-layer-01);
  box-shadow: inset 0 0 0 1px var(--v2-border-border-focus);
}
.cp-banner--error {
  box-shadow: inset 0 0 0 1px var(--v2-state-fg-danger);
}
.cp-banner-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.cp-banner-title {
  font-size: 13px;
  font-weight: 550;
  color: var(--v2-text-text-base);
}
.cp-banner-desc {
  font-size: 12px;
  color: var(--v2-text-text-muted);
  line-height: 1.4;
}
.cp-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.cp-provider-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}
.cp-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 500;
  background-color: var(--v2-background-bg-layer-02);
  color: var(--v2-text-text-muted);
  box-shadow: inset 0 0 0 0.5px var(--v2-border-border-base);
}
.cp-badge--ok {
  color: var(--v2-state-fg-success, var(--v2-text-text-accent));
}
.cp-badge--accent {
  color: var(--v2-text-text-accent);
  box-shadow: inset 0 0 0 0.5px var(--v2-border-border-focus);
}
.cp-badge--warn {
  color: var(--v2-state-fg-warning);
}
.cp-badge--mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.cp-model-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 6px;
}
.cp-row-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.cp-empty {
  padding: 24px 18px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.cp-empty-title {
  font-size: 13.5px;
  font-weight: 550;
  color: var(--v2-text-text-base);
}
.cp-empty-desc {
  font-size: 12px;
  color: var(--v2-text-text-muted);
  max-width: 480px;
  line-height: 1.45;
}
.cp-dialog-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 4px;
  width: 100%;
  box-sizing: border-box;
}
[data-component="dialog-v2"]:has(.cp-dialog-form) [data-slot="dialog-container"] {
  width: min(100vw - 32px, 780px);
  height: auto;
  max-height: min(100vh - 48px, 760px);
}
[data-component="dialog-v2"]:has(.cp-dialog-form) [data-slot="dialog-body"] {
  overflow-y: auto;
  min-height: 0;
}
[data-component="dialog-v2"]:has(.cp-dialog-form) [data-slot="dialog-footer"] {
  border-top: 0.5px solid var(--v2-border-border-muted);
  background-color: var(--v2-background-bg-layer-01);
}
.cp-dialog-form [data-component="text-input-v2"],
.cp-dialog-form [data-component="select-v2-root"],
.cp-dialog-form [data-component="select-v2"],
.cp-stack [data-component="text-input-v2"] {
  width: 100% !important;
  min-width: 0;
  max-width: 100%;
  flex: 1 1 0%;
  box-sizing: border-box;
}
.cp-dialog-form [data-slot="text-input-v2-value"],
.cp-dialog-form [data-slot="text-input-v2-input"],
.cp-dialog-form [data-slot="select-v2-value"] {
  min-width: 0;
}
.cp-dialog-form [data-slot="select-v2-value"] {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cp-tabs {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px;
  border-radius: 8px;
  background-color: var(--v2-background-bg-layer-02);
  box-shadow: inset 0 0 0 0.5px var(--v2-border-border-base);
  align-self: flex-start;
}
.cp-tab-btn {
  border: 0;
  border-radius: 6px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 520;
  background: transparent;
  color: var(--v2-text-text-muted);
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}
.cp-tab-btn:hover {
  color: var(--v2-text-text-base);
}
.cp-tab-btn--active {
  background-color: var(--v2-background-bg-layer-01);
  color: var(--v2-text-text-base);
  box-shadow: inset 0 0 0 0.5px var(--v2-border-border-strong);
}
.cp-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 8px;
  background-color: var(--v2-background-bg-layer-01);
  box-shadow: inset 0 0 0 0.5px var(--v2-border-border-base);
}
.cp-card--subtle {
  background-color: var(--v2-background-bg-layer-02);
}
.cp-card-title {
  font-size: 12px;
  font-weight: 560;
  color: var(--v2-text-text-base);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.cp-grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.cp-master-detail {
  display: grid;
  grid-template-columns: minmax(220px, 260px) minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
  min-height: 310px;
}
@media (max-width: 640px) {
  .cp-grid-2,
  .cp-master-detail {
    grid-template-columns: minmax(0, 1fr);
  }
}
.cp-master-pane {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border-radius: 8px;
  background-color: var(--v2-background-bg-layer-02);
  box-shadow: inset 0 0 0 0.5px var(--v2-border-border-base);
  min-width: 0;
}
.cp-master-scroll {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 340px;
  overflow-y: auto;
}
.cp-master-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 9px;
  border-radius: 6px;
  background-color: transparent;
  cursor: pointer;
  border: 0.5px solid transparent;
  transition: background-color 100ms ease, border-color 100ms ease;
}
.cp-master-item:hover {
  background-color: var(--v2-overlay-simple-overlay-hover);
}
.cp-master-item--active {
  background-color: var(--v2-background-bg-layer-01);
  border-color: var(--v2-border-border-focus);
  box-shadow: inset 2px 0 0 0 var(--v2-border-border-focus);
}
.cp-inspector-pane {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 8px;
  background-color: var(--v2-background-bg-layer-01);
  box-shadow: inset 0 0 0 0.5px var(--v2-border-border-base);
  min-width: 0;
}
.cp-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
.cp-label {
  font-size: 12px;
  font-weight: 530;
  color: var(--v2-text-text-base);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.cp-hint {
  font-size: 11px;
  color: var(--v2-text-text-muted);
  font-weight: 400;
}
.cp-key-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
}
.cp-key-row > :first-child {
  flex: 1 1 0%;
  min-width: 0;
}
.cp-key-row > :last-child {
  flex-shrink: 0;
}
.cp-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.cp-status-box {
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.45;
  background-color: var(--v2-background-bg-layer-02);
  color: var(--v2-text-text-muted);
  box-shadow: inset 0 0 0 0.5px var(--v2-border-border-base);
}
.cp-status-box--error {
  color: var(--v2-state-fg-danger);
  box-shadow: inset 0 0 0 0.5px var(--v2-state-fg-danger);
}
.cp-status-box--ok {
  color: var(--v2-text-text-base);
  box-shadow: inset 0 0 0 0.5px var(--v2-border-border-focus);
}
.cp-discovered-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 145px;
  overflow-y: auto;
  padding: 8px;
  border-radius: 6px;
  background-color: var(--v2-background-bg-layer-02);
  box-shadow: inset 0 0 0 0.5px var(--v2-border-border-base);
}
.cp-chip-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 5px;
  font-size: 11.5px;
  border: 0.5px solid var(--v2-border-border-base);
  background-color: var(--v2-background-bg-layer-01);
  color: var(--v2-text-text-base);
  cursor: pointer;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.cp-chip-btn:hover {
  background-color: var(--v2-overlay-simple-overlay-hover);
  border-color: var(--v2-border-border-strong);
}
.cp-chip-btn--added {
  border-color: var(--v2-border-border-focus);
  color: var(--v2-text-text-accent);
}
.cp-pill-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}
.cp-pill-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 9px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 500;
  border: 0.5px solid var(--v2-border-border-base);
  background-color: var(--v2-background-bg-layer-01);
  color: var(--v2-text-text-muted);
  cursor: pointer;
}
.cp-pill-btn:hover {
  background-color: var(--v2-overlay-simple-overlay-hover);
  color: var(--v2-text-text-base);
}
.cp-pill-btn--active {
  border-color: var(--v2-border-border-focus);
  background-color: var(--v2-background-bg-layer-02);
  color: var(--v2-text-text-accent);
  box-shadow: inset 0 0 0 0.5px var(--v2-border-border-focus);
}
.cp-model-item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cp-model-id {
  font-size: 12px;
  font-weight: 540;
  color: var(--v2-text-text-base);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cp-model-sub {
  font-size: 11px;
  color: var(--v2-text-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cp-toolbar-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background-color: var(--v2-background-bg-layer-02);
  box-shadow: inset 0 0 0 0.5px var(--v2-border-border-base);
}
.cp-add-inline {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}
.cp-textarea {
  width: 100%;
  min-height: 120px;
  padding: 10px;
  border-radius: 6px;
  border: 0.5px solid var(--v2-border-border-base);
  background-color: var(--v2-background-bg-layer-01);
  color: var(--v2-text-text-base);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.45;
  resize: vertical;
  box-sizing: border-box;
}
.cp-textarea:focus {
  outline: none;
  border-color: var(--v2-border-border-focus);
}
.cp-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  flex-wrap: wrap;
}
.cp-dialog-footer [data-component="switch"] {
  flex-direction: row-reverse;
  gap: 8px;
  font-size: 12.5px;
  color: var(--v2-text-text-muted);
}
.cp-dialog-footer-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.cp-path-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11.5px;
}
`;

// ---------------------------------------------------------------------------
// Main Process Implementation (Node.js / Electron Main)
// ---------------------------------------------------------------------------

/** Strips UTF-8 BOM, JSONC comments, and trailing commas outside string literals. */
function parseJsonc(raw) {
  const src = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  let stripped = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];

    if (inString) {
      stripped += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      stripped += ch;
      continue;
    }

    if (ch === "/" && next === "/") {
      while (i + 1 < src.length && src[i + 1] !== "\n") i++;
      continue;
    }

    if (ch === "/" && next === "*") {
      i += 2;
      while (i + 1 < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i++;
      continue;
    }

    stripped += ch;
  }

  // Remove trailing commas outside strings
  let cleaned = "";
  inString = false;
  escaped = false;
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (inString) {
      cleaned += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      cleaned += ch;
      continue;
    }
    if (ch === ",") {
      let j = i + 1;
      while (j < stripped.length && /\s/.test(stripped[j])) j++;
      if (stripped[j] === "}" || stripped[j] === "]") continue;
    }
    cleaned += ch;
  }

  if (!cleaned.trim()) return {};
  return JSON.parse(cleaned);
}

function maskSecret(secret) {
  if (typeof secret !== "string" || !secret) return "";
  const envMatch = secret.match(/^\{env:([^}]+)\}$/);
  if (envMatch) return `{env:${envMatch[1]}}`;
  if (secret.length <= 8) return "•".repeat(secret.length);
  return `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
}

function slugifyId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolvePackageName(protocol, customPkg) {
  const preset = PROTOCOL_PRESETS.find((p) => p.id === protocol);
  if (preset) return preset.pkg;
  const trimmed = String(customPkg || "").trim();
  return LEGACY_NPM_TO_V2[trimmed] || trimmed || "@opencode/ai/providers/openai-compatible";
}

function detectProtocolFromPackage(pkg) {
  if (!pkg) return "openai-compatible";
  return PACKAGE_TO_PROTOCOL[pkg] || "custom";
}

function parseTokenLimit(raw) {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Math.trunc(raw);
  const s = String(raw || "").trim().replace(/,/g, "").toLowerCase();
  if (!s) return null;
  const match = s.match(/^(\d+(?:\.\d+)?)\s*([km])?$/i);
  if (!match) return null;
  const base = Number(match[1]);
  if (!Number.isFinite(base) || base <= 0) return null;
  const unit = match[2];
  const mult = unit === "m" ? 1000000 : unit === "k" ? 1000 : 1;
  return Math.trunc(base * mult);
}

function formatTokenCount(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "";
  if (value >= 1000000 && value % 1000000 === 0) return `${value / 1000000}M`;
  if (value >= 1000 && value % 1000 === 0) return `${value / 1000}K`;
  return String(value);
}

function orderEffortLevels(levels) {
  const rank = new Map(ALL_EFFORT_OPTIONS.map((lvl, idx) => [lvl, idx]));
  const seen = new Set();
  const clean = [];
  for (const item of Array.isArray(levels) ? levels : []) {
    const val = String(item || "").trim().toLowerCase();
    if (!val || seen.has(val)) continue;
    seen.add(val);
    clean.push(val);
  }
  return clean.sort((a, b) => {
    const ra = rank.has(a) ? rank.get(a) : 999;
    const rb = rank.has(b) ? rank.get(b) : 999;
    return ra !== rb ? ra - rb : a.localeCompare(b);
  });
}

function defaultUltraTargetForProtocol(protocol) {
  return protocol === "anthropic" || protocol === "google" ? "max" : "xhigh";
}

function formatEffortSummary(levels) {
  const ordered = orderEffortLevels(levels);
  if (ordered.length === 0) return "auto";
  if (ordered.length === 1) return ordered[0];
  if (ordered.length <= 2) return ordered.join("/");
  return `${ordered[0]}..${ordered[ordered.length - 1]}`;
}

function buildVariantSettingsForProtocol(protocol, effortVal) {
  const eff = String(effortVal || "").trim().toLowerCase() || "xhigh";
  if (protocol === "anthropic") {
    return {
      thinking: { type: "adaptive", display: "summarized" },
      effort: eff === "ultra" ? "max" : eff,
    };
  }
  if (protocol === "google") {
    return {
      thinkingConfig: {
        includeThoughts: true,
        thinkingLevel: eff === "ultra" ? "high" : eff,
      },
    };
  }
  if (protocol === "openai" || protocol === "openai-compatible-responses") {
    return {
      reasoningEffort: eff,
      reasoningSummary: "auto",
      include: ["reasoning.encrypted_content"],
    };
  }
  return { reasoningEffort: eff };
}

function normalizeModelRecord(modelKey, raw) {
  const m = raw && typeof raw === "object" ? raw : {};
  const ctxLim = typeof m.limit?.context === "number" ? m.limit.context : null;
  const outLim = typeof m.limit?.output === "number" ? m.limit.output : null;
  const collected = [];
  let ultraTarget = null;

  if (Array.isArray(m.capabilities?.reasoning?.effort)) {
    for (const lvl of m.capabilities.reasoning.effort) {
      if (typeof lvl === "string" && lvl.trim()) collected.push(lvl.trim());
    }
  }
  if (Array.isArray(m.variants)) {
    for (const v of m.variants) {
      if (v && typeof v.id === "string" && v.id.trim()) {
        const vid = v.id.trim().toLowerCase();
        collected.push(vid);
        if (vid === "ultra" && v.settings && typeof v.settings === "object") {
          const t =
            v.settings.reasoningEffort ||
            v.settings.effort ||
            v.settings.thinkingConfig?.thinkingLevel ||
            v.settings.thinkingLevel;
          if (typeof t === "string" && t.trim()) ultraTarget = t.trim().toLowerCase();
        }
      }
    }
  } else if (m.variants && typeof m.variants === "object") {
    for (const [vidRaw, vcfg] of Object.entries(m.variants)) {
      const vid = String(vidRaw || "").trim().toLowerCase();
      if (!vid) continue;
      collected.push(vid);
      if (vid === "ultra" && vcfg && typeof vcfg === "object") {
        const t = vcfg.reasoningEffort || vcfg.effort || vcfg.thinkingLevel;
        if (typeof t === "string" && t.trim()) ultraTarget = t.trim().toLowerCase();
      }
    }
  }

  const rawModelPkg =
    typeof m.package === "string" && m.package.trim()
      ? LEGACY_NPM_TO_V2[m.package.trim()] || m.package.trim()
      : typeof m.npm === "string" && m.npm.trim()
        ? LEGACY_NPM_TO_V2[m.npm.trim()] || m.npm.trim()
        : "";
  const modelProtocol = rawModelPkg ? detectProtocolFromPackage(rawModelPkg) : "inherit";

  return {
    id: modelKey,
    name: typeof m.name === "string" && m.name.trim() ? m.name.trim() : modelKey,
    modelID: typeof m.modelID === "string" && m.modelID.trim() ? m.modelID.trim() : typeof m.id === "string" ? m.id : null,
    contextLimit: ctxLim,
    outputLimit: outLim,
    protocol: modelProtocol,
    pkg: rawModelPkg || null,
    effortLevels: orderEffortLevels(collected),
    ultraTarget,
  };
}

/** Converts either V2 (`providers`) or V1 (`provider`) raw entry into canonical V2 config shape. */
function convertRawToV2Config(rawEntry) {
  const raw = rawEntry && typeof rawEntry === "object" ? rawEntry : {};
  const isV1 = "npm" in raw || "options" in raw || "api" in raw;
  const rawPkg = typeof raw.package === "string" ? raw.package : typeof raw.npm === "string" ? raw.npm : "";
  const mappedPkg = LEGACY_NPM_TO_V2[rawPkg] || rawPkg || "@opencode/ai/providers/openai-compatible";

  const srcSettings = {
    ...(raw.options && typeof raw.options === "object" ? raw.options : {}),
    ...(raw.settings && typeof raw.settings === "object" ? raw.settings : {}),
  };

  let baseURL = "";
  if (typeof srcSettings.baseURL === "string") baseURL = srcSettings.baseURL.trim();
  else if (typeof raw.api === "string") baseURL = raw.api.trim();

  const headers = {};
  if (srcSettings.headers && typeof srcSettings.headers === "object") {
    for (const [k, v] of Object.entries(srcSettings.headers)) {
      if (typeof v === "string") headers[k] = v;
    }
  }
  if (raw.headers && typeof raw.headers === "object") {
    for (const [k, v] of Object.entries(raw.headers)) {
      if (typeof v === "string") headers[k] = v;
    }
  }

  let env = Array.isArray(raw.env) ? raw.env.filter((x) => typeof x === "string" && x.trim()) : [];
  let apiKey = typeof srcSettings.apiKey === "string" ? srcSettings.apiKey.trim() : "";

  const envRef = apiKey.match(/^\{env:([^}]+)\}$/);
  if (envRef && !env.includes(envRef[1])) {
    env = [...env, envRef[1]];
  }

  const nextSettings = { ...srcSettings };
  delete nextSettings.headers;
  delete nextSettings.setCacheKey;
  if (baseURL) nextSettings.baseURL = baseURL;
  if (apiKey) nextSettings.apiKey = apiKey;

  const models = {};
  if (raw.models && typeof raw.models === "object") {
    for (const [mid, mval] of Object.entries(raw.models)) {
      if (!mval || typeof mval !== "object") continue;
      const entry = {};
      entry.name = typeof mval.name === "string" && mval.name.trim() ? mval.name.trim() : mid;
      if (typeof mval.modelID === "string" && mval.modelID.trim()) entry.modelID = mval.modelID.trim();
      else if (typeof mval.id === "string" && mval.id.trim() && mval.id !== mid) entry.modelID = mval.id.trim();
      const rawMPkg = typeof mval.package === "string" ? mval.package.trim() : typeof mval.npm === "string" ? mval.npm.trim() : "";
      if (rawMPkg) entry.package = LEGACY_NPM_TO_V2[rawMPkg] || rawMPkg;
      if (mval.limit && typeof mval.limit === "object") {
        const limit = {};
        if (typeof mval.limit.context === "number" && Number.isFinite(mval.limit.context)) limit.context = Math.trunc(mval.limit.context);
        if (typeof mval.limit.output === "number" && Number.isFinite(mval.limit.output)) limit.output = Math.trunc(mval.limit.output);
        if (Object.keys(limit).length > 0) entry.limit = limit;
      }
      if (mval.capabilities && typeof mval.capabilities === "object") entry.capabilities = mval.capabilities;
      if (Array.isArray(mval.variants)) {
        const cleanedVariants = mval.variants.filter((v) => v && typeof v.id === "string" && v.id.trim());
        if (cleanedVariants.length > 0) entry.variants = cleanedVariants;
      } else if (mval.variants && typeof mval.variants === "object") {
        const converted = Object.entries(mval.variants)
          .filter(([vid, vcfg]) => vid && vcfg && typeof vcfg === "object")
          .map(([vid, vcfg]) => ({ id: vid, settings: vcfg }));
        if (converted.length > 0) entry.variants = converted;
      }
      models[mid] = entry;
    }
  }

  const result = {
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "Custom Provider",
    package: mappedPkg,
  };
  if (env.length > 0) result.env = env;
  if (Object.keys(nextSettings).length > 0) result.settings = nextSettings;
  if (Object.keys(headers).length > 0) result.headers = headers;
  if (isV1 && srcSettings.setCacheKey !== undefined) {
    result.compatibility = { supportsPromptCacheKey: Boolean(srcSettings.setCacheKey) };
  } else if (raw.compatibility && typeof raw.compatibility === "object") {
    result.compatibility = raw.compatibility;
  }
  result.models = models;
  return result;
}

function isCustomProviderEntry(raw) {
  if (!raw || typeof raw !== "object") return false;
  const sett =
    raw.settings && typeof raw.settings === "object"
      ? raw.settings
      : raw.options && typeof raw.options === "object"
        ? raw.options
        : null;
  return Boolean(
    (typeof raw.package === "string" && raw.package.trim()) ||
      (typeof raw.npm === "string" && raw.npm.trim()) ||
      (typeof raw.api === "string" && raw.api.trim()) ||
      (sett && typeof sett.baseURL === "string" && sett.baseURL.trim())
  );
}

function buildModelConfigEntry({
  name,
  modelID,
  contextLimit,
  outputLimit,
  modelPkg,
  effortLevels,
  ultraTarget,
  effectiveProtocol,
  prevModel,
  omitName,
}) {
  const mEntry = {};
  if (!omitName) {
    mEntry.name = String(name || "").trim() || String(modelID || "");
  } else if (prevModel && typeof prevModel.name === "string" && prevModel.name.trim()) {
    mEntry.name = prevModel.name.trim();
  }
  if (modelID && typeof modelID === "string" && modelID.trim()) {
    mEntry.modelID = modelID.trim();
  }
  if (modelPkg) {
    mEntry.package = modelPkg;
  }

  const limit = {};
  if (typeof contextLimit === "number" && contextLimit > 0) limit.context = Math.trunc(contextLimit);
  if (typeof outputLimit === "number" && outputLimit > 0) limit.output = Math.trunc(outputLimit);
  if (Object.keys(limit).length > 0) mEntry.limit = limit;

  const orderedEfforts = orderEffortLevels(effortLevels || []);
  const stdEfforts = orderedEfforts.filter((lvl) => STANDARD_EFFORT_LEVELS.includes(lvl));
  const customEfforts = orderedEfforts.filter((lvl) => !STANDARD_EFFORT_LEVELS.includes(lvl));

  const prevCaps = prevModel?.capabilities && typeof prevModel.capabilities === "object" ? { ...prevModel.capabilities } : {};
  delete prevCaps.reasoning;
  if (stdEfforts.length > 0) {
    mEntry.capabilities = {
      ...prevCaps,
      reasoning: { supported: true, effort: stdEfforts },
    };
  } else if (Object.keys(prevCaps).length > 0) {
    mEntry.capabilities = prevCaps;
  }

  const prevVariants = Array.isArray(prevModel?.variants)
    ? prevModel.variants.filter(
        (v) => v && typeof v.id === "string" && v.id.toLowerCase() !== "ultra" && !customEfforts.includes(v.id.toLowerCase())
      )
    : [];
  const customVariants = customEfforts.map((vid) => {
    const effVal =
      vid === "ultra"
        ? String(ultraTarget || "").trim().toLowerCase() || defaultUltraTargetForProtocol(effectiveProtocol)
        : vid;
    return {
      id: vid,
      settings: buildVariantSettingsForProtocol(effectiveProtocol, effVal),
    };
  });
  const nextVariants = [...prevVariants, ...customVariants];
  if (nextVariants.length > 0) {
    mEntry.variants = nextVariants;
  }

  return mEntry;
}

function mergeRawProvidersV2(cfg) {
  return {
    ...(cfg.provider && typeof cfg.provider === "object"
      ? Object.fromEntries(
          Object.entries(cfg.provider).map(([k, v]) => [k, isCustomProviderEntry(v) ? convertRawToV2Config(v) : v])
        )
      : {}),
    ...(cfg.providers && typeof cfg.providers === "object" ? { ...cfg.providers } : {}),
  };
}

/** Collects provider map from config object combining V1 (`provider`) and V2 (`providers`). */
function collectRawProviders(cfg) {
  const out = {};
  if (cfg && cfg.provider && typeof cfg.provider === "object") {
    for (const [id, entry] of Object.entries(cfg.provider)) {
      if (entry && typeof entry === "object") out[id] = entry;
    }
  }
  if (cfg && cfg.providers && typeof cfg.providers === "object") {
    for (const [id, entry] of Object.entries(cfg.providers)) {
      if (entry && typeof entry === "object") out[id] = entry;
    }
  }
  return out;
}

function buildModelsProbeUrls(baseURL) {
  const clean = String(baseURL || "").trim().replace(/\/+$/, "");
  if (!clean) return [];
  const stripped = clean.replace(/\/(?:chat\/completions|responses|messages|models)$/i, "");
  const candidates = [`${stripped}/models`];
  try {
    const parsed = new URL(stripped);
    if (!/\/v\d+(?:alpha|beta)?$/i.test(parsed.pathname.replace(/\/+$/, ""))) {
      candidates.push(`${stripped}/v1/models`);
    }
    if (parsed.pathname && parsed.pathname !== "/" && !parsed.pathname.endsWith("/v1")) {
      candidates.push(`${parsed.origin}/v1/models`);
    }
  } catch {
    // URL validation handled separately
  }
  return [...new Set(candidates)];
}

function normalizeBaseUrlForProtocol(rawUrl, protocol) {
  let clean = String(rawUrl || "").trim().replace(/\/+$/, "");
  if (!clean) return "";
  if (protocol && protocol !== "custom") {
    clean = clean.replace(/\/(?:chat\/completions|responses|messages|models)$/i, "");
    clean = clean.replace(/\/+$/, "");
  }
  return clean;
}

async function createMainHandler(ctx) {
  const fs = require("node:fs");
  const fsp = require("node:fs/promises");
  const path = require("node:path");
  const os = require("node:os");

  const configDir = process.env.OPENCODE_CONFIG_DIR
    ? path.resolve(process.env.OPENCODE_CONFIG_DIR)
    : path.join(os.homedir(), ".config", "opencode");

  async function getToolboxSettings() {
    try {
      const raw = await fsp.readFile(path.join(configDir, "opencode-toolbox.json"), "utf8");
      const value = JSON.parse(raw);
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch (error) {
      if (error?.code === "ENOENT") return {};
      console.error("[opencode-toolbox] Cannot read GUI module settings:", error);
      return {};
    }
  }

  async function resolveConfigFile() {
    const jsonc = path.join(configDir, "opencode.jsonc");
    const json = path.join(configDir, "opencode.json");
    if (fs.existsSync(jsonc)) return { filePath: jsonc, exists: true };
    if (fs.existsSync(json)) return { filePath: json, exists: true };
    return { filePath: jsonc, exists: false };
  }

  async function readConfigObject(filePath) {
    if (!fs.existsSync(filePath)) return {};
    const raw = await fsp.readFile(filePath, "utf8");
    const parsed = parseJsonc(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`Configuration root in ${path.basename(filePath)} must be a JSON object.`);
    }
    return parsed;
  }

  let writeChain = Promise.resolve();
  async function writeConfigObject(filePath, cfg) {
    const run = async () => {
      await fsp.mkdir(path.dirname(filePath), { recursive: true });
      const next = { ...cfg };
      if (!next.$schema) next.$schema = "https://opencode.ai/config.json";
      const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2, 6)}.tmp`;
      const serialized = JSON.stringify(next, null, 2) + "\n";
      await fsp.writeFile(tmpPath, serialized, "utf8");
      try {
        let renamed = false;
        let lastErr = null;
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            await fsp.rename(tmpPath, filePath);
            renamed = true;
            break;
          } catch (err) {
            lastErr = err;
            if (err && (err.code === "EPERM" || err.code === "EBUSY" || err.code === "EACCES")) {
              await new Promise((r) => setTimeout(r, 15 * (1 << attempt)));
              continue;
            }
            throw err;
          }
        }
        if (!renamed) {
          if (lastErr && (lastErr.code === "EPERM" || lastErr.code === "EBUSY" || lastErr.code === "EACCES")) {
            await fsp.writeFile(filePath, serialized, "utf8");
          } else if (lastErr) {
            throw lastErr;
          }
        }
      } finally {
        await fsp.unlink(tmpPath).catch(() => {});
      }
    };
    const nextWrite = writeChain.then(run, run);
    writeChain = nextWrite.catch(() => {});
    return nextWrite;
  }

  async function callSidecar(method, apiPath, timeoutMs = 8000) {
    const endpoint = ctx.serverEndpoints.get("sidecar");
    if (!endpoint) return null;
    const url = `${endpoint.url.replace(/\/+$/, "")}${apiPath}`;
    const res = await fetch(url, {
      method,
      headers: {
        ...endpoint.headers,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
    if (res.status === 204) return null;
    return res.json();
  }

  async function reloadCatalogSoft() {
    try {
      await callSidecar("POST", "/api/location/reload", 2500);
      return true;
    } catch {
      return false;
    }
  }

  async function fetchConnectedIntegrations() {
    try {
      const json = await callSidecar("GET", "/api/integration");
      const list = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
      const connected = new Set();
      for (const item of list) {
        if (item?.id && Array.isArray(item.connections) && item.connections.length > 0) {
          connected.add(item.id);
        }
      }
      return connected;
    } catch {
      return new Set();
    }
  }

  async function findDesktopConfig() {
    const desktopDir = path.join(os.homedir(), "Desktop");
    for (const name of ["opencode.jsonc", "opencode.json"]) {
      const candidate = path.join(desktopDir, name);
      if (fs.existsSync(candidate)) {
        try {
          const parsed = parseJsonc(await fsp.readFile(candidate, "utf8"));
          const rawMap = collectRawProviders(parsed);
          if (Object.keys(rawMap).length > 0) {
            return { filePath: candidate, providers: rawMap };
          }
        } catch {
          // Ignore unreadable desktop files cleanly
        }
      }
    }
    return null;
  }

  function toProviderView(id, rawEntry, connectedSet) {
    const raw = rawEntry && typeof rawEntry === "object" ? rawEntry : {};
    const v2 = convertRawToV2Config(raw);
    const settings = v2.settings || {};
    const apiKey = typeof settings.apiKey === "string" ? settings.apiKey : "";
    const envList = Array.isArray(v2.env) ? v2.env : [];
    const primaryEnv = envList[0] || (apiKey.match(/^\{env:([^}]+)\}$/)?.[1] ?? "");

    let authMode = "none";
    if (apiKey && !/^\{env:[^}]+\}$/.test(apiKey)) {
      authMode = "key";
    } else if (primaryEnv) {
      authMode = "env";
    }

    const envPresent = primaryEnv ? Boolean(process.env[primaryEnv]) : false;
    const protocol = detectProtocolFromPackage(v2.package);
    const models = Object.entries(v2.models || {}).map(([mid, m]) => normalizeModelRecord(mid, m));

    let headersJson = "";
    if (v2.headers && Object.keys(v2.headers).length > 0) {
      headersJson = JSON.stringify(v2.headers, null, 2);
    }

    return {
      id,
      name: v2.name || id,
      protocol,
      pkg: v2.package || "",
      baseURL: typeof settings.baseURL === "string" ? settings.baseURL : "",
      authMode,
      hasKey: Boolean(apiKey),
      apiKeyMask: maskSecret(apiKey),
      envVar: primaryEnv,
      envPresent,
      connected: connectedSet.has(id) || (authMode === "key" && Boolean(apiKey)) || (authMode === "env" && envPresent),
      headersJson,
      models,
    };
  }

  let currentState = {
    configPath: path.join(configDir, "opencode.jsonc"),
    configExists: false,
    desktopPath: null,
    desktopCandidates: [],
    providers: [],
    modelOverrides: [],
    lastError: null,
  };

  let ipcHandle = null;
  let activeRebuild = null;
  let pendingRebuild = false;

  async function runRebuildState(skipSidecar) {
    try {
      const { filePath, exists } = await resolveConfigFile();
      const cfg = exists ? await readConfigObject(filePath) : {};
      const rawMap = collectRawProviders(cfg);
      const connectedSet = skipSidecar ? new Set() : await fetchConnectedIntegrations();
      const providers = [];
      const modelOverrides = [];
      for (const [id, entry] of Object.entries(rawMap)) {
        if (isCustomProviderEntry(entry)) {
          providers.push(toProviderView(id, entry, connectedSet));
        } else if (entry?.models && typeof entry.models === "object") {
          for (const [mid, mRaw] of Object.entries(entry.models)) {
            const norm = normalizeModelRecord(mid, mRaw);
            modelOverrides.push({
              providerID: id,
              modelID: mid,
              contextLimit: norm.contextLimit,
              outputLimit: norm.outputLimit,
              effortLevels: norm.effortLevels,
              ultraTarget: norm.ultraTarget,
            });
          }
        }
      }
      const existingIds = new Set(providers.map((p) => p.id));

      const desktop = await findDesktopConfig();
      const desktopCandidates = desktop
        ? Object.entries(desktop.providers).map(([id, entry]) => {
            const v2 = convertRawToV2Config(entry);
            return {
              id,
              name: v2.name || id,
              protocol: detectProtocolFromPackage(v2.package),
              baseURL: v2.settings?.baseURL || "",
              modelCount: Object.keys(v2.models || {}).length,
              alreadyExists: existingIds.has(id),
            };
          })
        : [];

      currentState = {
        configPath: filePath,
        configExists: exists,
        desktopPath: desktop ? desktop.filePath : null,
        desktopCandidates,
        providers,
        modelOverrides,
        lastError: null,
      };
    } catch (err) {
      currentState = {
        ...currentState,
        lastError: err instanceof Error ? err.message : String(err),
      };
    }

    // OpenCode's Host `changed(windowId)` treats any non-undefined argument as a
    // target window ID filter; pass no argument to broadcast to all subscribed windows.
    ipcHandle?.changed();
    return currentState;
  }

  async function rebuildState(options = {}) {
    if (activeRebuild) {
      pendingRebuild = true;
      await activeRebuild;
      if (!pendingRebuild) return currentState;
    }
    pendingRebuild = false;
    activeRebuild = (async () => {
      do {
        pendingRebuild = false;
        await runRebuildState(Boolean(options.skipSidecar));
        options = {};
      } while (pendingRebuild);
      return currentState;
    })();
    try {
      return await activeRebuild;
    } finally {
      activeRebuild = null;
    }
  }

  function scheduleRefresh() {
    setTimeout(() => {
      void rebuildState();
    }, 350);
  }

  // Hydrate initial state from disk BEFORE registering IPC so the very first
  // renderer snapshot already includes all configured providers.
  await rebuildState({ skipSidecar: true });

  // Watch config directory for external edits so Settings tab stays current
  let watchTimer = null;
  try {
    if (fs.existsSync(configDir)) {
      const watcher = fs.watch(configDir, (_event, filename) => {
        if (filename && !/^opencode\.jsonc?$/i.test(String(filename))) return;
        clearTimeout(watchTimer);
        watchTimer = setTimeout(() => { void rebuildState(); void rebuildMcpState(); }, 250);
      });
      ctx.onCleanup(() => {
        clearTimeout(watchTimer);
        watcher.close();
      });
    }
  } catch {
    // Non-fatal if configDir doesn't exist yet
  }

  ipcHandle = ctx.provide(CustomProviderIpc, {
    state: () => currentState,

    async refresh() {
      return rebuildState();
    },

    async saveProvider(input) {
      const id = slugifyId(input.id);
      if (!id) {
        return { ok: false, message: "Provider ID must contain letters or numbers.", importedCount: 0 };
      }

      const baseURL = normalizeBaseUrlForProtocol(input.baseURL, input.protocol);
      if (!baseURL || !/^https?:\/\//i.test(baseURL)) {
        return { ok: false, message: "Base URL must start with http:// or https://.", importedCount: 0 };
      }

      let parsedHeaders = undefined;
      if (String(input.headersJson || "").trim()) {
        try {
          const obj = JSON.parse(input.headersJson);
          if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
            return { ok: false, message: "Custom headers must be a JSON object.", importedCount: 0 };
          }
          parsedHeaders = Object.fromEntries(
            Object.entries(obj).map(([k, v]) => [String(k), String(v)])
          );
        } catch (err) {
          return {
            ok: false,
            message: `Invalid headers JSON: ${err instanceof Error ? err.message : String(err)}`,
            importedCount: 0,
          };
        }
      }

      const { filePath } = await resolveConfigFile();
      const cfg = await readConfigObject(filePath);
      const nextProviders = mergeRawProvidersV2(cfg);

      const lookupId = input.originalId || id;
      const existingRaw = nextProviders[lookupId] ? convertRawToV2Config(nextProviders[lookupId]) : null;
      if (input.originalId && input.originalId !== id) {
        delete nextProviders[input.originalId];
      }

      const pkg = resolvePackageName(input.protocol, input.customPkg);
      const settings = { ...(existingRaw?.settings || {}), baseURL };
      delete settings.apiKey;
      let env = undefined;

      if (input.authMode === "key") {
        const keyVal = String(input.apiKeyInput || "").trim();
        if (keyVal) {
          settings.apiKey = keyVal;
          const envRef = keyVal.match(/^\{env:([^}]+)\}$/);
          if (envRef) env = [envRef[1]];
        } else if (input.keepExistingKey && existingRaw?.settings?.apiKey) {
          settings.apiKey = existingRaw.settings.apiKey;
          if (existingRaw.env?.length) env = existingRaw.env;
        }
      } else if (input.authMode === "env") {
        const varName = String(input.envVar || "").trim();
        if (!varName) {
          return { ok: false, message: "Environment variable name is required in Env mode.", importedCount: 0 };
        }
        env = [varName];
        settings.apiKey = `{env:${varName}}`;
      }

      const modelsObj = {};
      for (const m of input.models || []) {
        const mid = String(m.id || "").trim();
        if (!mid) continue;
        const prevModel = existingRaw?.models && typeof existingRaw.models[mid] === "object" ? existingRaw.models[mid] : null;
        const rawProto = typeof m.protocol === "string" && m.protocol.trim() ? m.protocol.trim() : "inherit";
        let modelPkg = null;
        if (rawProto === "custom") {
          const customP = String(m.pkg || "").trim();
          if (customP) modelPkg = LEGACY_NPM_TO_V2[customP] || customP;
        } else if (rawProto !== "inherit") {
          modelPkg = resolvePackageName(rawProto, m.pkg || "");
        }
        const effectiveProtocol = rawProto && rawProto !== "inherit" ? rawProto : input.protocol;
        modelsObj[mid] = buildModelConfigEntry({
          name: String(m.name || "").trim() || mid,
          modelID: m.modelID && m.modelID.trim() && m.modelID.trim() !== mid ? m.modelID.trim() : null,
          contextLimit: m.contextLimit,
          outputLimit: m.outputLimit,
          modelPkg,
          effortLevels: m.effortLevels || [],
          ultraTarget: m.ultraTarget,
          effectiveProtocol,
          prevModel,
          omitName: false,
        });
      }

      const entry = {
        name: String(input.name || "").trim() || id,
        package: pkg,
        ...(env ? { env } : {}),
        settings,
        ...(parsedHeaders && Object.keys(parsedHeaders).length > 0 ? { headers: parsedHeaders } : {}),
        models: modelsObj,
      };

      nextProviders[id] = entry;
      delete cfg.provider;
      cfg.providers = nextProviders;

      if (input.setAsDefaultModel) {
        const firstModel = Object.keys(modelsObj)[0];
        if (firstModel) cfg.model = `${id}/${firstModel}`;
      }

      await writeConfigObject(filePath, cfg);
      await rebuildState();
      await reloadCatalogSoft();
      scheduleRefresh();
      return {
        ok: true,
        message: `Saved custom provider "${entry.name}" (${Object.keys(modelsObj).length} model(s)).`,
        importedCount: 1,
      };
    },

    async deleteProvider({ id }) {
      const { filePath, exists } = await resolveConfigFile();
      if (!exists) return { ok: false, message: "No config file found.", importedCount: 0 };

      const cfg = await readConfigObject(filePath);
      const nextProviders = mergeRawProvidersV2(cfg);

      if (!(id in nextProviders)) {
        return { ok: false, message: `Provider "${id}" not found.`, importedCount: 0 };
      }

      const removedName = nextProviders[id]?.name || id;
      delete nextProviders[id];
      delete cfg.provider;
      if (Object.keys(nextProviders).length > 0) {
        cfg.providers = nextProviders;
      } else {
        delete cfg.providers;
      }

      await writeConfigObject(filePath, cfg);
      await rebuildState();
      await reloadCatalogSoft();
      scheduleRefresh();
      return { ok: true, message: `Deleted "${removedName}".`, importedCount: 0 };
    },

    async importDesktop({ onlyMissing }) {
      const desktop = await findDesktopConfig();
      if (!desktop) {
        return { ok: false, message: "No providers found in Desktop/opencode.jsonc.", importedCount: 0 };
      }

      const { filePath } = await resolveConfigFile();
      const cfg = await readConfigObject(filePath);
      const nextProviders = mergeRawProvidersV2(cfg);

      let count = 0;
      for (const [id, entry] of Object.entries(desktop.providers)) {
        if (onlyMissing && id in nextProviders) continue;
        nextProviders[id] = convertRawToV2Config(entry);
        count++;
      }

      if (count === 0) {
        return { ok: true, message: "All Desktop providers are already imported.", importedCount: 0 };
      }

      delete cfg.provider;
      cfg.providers = nextProviders;
      await writeConfigObject(filePath, cfg);
      await rebuildState();
      await reloadCatalogSoft();
      scheduleRefresh();
      return {
        ok: true,
        message: `Imported ${count} provider(s) from Desktop config.`,
        importedCount: count,
      };
    },

    async importJson({ text, overwrite }) {
      let parsed;
      try {
        parsed = parseJsonc(String(text || ""));
      } catch (err) {
        return {
          ok: false,
          message: `Invalid JSON/JSONC: ${err instanceof Error ? err.message : String(err)}`,
          importedCount: 0,
        };
      }

      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ok: false, message: "Pasted text must be a JSON object.", importedCount: 0 };
      }

      let rawMap = collectRawProviders(parsed);
      if (Object.keys(rawMap).length === 0) {
        // Check if user pasted a direct map of `{ "<providerId>": { ... } }`
        const looksLikeProviderMap = Object.values(parsed).some(
          (v) => v && typeof v === "object" && ("models" in v || "options" in v || "settings" in v || "npm" in v || "package" in v)
        );
        if (looksLikeProviderMap) rawMap = parsed;
      }

      const entries = Object.entries(rawMap);
      if (entries.length === 0) {
        return {
          ok: false,
          message: 'No providers found. Paste an object with "providers" or "provider".',
          importedCount: 0,
        };
      }

      const { filePath } = await resolveConfigFile();
      const cfg = await readConfigObject(filePath);
      const nextProviders = mergeRawProvidersV2(cfg);

      let count = 0;
      for (const [id, entry] of entries) {
        const cleanId = slugifyId(id);
        if (!cleanId) continue;
        if (!overwrite && cleanId in nextProviders) continue;
        nextProviders[cleanId] = convertRawToV2Config(entry);
        count++;
      }

      delete cfg.provider;
      cfg.providers = nextProviders;
      await writeConfigObject(filePath, cfg);
      await rebuildState();
      await reloadCatalogSoft();
      scheduleRefresh();
      return {
        ok: true,
        message: `Imported ${count} provider(s) into config.`,
        importedCount: count,
      };
    },

    async fetchModels(input) {
      const urls = buildModelsProbeUrls(input.baseURL);
      if (urls.length === 0) {
        return {
          ok: false,
          url: "",
          suggestedBaseURL: null,
          status: 0,
          latencyMs: 0,
          error: "Base URL is required.",
          models: [],
        };
      }

      // Resolve runtime secret purely inside Main process; never send key back to renderer.
      let resolvedKey = "";
      if (input.authMode === "key") {
        const raw = String(input.apiKeyInput || "").trim();
        if (raw) {
          const envRef = raw.match(/^\{env:([^}]+)\}$/);
          resolvedKey = envRef ? String(process.env[envRef[1]] || "") : raw;
        } else if (input.existingId) {
          try {
            const { filePath, exists } = await resolveConfigFile();
            if (exists) {
              const cfg = await readConfigObject(filePath);
              const rawMap = collectRawProviders(cfg);
              const existing = rawMap[input.existingId] ? convertRawToV2Config(rawMap[input.existingId]) : null;
              const stored = existing?.settings?.apiKey || "";
              const envRef = stored.match(/^\{env:([^}]+)\}$/);
              resolvedKey = envRef ? String(process.env[envRef[1]] || "") : stored;
            }
          } catch {
            // Fall through unauthenticated
          }
        }
      } else if (input.authMode === "env" && input.envVar) {
        resolvedKey = String(process.env[input.envVar.trim()] || "");
      }

      const headers = { Accept: "application/json" };
      if (String(input.headersJson || "").trim()) {
        try {
          const custom = JSON.parse(input.headersJson);
          if (custom && typeof custom === "object") {
            for (const [k, v] of Object.entries(custom)) headers[k] = String(v);
          }
        } catch {
          // Ignore invalid JSON headers during probe
        }
      }
      if (resolvedKey) {
        headers.Authorization = `Bearer ${resolvedKey}`;
        if (input.protocol === "anthropic") {
          headers["x-api-key"] = resolvedKey;
          headers["anthropic-version"] = headers["anthropic-version"] || "2023-06-01";
        }
      }

      let lastErr = "Request failed";
      let lastUrl = urls[0];
      let lastStatus = 0;
      const started = Date.now();

      for (const probeUrl of urls) {
        lastUrl = probeUrl;
        try {
          const res = await fetch(probeUrl, {
            method: "GET",
            headers,
            signal: AbortSignal.timeout(12000),
          });
          lastStatus = res.status;
          const contentType = String(res.headers.get("content-type") || "").toLowerCase();
          const text = await res.text();
          if (!res.ok) {
            lastErr = `HTTP ${res.status}${text ? `: ${text.slice(0, 180)}` : ""}`;
            continue;
          }
          if (!text.trim()) {
            lastErr = `Empty response body (HTTP ${res.status})`;
            continue;
          }
          if (contentType.includes("text/html") || /^\s*(?:<!doctype|<html\b)/i.test(text)) {
            lastErr = "Endpoint returned an HTML webpage instead of JSON (check if Base URL needs /v1).";
            continue;
          }
          const json = JSON.parse(text);
          const list = Array.isArray(json?.data)
            ? json.data
            : Array.isArray(json?.models)
              ? json.models
              : Array.isArray(json)
                ? json
                : [];
          const models = list
            .map((item) => {
              const mid = typeof item?.id === "string" ? item.id : typeof item?.name === "string" ? item.name : "";
              if (!mid) return null;
              const rawName = typeof item?.display_name === "string" ? item.display_name : typeof item?.name === "string" ? item.name : mid;
              const ctxLim =
                typeof item?.context_length === "number"
                  ? item.context_length
                  : typeof item?.max_model_len === "number"
                    ? item.max_model_len
                    : typeof item?.inputTokenLimit === "number"
                      ? item.inputTokenLimit
                      : null;
              const outLim =
                typeof item?.max_output_tokens === "number"
                  ? item.max_output_tokens
                  : typeof item?.output_token_limit === "number"
                    ? item.output_token_limit
                    : typeof item?.outputTokenLimit === "number"
                      ? item.outputTokenLimit
                      : typeof item?.max_completion_tokens === "number"
                        ? item.max_completion_tokens
                        : null;
              return { id: mid, name: rawName, contextLimit: ctxLim, outputLimit: outLim };
            })
            .filter(Boolean)
            .sort((a, b) => a.id.localeCompare(b.id));

          const suggestedBaseURL = probeUrl.replace(/\/models(?:\?.*)?$/i, "");
          return {
            ok: true,
            url: probeUrl,
            suggestedBaseURL: suggestedBaseURL || null,
            status: res.status,
            latencyMs: Date.now() - started,
            error: null,
            models,
          };
        } catch (err) {
          lastErr = err instanceof Error ? err.message : String(err);
        }
      }

      return {
        ok: false,
        url: lastUrl,
        suggestedBaseURL: null,
        status: lastStatus,
        latencyMs: Date.now() - started,
        error: lastErr,
        models: [],
      };
    },

    async listCatalogModels() {
      const { filePath, exists } = await resolveConfigFile();
      const cfg = exists ? await readConfigObject(filePath) : {};
      const rawMap = collectRawProviders(cfg);
      const customProviderIds = new Set(
        Object.entries(rawMap)
          .filter(([, e]) => isCustomProviderEntry(e))
          .map(([pid]) => pid)
      );

      let sidecarError = null;
      let providerNameMap = new Map();
      let liveModels = [];
      try {
        const [provRes, modRes] = await Promise.all([
          callSidecar("GET", "/api/provider").catch(() => null),
          callSidecar("GET", "/api/model"),
        ]);
        const provArr = Array.isArray(provRes?.data) ? provRes.data : Array.isArray(provRes) ? provRes : [];
        for (const p of provArr) {
          if (p?.id) providerNameMap.set(p.id, p.name || p.id);
        }
        liveModels = Array.isArray(modRes?.data) ? modRes.data : Array.isArray(modRes) ? modRes : [];
      } catch (err) {
        sidecarError = err instanceof Error ? err.message : String(err);
      }

      const combined = new Map();
      for (const m of liveModels) {
        const pid = String(m?.providerID || "").trim();
        const mid = String(m?.id || "").trim();
        if (!pid || !mid) continue;
        const norm = normalizeModelRecord(mid, m);
        const cfgProv = rawMap[pid];
        const cfgMod = cfgProv?.models && typeof cfgProv.models === "object" ? cfgProv.models[mid] : null;
        const cfgNorm = cfgMod ? normalizeModelRecord(mid, cfgMod) : null;
        const hasOverride = Boolean(
          cfgMod &&
            (!customProviderIds.has(pid) ||
              (cfgNorm && (cfgNorm.effortLevels.length > 0 || cfgNorm.contextLimit || cfgNorm.outputLimit)))
        );
        combined.set(`${pid}/${mid}`, {
          providerID: pid,
          providerName: providerNameMap.get(pid) || cfgProv?.name || pid,
          id: mid,
          name: String(m.name || mid),
          protocol: detectProtocolFromPackage(m.package),
          isCustomProvider: customProviderIds.has(pid),
          contextLimit: norm.contextLimit,
          outputLimit: norm.outputLimit,
          effortLevels: norm.effortLevels,
          hasOverride,
          overrideContextLimit: cfgNorm?.contextLimit ?? null,
          overrideOutputLimit: cfgNorm?.outputLimit ?? null,
          overrideEffortLevels: cfgNorm?.effortLevels ?? [],
          overrideUltraTarget: cfgNorm?.ultraTarget ?? null,
        });
      }

      for (const [pid, cfgProv] of Object.entries(rawMap)) {
        if (!cfgProv?.models || typeof cfgProv.models !== "object") continue;
        const isCustom = customProviderIds.has(pid);
        const provPkg = typeof cfgProv.package === "string" ? cfgProv.package : "";
        for (const [mid, cfgMod] of Object.entries(cfgProv.models)) {
          const key = `${pid}/${mid}`;
          if (combined.has(key)) continue;
          const norm = normalizeModelRecord(mid, cfgMod);
          const proto = norm.protocol && norm.protocol !== "inherit" ? norm.protocol : detectProtocolFromPackage(provPkg);
          combined.set(key, {
            providerID: pid,
            providerName: providerNameMap.get(pid) || cfgProv.name || pid,
            id: mid,
            name: norm.name || mid,
            protocol: proto,
            isCustomProvider: isCustom,
            contextLimit: norm.contextLimit,
            outputLimit: norm.outputLimit,
            effortLevels: norm.effortLevels,
            hasOverride: true,
            overrideContextLimit: norm.contextLimit,
            overrideOutputLimit: norm.outputLimit,
            overrideEffortLevels: norm.effortLevels,
            overrideUltraTarget: norm.ultraTarget,
          });
        }
      }

      const list = Array.from(combined.values()).sort((a, b) =>
        a.providerID !== b.providerID ? a.providerID.localeCompare(b.providerID) : a.id.localeCompare(b.id)
      );
      return { ok: !sidecarError || list.length > 0, error: sidecarError, models: list };
    },

    async saveModelOverride(input) {
      const pid = String(input.providerID || "").trim();
      const mid = String(input.modelID || "").trim();
      if (!pid || !mid) return { ok: false, message: "Provider ID and Model ID are required.", importedCount: 0 };

      const { filePath } = await resolveConfigFile();
      const cfg = await readConfigObject(filePath);
      const nextProviders = mergeRawProvidersV2(cfg);

      const existingProv = nextProviders[pid] && typeof nextProviders[pid] === "object" ? { ...nextProviders[pid] } : {};
      const isCustom = isCustomProviderEntry(existingProv);
      const existingModels = existingProv.models && typeof existingProv.models === "object" ? { ...existingProv.models } : {};
      const prevModel = existingModels[mid] && typeof existingModels[mid] === "object" ? existingModels[mid] : null;

      const built = buildModelConfigEntry({
        name: prevModel?.name || mid,
        modelID: prevModel?.modelID || null,
        contextLimit: input.contextLimit,
        outputLimit: input.outputLimit,
        modelPkg: prevModel?.package || null,
        effortLevels: input.effortLevels || [],
        ultraTarget: input.ultraTarget,
        effectiveProtocol: input.protocol || "openai-compatible",
        prevModel,
        omitName: !isCustom,
      });

      if (!isCustom && Object.keys(built).length === 0) {
        delete existingModels[mid];
        if (Object.keys(existingModels).length > 0) {
          nextProviders[pid] = { ...existingProv, models: existingModels };
        } else {
          delete nextProviders[pid];
        }
      } else {
        existingModels[mid] = built;
        nextProviders[pid] = { ...existingProv, models: existingModels };
      }

      delete cfg.provider;
      if (Object.keys(nextProviders).length > 0) cfg.providers = nextProviders;
      else delete cfg.providers;

      await writeConfigObject(filePath, cfg);
      await rebuildState();
      await reloadCatalogSoft();
      scheduleRefresh();
      return { ok: true, message: `Updated ${pid}/${mid}.`, importedCount: 1 };
    },

    async batchBoostModels(input) {
      const pid = String(input.providerID || "").trim();
      if (!pid || !Array.isArray(input.models) || input.models.length === 0) {
        return { ok: false, message: "No models selected to boost.", importedCount: 0 };
      }

      const { filePath } = await resolveConfigFile();
      const cfg = await readConfigObject(filePath);
      const nextProviders = mergeRawProvidersV2(cfg);

      const existingProv = nextProviders[pid] && typeof nextProviders[pid] === "object" ? { ...nextProviders[pid] } : {};
      const isCustom = isCustomProviderEntry(existingProv);
      const existingModels = existingProv.models && typeof existingProv.models === "object" ? { ...existingProv.models } : {};

      let count = 0;
      for (const item of input.models) {
        const mid = String(item.modelID || "").trim();
        if (!mid) continue;
        const prevModel = existingModels[mid] && typeof existingModels[mid] === "object" ? existingModels[mid] : null;
        const built = buildModelConfigEntry({
          name: prevModel?.name || mid,
          modelID: prevModel?.modelID || null,
          contextLimit: input.contextLimit !== undefined && input.contextLimit !== null ? input.contextLimit : prevModel?.limit?.context ?? null,
          outputLimit: input.outputLimit !== undefined && input.outputLimit !== null ? input.outputLimit : prevModel?.limit?.output ?? null,
          modelPkg: prevModel?.package || null,
          effortLevels: input.effortLevels || [],
          ultraTarget: input.ultraTarget,
          effectiveProtocol: item.protocol || "openai-compatible",
          prevModel,
          omitName: !isCustom,
        });
        if (!isCustom && Object.keys(built).length === 0) {
          delete existingModels[mid];
        } else {
          existingModels[mid] = built;
        }
        count++;
      }

      if (!isCustom && Object.keys(existingModels).length === 0) {
        delete nextProviders[pid];
      } else {
        nextProviders[pid] = { ...existingProv, models: existingModels };
      }

      delete cfg.provider;
      if (Object.keys(nextProviders).length > 0) cfg.providers = nextProviders;
      else delete cfg.providers;

      await writeConfigObject(filePath, cfg);
      await rebuildState();
      await reloadCatalogSoft();
      scheduleRefresh();
      return { ok: true, message: `Boosted ${count} model(s) in "${pid}".`, importedCount: count };
    },

    async resetModelOverride({ providerID, modelID }) {
      const pid = String(providerID || "").trim();
      const mid = String(modelID || "").trim();
      if (!pid || !mid) return { ok: false, message: "Invalid model identifier.", importedCount: 0 };

      const { filePath, exists } = await resolveConfigFile();
      if (!exists) return { ok: true, message: "Already at default.", importedCount: 0 };
      const cfg = await readConfigObject(filePath);
      const nextProviders = mergeRawProvidersV2(cfg);

      const existingProv = nextProviders[pid];
      if (!existingProv || typeof existingProv !== "object" || !existingProv.models || !(mid in existingProv.models)) {
        return { ok: true, message: "No override found.", importedCount: 0 };
      }

      const isCustom = isCustomProviderEntry(existingProv);
      const existingModels = { ...existingProv.models };
      if (!isCustom) {
        delete existingModels[mid];
        if (Object.keys(existingModels).length > 0) {
          nextProviders[pid] = { ...existingProv, models: existingModels };
        } else {
          delete nextProviders[pid];
        }
      } else {
        const prev = existingModels[mid];
        existingModels[mid] = {
          name: prev?.name || mid,
          ...(prev?.modelID ? { modelID: prev.modelID } : {}),
          ...(prev?.package ? { package: prev.package } : {}),
        };
        nextProviders[pid] = { ...existingProv, models: existingModels };
      }

      delete cfg.provider;
      if (Object.keys(nextProviders).length > 0) cfg.providers = nextProviders;
      else delete cfg.providers;

      await writeConfigObject(filePath, cfg);
      await rebuildState();
      await reloadCatalogSoft();
      scheduleRefresh();
      return { ok: true, message: `Reset ${pid}/${mid} to default.`, importedCount: 1 };
    },

    async reloadServer() {
      try {
        await callSidecar("POST", "/api/location/reload");
        await rebuildState();
        return { ok: true, message: "OpenCode provider catalog reloaded.", importedCount: 0 };
      } catch (err) {
        return {
          ok: false,
          message: `Reload failed: ${err instanceof Error ? err.message : String(err)}`,
          importedCount: 0,
        };
      }
    },
  });


  let currentMcpState = { configPath: "", servers: [], error: null };
  let mcpIpcHandle = null;
  async function rebuildMcpState() {
    try {
      const { filePath, exists } = await resolveConfigFile();
      const cfg = exists ? await readConfigObject(filePath) : {};
      const source = cfg.mcp?.servers && typeof cfg.mcp.servers === "object" ? cfg.mcp.servers : {};
      const servers = Object.entries(source).map(([id, value]) => {
        const server = value && typeof value === "object" ? value : {};
        return {
          id, type: String(server.type || "local"), disabled: Boolean(server.disabled),
          command: Array.isArray(server.command) ? server.command.map(String) : [],
          url: String(server.url || ""), cwd: String(server.cwd || ""),
          environmentJson: JSON.stringify(server.environment || {}, null, 2),
          headersJson: JSON.stringify(server.headers || {}, null, 2),
        };
      });
      currentMcpState = { configPath: filePath, servers, error: null };
    } catch (error) {
      currentMcpState = { configPath: "", servers: [], error: error instanceof Error ? error.message : String(error) };
    }
    mcpIpcHandle?.changed();
    return currentMcpState;
  }
  await rebuildMcpState();
  mcpIpcHandle = ctx.provide(McpIpc, {
    state: () => currentMcpState,
    async refresh() { return rebuildMcpState(); },
    async save(input) {
      try {
        const id = String(input.id || "").trim();
        if (!/^[a-zA-Z0-9._-]+$/.test(id)) return { ok: false, message: "ID may contain only letters, numbers, dot, underscore and hyphen." };
        if (input.type !== "local" && input.type !== "remote") return { ok: false, message: "Unsupported MCP type." };
        const command = input.type === "local" ? JSON.parse(input.commandJson || "[]") : [];
        const environment = JSON.parse(input.environmentJson || "{}");
        const headers = JSON.parse(input.headersJson || "{}");
        if (input.type === "local" && (!Array.isArray(command) || command.length === 0 || command.some((v) => typeof v !== "string" || !v.trim()))) return { ok: false, message: "Local MCP requires a command array of non-empty strings." };
        if (input.type === "remote" && !/^https?:\/\//i.test(input.url || "")) return { ok: false, message: "Remote MCP URL must start with http:// or https://." };
        if (!environment || typeof environment !== "object" || Array.isArray(environment) || Object.values(environment).some((v) => typeof v !== "string")) return { ok: false, message: "Environment must be a JSON object with string values." };
        if (!headers || typeof headers !== "object" || Array.isArray(headers) || Object.values(headers).some((v) => typeof v !== "string")) return { ok: false, message: "Headers must be a JSON object with string values." };
        const { filePath } = await resolveConfigFile();
        const cfg = await readConfigObject(filePath);
        cfg.mcp = cfg.mcp && typeof cfg.mcp === "object" ? { ...cfg.mcp } : {};
        cfg.mcp.servers = cfg.mcp.servers && typeof cfg.mcp.servers === "object" ? { ...cfg.mcp.servers } : {};
        const oldId = input.originalId || id;
        const previous = cfg.mcp.servers[oldId] && typeof cfg.mcp.servers[oldId] === "object" ? cfg.mcp.servers[oldId] : {};
        const next = { ...previous, type: input.type, disabled: Boolean(input.disabled) };
        if (input.type === "local") {
          next.command = command;
          if (input.cwd.trim()) next.cwd = input.cwd.trim(); else delete next.cwd;
          if (Object.keys(environment).length) next.environment = environment; else delete next.environment;
          delete next.url; delete next.headers;
        } else {
          next.url = input.url.trim();
          if (Object.keys(headers).length) next.headers = headers; else delete next.headers;
          delete next.command; delete next.cwd; delete next.environment;
        }
        if (oldId !== id) delete cfg.mcp.servers[oldId];
        cfg.mcp.servers[id] = next;
        await writeConfigObject(filePath, cfg);
        await rebuildMcpState();
        return { ok: true, message: "MCP server saved. OpenCode will reload the updated configuration." };
      } catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; }
    },
    async setDisabled({ id, disabled }) {
      try {
        const { filePath } = await resolveConfigFile();
        const cfg = await readConfigObject(filePath);
        const server = cfg.mcp?.servers?.[id];
        if (!server) return { ok: false, message: "MCP server not found." };
        server.disabled = Boolean(disabled);
        await writeConfigObject(filePath, cfg);
        await rebuildMcpState();
        return { ok: true, message: disabled ? "MCP server disabled." : "MCP server enabled." };
      } catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; }
    },
    async remove({ id }) {
      try {
        const { filePath } = await resolveConfigFile();
        const cfg = await readConfigObject(filePath);
        if (!cfg.mcp?.servers?.[id]) return { ok: false, message: "MCP server not found." };
        delete cfg.mcp.servers[id];
        if (!Object.keys(cfg.mcp.servers).length) delete cfg.mcp.servers;
        if (!Object.keys(cfg.mcp).length) delete cfg.mcp;
        await writeConfigObject(filePath, cfg);
        await rebuildMcpState();
        return { ok: true, message: "MCP server removed from OpenCode config." };
      } catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; }
    },
  });
  ipcHandle?.changed();
  void rebuildState();

  const toolboxSettingsPath = path.join(configDir, "opencode-toolbox.json");
  ctx.provide(ToolboxIpc, {
    async getSettings() {
      try { return await fsp.readFile(toolboxSettingsPath, "utf8"); }
      catch (error) {
        if (error?.code === "ENOENT") return JSON.stringify({ modules: { trueModelDisabler: true, providerDisabler: false, bulkModelToggle: false, mcpGui: false, customProviders: false }, disabledProviders: [], disabledMcpServers: [], modelEnabledOverrides: {} });
        throw error;
      }
    },
    async saveSettings(raw) {
      try {
        const value = JSON.parse(raw);
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Settings must be a JSON object.");
        const normalized = {
          ...value,
          modules: {
            trueModelDisabler: value.modules?.trueModelDisabler !== false,
            providerDisabler: Boolean(value.modules?.providerDisabler),
            bulkModelToggle: Boolean(value.modules?.bulkModelToggle),
            mcpGui: Boolean(value.modules?.mcpGui),
            customProviders: Boolean(value.modules?.customProviders),
          },
          disabledProviders: Array.isArray(value.disabledProviders) ? [...new Set(value.disabledProviders.filter(x => typeof x === "string" && x.trim()))] : [],
          disabledMcpServers: Array.isArray(value.disabledMcpServers) ? [...new Set(value.disabledMcpServers.filter(x => typeof x === "string" && x.trim()))] : [],
          modelEnabledOverrides: value.modelEnabledOverrides && typeof value.modelEnabledOverrides === "object" && !Array.isArray(value.modelEnabledOverrides) ? value.modelEnabledOverrides : {},
        };
        await fsp.mkdir(configDir, { recursive: true });
        const temporaryPath = toolboxSettingsPath + "." + process.pid + ".tmp";
        await fsp.writeFile(temporaryPath, JSON.stringify(normalized, null, 2) + "\n", "utf8");
        await fsp.rename(temporaryPath, toolboxSettingsPath);
        return { ok: true, message: "Saved. Restart OpenCode Desktop to apply server-side changes." };
      } catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; }
    },
  });
}

// ---------------------------------------------------------------------------
// Renderer UI Helpers & Views (Solid.js + Native `ctx.ui.*`)
// ---------------------------------------------------------------------------

function appendHChild(el, child) {
  if (child === undefined || child === null || child === false || child === true) return;
  if (Array.isArray(child)) {
    for (const item of child) appendHChild(el, item);
    return;
  }
  if (typeof child === "object" && child.nodeType) {
    el.appendChild(child);
    return;
  }
  if (typeof child === "string" || typeof child === "number") {
    el.appendChild(document.createTextNode(String(child)));
    return;
  }
  if (typeof child === "function") {
    // Always anchor dynamic children (Show, For, getters) to a private comment marker
    // so Solid's insert() never wipes sibling nodes inside the same parent element.
    const marker = document.createComment("cp");
    el.appendChild(marker);
    insert(el, child, marker);
    return;
  }
  const marker = document.createComment("cp");
  el.appendChild(marker);
  insert(el, child, marker);
}

function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props && typeof props === "object") {
    for (const [key, val] of Object.entries(props)) {
      if (val === undefined || val === null) continue;
      if (key === "class" || key === "className") {
        if (typeof val === "function") createEffect(() => { el.className = val() || ""; });
        else el.className = val;
      } else if (key === "style" && typeof val === "object") {
        Object.assign(el.style, val);
      } else if (key.startsWith("on") && typeof val === "function") {
        el.addEventListener(key.slice(2).toLowerCase(), val);
      } else if (key === "value" || key === "checked" || key === "disabled") {
        if (typeof val === "function") {
          createEffect(() => {
            const v = val();
            if (key === "value") {
              if (el.value !== String(v ?? "")) el.value = String(v ?? "");
            } else {
              el[key] = Boolean(v);
            }
          });
        } else {
          el[key] = val;
        }
      } else if (typeof val === "function") {
        createEffect(() => {
          const v = val();
          if (v === false || v === null || v === undefined) el.removeAttribute(key);
          else el.setAttribute(key, String(v));
        });
      } else {
        el.setAttribute(key, String(val));
      }
    }
  }
  for (const child of children) {
    appendHChild(el, child);
  }
  return el;
}

function setupRenderer(ctx) {
  ctx.add(Style, PLUGIN_CSS);

  const ipc = ctx.use(CustomProviderIpc);
  const client = () => {
    const live = ipc();
    return live.status === "active" ? live.value : undefined;
  };
  const mainApi = () => ctx.main(CustomProviderIpc);
  const [manualState, setManualState] = createSignal(null);
  createEffect(() => {
    const liveState = client()?.state();
    if (liveState !== undefined) {
      setManualState(null);
    }
  });
  const state = () => manualState() ?? client()?.state();

  async function silentRefresh() {
    try {
      const next = await mainApi().refresh();
      if (next) setManualState(next);
    } catch {
      // Ignored on background mount sync
    }
  }

  async function refreshNow() {
    try {
      const next = await mainApi().refresh();
      if (next) setManualState(next);
    } catch (err) {
      await ctx.dialogs.alert({
        title: "Refresh Failed",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function toggleEffortInList(list, lvl) {
    const has = list.includes(lvl);
    return orderEffortLevels(has ? list.filter((x) => x !== lvl) : [...list, lvl]);
  }

  function createEffortPicker({ getEfforts, onChangeEfforts, getUltraTarget, onChangeUltraTarget, autoLabel }) {
    return h(
      "div",
      { class: "cp-stack", style: { gap: "6px" } },
      h(
        "div",
        { class: "cp-pill-row" },
        ...ALL_EFFORT_OPTIONS.map((lvl) =>
          h(
            "button",
            {
              type: "button",
              class: () => (getEfforts().includes(lvl) ? "cp-pill-btn cp-pill-btn--active" : "cp-pill-btn"),
              onClick: () => onChangeEfforts(toggleEffortInList(getEfforts(), lvl)),
            },
            () => (getEfforts().includes(lvl) ? `✓ ${lvl}` : lvl)
          )
        ),
        h(
          "button",
          {
            type: "button",
            class: () => (getEfforts().length === 0 ? "cp-pill-btn cp-pill-btn--active" : "cp-pill-btn"),
            onClick: () => onChangeEfforts([]),
          },
          autoLabel || "Auto Default"
        )
      ),
      createComponent(Show, {
        get when() { return getEfforts().includes("ultra"); },
        get children() {
          return h(
            "div",
            { class: "cp-pill-row" },
            h("span", { class: "cp-hint" }, "When selecting 'ultra', send upstream:"),
            ...ULTRA_TARGET_OPTIONS.map((opt) =>
              h(
                "button",
                {
                  type: "button",
                  class: () => (getUltraTarget() === opt ? "cp-pill-btn cp-pill-btn--active" : "cp-pill-btn"),
                  onClick: () => onChangeUltraTarget(opt),
                },
                opt
              )
            )
          );
        },
      })
    );
  }

  function createLimitField({ label, hint, placeholder, getValue, onChange, presets, clearLabel }) {
    return h(
      "div",
      { class: "cp-field" },
      h("div", { class: "cp-label" }, label, hint ? h("span", { class: "cp-hint" }, hint) : null),
      createComponent(ctx.ui.TextInput, {
        label,
        placeholder,
        get value() { return getValue(); },
        onInput: onChange,
      }),
      h(
        "div",
        { class: "cp-pill-row" },
        ...presets.map((p) =>
          h(
            "button",
            {
              type: "button",
              class: () => (getValue().trim() === p.val ? "cp-pill-btn cp-pill-btn--active" : "cp-pill-btn"),
              onClick: () => onChange(p.val),
            },
            p.label
          )
        ),
        h(
          "button",
          {
            type: "button",
            class: () => (!getValue().trim() ? "cp-pill-btn cp-pill-btn--active" : "cp-pill-btn"),
            onClick: () => onChange(""),
          },
          clearLabel || "Auto"
        )
      )
    );
  }

  function openProviderEditor(existing) {
    const isEdit = Boolean(existing);
    const initialModels = existing?.models
      ? existing.models.map((m) => ({
          ...m,
          protocol: m.protocol || "inherit",
          pkg: m.pkg ?? null,
          effortLevels: Array.isArray(m.effortLevels) ? [...m.effortLevels] : [],
          ultraTarget: m.ultraTarget ?? null,
        }))
      : [];

    const [activeTab, setActiveTab] = createSignal(isEdit && initialModels.length > 0 ? "models" : "connection");
    const [id, setId] = createSignal(existing?.id || "");
    const [idTouched, setIdTouched] = createSignal(isEdit);
    const [name, setName] = createSignal(existing?.name || "");
    const [protocol, setProtocol] = createSignal(
      existing && PROTOCOL_PRESETS.some((p) => p.id === existing.protocol) ? existing.protocol : "openai-compatible"
    );
    const [customPkg, setCustomPkg] = createSignal(existing?.pkg || "");
    const [baseURL, setBaseURL] = createSignal(existing?.baseURL || "");
    const [authMode, setAuthMode] = createSignal(existing?.authMode || "key");
    const [apiKeyInput, setApiKeyInput] = createSignal("");
    const [showSecret, setShowSecret] = createSignal(false);
    const [envVar, setEnvVar] = createSignal(existing?.envVar || "");
    const [headersJson, setHeadersJson] = createSignal(existing?.headersJson || "");
    const [showAdvanced, setShowAdvanced] = createSignal(Boolean(existing?.headersJson));
    const [setAsDefault, setSetAsDefault] = createSignal(false);
    const [models, setModels] = createSignal(initialModels);
    const [modelFilter, setModelFilter] = createSignal("");

    const [newModelId, setNewModelId] = createSignal("");
    const [defaultEfforts, setDefaultEfforts] = createSignal(["low", "medium", "high", "xhigh", "max"]);
    const [defaultUltraTarget, setDefaultUltraTarget] = createSignal(defaultUltraTargetForProtocol(protocol()));

    const firstM = initialModels[0] || null;
    const [editingModelId, setEditingModelId] = createSignal(firstM ? firstM.id : null);
    const [editModelName, setEditModelName] = createSignal(firstM ? firstM.name || firstM.id : "");
    const [editModelCtx, setEditModelCtx] = createSignal(firstM?.contextLimit ? String(firstM.contextLimit) : "");
    const [editModelOut, setEditModelOut] = createSignal(firstM?.outputLimit ? String(firstM.outputLimit) : "");
    const [editModelProtocol, setEditModelProtocol] = createSignal(firstM?.protocol || "inherit");
    const [editModelCustomPkg, setEditModelCustomPkg] = createSignal(firstM?.pkg || "");
    const [editModelEfforts, setEditModelEfforts] = createSignal(orderEffortLevels(firstM?.effortLevels || []));
    const [editModelUltraTarget, setEditModelUltraTarget] = createSignal(
      firstM?.ultraTarget || defaultUltraTargetForProtocol(firstM?.protocol && firstM.protocol !== "inherit" ? firstM.protocol : protocol())
    );

    const [probing, setProbing] = createSignal(false);
    const [probeResult, setProbeResult] = createSignal(null);
    const [saving, setSaving] = createSignal(false);
    const [formError, setFormError] = createSignal("");

    const activePreset = createMemo(() => PROTOCOL_PRESETS.find((p) => p.id === protocol()) || PROTOCOL_PRESETS[0]);
    const addedIds = createMemo(() => new Set(models().map((m) => m.id)));
    const filteredModels = createMemo(() => {
      const q = modelFilter().trim().toLowerCase();
      if (!q) return models();
      return models().filter((m) => m.id.toLowerCase().includes(q) || (m.name || "").toLowerCase().includes(q));
    });

    function syncEditingModelToList(overrides = {}) {
      const targetId = editingModelId();
      if (!targetId) return;
      const nextName = "name" in overrides ? overrides.name : editModelName().trim();
      const nextCtxRaw = "ctxRaw" in overrides ? overrides.ctxRaw : editModelCtx();
      const nextOutRaw = "outRaw" in overrides ? overrides.outRaw : editModelOut();
      const nextProto = "protocol" in overrides ? overrides.protocol : editModelProtocol();
      const nextPkgRaw = "pkg" in overrides ? overrides.pkg : editModelCustomPkg();
      const nextEfforts = "efforts" in overrides ? overrides.efforts : editModelEfforts();
      const nextUltra = "ultra" in overrides ? overrides.ultra : editModelUltraTarget();

      const effProto = nextProto && nextProto !== "inherit" ? nextProto : protocol();
      const resolvedPkg =
        nextProto === "custom"
          ? String(nextPkgRaw || "").trim() || null
          : nextProto && nextProto !== "inherit"
            ? resolvePackageName(nextProto, "")
            : null;

      const parsedCtx = parseTokenLimit(nextCtxRaw);
      const parsedOut = parseTokenLimit(nextOutRaw);
      setModels((prev) =>
        prev.map((m) =>
          m.id !== targetId
            ? m
            : {
                ...m,
                name: nextName || m.id,
                contextLimit: parsedCtx,
                outputLimit: parsedOut,
                protocol: nextProto || "inherit",
                pkg: resolvedPkg,
                effortLevels: orderEffortLevels(nextEfforts),
                ultraTarget: nextEfforts.includes("ultra") ? nextUltra || defaultUltraTargetForProtocol(effProto) : null,
              }
        )
      );
    }

    function startEditModel(m) {
      if (!m) {
        setEditingModelId(null);
        return;
      }
      if (editingModelId() !== m.id) syncEditingModelToList();
      setEditingModelId(m.id);
      setEditModelName(m.name || m.id);
      setEditModelCtx(m.contextLimit ? String(m.contextLimit) : "");
      setEditModelOut(m.outputLimit ? String(m.outputLimit) : "");
      const mProto = m.protocol || "inherit";
      setEditModelProtocol(mProto);
      setEditModelCustomPkg(m.pkg || "");
      setEditModelEfforts(orderEffortLevels(m.effortLevels || []));
      const effProto = mProto !== "inherit" ? mProto : protocol();
      setEditModelUltraTarget(m.ultraTarget || defaultUltraTargetForProtocol(effProto));
    }

    function applyEditLimitsAndEffortsToAll() {
      syncEditingModelToList();
      const parsedCtx = parseTokenLimit(editModelCtx());
      const parsedOut = parseTokenLimit(editModelOut());
      const ordered = orderEffortLevels(editModelEfforts());
      const ultraVal = ordered.includes("ultra") ? editModelUltraTarget() || defaultUltraTargetForProtocol(protocol()) : null;
      setModels((prev) =>
        prev.map((m) => ({
          ...m,
          ...(editModelCtx().trim() ? { contextLimit: parsedCtx } : {}),
          ...(editModelOut().trim() ? { outputLimit: parsedOut } : {}),
          effortLevels: [...ordered],
          ultraTarget: ultraVal,
        }))
      );
      setDefaultEfforts([...ordered]);
      if (ultraVal) setDefaultUltraTarget(ultraVal);
    }

    function batchApplyToAllModels({ contextLimit, outputLimit, effortLevels, ultraTarget }) {
      syncEditingModelToList();
      setModels((prev) =>
        prev.map((m) => ({
          ...m,
          ...(contextLimit !== undefined ? { contextLimit } : {}),
          ...(outputLimit !== undefined ? { outputLimit } : {}),
          ...(effortLevels !== undefined ? { effortLevels: orderEffortLevels(effortLevels) } : {}),
          ...(effortLevels !== undefined
            ? { ultraTarget: effortLevels.includes("ultra") ? ultraTarget || defaultUltraTarget() : null }
            : {}),
        }))
      );
      if (editingModelId()) {
        if (contextLimit !== undefined) setEditModelCtx(contextLimit ? String(contextLimit) : "");
        if (outputLimit !== undefined) setEditModelOut(outputLimit ? String(outputLimit) : "");
        if (effortLevels !== undefined) setEditModelEfforts(orderEffortLevels(effortLevels));
        if (ultraTarget) setEditModelUltraTarget(ultraTarget);
      }
      if (effortLevels !== undefined) setDefaultEfforts(orderEffortLevels(effortLevels));
      if (ultraTarget) setDefaultUltraTarget(ultraTarget);
    }

    function buildModelFromDiscovery(dm) {
      const effs = orderEffortLevels(defaultEfforts());
      return {
        id: dm.id,
        name: dm.name || dm.id,
        modelID: null,
        contextLimit: dm.contextLimit ?? null,
        outputLimit: dm.outputLimit ?? null,
        protocol: "inherit",
        pkg: null,
        effortLevels: effs,
        ultraTarget: effs.includes("ultra") ? defaultUltraTarget() : null,
      };
    }

    function toggleModelFromDiscovery(dm) {
      if (addedIds().has(dm.id)) {
        const remaining = models().filter((m) => m.id !== dm.id);
        setModels(remaining);
        if (editingModelId() === dm.id) startEditModel(remaining[0] || null);
      } else {
        const entry = buildModelFromDiscovery(dm);
        setModels((prev) => [...prev, entry]);
        if (!editingModelId()) startEditModel(entry);
      }
    }

    function addAllDiscovered() {
      const list = probeResult()?.models || [];
      if (list.length === 0) return;
      const existingMap = new Map(models().map((m) => [m.id, m]));
      for (const dm of list) {
        if (!existingMap.has(dm.id)) existingMap.set(dm.id, buildModelFromDiscovery(dm));
      }
      const next = Array.from(existingMap.values());
      setModels(next);
      if (!editingModelId() && next[0]) startEditModel(next[0]);
    }

    function addManualModel() {
      const raw = newModelId().trim();
      if (!raw) return;
      const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
      const effs = orderEffortLevels(defaultEfforts());
      const next = [...models()];
      const seen = new Set(next.map((m) => m.id));
      let firstAdded = null;
      for (const mid of parts) {
        if (seen.has(mid)) continue;
        seen.add(mid);
        const item = {
          id: mid,
          name: mid,
          modelID: null,
          contextLimit: null,
          outputLimit: null,
          protocol: "inherit",
          pkg: null,
          effortLevels: [...effs],
          ultraTarget: effs.includes("ultra") ? defaultUltraTarget() : null,
        };
        next.push(item);
        if (!firstAdded) firstAdded = item;
      }
      setModels(next);
      setNewModelId("");
      if (firstAdded) startEditModel(firstAdded);
    }

    async function handleFetchModels() {
      setFormError("");
      setProbing(true);
      try {
        const res = await mainApi().fetchModels({
          existingId: existing?.id || null,
          baseURL: baseURL(),
          protocol: protocol(),
          authMode: authMode(),
          apiKeyInput: apiKeyInput(),
          envVar: envVar(),
          headersJson: headersJson(),
        });
        const currentClean = normalizeBaseUrlForProtocol(baseURL(), protocol());
        const baseAdjusted =
          Boolean(res?.ok && res?.suggestedBaseURL) &&
          res.suggestedBaseURL.replace(/\/+$/, "") !== currentClean;
        if (baseAdjusted) setBaseURL(res.suggestedBaseURL);
        setProbeResult({ ...res, baseAdjusted });
      } catch (err) {
        setProbeResult({
          ok: false,
          url: baseURL(),
          suggestedBaseURL: null,
          status: 0,
          latencyMs: 0,
          error: err instanceof Error ? err.message : String(err),
          models: [],
          baseAdjusted: false,
        });
      } finally {
        setProbing(false);
      }
    }

    async function handleSave(dialog) {
      setFormError("");
      syncEditingModelToList();
      const cleanId = slugifyId(id());
      if (!cleanId) {
        setActiveTab("connection");
        setFormError("Please enter a valid Provider ID (e.g. my-proxy).");
        return;
      }
      if (!baseURL().trim() || !/^https?:\/\//i.test(baseURL().trim())) {
        setActiveTab("connection");
        setFormError("Please enter a valid Base URL starting with https:// or http://.");
        return;
      }
      if (authMode() === "env" && !envVar().trim()) {
        setActiveTab("connection");
        setFormError("Please enter the Environment Variable name (e.g. OPENAI_API_KEY).");
        return;
      }
      if (models().length === 0) {
        setActiveTab("models");
        setFormError("Add at least one model so OpenCode can list it in the Model Selector.");
        return;
      }

      setSaving(true);
      try {
        const res = await mainApi().saveProvider({
          originalId: existing?.id || null,
          id: cleanId,
          name: name().trim() || cleanId,
          protocol: protocol(),
          customPkg: customPkg().trim(),
          baseURL: baseURL().trim(),
          authMode: authMode(),
          apiKeyInput: apiKeyInput(),
          keepExistingKey: isEdit && authMode() === "key" && !apiKeyInput().trim() && Boolean(existing?.hasKey),
          envVar: envVar().trim(),
          headersJson: headersJson(),
          setAsDefaultModel: setAsDefault(),
          models: models(),
        });
        if (!res.ok) {
          setFormError(res.message);
          return;
        }
        dialog.close();
      } catch (err) {
        setFormError(err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(false);
      }
    }

    function openModelsTab() {
      setActiveTab("models");
      if (!editingModelId() && models().length > 0) startEditModel(models()[0]);
    }

    ctx.dialogs.open((dialog) =>
      createComponent(ctx.ui.Dialog, {
        size: "large",
        closable: true,
        get title() {
          return isEdit ? `Edit Provider · ${existing.name}` : "Add Custom Provider";
        },
        description: "Configure your endpoint and unlock custom Context limits & Xhigh/Max/Ultra efforts.",
        get footer() {
          return h(
            "div",
            { class: "cp-dialog-footer" },
            createComponent(ctx.ui.Switch, {
              label: "Set first model as default",
              get checked() { return setAsDefault(); },
              onChange: (val) => setSetAsDefault(val),
            }),
            h(
              "div",
              { class: "cp-dialog-footer-right" },
              createComponent(ctx.ui.Button, {
                variant: "neutral",
                onClick: () => dialog.close(),
                children: "Cancel",
              }),
              createComponent(ctx.ui.Button, {
                variant: "contrast",
                get busy() { return saving(); },
                onClick: () => void handleSave(dialog),
                children: isEdit ? "Save Changes" : "Save Provider",
              })
            )
          );
        },
        get children() {
          return h(
            "div",
            { class: "cp-dialog-form" },
            createComponent(Show, {
              get when() { return Boolean(formError()); },
              get children() {
                return h("div", { class: "cp-status-box cp-status-box--error" }, () => formError());
              },
            }),

            // Segmented Tab Switcher
            h(
              "div",
              { class: "cp-section-head" },
              h(
                "div",
                { class: "cp-tabs" },
                h(
                  "button",
                  {
                    type: "button",
                    class: () => (activeTab() === "connection" ? "cp-tab-btn cp-tab-btn--active" : "cp-tab-btn"),
                    onClick: () => setActiveTab("connection"),
                  },
                  "1. Connection & Fetch"
                ),
                h(
                  "button",
                  {
                    type: "button",
                    class: () => (activeTab() === "models" ? "cp-tab-btn cp-tab-btn--active" : "cp-tab-btn"),
                    onClick: openModelsTab,
                  },
                  () => `2. Models & Efforts (${models().length})`
                )
              )
            ),

            // TAB 1: CONNECTION & DISCOVERY
            createComponent(Show, {
              get when() { return activeTab() === "connection"; },
              get children() {
                return h(
                  "div",
                  { class: "cp-stack", style: { gap: "10px" } },
                  h(
                    "div",
                    { class: "cp-card" },
                    h(
                      "div",
                      { class: "cp-grid-2" },
                      h(
                        "div",
                        { class: "cp-field" },
                        h("div", { class: "cp-label" }, "Display Name"),
                        createComponent(ctx.ui.TextInput, {
                          label: "Display Name",
                          placeholder: "e.g. JustWoker, Aether, Ollama",
                          autofocus: !isEdit,
                          get value() { return name(); },
                          onInput: (val) => {
                            setName(val);
                            if (!idTouched()) setId(slugifyId(val));
                          },
                        })
                      ),
                      h(
                        "div",
                        { class: "cp-field" },
                        h("div", { class: "cp-label" }, "Provider ID", h("span", { class: "cp-hint" }, "lowercase slug")),
                        createComponent(ctx.ui.TextInput, {
                          label: "Provider ID",
                          placeholder: "e.g. my-proxy",
                          get value() { return id(); },
                          onInput: (val) => {
                            setIdTouched(true);
                            setId(val);
                          },
                        })
                      )
                    ),
                    h(
                      "div",
                      { class: "cp-grid-2" },
                      h(
                        "div",
                        { class: "cp-field" },
                        h("div", { class: "cp-label" }, "API Compatibility"),
                        createComponent(ctx.ui.Select, {
                          label: "API Compatibility",
                          options: PROTOCOL_PRESETS.map((p) => ({ value: p.id, label: p.label })),
                          get value() { return protocol(); },
                          onChange: (val) => setProtocol(val),
                        })
                      ),
                      h(
                        "div",
                        { class: "cp-field" },
                        h("div", { class: "cp-label" }, "Base URL"),
                        createComponent(ctx.ui.TextInput, {
                          label: "Base URL",
                          get placeholder() { return activePreset().placeholderUrl; },
                          get value() { return baseURL(); },
                          onInput: (val) => setBaseURL(val),
                        })
                      )
                    ),
                    createComponent(Show, {
                      get when() { return protocol() === "custom"; },
                      get children() {
                        return h(
                          "div",
                          { class: "cp-field" },
                          h("div", { class: "cp-label" }, "Custom OpenCode Provider Package"),
                          createComponent(ctx.ui.TextInput, {
                            label: "Custom Provider Package",
                            placeholder: "@opencode/ai/providers/openai-compatible",
                            get value() { return customPkg(); },
                            onInput: setCustomPkg,
                          })
                        );
                      },
                    })
                  ),

                  h(
                    "div",
                    { class: "cp-card" },
                    h(
                      "div",
                      { class: "cp-grid-2" },
                      h(
                        "div",
                        { class: "cp-field" },
                        h("div", { class: "cp-label" }, "Authentication"),
                        createComponent(ctx.ui.Select, {
                          label: "Authentication",
                          options: [
                            { value: "key", label: "API Key (saved or {env:VAR})" },
                            { value: "env", label: "Environment Variable" },
                            { value: "none", label: "No Auth (Local Server)" },
                          ],
                          get value() { return authMode(); },
                          onChange: (val) => setAuthMode(val),
                        })
                      ),
                      createComponent(Show, {
                        get when() { return authMode() === "key"; },
                        get children() {
                          return h(
                            "div",
                            { class: "cp-field" },
                            h(
                              "div",
                              { class: "cp-label" },
                              "API Key",
                              h("span", { class: "cp-hint" }, isEdit && existing?.hasKey ? `Saved: ${existing.apiKeyMask}` : "sk-... or {env:VAR}")
                            ),
                            h(
                              "div",
                              { class: "cp-key-row" },
                              createComponent(ctx.ui.TextInput, {
                                label: "API Key",
                                get type() { return showSecret() ? "text" : "password"; },
                                get placeholder() {
                                  return isEdit && existing?.hasKey ? "Leave blank to keep existing key" : "sk-... or {env:MY_KEY}";
                                },
                                get value() { return apiKeyInput(); },
                                onInput: (val) => setApiKeyInput(val),
                              }),
                              createComponent(ctx.ui.IconButton, {
                                get icon() { return showSecret() ? "outline-eye-slash" : "outline-eye"; },
                                label: "Toggle key visibility",
                                get pressed() { return showSecret(); },
                                onClick: () => setShowSecret((v) => !v),
                              })
                            )
                          );
                        },
                      }),
                      createComponent(Show, {
                        get when() { return authMode() === "env"; },
                        get children() {
                          return h(
                            "div",
                            { class: "cp-field" },
                            h("div", { class: "cp-label" }, "Environment Variable Name"),
                            createComponent(ctx.ui.TextInput, {
                              label: "Environment Variable Name",
                              placeholder: "e.g. JUSTWOKER_API_KEY",
                              get value() { return envVar(); },
                              onInput: (val) => setEnvVar(val),
                            })
                          );
                        },
                      })
                    ),
                    h(
                      "div",
                      { class: "cp-section-head" },
                      createComponent(ctx.ui.Button, {
                        variant: "ghost",
                        size: "small",
                        onClick: () => setShowAdvanced((v) => !v),
                        get children() { return showAdvanced() ? "Hide Custom Headers" : "+ Custom Headers (JSON)"; },
                      }),
                      createComponent(ctx.ui.Button, {
                        variant: "neutral",
                        size: "small",
                        icon: "refresh",
                        get busy() { return probing(); },
                        onClick: () => void handleFetchModels(),
                        children: "Test & Fetch Models",
                      })
                    ),
                    createComponent(Show, {
                      get when() { return showAdvanced(); },
                      get children() {
                        return h("textarea", {
                          class: "cp-textarea",
                          style: { minHeight: "76px" },
                          placeholder: '{\n  "X-Custom-Header": "value"\n}',
                          value: headersJson,
                          onInput: (e) => setHeadersJson(e.currentTarget.value),
                        });
                      },
                    })
                  ),

                  createComponent(Show, {
                    get when() { return Boolean(probeResult()); },
                    get children() {
                      const res = probeResult();
                      if (!res) return null;
                      if (!res.ok) {
                        return h(
                          "div",
                          { class: "cp-status-box cp-status-box--error" },
                          `Connection check failed (${res.url || "no URL"}, ${res.latencyMs}ms): ${res.error}`
                        );
                      }
                      return h(
                        "div",
                        { class: "cp-card cp-card--subtle" },
                        h(
                          "div",
                          { class: "cp-section-head" },
                          h(
                            "span",
                            { class: "cp-hint" },
                            `Connected (${res.latencyMs}ms) — ${res.models.length} model(s) found${res.baseAdjusted && res.suggestedBaseURL ? ` · Base URL updated` : ""}`
                          ),
                          h(
                            "div",
                            { class: "cp-row-controls" },
                            createComponent(ctx.ui.Button, {
                              variant: "neutral",
                              size: "small",
                              onClick: addAllDiscovered,
                              children: "Add All",
                            }),
                            createComponent(ctx.ui.Button, {
                              variant: "contrast",
                              size: "small",
                              onClick: () => {
                                addAllDiscovered();
                                openModelsTab();
                              },
                              children: "Add All & Edit Efforts →",
                            })
                          )
                        ),
                        h(
                          "div",
                          { class: "cp-discovered-list" },
                          createComponent(For, {
                            each: res.models,
                            children: (dm) =>
                              h(
                                "button",
                                {
                                  type: "button",
                                  class: () => (addedIds().has(dm.id) ? "cp-chip-btn cp-chip-btn--added" : "cp-chip-btn"),
                                  onClick: () => toggleModelFromDiscovery(dm),
                                },
                                () => (addedIds().has(dm.id) ? `✓ ${dm.id}` : `+ ${dm.id}`)
                              ),
                          })
                        )
                      );
                    },
                  })
                );
              },
            }),

            // TAB 2: MODELS & EFFORTS (Master-Detail Split)
            createComponent(Show, {
              get when() { return activeTab() === "models"; },
              get children() {
                return h(
                  "div",
                  { class: "cp-stack", style: { gap: "10px" } },
                  h(
                    "div",
                    { class: "cp-toolbar-bar" },
                    h(
                      "div",
                      { class: "cp-add-inline" },
                      createComponent(ctx.ui.TextInput, {
                        label: "Add Model IDs",
                        placeholder: "Add model ID(s), comma-separated (e.g. gpt-6.1-sol, claude-sonnet-5.5)",
                        get value() { return newModelId(); },
                        onInput: setNewModelId,
                        onSubmit: addManualModel,
                      }),
                      createComponent(ctx.ui.Button, {
                        variant: "neutral",
                        size: "normal",
                        icon: "plus",
                        get disabled() { return !newModelId().trim(); },
                        onClick: addManualModel,
                        children: "Add",
                      })
                    ),
                    createComponent(Show, {
                      get when() { return models().length > 0; },
                      get children() {
                        return h(
                          "div",
                          { class: "cp-pill-row" },
                          h("span", { class: "cp-hint" }, "Apply to all listed:"),
                          ...[
                            { label: "Ctx 128K", ctx: 128000 },
                            { label: "Ctx 200K", ctx: 200000 },
                            { label: "Ctx 400K", ctx: 400000 },
                            { label: "Ctx 1M", ctx: 1000000 },
                          ].map((cp) =>
                            h(
                              "button",
                              {
                                type: "button",
                                class: "cp-pill-btn",
                                onClick: () => batchApplyToAllModels({ contextLimit: cp.ctx }),
                              },
                              cp.label
                            )
                          ),
                          h(
                            "button",
                            {
                              type: "button",
                              class: "cp-pill-btn",
                              onClick: () => batchApplyToAllModels({ effortLevels: ["low", "medium", "high"] }),
                            },
                            "Efforts: L/M/H"
                          ),
                          h(
                            "button",
                            {
                              type: "button",
                              class: "cp-pill-btn",
                              onClick: () => batchApplyToAllModels({ effortLevels: ["low", "medium", "high", "xhigh", "max"] }),
                            },
                            "Efforts: +Xhigh/Max"
                          ),
                          h(
                            "button",
                            {
                              type: "button",
                              class: "cp-pill-btn",
                              onClick: () =>
                                batchApplyToAllModels({
                                  effortLevels: ["low", "medium", "high", "xhigh", "max", "ultra"],
                                  ultraTarget: defaultUltraTarget(),
                                }),
                            },
                            "Efforts: +Ultra"
                          ),
                          h(
                            "button",
                            {
                              type: "button",
                              class: "cp-pill-btn",
                              onClick: () => batchApplyToAllModels({ effortLevels: [] }),
                            },
                            "Efforts: Auto"
                          )
                        );
                      },
                    })
                  ),

                  createComponent(Show, {
                    get when() { return models().length > 0; },
                    get fallback() {
                      return h(
                        "div",
                        { class: "cp-status-box" },
                        "No models added yet. Add a model ID above, or switch to Tab 1 ('Connection & Fetch') to auto-discover models."
                      );
                    },
                    get children() {
                      return h(
                        "div",
                        { class: "cp-master-detail" },
                        // Left Master List
                        h(
                          "div",
                          { class: "cp-master-pane" },
                          createComponent(Show, {
                            get when() { return models().length > 5; },
                            get children() {
                              return createComponent(ctx.ui.TextInput, {
                                label: "Filter models",
                                placeholder: "Filter models...",
                                get value() { return modelFilter(); },
                                onInput: setModelFilter,
                              });
                            },
                          }),
                          h(
                            "div",
                            { class: "cp-master-scroll" },
                            createComponent(For, {
                              get each() { return filteredModels(); },
                              children: (m) =>
                                h(
                                  "div",
                                  {
                                    class: () =>
                                      editingModelId() === m.id ? "cp-master-item cp-master-item--active" : "cp-master-item",
                                  },
                                  h(
                                    "div",
                                    {
                                      class: "cp-model-item-main",
                                      onClick: () => startEditModel(m),
                                    },
                                    h("div", { class: "cp-model-id" }, m.id),
                                    h(
                                      "div",
                                      { class: "cp-model-sub" },
                                      `${m.contextLimit ? formatTokenCount(m.contextLimit) : "auto ctx"}${m.outputLimit ? `/${formatTokenCount(m.outputLimit)}` : ""} · ${formatEffortSummary(m.effortLevels)}${m.protocol && m.protocol !== "inherit" ? ` · ${m.protocol}` : ""}`
                                    )
                                  ),
                                  createComponent(ctx.ui.IconButton, {
                                    icon: "outline-trash",
                                    label: `Remove ${m.id}`,
                                    onClick: () => {
                                      const remaining = models().filter((item) => item.id !== m.id);
                                      setModels(remaining);
                                      if (editingModelId() === m.id) startEditModel(remaining[0] || null);
                                    },
                                  })
                                ),
                            })
                          )
                        ),

                        // Right Detail Inspector
                        h(
                          "div",
                          { class: "cp-inspector-pane" },
                          createComponent(Show, {
                            get when() { return Boolean(editingModelId()); },
                            get fallback() {
                              return h(
                                "div",
                                { class: "cp-empty" },
                                h("div", { class: "cp-empty-desc" }, "Select a model on the left to customize Context, Output, Compatibility & Effort levels.")
                              );
                            },
                            get children() {
                              return h(
                                "div",
                                { class: "cp-stack", style: { gap: "10px" } },
                                h(
                                  "div",
                                  { class: "cp-section-head" },
                                  h("div", { class: "cp-model-id" }, () => editingModelId() || ""),
                                  createComponent(ctx.ui.Button, {
                                    variant: "neutral",
                                    size: "small",
                                    onClick: applyEditLimitsAndEffortsToAll,
                                    children: "Copy to All Models",
                                  })
                                ),
                                h(
                                  "div",
                                  { class: "cp-grid-2" },
                                  h(
                                    "div",
                                    { class: "cp-field" },
                                    h("div", { class: "cp-label" }, "Display Name"),
                                    createComponent(ctx.ui.TextInput, {
                                      label: "Display Name",
                                      placeholder: "Model display name",
                                      get value() { return editModelName(); },
                                      onInput: (val) => {
                                        setEditModelName(val);
                                        syncEditingModelToList({ name: val });
                                      },
                                    })
                                  ),
                                  h(
                                    "div",
                                    { class: "cp-field" },
                                    h("div", { class: "cp-label" }, "Compatibility", h("span", { class: "cp-hint" }, "per-model")),
                                    createComponent(ctx.ui.Select, {
                                      label: "Model API Compatibility",
                                      options: [
                                        { value: "inherit", label: "Inherit Provider Default" },
                                        ...PROTOCOL_PRESETS.map((p) => ({ value: p.id, label: p.label })),
                                        { value: "custom", label: "Custom Package..." },
                                      ],
                                      get value() { return editModelProtocol(); },
                                      onChange: (val) => {
                                        const nextP = val || "inherit";
                                        setEditModelProtocol(nextP);
                                        syncEditingModelToList({ protocol: nextP });
                                      },
                                    })
                                  )
                                ),
                                createComponent(Show, {
                                  get when() { return editModelProtocol() === "custom"; },
                                  get children() {
                                    return h(
                                      "div",
                                      { class: "cp-field" },
                                      h("div", { class: "cp-label" }, "Custom Model Package"),
                                      createComponent(ctx.ui.TextInput, {
                                        label: "Custom Model Package",
                                        placeholder: "@opencode/ai/providers/anthropic",
                                        get value() { return editModelCustomPkg(); },
                                        onInput: (val) => {
                                          setEditModelCustomPkg(val);
                                          syncEditingModelToList({ pkg: val });
                                        },
                                      })
                                    );
                                  },
                                }),
                                h(
                                  "div",
                                  { class: "cp-grid-2" },
                                  createLimitField({
                                    label: "Context Limit",
                                    hint: "or 1m/200k",
                                    placeholder: "Auto (200K)",
                                    getValue: editModelCtx,
                                    onChange: (v) => {
                                      setEditModelCtx(v);
                                      syncEditingModelToList({ ctxRaw: v });
                                    },
                                    presets: [
                                      { label: "128K", val: "128000" },
                                      { label: "200K", val: "200000" },
                                      { label: "400K", val: "400000" },
                                      { label: "1M", val: "1000000" },
                                    ],
                                    clearLabel: "Auto",
                                  }),
                                  createLimitField({
                                    label: "Output Limit",
                                    hint: "or 64k",
                                    placeholder: "Auto (32K)",
                                    getValue: editModelOut,
                                    onChange: (v) => {
                                      setEditModelOut(v);
                                      syncEditingModelToList({ outRaw: v });
                                    },
                                    presets: [
                                      { label: "16K", val: "16000" },
                                      { label: "32K", val: "32000" },
                                      { label: "64K", val: "64000" },
                                      { label: "128K", val: "128000" },
                                    ],
                                    clearLabel: "Auto",
                                  })
                                ),
                                h(
                                  "div",
                                  { class: "cp-field" },
                                  h("div", { class: "cp-label" }, "Reasoning Effort Tiers", h("span", { class: "cp-hint" }, "Unlock Xhigh / Max / Ultra")),
                                  createEffortPicker({
                                    getEfforts: editModelEfforts,
                                    onChangeEfforts: (next) => {
                                      setEditModelEfforts(next);
                                      syncEditingModelToList({ efforts: next });
                                    },
                                    getUltraTarget: editModelUltraTarget,
                                    onChangeUltraTarget: (opt) => {
                                      setEditModelUltraTarget(opt);
                                      syncEditingModelToList({ ultra: opt });
                                    },
                                    autoLabel: "Auto Default",
                                  })
                                )
                              );
                            },
                          })
                        )
                      );
                    },
                  })
                );
              },
            })
          );
        },
      })
    );
  }

  function openModelBoosterDialog(initialTarget) {
    const [loading, setLoading] = createSignal(true);
    const [catalogError, setCatalogError] = createSignal("");
    const [catalog, setCatalog] = createSignal([]);
    const [searchText, setSearchText] = createSignal("");
    const [providerFilter, setProviderFilter] = createSignal(initialTarget?.providerID || "__all__");
    const [onlyBoosted, setOnlyBoosted] = createSignal(false);

    const [selectedKey, setSelectedKey] = createSignal(
      initialTarget ? `${initialTarget.providerID}/${initialTarget.modelID}` : ""
    );
    const [editEfforts, setEditEfforts] = createSignal(["low", "medium", "high", "xhigh", "max"]);
    const [editUltraTarget, setEditUltraTarget] = createSignal("xhigh");
    const [editCtx, setEditCtx] = createSignal("");
    const [editOut, setEditOut] = createSignal("");
    const [busyAction, setBusyAction] = createSignal(false);
    const [statusMsg, setStatusMsg] = createSignal("");
    const [statusErr, setStatusErr] = createSignal("");

    const [showManual, setShowManual] = createSignal(false);
    const [manualProvId, setManualProvId] = createSignal("opencode");
    const [manualModelId, setManualModelId] = createSignal("");

    function loadModelIntoInspector(m) {
      if (!m) return;
      setSelectedKey(`${m.providerID}/${m.id}`);
      const effs = m.hasOverride && Array.isArray(m.overrideEffortLevels) && m.overrideEffortLevels.length > 0
        ? m.overrideEffortLevels
        : m.effortLevels || [];
      setEditEfforts(orderEffortLevels(effs));
      setEditUltraTarget(m.overrideUltraTarget || defaultUltraTargetForProtocol(m.protocol));
      setEditCtx(m.overrideContextLimit ? String(m.overrideContextLimit) : "");
      setEditOut(m.overrideOutputLimit ? String(m.overrideOutputLimit) : "");
      setStatusErr("");
    }

    async function loadCatalog(preferKey) {
      setLoading(true);
      setCatalogError("");
      try {
        const res = await mainApi().listCatalogModels();
        let list = Array.isArray(res?.models) ? res.models : [];
        if (initialTarget && !list.some((m) => m.providerID === initialTarget.providerID && m.id === initialTarget.modelID)) {
          list = [
            {
              providerID: initialTarget.providerID,
              providerName: initialTarget.providerID,
              id: initialTarget.modelID,
              name: initialTarget.modelID,
              protocol: "openai-compatible",
              isCustomProvider: false,
              contextLimit: initialTarget.contextLimit ?? null,
              outputLimit: initialTarget.outputLimit ?? null,
              effortLevels: initialTarget.effortLevels || [],
              hasOverride: true,
              overrideContextLimit: initialTarget.contextLimit ?? null,
              overrideOutputLimit: initialTarget.outputLimit ?? null,
              overrideEffortLevels: initialTarget.effortLevels || [],
              overrideUltraTarget: initialTarget.ultraTarget ?? null,
            },
            ...list,
          ];
        }
        setCatalog(list);
        if (res?.error && list.length === 0) setCatalogError(res.error);
        const keyToPick = preferKey || selectedKey();
        const found = list.find((m) => `${m.providerID}/${m.id}` === keyToPick) || list[0] || null;
        if (found) loadModelIntoInspector(found);
      } catch (err) {
        setCatalogError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }

    void loadCatalog(initialTarget ? `${initialTarget.providerID}/${initialTarget.modelID}` : "");

    const providerOptions = createMemo(() => {
      const seen = new Map();
      for (const m of catalog()) {
        if (!seen.has(m.providerID)) seen.set(m.providerID, m.providerName || m.providerID);
      }
      return [
        { value: "__all__", label: `All Providers (${seen.size})` },
        ...Array.from(seen.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([pid, pname]) => ({ value: pid, label: pname === pid ? pid : `${pname} (${pid})` })),
      ];
    });

    const filteredCatalog = createMemo(() => {
      const q = searchText().trim().toLowerCase();
      const pf = providerFilter();
      const boosted = onlyBoosted();
      return catalog().filter((m) => {
        if (pf !== "__all__" && m.providerID !== pf) return false;
        if (boosted && !m.hasOverride) return false;
        if (!q) return true;
        return (
          m.id.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          m.providerID.toLowerCase().includes(q)
        );
      });
    });

    const selectedModel = createMemo(() =>
      catalog().find((m) => `${m.providerID}/${m.id}` === selectedKey()) || null
    );

    async function handleSaveOverride() {
      const cur = selectedModel();
      if (!cur) return;
      setBusyAction(true);
      setStatusMsg("");
      setStatusErr("");
      try {
        const res = await mainApi().saveModelOverride({
          providerID: cur.providerID,
          modelID: cur.id,
          protocol: cur.protocol || "openai-compatible",
          contextLimit: parseTokenLimit(editCtx()),
          outputLimit: parseTokenLimit(editOut()),
          effortLevels: orderEffortLevels(editEfforts()),
          ultraTarget: editEfforts().includes("ultra") ? editUltraTarget() : null,
        });
        if (!res.ok) {
          setStatusErr(res.message);
          return;
        }
        setStatusMsg(res.message);
        await loadCatalog(`${cur.providerID}/${cur.id}`);
      } catch (err) {
        setStatusErr(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyAction(false);
      }
    }

    async function handleResetSingle() {
      const cur = selectedModel();
      if (!cur) return;
      setBusyAction(true);
      setStatusMsg("");
      setStatusErr("");
      try {
        const res = await mainApi().resetModelOverride({ providerID: cur.providerID, modelID: cur.id });
        if (!res.ok) {
          setStatusErr(res.message);
          return;
        }
        setStatusMsg(res.message);
        await loadCatalog(`${cur.providerID}/${cur.id}`);
      } catch (err) {
        setStatusErr(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyAction(false);
      }
    }

    async function handleBatchBoostVisible(levels) {
      const list = filteredCatalog();
      if (list.length === 0) return;
      const byProv = new Map();
      for (const m of list) {
        if (!byProv.has(m.providerID)) byProv.set(m.providerID, []);
        byProv.get(m.providerID).push({ modelID: m.id, protocol: m.protocol || "openai-compatible" });
      }
      if (byProv.size > 1 && providerFilter() === "__all__") {
        setStatusErr("Select a specific Provider in the dropdown above before 1-click batch boosting.");
        return;
      }
      setBusyAction(true);
      setStatusMsg("");
      setStatusErr("");
      try {
        let total = 0;
        for (const [pid, models] of byProv.entries()) {
          const res = await mainApi().batchBoostModels({
            providerID: pid,
            models,
            effortLevels: levels,
            ultraTarget: levels.includes("ultra") ? "xhigh" : null,
          });
          if (!res.ok) {
            setStatusErr(res.message);
            return;
          }
          total += res.importedCount;
        }
        setStatusMsg(`Boosted ${total} model(s) & reloaded catalog.`);
        await loadCatalog(selectedKey());
      } catch (err) {
        setStatusErr(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyAction(false);
      }
    }

    function addManualTarget() {
      const pid = slugifyId(manualProvId());
      const mid = manualModelId().trim();
      if (!pid || !mid) return;
      const key = `${pid}/${mid}`;
      if (!catalog().some((m) => `${m.providerID}/${m.id}` === key)) {
        const item = {
          providerID: pid,
          providerName: pid,
          id: mid,
          name: mid,
          protocol: pid.includes("anthropic") || mid.includes("claude") ? "anthropic" : pid.includes("google") || mid.includes("gemini") ? "google" : "openai-compatible",
          isCustomProvider: false,
          contextLimit: null,
          outputLimit: null,
          effortLevels: [],
          hasOverride: false,
          overrideContextLimit: null,
          overrideOutputLimit: null,
          overrideEffortLevels: [],
          overrideUltraTarget: null,
        };
        setCatalog((prev) => [item, ...prev]);
        loadModelIntoInspector(item);
      } else {
        const existingItem = catalog().find((m) => `${m.providerID}/${m.id}` === key);
        loadModelIntoInspector(existingItem);
      }
      setProviderFilter("__all__");
      setManualModelId("");
      setShowManual(false);
    }

    ctx.dialogs.open((dialog) =>
      createComponent(ctx.ui.Dialog, {
        size: "large",
        closable: true,
        title: "Boost Any OpenCode Model",
        description: "Unlock Xhigh / Max / Ultra reasoning efforts & custom limits on built-in OpenCode, OpenAI, Anthropic, Google, AgentRouter, and custom models.",
        get footer() {
          return h(
            "div",
            { class: "cp-dialog-footer" },
            h("span", { class: "cp-hint" }, "Built-in keys, endpoints & multimodal tools stay untouched."),
            h(
              "div",
              { class: "cp-dialog-footer-right" },
              createComponent(ctx.ui.Button, {
                variant: "neutral",
                onClick: () => dialog.close(),
                children: "Close",
              })
            )
          );
        },
        get children() {
          return h(
            "div",
            { class: "cp-dialog-form" },
            createComponent(Show, {
              get when() { return Boolean(catalogError() || statusErr()); },
              get children() {
                return h("div", { class: "cp-status-box cp-status-box--error" }, () => statusErr() || catalogError());
              },
            }),
            createComponent(Show, {
              get when() { return Boolean(statusMsg()); },
              get children() {
                return h("div", { class: "cp-status-box cp-status-box--ok" }, () => statusMsg());
              },
            }),

            // Filter & Batch Boost Toolbar
            h(
              "div",
              { class: "cp-toolbar-bar" },
              h(
                "div",
                { class: "cp-grid-2" },
                createComponent(ctx.ui.TextInput, {
                  label: "Search Models",
                  placeholder: "Search model (e.g. gpt, claude, hy4, gemini)...",
                  get value() { return searchText(); },
                  onInput: setSearchText,
                }),
                createComponent(ctx.ui.Select, {
                  label: "Provider Filter",
                  get options() { return providerOptions(); },
                  get value() { return providerFilter(); },
                  onChange: (v) => setProviderFilter(v || "__all__"),
                })
              ),
              h(
                "div",
                { class: "cp-section-head" },
                h(
                  "div",
                  { class: "cp-pill-row" },
                  h(
                    "button",
                    {
                      type: "button",
                      class: () => (onlyBoosted() ? "cp-pill-btn cp-pill-btn--active" : "cp-pill-btn"),
                      onClick: () => setOnlyBoosted((v) => !v),
                    },
                    "Boosted Only"
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      class: () => (showManual() ? "cp-pill-btn cp-pill-btn--active" : "cp-pill-btn"),
                      onClick: () => setShowManual((v) => !v),
                    },
                    "+ Manual Model ID"
                  )
                ),
                h(
                  "div",
                  { class: "cp-pill-row" },
                  h("span", { class: "cp-hint" }, "Boost selected provider:"),
                  h(
                    "button",
                    {
                      type: "button",
                      class: "cp-pill-btn",
                      onClick: () => void handleBatchBoostVisible(["low", "medium", "high", "xhigh", "max"]),
                    },
                    "+Xhigh & Max"
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      class: "cp-pill-btn",
                      onClick: () => void handleBatchBoostVisible(["low", "medium", "high", "xhigh", "max", "ultra"]),
                    },
                    "+Ultra"
                  )
                )
              ),
              createComponent(Show, {
                get when() { return showManual(); },
                get children() {
                  return h(
                    "div",
                    { class: "cp-grid-2" },
                    createComponent(ctx.ui.TextInput, {
                      label: "Provider ID",
                      placeholder: "e.g. agent, anthropic, opencode",
                      get value() { return manualProvId(); },
                      onInput: setManualProvId,
                    }),
                    h(
                      "div",
                      { class: "cp-add-inline" },
                      createComponent(ctx.ui.TextInput, {
                        label: "Model ID",
                        placeholder: "e.g. gpt-5.6-sol",
                        get value() { return manualModelId(); },
                        onInput: setManualModelId,
                        onSubmit: addManualTarget,
                      }),
                      createComponent(ctx.ui.Button, {
                        variant: "neutral",
                        size: "small",
                        onClick: addManualTarget,
                        children: "Load",
                      })
                    )
                  );
                },
              })
            ),

            // Master-Detail Split
            h(
              "div",
              { class: "cp-master-detail" },
              h(
                "div",
                { class: "cp-master-pane" },
                h(
                  "div",
                  { class: "cp-master-scroll" },
                  createComponent(Show, {
                    get when() { return !loading(); },
                    get fallback() {
                      return h("div", { class: "cp-status-box" }, "Loading OpenCode models...");
                    },
                    get children() {
                      return createComponent(For, {
                        get each() { return filteredCatalog(); },
                        children: (m) =>
                          h(
                            "div",
                            {
                              class: () =>
                                selectedKey() === `${m.providerID}/${m.id}`
                                  ? "cp-master-item cp-master-item--active"
                                  : "cp-master-item",
                              onClick: () => loadModelIntoInspector(m),
                            },
                            h(
                              "div",
                              { class: "cp-model-item-main" },
                              h("div", { class: "cp-model-id" }, m.id),
                              h(
                                "div",
                                { class: "cp-model-sub" },
                                `${m.providerID} · ${m.contextLimit ? formatTokenCount(m.contextLimit) : "auto"} · ${formatEffortSummary(m.effortLevels)}${m.hasOverride ? " · boosted" : ""}`
                              )
                            )
                          ),
                      });
                    },
                  })
                )
              ),

              h(
                "div",
                { class: "cp-inspector-pane" },
                createComponent(Show, {
                  get when() { return Boolean(selectedModel()); },
                  get fallback() {
                    return h(
                      "div",
                      { class: "cp-empty" },
                      h("div", { class: "cp-empty-desc" }, "Select any model on the left (or click + Manual Model ID) to boost its Effort levels & Context limits.")
                    );
                  },
                  get children() {
                    return h(
                      "div",
                      { class: "cp-stack", style: { gap: "10px" } },
                      h(
                        "div",
                        { class: "cp-section-head" },
                        h(
                          "div",
                          { class: "cp-model-item-main" },
                          h("div", { class: "cp-model-id" }, () => `${selectedModel()?.providerID || ""}/${selectedModel()?.id || ""}`),
                          h(
                            "div",
                            { class: "cp-model-sub" },
                            () =>
                              `Protocol: ${selectedModel()?.protocol || "openai-compatible"} · Live: ${formatEffortSummary(selectedModel()?.effortLevels || [])}${selectedModel()?.contextLimit ? ` · ${formatTokenCount(selectedModel().contextLimit)}` : ""}`
                          )
                        ),
                        createComponent(Show, {
                          get when() { return Boolean(selectedModel()?.hasOverride); },
                          get children() {
                            return h("span", { class: "cp-badge cp-badge--accent" }, "Boosted");
                          },
                        })
                      ),
                      h(
                        "div",
                        { class: "cp-field" },
                        h("div", { class: "cp-label" }, "Reasoning Effort Tiers", h("span", { class: "cp-hint" }, "Override beyond high")),
                        createEffortPicker({
                          getEfforts: editEfforts,
                          onChangeEfforts: setEditEfforts,
                          getUltraTarget: editUltraTarget,
                          onChangeUltraTarget: setEditUltraTarget,
                          autoLabel: "Keep Default",
                        })
                      ),
                      h(
                        "div",
                        { class: "cp-grid-2" },
                        createLimitField({
                          label: "Context Override",
                          hint: "blank = default",
                          placeholder: "Keep OpenCode default",
                          getValue: editCtx,
                          onChange: setEditCtx,
                          presets: [
                            { label: "200K", val: "200000" },
                            { label: "400K", val: "400000" },
                            { label: "1M", val: "1000000" },
                          ],
                          clearLabel: "Default",
                        }),
                        createLimitField({
                          label: "Output Override",
                          hint: "blank = default",
                          placeholder: "Keep OpenCode default",
                          getValue: editOut,
                          onChange: setEditOut,
                          presets: [
                            { label: "32K", val: "32000" },
                            { label: "64K", val: "64000" },
                            { label: "128K", val: "128000" },
                          ],
                          clearLabel: "Default",
                        })
                      ),
                      h(
                        "div",
                        { class: "cp-section-head" },
                        createComponent(Show, {
                          get when() { return Boolean(selectedModel()?.hasOverride); },
                          get children() {
                            return createComponent(ctx.ui.Button, {
                              variant: "neutral",
                              size: "small",
                              get busy() { return busyAction(); },
                              onClick: () => void handleResetSingle(),
                              children: "Reset to Default",
                            });
                          },
                        }),
                        createComponent(ctx.ui.Button, {
                          variant: "contrast",
                          size: "small",
                          get busy() { return busyAction(); },
                          onClick: () => void handleSaveOverride(),
                          children: "Save Model Boost",
                        })
                      )
                    );
                  },
                })
              )
            )
          );
        },
      })
    );
  }

  async function handleResetOverride(ovr) {
    const res = await mainApi().resetModelOverride({
      providerID: ovr.providerID,
      modelID: ovr.modelID,
    });
    if (!res.ok) {
      await ctx.dialogs.alert({ title: "Reset Failed", description: res.message });
    }
  }

  function openJsonImportDialog() {
    const [jsonText, setJsonText] = createSignal("");
    const [overwrite, setOverwrite] = createSignal(false);
    const [importing, setImporting] = createSignal(false);
    const [errMsg, setErrMsg] = createSignal("");

    async function doImport(dialog) {
      setErrMsg("");
      setImporting(true);
      try {
        const res = await mainApi().importJson({ text: jsonText(), overwrite: overwrite() });
        if (!res.ok) {
          setErrMsg(res.message);
          return;
        }
        dialog.close();
      } catch (err) {
        setErrMsg(err instanceof Error ? err.message : String(err));
      } finally {
        setImporting(false);
      }
    }

    ctx.dialogs.open((dialog) =>
      createComponent(ctx.ui.Dialog, {
        size: "large",
        closable: true,
        title: "Import Provider Config (JSON / JSONC)",
        description: 'Paste a full opencode.jsonc snippet with "provider" or "providers" to convert and import.',
        get footer() {
          return h(
            "div",
            { class: "cp-dialog-footer" },
            createComponent(ctx.ui.Switch, {
              label: "Overwrite existing providers with same ID",
              get checked() { return overwrite(); },
              onChange: (val) => setOverwrite(val),
            }),
            h(
              "div",
              { class: "cp-dialog-footer-right" },
              createComponent(ctx.ui.Button, {
                variant: "neutral",
                onClick: () => dialog.close(),
                children: "Cancel",
              }),
              createComponent(ctx.ui.Button, {
                variant: "contrast",
                get busy() { return importing(); },
                get disabled() { return !jsonText().trim(); },
                onClick: () => void doImport(dialog),
                children: "Import",
              })
            )
          );
        },
        get children() {
          return h(
            "div",
            { class: "cp-dialog-form" },
            createComponent(Show, {
              get when() { return Boolean(errMsg()); },
              get children() {
                return h("div", { class: "cp-status-box cp-status-box--error" }, () => errMsg());
              },
            }),
            h("textarea", {
              class: "cp-textarea",
              placeholder: '{\n  "providers": {\n    "my-provider": {\n      "name": "My Provider",\n      "package": "@opencode/ai/providers/openai-compatible",\n      "settings": { "baseURL": "https://api.example.com/v1" },\n      "models": { "gpt-4o": { "name": "GPT-4o" } }\n    }\n  }\n}',
              value: jsonText,
              onInput: (e) => setJsonText(e.currentTarget.value),
            })
          );
        },
      })
    );
  }

  async function handleImportDesktop() {
    try {
      const res = await mainApi().importDesktop({ onlyMissing: true });
      if (!res.ok) {
        await ctx.dialogs.alert({ title: "Import Failed", description: res.message });
      }
    } catch (err) {
      await ctx.dialogs.alert({
        title: "Import Failed",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleDelete(provider) {
    const confirmed = await ctx.dialogs.confirm({
      title: `Remove "${provider.name}"?`,
      description: `This removes "${provider.id}" and its ${provider.models.length} model(s) from opencode.jsonc.`,
      confirm: "Remove",
      cancel: "Cancel",
      danger: true,
    });
    if (!confirmed) return;
    const res = await mainApi().deleteProvider({ id: provider.id });
    if (!res.ok) {
      await ctx.dialogs.alert({ title: "Delete Failed", description: res.message });
    }
  }

  async function handleReload() {
    const res = await mainApi().reloadServer();
    if (!res.ok) {
      await ctx.dialogs.alert({ title: "Reload Failed", description: res.message });
    }
  }

  let customProvidersEnabled = false;
  void ctx.main(ToolboxIpc).getModuleSettings().then((settings) => {
    customProvidersEnabled = settings.modules?.customProviders === true;
  }).catch((error) => {
    customProvidersEnabled = false;
    ctx.toast.show({ variant: "error", title: "Custom Providers settings unavailable", description: String(error) });
  });
  ctx.add(Command, {
    id: "manage",
    title: "Manage Custom Providers & Model Boost",
    description: "Manage custom API endpoints and unlock Xhigh / Max / Ultra efforts on any OpenCode model",
    keywords: "custom provider openai anthropic endpoint api key baseurl proxy models effort ultra xhigh max boost",
    group: "Settings",
    section: "navigation",
    slash: { name: "custom-provider" },
    run: () => {
      if (!customProvidersEnabled) {
        ctx.toast.show({ variant: "warning", title: "Custom Providers module is disabled" });
        return;
      }
      ctx.layout.settings("custom-providers");
    },
  });

  ctx.add(SettingsPage, {
    id: "custom-providers",
    title: "Custom Providers",
    icon: "outline-sliders",
    entries: [
      {
        id: "custom-providers-list",
        title: "Configured Custom Providers",
        description: "Manage custom API endpoints, API keys, and model definitions",
        keywords: "custom provider openai anthropic endpoint api key baseurl proxy",
      },
      {
        id: "model-boost-overrides",
        title: "Built-in & Connected Model Boost",
        description: "Unlock Xhigh / Max / Ultra reasoning efforts & Context limits on any OpenCode model",
        keywords: "boost model effort xhigh max ultra opencode openai anthropic agentrouter",
      },
      {
        id: "add-custom-provider",
        title: "Add Custom Provider",
        description: "Create a new custom OpenAI-compatible or Anthropic-compatible provider",
        keywords: "add new custom provider url key endpoint",
      },
    ],
    render: () => {
      if (!customProvidersEnabled) {
        return createComponent(ctx.ui.SettingsLayout, {
          title: "Custom Providers",
          description: "Enable the Custom Providers module in OpenCode Toolbox settings to use this page.",
        });
      }
      const [busyReload, setBusyReload] = createSignal(false);
      const [busyImport, setBusyImport] = createSignal(false);
      const [desktopDismissed, setDesktopDismissed] = createSignal(false);

      // Re-sync from disk whenever Custom Providers settings opens
      void Promise.resolve().then(() => silentRefresh());

      const missingDesktop = createMemo(() =>
        (state()?.desktopCandidates || []).filter((c) => !c.alreadyExists)
      );

      return createComponent(ctx.ui.SettingsLayout, {
        title: "Custom Providers & Model Boost",
        description: "Configure custom API providers and unlock higher Reasoning Efforts (Xhigh / Max / Ultra) & Context limits across any model.",
        get actions() {
          return h(
            "div",
            { class: "cp-header-actions" },
            createComponent(ctx.ui.Button, {
              variant: "neutral",
              size: "small",
              onClick: openJsonImportDialog,
              children: "Import JSON",
            }),
            createComponent(ctx.ui.Button, {
              variant: "neutral",
              size: "small",
              icon: "refresh",
              get busy() { return busyReload(); },
              onClick: async () => {
                setBusyReload(true);
                try {
                  await handleReload();
                } finally {
                  setBusyReload(false);
                }
              },
              children: "Reload",
            }),
            createComponent(ctx.ui.Button, {
              variant: "neutral",
              size: "small",
              onClick: () => openModelBoosterDialog(null),
              children: "Boost Any Model",
            }),
            createComponent(ctx.ui.Button, {
              variant: "contrast",
              size: "small",
              icon: "plus",
              onClick: () => openProviderEditor(null),
              children: "Add Provider",
            })
          );
        },
        get children() {
          return h(
            "div",
            { class: "cp-stack" },

            // Config Error Banner (if any)
            createComponent(Show, {
              get when() { return Boolean(state()?.lastError); },
              get children() {
                return h(
                  "div",
                  { class: "cp-banner cp-banner--error" },
                  h(
                    "div",
                    { class: "cp-banner-text" },
                    h("div", { class: "cp-banner-title" }, "Configuration Read Warning"),
                    h("div", { class: "cp-banner-desc" }, () => state()?.lastError || "")
                  ),
                  createComponent(ctx.ui.Button, {
                    variant: "neutral",
                    size: "small",
                    onClick: () => void refreshNow(),
                    children: "Retry",
                  })
                );
              },
            }),

            // 1-Click Desktop Config Import Banner
            createComponent(Show, {
              get when() { return !desktopDismissed() && missingDesktop().length > 0; },
              get children() {
                return h(
                  "div",
                  { class: "cp-banner" },
                  h(
                    "div",
                    { class: "cp-banner-text" },
                    h(
                      "div",
                      { class: "cp-banner-title" },
                      () => `Found ${missingDesktop().length} provider(s) on Desktop`
                    ),
                    h(
                      "div",
                      { class: "cp-banner-desc" },
                      () =>
                        `${missingDesktop().map((p) => `${p.name} (${p.modelCount} models)`).join(", ")} in ${state()?.desktopPath || "Desktop/opencode.jsonc"}`
                    )
                  ),
                  h(
                    "div",
                    { class: "cp-row-controls" },
                    createComponent(ctx.ui.Button, {
                      variant: "neutral",
                      size: "small",
                      onClick: () => setDesktopDismissed(true),
                      children: "Dismiss",
                    }),
                    createComponent(ctx.ui.Button, {
                      variant: "contrast",
                      size: "small",
                      get busy() { return busyImport(); },
                      onClick: async () => {
                        setBusyImport(true);
                        try {
                          await handleImportDesktop();
                        } finally {
                          setBusyImport(false);
                        }
                      },
                      children: "Import Now",
                    })
                  )
                );
              },
            }),

            // Configured Providers List Section
            createComponent(ctx.ui.SettingsSection, {
              title: "Configured Custom Providers",
              get children() {
                return createComponent(Show, {
                  get when() { return (state()?.providers || []).length > 0; },
                  get fallback() {
                    return h(
                      "div",
                      { class: "cp-empty", "data-action": "custom-providers-list" },
                      h("div", { class: "cp-empty-title" }, "No Custom Providers Configured Yet"),
                      h(
                        "div",
                        { class: "cp-empty-desc" },
                        "Add your own OpenAI-compatible or Anthropic-compatible API endpoint, proxy, or local model server."
                      ),
                      h(
                        "div",
                        { class: "cp-header-actions" },
                        createComponent(ctx.ui.Button, {
                          variant: "contrast",
                          icon: "plus",
                          onClick: () => openProviderEditor(null),
                          children: "Add Custom Provider",
                        }),
                        createComponent(ctx.ui.Button, {
                          variant: "neutral",
                          onClick: openJsonImportDialog,
                          children: "Paste JSON / JSONC",
                        })
                      )
                    );
                  },
                  get children() {
                    return createComponent(For, {
                      get each() { return state()?.providers || []; },
                      children: (provider) =>
                        createComponent(ctx.ui.SettingsRow, {
                          id: `provider-${provider.id}`,
                          get title() { return provider.name; },
                          get description() {
                            return h(
                              "div",
                              { class: "cp-stack", style: { gap: "4px" } },
                              h(
                                "div",
                                { class: "cp-provider-meta" },
                                h("span", { class: "cp-badge cp-badge--mono" }, () => provider.id),
                                h("span", { class: "cp-badge" }, () => provider.protocol),
                                h(
                                  "span",
                                  {
                                    class: () =>
                                      provider.authMode === "env"
                                        ? provider.envPresent
                                          ? "cp-badge cp-badge--ok"
                                          : "cp-badge cp-badge--warn"
                                        : provider.authMode === "key"
                                          ? "cp-badge cp-badge--ok"
                                          : "cp-badge",
                                  },
                                  () =>
                                    provider.authMode === "env"
                                      ? provider.envPresent
                                        ? `env ${provider.envVar}`
                                        : `env ${provider.envVar} (missing)`
                                      : provider.authMode === "key"
                                        ? `key ${provider.apiKeyMask}`
                                        : "no auth"
                                ),
                                h("span", { class: "cp-badge" }, () => `${provider.models.length} model${provider.models.length === 1 ? "" : "s"}`)
                              ),
                              h(
                                "div",
                                { class: "cp-model-chips" },
                                createComponent(For, {
                                  get each() { return (provider.models || []).slice(0, 5); },
                                  children: (m) =>
                                    h(
                                      "span",
                                      {
                                        class: () =>
                                          Array.isArray(m.effortLevels) && m.effortLevels.length > 0
                                            ? "cp-badge cp-badge--mono cp-badge--accent"
                                            : "cp-badge cp-badge--mono",
                                      },
                                      () => {
                                        const parts = [m.id];
                                        if (m.protocol && m.protocol !== "inherit") parts.push(m.protocol);
                                        if (m.contextLimit) parts.push(formatTokenCount(m.contextLimit));
                                        if (Array.isArray(m.effortLevels) && m.effortLevels.length > 0) {
                                          parts.push(formatEffortSummary(m.effortLevels));
                                        }
                                        return parts.join(" · ");
                                      }
                                    ),
                                }),
                                createComponent(Show, {
                                  get when() { return (provider.models || []).length > 5; },
                                  get children() {
                                    return h("span", { class: "cp-badge" }, () => `+${provider.models.length - 5} more`);
                                  },
                                })
                              )
                            );
                          },
                          get children() {
                            return h(
                              "div",
                              { class: "cp-row-controls" },
                              createComponent(ctx.ui.Button, {
                                variant: "neutral",
                                size: "small",
                                icon: "edit",
                                onClick: () => {
                                  const live = (state()?.providers || []).find((p) => p.id === provider.id) || provider;
                                  openProviderEditor(live);
                                },
                                children: "Edit",
                              }),
                              createComponent(ctx.ui.IconButton, {
                                icon: "outline-trash",
                                get label() { return `Remove ${provider.name}`; },
                                onClick: () => void handleDelete(provider),
                              })
                            );
                          },
                        }),
                    });
                  },
                });
              },
            }),

            // Built-in & Connected Model Boost Section (Non-custom providers!)
            createComponent(ctx.ui.SettingsSection, {
              title: "Built-in & Connected Model Boost",
              get children() {
                return h(
                  "div",
                  { class: "cp-stack", style: { gap: "8px" } },
                  createComponent(ctx.ui.SettingsRow, {
                    id: "model-boost-overrides",
                    title: "Unlock Xhigh / Max / Ultra on Other Models",
                    description: "Override reasoning effort tiers (beyond High) and Context/Output limits on OpenCode, OpenAI, Anthropic, Google, AgentRouter & any other provider without touching keys or integrations.",
                    get children() {
                      return createComponent(ctx.ui.Button, {
                        variant: "neutral",
                        size: "small",
                        onClick: () => openModelBoosterDialog(null),
                        children: "Browse & Boost Models",
                      });
                    },
                  }),
                  createComponent(For, {
                    get each() { return state()?.modelOverrides || []; },
                    children: (ovr) =>
                      createComponent(ctx.ui.SettingsRow, {
                        id: `ovr-${ovr.providerID}-${ovr.modelID}`,
                        get title() { return `${ovr.providerID} / ${ovr.modelID}`; },
                        get description() {
                          return h(
                            "div",
                            { class: "cp-provider-meta" },
                            h(
                              "span",
                              { class: "cp-badge cp-badge--accent cp-badge--mono" },
                              () => formatEffortSummary(ovr.effortLevels || [])
                            ),
                            ovr.contextLimit
                              ? h("span", { class: "cp-badge cp-badge--mono" }, () => `ctx ${formatTokenCount(ovr.contextLimit)}`)
                              : null,
                            ovr.outputLimit
                              ? h("span", { class: "cp-badge cp-badge--mono" }, () => `out ${formatTokenCount(ovr.outputLimit)}`)
                              : null
                          );
                        },
                        get children() {
                          return h(
                            "div",
                            { class: "cp-row-controls" },
                            createComponent(ctx.ui.Button, {
                              variant: "neutral",
                              size: "small",
                              icon: "edit",
                              onClick: () => openModelBoosterDialog(ovr),
                              children: "Edit",
                            }),
                            createComponent(ctx.ui.IconButton, {
                              icon: "outline-trash",
                              get label() { return `Reset ${ovr.providerID}/${ovr.modelID}`; },
                              onClick: () => void handleResetOverride(ovr),
                            })
                          );
                        },
                      }),
                  })
                );
              },
            }),

            // Config Location & Status Section
            createComponent(ctx.ui.SettingsSection, {
              title: "Configuration Storage",
              get children() {
                return createComponent(ctx.ui.SettingsRow, {
                  id: "add-custom-provider",
                  title: "Global OpenCode Config File (Plugin v1.3.0)",
                  get description() {
                    return h(
                      "span",
                      { class: "cp-path-mono" },
                      () => `${state()?.configPath || "~/.config/opencode/opencode.jsonc"}${state()?.configExists ? "" : " (will be created on first save)"}`
                    );
                  },
                });
              },
            })
          );
        },
      });
    },
  });
}

function setupMcpGuiPage(ctx) {
  const ui = ctx.ui, ipc = ctx.use(McpIpc), api = () => ctx.main(McpIpc);
  const [manualState, setManualState] = createSignal(null);
  const state = () => manualState() ?? (ipc().status === "active" ? ipc().value.state() : undefined);
  const [id, setId] = createSignal(""), [type, setType] = createSignal("local");
  const [commandJson, setCommandJson] = createSignal('["npx","-y","@modelcontextprotocol/server-example"]');
  const [url, setUrl] = createSignal("https://example.com/mcp"), [cwd, setCwd] = createSignal("");
  const [environmentJson, setEnvironmentJson] = createSignal("{}"), [headersJson, setHeadersJson] = createSignal("{}");
  const [disabled, setDisabled] = createSignal(false), [originalId, setOriginalId] = createSignal(null), [busy, setBusy] = createSignal(false);
  async function refresh() { try { setManualState(await api().refresh()); } catch (e) { ctx.toast.show({ variant: "error", title: String(e) }); } }
  function edit(s) { setOriginalId(s.id); setId(s.id); setType(s.type); setCommandJson(JSON.stringify(s.command,null,2)); setUrl(s.url); setCwd(s.cwd); setEnvironmentJson(s.environmentJson); setHeadersJson(s.headersJson); setDisabled(s.disabled); }
  function clearForm() { setOriginalId(null); setId(""); setType("local"); setCommandJson('["npx","-y","@modelcontextprotocol/server-example"]'); setUrl("https://example.com/mcp"); setCwd(""); setEnvironmentJson("{}"); setHeadersJson("{}"); setDisabled(false); }
  async function save() {
    setBusy(true);
    try {
      const r = await api().save({ id:id(), originalId:originalId(), type:type(), commandJson:commandJson(), url:url(), cwd:cwd(), environmentJson:environmentJson(), headersJson:headersJson(), disabled:disabled() });
      if (!r.ok) { await ctx.dialogs.alert({ title:"MCP save failed", description:r.message }); return; }
      ctx.toast.show({ variant: "success", title: r.message }); clearForm(); await refresh();
    } catch(e) { await ctx.dialogs.alert({ title:"MCP save failed", description:String(e) }); }
    finally { setBusy(false); }
  }
  async function toggle(s, value) {
    try { const r=await api().setDisabled({id:s.id,disabled:!value}); if(!r.ok) await ctx.dialogs.alert({title:"MCP update failed",description:r.message}); else {ctx.toast.show({ variant: "success", title: r.message });await refresh();} }
    catch(e) { await ctx.dialogs.alert({title:"MCP update failed",description:String(e)}); }
  }
  async function remove(s) {
    const yes=await ctx.dialogs.confirm({title:`Delete MCP server "${s.id}"?`,description:"This removes the server definition from the OpenCode configuration file.",confirm:"Delete",cancel:"Cancel",danger:true});
    if(!yes)return;
    try { const r=await api().remove({id:s.id}); if(!r.ok) await ctx.dialogs.alert({title:"MCP delete failed",description:r.message}); else {ctx.toast.show({ variant: "success", title: r.message });if(originalId()===s.id)clearForm();await refresh();} }
    catch(e) { await ctx.dialogs.alert({title:"MCP delete failed",description:String(e)}); }
  }
  const field=(label,value,setter,placeholder)=>h("div",{class:"cp-field"},h("div",{class:"cp-label"},label),createComponent(ui.TextInput,{label,value,placeholder,onInput:setter}));
  const register = async () => {
    const settings = await api().getModuleSettings();
    if (!settings.modules?.mcpGui) return;
    ctx.add(Command,{id:"mcp-gui",title:"Manage MCP Servers",description:"Add, edit, enable, disable and remove MCP servers",keywords:"mcp server tools local remote",group:"Settings",section:"navigation",slash:{name:"mcp-gui"},run:()=>ctx.layout.settings("mcp-gui")});
    ctx.add(SettingsPage,{
      id:"mcp-gui",title:"MCP-GUI",icon:"server",
      entries:[{id:"mcp-servers",title:"MCP Servers",description:"Manage local and remote MCP servers",keywords:"mcp server local remote command url"}],
    render:()=>createComponent(ui.SettingsLayout,{
      title:"MCP-GUI",description:"Manage local and remote MCP servers in your OpenCode configuration.",
      get children(){ return [
        createComponent(ui.SettingsSection,{title:"Configured servers",get children(){
          const servers=state()?.servers||[];
          return [
            createComponent(ui.SettingsRow,{title:"Configuration file",description:state()?.configPath||"Loading configuration…",get children(){return createComponent(ui.Button,{variant:"ghost",size:"small",onClick:refresh,children:"Refresh"});}}),
            ...servers.map(s=>createComponent(ui.SettingsRow,{title:s.id,description:s.type==="local"?(s.command||[]).join(" "):s.url,get children(){return h("div",{class:"cp-row-controls"},
              createComponent(ui.Switch,{label:"Enabled",checked:!s.disabled,onChange:v=>void toggle(s,v)}),
              createComponent(ui.Button,{variant:"ghost",size:"small",onClick:()=>edit(s),children:"Edit"}),
              createComponent(ui.IconButton,{icon:"outline-trash",label:`Delete ${s.id}`,onClick:()=>void remove(s)})
            );}})),
            ...(servers.length?[]:[createComponent(ui.SettingsRow,{title:"No MCP servers configured",description:"Add a local or remote server below."})])
          ];
        }}),
        createComponent(ui.SettingsSection,{title:originalId()?"Edit MCP server":"Add MCP server",get children(){
          return h("div",{class:"cp-stack"},
            field("Server ID",id(),setId,"my-mcp-server"),
            h("div",{class:"cp-field"},h("div",{class:"cp-label"},"Connection type"),createComponent(ui.Select,{label:"Connection type",options:[{value:"local",label:"Local command"},{value:"remote",label:"Remote HTTP"}],value:type(),onChange:setType})),
            type()==="local"?field("Command (JSON array)",commandJson(),setCommandJson,'["npx","-y","package-name"]'):field("Server URL",url(),setUrl,"https://example.com/mcp"),
            type()==="local"?field("Working directory (optional)",cwd(),setCwd,"C:\\work"):null,
            type()==="local"?field("Environment (JSON object)",environmentJson(),setEnvironmentJson,'{"API_KEY":"{env:API_KEY}"}'):null,
            type()==="remote"?field("Headers (JSON object)",headersJson(),setHeadersJson,'{"Authorization":"Bearer {env:API_KEY}"}'):null,
            createComponent(ui.Switch,{label:"Disabled",checked:disabled(),onChange:setDisabled}),
            h("div",{class:"cp-header-actions"},
              createComponent(ui.Button,{variant:"contrast",busy:busy(),onClick:()=>void save(),children:originalId()?"Save changes":"Add MCP server"}),
              createComponent(ui.Button,{variant:"ghost",onClick:clearForm,children:"Clear form"})
            )
          );
        }})
      ]; }
    })
    });
  };
  void register();
}

function setupToolboxPage(ctx) {
  const ui = ctx.ui, ipc = ctx.main(ToolboxIpc);
  ctx.add(Command,{id:"toolbox",title:"Open OpenCode Toolbox",description:"Open the modular Toolbox settings",keywords:"toolbox modules mcp providers",group:"Settings",section:"navigation",slash:{name:"toolbox"},run:()=>ctx.layout.settings("toolbox")});
  ctx.add(SettingsPage,{
    id:"toolbox",title:"OpenCode Toolbox",icon:"outline-sliders",
    entries:[{id:"toolbox-modules",title:"Modules",description:"Configure Toolbox modules, providers and models",keywords:"toolbox modules providers models"}],
    render:()=>{
      const [settings,setSettings]=createSignal({modules:{trueModelDisabler:true,providerDisabler:false,bulkModelToggle:false,mcpGui:false,customProviders:false},disabledProviders:[],disabledMcpServers:[],modelEnabledOverrides:{}});
      const [providers,setProviders]=createSignal([]),[models,setModels]=createSignal([]),[selected,setSelected]=createSignal("");
      const [status,setStatus]=createSignal("Loading settings…"),[busy,setBusy]=createSignal(false);
      const load=async()=>{
        setBusy(true);
        try {
          const raw=await ipc.getSettings(), parsed=JSON.parse(raw);
          setSettings({...settings(),...parsed,modules:{...settings().modules,...(parsed.modules||{})}});
          const [pr,mr]=await Promise.all([ctx.client.provider.list(),ctx.client.model.list()]);
          const pd=pr?.data??pr, md=mr?.data??mr;
          const pRows=Array.isArray(pd)?pd:Object.values(pd?.all||pd?.connected||pd?.providers||pd||{});
          const clean=pRows.map(p=>({id:p.id||p.provider?.id,name:p.name||p.provider?.name||p.id||p.provider?.id})).filter(p=>p.id);
          const mRows=Array.isArray(md)?md:Object.values(md?.models||md||{});
          setProviders(clean);setModels(mRows.map(m=>({id:m.id,providerID:m.providerID,name:m.name||m.id})).filter(m=>m.id&&m.providerID));
          if(!selected()&&clean.length)setSelected(clean[0].id);
          setStatus("");
        } catch(e){setStatus("Catalog/settings load error: "+String(e));}
        finally{setBusy(false);}
      };
      const save=async next=>{
        setSettings(next);
        try{const r=await ipc.saveSettings(JSON.stringify(next));if(!r.ok)throw new Error(r.message);setStatus(r.message);}
        catch(e){setStatus("Save failed: "+String(e));}
      };
      const moduleSwitch=(key,value)=>void save({...settings(),modules:{...settings().modules,[key]:value}});
      const providerSwitch=(id,value)=>{
        const ids=new Set(settings().disabledProviders||[]);
        if(value)ids.delete(id);else ids.add(id);
        void save({...settings(),disabledProviders:[...ids]});
      };
      const bulk=enabled=>{
        const id=selected(), target=models().filter(m=>m.providerID===id);
        const overrides={...(settings().modelEnabledOverrides||{}),[id]:{...(settings().modelEnabledOverrides?.[id]||{})}};
        for(const m of target)overrides[id][m.id]=enabled;
        void save({...settings(),modelEnabledOverrides:overrides});
      };
      const resetBulk=()=>{
        const id=selected();
        const overrides={...(settings().modelEnabledOverrides||{})};
        delete overrides[id];
        void save({...settings(),modelEnabledOverrides:overrides});
      };
      const overrideCount=()=>Object.keys(settings().modelEnabledOverrides?.[selected()]||{}).length;
      void load();
      return createComponent(ui.SettingsLayout,{
        title:"OpenCode Toolbox",
        description:"Settings are stored in opencode-toolbox.json. Restart OpenCode Desktop to apply server-side changes.",
        get actions(){return createComponent(ui.Button,{variant:"neutral",size:"small",icon:"refresh",busy:busy(),onClick:()=>void load(),children:"Refresh"});},
        get children(){return [
          createComponent(ui.SettingsSection,{title:"Modules",get children(){
            return [
              ["trueModelDisabler","True Model Disabler","Blocks hidden models at request time, including subagents."],
              ["providerDisabler","Provider Disabler","Temporarily disables providers without removing credentials."],
              ["bulkModelToggle","Bulk Model Toggle","Enables/disables all models from a selected provider."],
              ["mcpGui","MCP-GUI","Manage local and remote MCP servers."],
              ["customProviders","Custom Providers","Manage custom API providers. Based on MoGlitch's MIT-licensed project."]
            ].map(([key,title,description])=>createComponent(ui.SettingsRow,{title,description,get children(){return createComponent(ui.Switch,{label:"Enabled",checked:settings().modules[key]!==false,onChange:v=>moduleSwitch(key,v)});}}));
          }}),
          createComponent(ui.SettingsSection,{title:"Provider Disabler",get children(){
            return providers().map(p=>createComponent(ui.SettingsRow,{title:p.name,description:p.id,get children(){return createComponent(ui.Switch,{label:"Enabled",checked:!(settings().disabledProviders||[]).includes(p.id),onChange:v=>providerSwitch(p.id,v)});}}));
          }}),
          createComponent(ui.SettingsSection,{title:"Bulk Model Toggle",get children(){
            const options=providers().map(p=>({value:p.id,label:p.name+" ("+p.id+")"}));
            return [
              createComponent(ui.SettingsRow,{title:"Provider",description:"Choose which provider's models to change.",get children(){return createComponent(ui.Select,{label:"Provider",options,value:selected(),onChange:setSelected});}}),
              createComponent(ui.SettingsRow,{title:"Models found",description:String(models().filter(m=>m.providerID===selected()).length)}),
              createComponent(ui.SettingsRow,{title:"Saved overrides",description:String(overrideCount())+" model(s) overridden for this provider."}),
              createComponent(ui.SettingsRow,{title:"Bulk actions",description:"Overrides are stored by provider/model ID. Reset removes Toolbox overrides and returns control to the provider's native model defaults.",get children(){return h("div",{class:"cp-row-controls"},
                createComponent(ui.Button,{variant:"contrast",size:"small",onClick:()=>bulk(true),disabled:models().filter(m=>m.providerID===selected()).length===0,children:"Enable all"}),
                createComponent(ui.Button,{variant:"neutral",size:"small",onClick:()=>bulk(false),disabled:models().filter(m=>m.providerID===selected()).length===0,children:"Disable all"}),
                createComponent(ui.Button,{variant:"ghost",size:"small",onClick:resetBulk,disabled:overrideCount()===0,children:"Reset overrides"})
              );}})
            ];
          }}),
          createComponent(ui.SettingsSection,{title:"About",get children(){return [
            createComponent(ui.SettingsRow,{title:"Version",description:"0.2.28"}),
            createComponent(ui.SettingsRow,{title:"Settings file",description:"opencode-toolbox.json in the OpenCode config directory."}),
            createComponent(ui.SettingsRow,{title:"Custom Providers attribution",description:"Based on MoGLCL/opencode-custom-provider by MoGlitch. MIT License."}),
            createComponent(ui.SettingsRow,{title:"Status",description:status()||"Ready"})
          ];}})
        ];},
      });
    }
  });
}

exports.default = Plugin.define({
  os: ["windows", "macos", "linux"],
  setup(ctx) {
    setupRenderer(ctx);
    setupToolboxPage(ctx);
  },
  main: createMainHandler,
});
