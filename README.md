# Goosenest Codex Switch

Расширение VS Code для переключения профилей Codex.

## Запуск

1. Откройте эту папку в VS Code.
2. Нажмите `F5` (Extension Development Host).
3. В палитре команд запустите `Codex: Switch Profile`.

Расширение копирует выбранный профиль в `.codex/config.toml`, предварительно сохраняя текущий файл как `config.toml.bak`.

Профили:

- `config.deafult.toml` — Default (сохранено исходное имя файла в `.codex`);
- `config.routercheap.toml` — Router.

Сейчас оба файла указывают на `cheaprouter`; для профиля OpenAI создайте отдельный TOML с настройками OpenAI и добавьте его в массив `profiles` в `extension.js`.
