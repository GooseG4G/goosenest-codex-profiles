# Codex Profiles

Codex Profiles is a local Codex account switcher for VS Code. Manage multiple `auth.json` profiles, inspect usage limits, and configure OpenAI-compatible providers from one sidebar.

OpenAI account switches keep the shared Codex home and chat history intact. Authentication snapshots stay local, refreshed tokens are preserved, and account limits come from the official Codex app-server.

## Highlights

- Switch OpenAI accounts while keeping one shared Codex home and chat history.
- Add accounts through the official Codex sign-in flow without logging out saved sessions.
- Add custom OpenAI-compatible providers with a base URL and token.
- See remaining 5-hour, weekly, and other usage windows for OpenAI accounts.
- Keep refreshed access and refresh tokens instead of restoring stale snapshots.
- Search profiles and remove inactive entries from a compact sidebar view.
- Use colors and controls from the active VS Code theme.

## Quick Start

1. Install the official OpenAI Codex extension and sign in to an account.
2. Install Codex Profiles.
3. Open **Codex Profiles** in the VS Code secondary sidebar.
4. Use **Add profile** to sign in to another OpenAI account, or **Add provider** to configure an OpenAI-compatible endpoint.
5. Select an inactive profile and confirm **Switch**.

Codex Profiles restarts the Extension Host after authentication changes. The VS Code window itself stays open.

## Usage Limits

Expand an OpenAI profile to view every rate-limit window returned by Codex. Common windows are displayed as **5-hour usage limit** and **Weekly usage limit**.

- The active OpenAI profile is refreshed at most once per minute.
- An expanded inactive OpenAI profile is also refreshed at most once per minute.
- Closed inactive profiles are not polled.
- Routine refreshes are quiet. A subtle shimmer appears only while genuinely stale data is being refreshed.
- Custom providers are not queried for OpenAI account limits.

Inactive checks run sequentially through one isolated temporary Codex home. This avoids parallel token refreshes and keeps polling cost independent of the total number of saved profiles.

## Install

### Visual Studio Marketplace

Search for **Codex Profiles** in the Extensions view, or install it by extension ID:

```shell
code --install-extension goosenest.codex-profiles
```

[Open Codex Profiles in the Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=goosenest.codex-profiles)

### GitHub Release

Download `codex-profiles-<version>.vsix` from the [latest GitHub release](https://github.com/GooseG4G/goosenest-codex-profiles/releases/latest), then run:

```shell
code --install-extension ./codex-profiles-<version>.vsix --force
```

VSIX installations do not receive Marketplace updates automatically.

## Profiles And Providers

### OpenAI Accounts

The extension identifies an account by its Codex account ID or email and stores a local snapshot of its `auth.json`. Before switching away, it synchronizes the latest active credentials. Before replacing authentication, it creates `auth.json.bak`.

### OpenAI-Compatible Providers

Provider profiles store a display name, base URL, and environment-variable key. Tokens entered in the provider form are written to the managed local Codex environment file. Provider changes are applied to `config.toml`, with `config.toml.bak` created before replacement.

Codex may keep custom-provider conversations in a provider-specific history group. The shared-history guarantee applies to OpenAI account profiles using the same OpenAI provider.

## Storage And Privacy

All profile data stays on the local machine.

- Profile metadata is stored in VS Code global extension storage.
- OpenAI authentication snapshots are stored as private local files and are never sent to the webview.
- Provider tokens are stored locally in the managed Codex environment file.
- Temporary inactive-profile checks use `%TEMP%/goosenest-codex-profiles` on Windows or the platform-equivalent temporary directory.
- Temporary `auth.json` files are removed after each check.
- Scratch homes are removed on a clean shutdown; a startup cleaner removes homes whose owning process no longer exists.

The active Codex authentication is shared by VS Code windows that use the same `CODEX_HOME`. Switching in one window therefore changes the account used by other windows on the same Codex home.

## Requirements

- VS Code 1.106 or newer.
- The official OpenAI Codex extension installed locally.
- A working Codex sign-in for OpenAI account profiles.

## Configuration

### `codexProfiles.codexHome`

Overrides the Codex home directory. When empty, Codex Profiles uses `~/.codex`.

## Build From Source

Building requires Node.js `^20.19.0` or `>=22.12.0`, npm, and Git.

```shell
git clone https://github.com/GooseG4G/goosenest-codex-profiles.git
cd goosenest-codex-profiles
npm ci
npm run check
npm run build
npm run package
```

The platform scripts `build.ps1` and `build.sh` run the same checked build and place their output under `build/`.

## Development

Open the repository in VS Code and press `F5` to launch an Extension Development Host. Individual checks are available through:

```shell
npm run check
npm run build
npm run package
```

## Disclaimer

Codex Profiles is an independent community extension. It is not affiliated with or endorsed by OpenAI or Microsoft.
