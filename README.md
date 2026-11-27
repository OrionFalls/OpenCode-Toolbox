# OpenCode Toolbox

**Модульный набор расширений для OpenCode Desktop.**

Версия: **0.2.5**.

Toolbox развивается как единый плагин. Серверная часть использует официальный OpenCode Plugin API, интерфейс — Desktop GUI API. Модули проектируются независимо; их состояние хранится в plugin-scoped storage.

## Модули

| Модуль | Назначение | Состояние |
| --- | --- | --- |
| True Model Disabler | Блокирует вызовы моделей, скрытых штатными настройками OpenCode, включая вызовы субагентов. | Серверная защита перенесена; требуется runtime-проверка |
| Provider Disabler | Временно отключает провайдеры без удаления ключей и моделей. | Transform подготовлен; UI-переключатель ещё не подключён |
| Bulk Model Toggle | Массово включает/отключает модели провайдера с сохранением overrides. | Постоянный transform зарегистрирован при включённом модуле; UI-кнопки ещё не подключены |
| MCP-GUI | Создание, редактирование, отключение и удаление MCP-серверов. | Policy transform подготовлен; полноценный GUI ещё не подключён |
| Custom Providers | Управление пользовательскими API-провайдерами и моделями. | Исходный GUI сохранён в vendor; интеграция в Toolbox ещё не завершена |

## Совместимость

- OpenCode Desktop с поддержкой GUI-плагинов.
- OpenCode Plugin API V2.
- Node.js 20+ для проверки синтаксиса; серверная среда OpenCode предоставляет Bun.
- Windows PowerShell 5.1+ для установщика.

## Установка и обновление на Windows

```powershell
irm https://raw.githubusercontent.com/OrionFalls/OpenCode-Toolbox/main/install.ps1 | iex
```

Повторный запуск проверяет наличие обновления и устанавливает актуальную опубликованную версию. После обновления полностью перезапустите OpenCode Desktop.

## Проверка

```bash
npm run check
```

Проверка проверяет синтаксис JavaScript-файлов. Она не заменяет тестирование внутри OpenCode Desktop.

## Архитектурные правила

- Настройки модулей хранятся в plugin-scoped storage OpenCode.
- Модели не удаляются из каталога ради имитации запрета.
- Bulk Model Toggle хранит overrides по ID провайдера и модели и повторно применяет их при перестроении каталога.
- Отключение провайдера не должно удалять его настройки, API-ключи и модели.
- MCP отключается через флаг `disabled`; удаление — отдельное явное действие.
- Каждое изменение версии сопровождается обновлением README и CHANGELOG.

## Заимствованный код и авторство

Исходный интерфейс **Custom Providers** основан на проекте [MoGLCL/opencode-custom-provider](https://github.com/MoGLCL/opencode-custom-provider), автор MoGlitch. Исходный GUI сохранён в `vendor/custom-provider/gui-experimental.cjs`; оригинальный текст лицензии MIT находится в `vendor/custom-provider/LICENSE`. При интеграции сохраняются уведомления об авторских правах и атрибуция в интерфейсе.

## License

Основной код OpenCode Toolbox распространяется по лицензии репозитория. Заимствованный Custom Providers — MIT, copyright MoGlitch.
