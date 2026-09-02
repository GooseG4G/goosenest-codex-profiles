
const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

function activate(context) {
  const disposable = vscode.commands.registerCommand('goosenestCodexSwitch.switchProfile', async () => {
    const switchConfig = (
      vscode.workspace
        .getConfiguration('goosenestCodexSwitch')
    );

    const codexHome = switchConfig.get('codexHome');

    const codexProfiles = [
      { label: 'Default', file: 'config.default.toml' },
      { label: 'RouterCheap', file: 'config.routercheap.toml' }
    ];

    const codexProfile = await (
      vscode.window.showQuickPick(
        codexProfiles,
        { placeHolder: 'Select a Codex profile' }
      )
    );

    if (!codexProfile) {
      return null;
    }

    const source = path.join(codexHome, codexProfile.file);
    const target = path.join(codexHome, 'config.toml');

    if (!fs.existsSync(source)) {
      await (
        vscode.window
          .showErrorMessage(`Profile file not found: ${source}`)
      );

      return null;;
    }

    fs.copyFileSync(target, `${target}.bak`);
    fs.copyFileSync(source, target);

    const reload = await vscode.window.showInformationMessage(
      `Codex profile switched to ${codexProfile.label}. ` +
      'Reload the VS Code window to apply it.',
      'Reload Window'
    );

    if (reload === 'Reload Window') {
      await (
        vscode.commands
          .executeCommand('workbench.action.reloadWindow')
      );
    }
  });
  
  context.subscriptions.push(disposable);
}

function deactivate() { }
module.exports = { activate, deactivate };
