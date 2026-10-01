# Codex Profiles

VS Code extension for automatically tracking and switching Codex `auth.json` profiles.

- opens from the secondary sidebar;
- automatically saves the current `~/.codex/auth.json` as a profile;
- preserves the freshest saved credentials using `last_refresh` and file modification time;
- keeps the active profile at the top of the table;
- uses the account email or `account_id` as its label;
- supports profile search and deletion of inactive profiles;
- creates `auth.json.bak` before switching;
- reloads the VS Code window immediately after switching.

Profile files are stored in the extension's private storage. Authentication contents are never sent to the webview.

## Development

```powershell
./build.ps1
```

On macOS or Linux, run `./build.sh`. Both scripts install dependencies from the lockfile, validate the Vue and TypeScript sources, rebuild `build/dist/`, and write the packaged extension to `build/codex-profiles-<version>.vsix`.

Open the project in VS Code and press `F5`. VS Code 1.106 or newer is required.
