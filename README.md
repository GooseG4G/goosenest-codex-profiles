# Codex Profiles

Manage multiple Codex accounts and OpenAI-compatible providers directly from VS Code. Switch the active account, compare usage limits, and keep one shared Codex history.

Codex Profiles stores account snapshots locally and switches the authentication used by the official Codex extension. It preserves refreshed credentials and restarts only the Extension Host, so the VS Code window stays open.

![Codex Profiles sidebar](images/preview.png)

## Why Codex Profiles

Codex normally reads one active sign-in from `CODEX_HOME`. Using a separate home for every account also separates conversation history and other Codex state.

Codex Profiles keeps one shared home and stores authentication separately for each account. Switching changes the active credentials without moving the rest of the Codex data.

## Features

- switch between saved Codex accounts from the VS Code secondary sidebar;
- add another account through the official Codex sign-in flow;
- preserve refreshed access and refresh tokens when leaving or checking an account;
- view remaining 5-hour, weekly, and other usage windows reported by Codex;
- configure OpenAI-compatible providers with a name, base URL, and token;
- search profiles and clearly identify the active account;
- create backups before replacing active authentication or provider configuration;
- follow the colors and interaction states of the active VS Code theme.

## Getting Started

1. Install the official OpenAI Codex extension and sign in.
2. Install **Codex Profiles** from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=goosenest.codex-profiles), or run:

   ```shell
   code --install-extension goosenest.codex-profiles
   ```

3. Open **Codex Profiles** in the VS Code secondary sidebar.
4. Select **Add profile** and confirm the Extension Host restart.
5. Open Codex, complete the normal sign-in, and return to the profile list.
6. Select any saved account to switch to it.

You can also use **Add provider** to configure an OpenAI-compatible endpoint instead of another OpenAI account.

## Switching Accounts

Before a switch, Codex Profiles synchronizes the latest credentials for the account you are leaving. It then replaces the active authentication with the selected snapshot and restarts the Extension Host so Codex reads the change.

The VS Code window, editors, and workspace remain open. Codex continues to use the same home and conversation history.

If a usage check is currently refreshing credentials for either account, the switch waits for that check to finish instead of overwriting newer authentication data.

## Usage Limits

Expand an OpenAI account to see every usage window returned by Codex, including the common **5-hour usage limit** and **Weekly usage limit**.

- the active account refreshes at most once per minute;
- an expanded inactive account also refreshes at most once per minute;
- closed inactive accounts are not polled;
- inactive checks run one at a time through a temporary isolated Codex home;
- a shimmer appears only when displayed data is stale and a refresh is actually running;
- provider profiles do not request OpenAI account limits.

## OpenAI-Compatible Providers

A provider profile contains a display name, base URL, and access token. Activating it updates the Codex provider configuration and restarts the Extension Host, just like an account switch.

Provider tokens are written to the local Codex environment file rather than exposed to the webview. Managed provider entries are removed when their profile is deleted.

Codex may group custom-provider conversations differently. The shared-history behavior described above applies to OpenAI accounts using the same OpenAI provider.

## Local Storage And Safety

Codex Profiles has no remote service or telemetry of its own. Usage checks are performed through the locally installed Codex app-server.

- profile metadata is stored in VS Code global extension storage;
- account credentials are stored as private local snapshots and are never sent to the sidebar webview;
- the current `auth.json` is backed up as `auth.json.bak` before a switch;
- provider changes back up `config.toml` as `config.toml.bak`;
- temporary account checks remove their copied `auth.json` after use;
- temporary homes are cleaned on shutdown and again on startup when their owning process no longer exists.

VS Code windows using the same `CODEX_HOME` also use the same active Codex authentication. Switching in one of those windows therefore changes the account used by the others.

## Install From A VSIX

Download `codex-profiles-<version>.vsix` from the [latest GitHub release](https://github.com/GooseG4G/goosenest-codex-profiles/releases/latest), then run:

```shell
code --install-extension ./codex-profiles-<version>.vsix --force
```

VSIX installations do not receive automatic Marketplace updates.

## Requirements

- VS Code 1.106 or newer;
- the official OpenAI Codex extension installed in the same VS Code environment;
- an existing Codex sign-in for the first OpenAI account.

## Configuration

### `codexProfiles.codexHome`

Overrides the Codex home directory. When empty, Codex Profiles uses `~/.codex`.

## Development

Building requires Node.js `^20.19.0` or `>=22.12.0`, npm, and Git.

```shell
git clone https://github.com/GooseG4G/goosenest-codex-profiles.git
cd goosenest-codex-profiles
npm ci
npm run check
npm run build
npm run package
```

Open the repository in VS Code and press `F5` to launch an Extension Development Host. The platform scripts `build.ps1` and `build.sh` run the same checked build and place their output under `build/`.

## Disclaimer

Codex Profiles is an independent community extension. It is not affiliated with or endorsed by OpenAI or Microsoft.
