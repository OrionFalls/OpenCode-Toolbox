"use strict";

/**
 * OpenCode Toolbox — Desktop GUI entrypoint.
 *
 * This first release is a visual prototype. The module switches are local UI
 * state only and do not activate/deactivate functionality yet.
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

function ToolboxSettings(ctx) {
  const ui = ctx.ui;

  // Demo state: switches update immediately, but are not persisted yet.
  const [visibilityGuard, setVisibilityGuard] = createSignal(true);
  const [groupControls, setGroupControls] = createSignal(false);
  const [providerSwitcher, setProviderSwitcher] = createSignal(false);

  const modules = [
    {
      id: "model-visibility-guard",
      name: "Model Visibility Guard",
      description:
        "Контролирует доступность моделей по галочкам в настройках OpenCode. Выключенные модели остаются в каталоге и могут быть включены обратно.",
      enabled: visibilityGuard,
      setEnabled: setVisibilityGuard,
    },
    {
      id: "model-group-controls",
      name: "Model Group Controls",
      description:
        "Добавляет массовое включение и отключение всех моделей внутри выбранной группы или провайдера.",
      enabled: groupControls,
      setEnabled: setGroupControls,
    },
    {
      id: "provider-switcher",
      name: "Provider Switcher",
      description:
        "Позволяет временно приостанавливать и возобновлять настроенных провайдеров без удаления конфигурации и API-ключей.",
      enabled: providerSwitcher,
      setEnabled: setProviderSwitcher,
    },
  ];

  return createComponent(ui.SettingsLayout, {
    title: "OpenCode Toolbox",
    description:
      "Набор дополнительных инструментов для OpenCode. Включайте только те возможности, которые вам нужны.",
    get children() {
      return [
        createComponent(ui.SettingsSection, {
          title: "Модули",
          get children() {
            return modules.map((module) =>
              createModuleRow(ui, module, module.enabled, module.setEnabled)
            );
          },
          footer:
            "Переключатели пока демонстрационные: настройки не сохраняются и функциональность модулей ещё не подключена.",
        }),
        createComponent(ui.SettingsSection, {
          title: "О проекте",
          get children() {
            return [
              createComponent(ui.SettingsRow, {
                title: "Версия",
                description: "0.1.0 · UI prototype",
              }),
              createComponent(ui.SettingsRow, {
                title: "Репозиторий",
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
  setup(ctx) {
    ctx.add(SettingsPage, {
      id: "toolbox",
      title: "OpenCode Toolbox",
      icon: "wrench",
      entries: [
        {
          id: "toolbox-modules",
          title: "Модули",
          description: "Включение и настройка модулей OpenCode Toolbox",
          keywords: "toolbox modules visibility models providers",
        },
      ],
      render: () => createComponent(ToolboxSettings, { ctx }),
    });

    ctx.add(Command, {
      id: "open-settings",
      title: "OpenCode Toolbox",
      description: "Открыть настройки OpenCode Toolbox",
      keywords: "toolbox modules settings",
      group: "Settings",
      section: "navigation",
      slash: { name: "toolbox" },
      run: () => ctx.layout.settings("toolbox"),
    });
  },
});
