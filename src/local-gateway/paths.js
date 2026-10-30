const os = require('os');
const path = require('path');

function getCodexRoot() {
  return process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
}

function createGatewayPaths(codexRoot = getCodexRoot()) {
  const profilesRoot = path.join(codexRoot, 'profiles');
  return {
    codexRoot,
    profilesRoot,
    accountsRoot: path.join(profilesRoot, 'accounts'),
    providersRoot: path.join(profilesRoot, 'providers'),
    runtimeRoot: path.join(profilesRoot, '.runtime'),
    indexPath: path.join(profilesRoot, 'index.json'),
    runtimePath: path.join(profilesRoot, '.runtime', 'daemon.json'),
    launchLockPath: path.join(profilesRoot, '.runtime', 'launch'),
    envPath: path.join(codexRoot, '.env'),
    configPath: path.join(codexRoot, 'config.toml'),
  };
}

function safeId(value) {
  const id = String(value || '');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id)) {
    throw new Error('Invalid profile identifier.');
  }
  return id;
}

function accountHome(paths, id) {
  return path.join(paths.accountsRoot, safeId(id));
}

function providerHome(paths, id) {
  return path.join(paths.providersRoot, safeId(id));
}

module.exports = {
  accountHome,
  createGatewayPaths,
  getCodexRoot,
  providerHome,
  safeId,
};
