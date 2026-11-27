# Changelog

## 0.2.15

- Добавлен общий файл настроек `opencode-toolbox.json`, читаемый серверным плагином и записываемый GUI main process.
- В интерфейсе реализованы переключатели модулей, Provider Disabler для обнаруженных провайдеров и Bulk Model Toggle для всех моделей выбранного провайдера.
- Серверные provider/model transforms всегда зарегистрированы и читают настройки при каждом применении; выключенные модули не меняют каталог.
- Обновлены README, версия интерфейса и package metadata.



## 0.2.14

- CI workflow теперь запускает `npm test` после синтаксической проверки.
- Обновлены версия, README и CHANGELOG.



## 0.2.13

- Добавлены unit-тесты серверных трансформаций Provider Disabler и Bulk Model Toggle.
- Добавлен отдельный скрипт `npm test` на встроенном Node.js test runner.
- Обновлены версия, README и CHANGELOG.



## 0.2.12

- Исправлены уведомления MCP-GUI: используется документированный `ctx.toast.show`.
- Устранён конфликт двух механизмов управления MCP: MCP-GUI остаётся единственным источником флага `mcp.servers[*].disabled`; серверная трансформация больше не перезаписывает настройки интерфейса.
- Обновлены версия в интерфейсе, серверном логе, README и package metadata.



## 0.2.11 — MCP config watcher

- Refresh MCP-GUI state when the OpenCode config file changes outside the plugin.
- Keep package, README and changelog version metadata synchronized.
