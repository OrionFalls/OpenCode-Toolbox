"use strict";

/**
 * OpenCode Toolbox Desktop GUI.
 * Module switches are stored through the plugin's main-process storage bridge
 * in the next UI integration step. This page intentionally contains navigation
 * and module descriptions only; it does not display non-functional toggles.
 */
const { Plugin, SettingsPage, Command } = require("@opencode/plugin/gui");
const { createComponent } = require("solid-js");

function ModuleRow(ui, title, description, status) {
  return createComponent(ui.SettingsRow, {
    title,
    description,
    get children() {
      return status;
    },
  });
}

function ToolboxPage(ctx) {
  const ui = ctx.ui;
  return createComponent(ui.SettingsLayout, {
    title: "OpenCode Toolbox",
    description: "Модульный набор инструментов для OpenCode.",
    get children() {
      return [
        createComponent(ui.SettingsSection, {
          title: "Модули",
          get children() {
            return [
              ModuleRow(ui, "True Model Disabler", "Блокирует вызовы моделей, отключённых в штатных настройках OpenCode, включая вызовы субагентов.", "Включён по умолчанию"),
              ModuleRow(ui, "Provider Disabler", "Временно отключает провайдеры, сохраняя конфигурацию и ключи.", "Требует подключения интерфейса"),
              ModuleRow(ui, "Bulk Model Toggle", "Массовое включение и отключение моделей выбранного провайдера.", "Требует подключения интерфейса"),
              ModuleRow(ui, "MCP-GUI", "Добавление, редактирование, отключение и удаление MCP-серверов.", "Требует подключения интерфейса"),
              ModuleRow(ui, "Custom Providers", "Добавление и управление пользовательскими API-провайдерами.", "Интеграция исходного проекта в процессе"),
            ];
          },
        }),
        createComponent(ui.SettingsSection, {
          title: "О проекте",
          get children() {
            return [
              createComponent(ui.SettingsRow, {
                title: "Версия",
                description: "0.2.2",
              }),
              createComponent(ui.SettingsRow, {
                title: "Авторство Custom Providers",
                description: "Based on opencode-custom-provider by MoGLCL / MoGlitch (MIT License).",
              }),
              createComponent(ui.SettingsRow, {
                title: "GitHub",
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
  i18n: { en: {}, ru: {} },
  setup(ctx) {
    ctx.add(SettingsPage, () => ({
      id: "toolbox",
      title: "OpenCode Toolbox",
      icon: "outline-sliders",
      entries: [
        { id: "toolbox-modules", title: "Модули", description: "Управление модулями OpenCode Toolbox", keywords: "toolbox modules" },
      ],
      render: () => ToolboxPage(ctx),
    }));
    ctx.add(Command, () => ({
      id: "open-settings",
      title: "Open OpenCode Toolbox",
      description: "Open Toolbox settings",
      keywords: "toolbox modules settings",
      group: "Settings",
      section: "navigation",
      slash: { name: "toolbox" },
      run: () => ctx.layout.settings("toolbox"),
    }));
  },
});
