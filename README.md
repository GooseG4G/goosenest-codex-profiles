# Codex Profiles

Codex Profiles is a VS Code extension for tracking and switching local Codex `auth.json` profiles from the secondary sidebar.

## Features

- Automatically saves the current `~/.codex/auth.json` as a profile.
- Keeps the active profile at the top and identifies it by email or `account_id`.
- Preserves the freshest saved credentials using `last_refresh` and file modification time.
- Watches `auth.json` for account sign-ins and token refreshes.
- Adds another account without revoking the saved session.
- Restores the previous account when adding a profile is cancelled.
- Supports profile search and deletion of inactive profiles.
- Creates `auth.json.bak` before switching profiles.
- Reloads the VS Code window immediately after a profile switch.

Profile files are stored in the extension's private storage. Authentication contents are never sent to the webview.

## Requirements

To use the extension:

- VS Code 1.106 or newer;
- the official Codex extension for the add-profile sign-in flow.

To build from source:

- Node.js `^20.19.0` or `>=22.12.0`;
- npm;
- Git when cloning the repository.

The build scripts use the repository's locked dependencies, including the local `@vscode/vsce` package. A global `vsce` installation is not required.

## Install a VSIX

### From VS Code

1. Open the Command Palette.
2. Run `Extensions: Install from VSIX...`.
3. Select `codex-profiles-<version>.vsix`.
4. Run `Developer: Reload Window` if VS Code does not reload automatically.

### From the command line

```shell
code --install-extension ./codex-profiles-<version>.vsix --force
```

Reload the VS Code window after installation. Extensions installed from a VSIX do not receive Marketplace updates automatically.

## Build from source

Clone the repository and enter its directory:

```shell
git clone https://github.com/GooseG4G/goosenest-codex-profiles.git
cd goosenest-codex-profiles
```

### Windows

Run from PowerShell:

```powershell
./build.ps1
```

### macOS and Linux

```shell
./build.sh
```

Each script performs the complete reproducible build:

1. installs dependencies with `npm ci`;
2. validates Vue and TypeScript with `vue-tsc`;
3. builds the webview with Vite;
4. packages the extension with `vsce`.

Generated files are kept under the ignored `build/` directory:

```text
build/
├── dist/
│   ├── codex-profiles.css
│   └── webview.js
└── codex-profiles-<version>.vsix
```

Install the resulting package directly:

```shell
code --install-extension ./build/codex-profiles-<version>.vsix --force
```

## Development

Open the repository in VS Code and press `F5` to launch an Extension Development Host. For individual checks, use:

```shell
npm run check
npm run build
```
