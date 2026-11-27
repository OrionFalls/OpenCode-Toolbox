# OpenCode Toolbox

**Модульный набор расширений для OpenCode Desktop.**

Версия: **0.2.10**.

Toolbox поставляется как единый плагин: серверная часть и GUI Desktop используют общую идентичность плагина. В GUI доступны отдельные страницы Toolbox, MCP-GUI и Custom Providers.

## Модули

| Модуль | Назначение | Состояние |
| --- | --- | --- |
| True Model Disabler | Блокирует вызовы моделей, скрытых штатными настройками OpenCode, включая вызовы субагентов. | Серверная защита перенесена; требуется runtime-проверка |
| Provider Disabler | Временно отключает провайдеры без удаления ключей и моделей. | Серверная трансформация подготовлена; UI-переключатель не подключён |
| Bulk Model Toggle | Массово включает/отключает модели провайдера с сохранением overrides. | Постоянная трансформация зарегистрирована; UI-кнопки не подключены |
| MCP-GUI | Создание, редактирование, отключение и удаление MCP-серверов. | GUI интегрирован: local/remote, mcp.servers, disabled и удаление |
| Custom Providers | Управление кастомными API-провайдерами и моделями. | **GUI интегрирован** как страница OpenCode Toolbox |

## Установка и обновление на Windows

```powershell
irm https://raw.githubusercontent.com/OrionFalls/OpenCode-Toolbox/main/install.ps1 | iex
```

Повторный запуск проверяет наличие обновления и устанавливает актуальную опубликованную версию. После обновления полностью перезапустите OpenCode Desktop.

## Проверка

```bash
npm run check
```

Проверка синтаксиса не заменяет тестирование внутри OpenCode Desktop.

## Архитектурные ограничения

Публичный OpenCode GUI SDK позволяет добавлять собственные SettingsPage, Commands, Panels и IPC между GUI-окнами и Electron main process. Он не документирует точки расширения для встраивания контролов внутрь нативных вкладок Providers и Models. Поэтому соответствующие функции не маскируются под встроенные элементы: до появления поддерживаемого API они будут размещаться на собственных страницах Toolbox.

## Заимствованный код и авторство

Страница **Custom Providers** интегрирована из проекта [MoGLCL/opencode-custom-provider](https://github.com/MoGLCL/opencode-custom-provider), автор MoGlitch, upstream version 1.3.0. Сохранены исходный код, уведомления об авторских правах и MIT License в `vendor/custom-provider/LICENSE`. Интерфейс Toolbox также указывает авторство MoGlitch.

## License

Основной код OpenCode Toolbox распространяется по лицензии репозитория. Заимствованный Custom Providers — MIT, copyright MoGlitch.
