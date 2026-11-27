"use strict";

/**
 * OpenCode Toolbox — Desktop GUI entrypoint.
 *
 * The OpenCode GUI SDK resolves translations using the application's locale.
 * English is the fallback; Russian is selected automatically for ru-* locales.
 */

const { Plugin, SettingsPage, Command } = require("@opencode/plugin/gui");
const { createComponent, createSignal } = require("solid-js");

function createModuleRow(ui, module, enabled, setEnabled) {
  return createComponent(ui.SettingsRow, {
    id: module.id,
    title: module.name,
    description: module.description,
    get children() {
      return createComponent(ui.Switch, {
        label: module.name,
        hideLabel: true,
        checked: enabled(),
        onChange: setEnabled,
      });
    },
  });
}

function ToolboxSettings(props) {
  const ctx = props.ctx;
  const ui = ctx.ui;

  // Demo state: switches update immediately, but are not persisted yet.
  const [visibilityGuard, setVisibilityGuard] = createSignal(true);
  const [groupControls, setGroupControls] = createSignal(false);
  const [providerSwitcher, setProviderSwitcher] = createSignal(false);

  const modules = [
    {
      id: "model-visibility-guard",
      name: () => ctx.t("module.visibility.title"),
      description: () => ctx.t("module.visibility.description"),
      enabled: visibilityGuard,
      setEnabled: setVisibilityGuard,
    },
    {
      id: "model-group-controls",
      name: () => ctx.t("module.groups.title"),
      description: () => ctx.t("module.groups.description"),
      enabled: groupControls,
      setEnabled: setGroupControls,
    },
    {
      id: "provider-switcher",
      name: () => ctx.t("module.providers.title"),
      description: () => ctx.t("module.providers.description"),
      enabled: providerSwitcher,
      setEnabled: setProviderSwitcher,
    },
  ];

  return createComponent(ui.SettingsLayout, {
    get title() { return ctx.t("settings.title"); },
    get description() { return ctx.t("settings.description"); },
    get children() {
      return [
        createComponent(ui.SettingsSection, {
          get title() { return ctx.t("section.modules"); },
          get children() {
            return modules.map((module) =>
              createModuleRow(
                ui,
                { id: module.id, name: module.name(), description: module.description() },
                module.enabled,
                module.setEnabled
              )
            );
          },
          get footer() { return ctx.t("section.modules.footer"); },
        }),
        createComponent(ui.SettingsSection, {
          get title() { return ctx.t("section.about"); },
          get children() {
            return [
              createComponent(ui.SettingsRow, {
                get title() { return ctx.t("about.version"); },
                description: "0.1.0 · UI prototype",
              }),
              createComponent(ui.SettingsRow, {
                get title() { return ctx.t("about.repository"); },
                description: "github.com/OrionFalls/OpenCode-Toolbox",
              }),
            ];
          },
        }),
      ];
    },
  });
}

module.exports.default = Plugin.define({
  i18n: {
    en: {
      "settings.title": "OpenCode Toolbox",
      "settings.description": "A set of extra tools for OpenCode. Enable only the features you need.",
      "section.modules": "Modules",
      "section.modules.footer": "These switches are a preview: settings are not saved yet, and module functionality is not connected.",
      "section.about": "About",
      "about.version": "Version",
      "about.repository": "Repository",
      "module.visibility.title": "Model Visibility Guard",
      "module.visibility.description": "Controls model availability using the checkboxes in OpenCode settings. Disabled models remain in the catalog and can be enabled again.",
      "module.groups.title": "Model Group Controls",
      "module.groups.description": "Adds controls to enable or disable all models in a selected group or provider at once.",
      "module.providers.title": "Provider Switcher",
      "module.providers.description": "Temporarily pauses and resumes configured providers without deleting their settings or API keys.",
      "command.open.title": "Open OpenCode Toolbox",
      "command.open.description": "Open OpenCode Toolbox settings",
      "command.open.group": "Settings",
      "command.open.entry": "Modules",
      "command.open.entry.description": "Enable and configure OpenCode Toolbox modules",
    },
    ru: {
      "settings.title": "OpenCode Toolbox",
      "settings.description": "Дополнительные инструменты для OpenCode. Включайте только те возможности, которые вам нужны.",
      "section.modules": "Модули",
      "section.modules.footer": "Это предварительная версия: настройки пока не сохраняются, а функциональность модулей ещё не подключена.",
      "section.about": "О проекте",
      "about.version": "Версия",
      "about.repository": "Репозиторий",
      "module.visibility.title": "Контроль доступности моделей",
      "module.visibility.description": "Управляет доступностью моделей с помощью переключателей в настройках OpenCode. Отключённые модели остаются в каталоге — их можно включить обратно.",
      "module.groups.title": "Управление группами моделей",
      "module.groups.description": "Позволяет включать и отключать все модели выбранной группы или провайдера одновременно.",
      "module.providers.title": "Переключатель провайдеров",
      "module.providers.description": "Позволяет временно отключать и снова включать настроенных провайдеров без удаления их настроек и API-ключей.",
      "command.open.title": "Открыть OpenCode Toolbox",
      "command.open.description": "Открыть настройки OpenCode Toolbox",
      "command.open.group": "Настройки",
      "command.open.entry": "Модули",
      "command.open.entry.description": "Включение и настройка модулей OpenCode Toolbox",
    },
  },

  setup(ctx) {
    ctx.add(SettingsPage, () => ({
      id: "toolbox",
      get title() { return ctx.t("settings.title"); },
      icon: "outline-sliders",
      get entries() {
        return [
          {
            id: "toolbox-modules",
            title: ctx.t("command.open.entry"),
            description: ctx.t("command.open.entry.description"),
            keywords: "toolbox modules visibility models providers",
          },
        ];
      },
      render: () => createComponent(ToolboxSettings, { ctx }),
    }));

    ctx.add(Command, () => ({
      id: "open-settings",
      title: ctx.t("command.open.title"),
      description: ctx.t("command.open.description"),
      keywords: "toolbox modules settings",
      group: ctx.t("command.open.group"),
      section: "navigation",
      slash: { name: "toolbox" },
      run: () => ctx.layout.settings("toolbox"),
    }));
  },
});
