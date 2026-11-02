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

function shardedHome(root, id) {
  const profileId = safeId(id);
  return path.join(root, profileId.slice(0, 2), profileId.slice(2, 4), profileId);
}

function accountHome(paths, id) {
  return shardedHome(paths.accountsRoot, id);
}

function providerHome(paths, id) {
  return shardedHome(paths.providersRoot, id);
}

function isShardedRootEntry(root, id) {
  let target;
  try {
    target = shardedHome(root, id);
  } catch {
    return false;
  }
  const relative = path.relative(root, target).split(path.sep).filter(Boolean);
  return relative[0] === id && relative.length >= 2;
}

function legacyHome(root, id) {
  return path.join(root, safeId(id));
}

module.exports = {
  accountHome,
  createGatewayPaths,
  getCodexRoot,
  legacyHome,
  providerHome,
  safeId,
  shardedHome,
  isShardedRootEntry,
};
