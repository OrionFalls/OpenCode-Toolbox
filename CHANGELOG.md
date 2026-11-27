# Changelog

## 0.2.12

- Исправлены уведомления MCP-GUI: используется документированный `ctx.toast.show`.
- Устранён конфликт двух механизмов управления MCP: MCP-GUI остаётся единственным источником флага `mcp.servers[*].disabled`; серверная трансформация больше не перезаписывает настройки интерфейса.
- Обновлены версия в интерфейсе, серверном логе, README и package metadata.



## 0.2.11 — MCP config watcher

- Refresh MCP-GUI state when the OpenCode config file changes outside the plugin.
- Keep package, README and changelog version metadata synchronized.
