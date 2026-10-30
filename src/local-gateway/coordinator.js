const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');
const { appendProviderConfig, formatTomlFile, upsertEnvValue } = require('../provider-config');
const { writeAtomic } = require('./registry');

const LOCAL_PROVIDER_ID = 'codex_profiles';
const LOCAL_TOKEN_ENV = 'CODEX_PROFILES_LOCAL_TOKEN';

async function readRuntime(paths) {
  try {
    const value = JSON.parse(await fs.promises.readFile(paths.runtimePath, 'utf8'));
    if (!Number.isInteger(value.port) || typeof value.token !== 'string') return null;
    return value;
  } catch {
    return null;
  }
}

async function isHealthy(runtime) {
  if (!runtime) return false;
  try {
    const response = await fetch(`http://127.0.0.1:${runtime.port}/health`, {
      headers: { authorization: `Bearer ${runtime.token}` },
      signal: AbortSignal.timeout(1_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForDaemon(paths, startedAfter, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const runtime = await readRuntime(paths);
    const startedAt = Date.parse(runtime?.startedAt || '');
    if (runtime && (!Number.isFinite(startedAt) || startedAt >= startedAfter) && await isHealthy(runtime)) return runtime;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Local Codex Profiles gateway did not start.');
}

async function ensureDaemon(paths) {
  await fs.promises.mkdir(paths.runtimeRoot, { recursive: true });
  await fs.promises.writeFile(paths.launchLockPath, '', { flag: 'a', mode: 0o600 });
  const release = await lockfile.lock(paths.launchLockPath, {
    realpath: false,
    stale: 30_000,
    update: 10_000,
    retries: { retries: 60, factor: 1.15, minTimeout: 25, maxTimeout: 250, randomize: true },
  });
  try {
    const current = await readRuntime(paths);
    if (await isHealthy(current)) return current;
    const daemonToken = crypto.randomBytes(32).toString('base64url');
    const daemonPath = path.join(__dirname, 'daemon.js');
    const startedAfter = Date.now() - 1_000;
    const child = spawn(process.execPath, [daemonPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        CODEX_ROOT: paths.codexRoot,
        CODEX_PROFILES_DAEMON_TOKEN: daemonToken,
      },
    });
    child.unref();
    return await waitForDaemon(paths, startedAfter);
  } finally {
    await release();
  }
}

async function ensureLocalProviderConfig(paths, runtime) {
  await fs.promises.mkdir(paths.codexRoot, { recursive: true });
  await Promise.all([
    fs.promises.writeFile(paths.configPath, '', { flag: 'a' }),
    fs.promises.writeFile(paths.envPath, '', { flag: 'a', mode: 0o600 }),
  ]);
  const release = await lockfile.lock(paths.configPath, {
    realpath: false,
    stale: 30_000,
    update: 10_000,
    retries: { retries: 30, factor: 1.2, minTimeout: 20, maxTimeout: 250, randomize: true },
  });
  try {
    const [config, env] = await Promise.all([
      fs.promises.readFile(paths.configPath, 'utf8'),
      fs.promises.readFile(paths.envPath, 'utf8'),
    ]);
    const nextConfig = appendProviderConfig(config, {
      provider: LOCAL_PROVIDER_ID,
      name: 'Codex Profiles',
      baseUrl: `http://127.0.0.1:${runtime.port}/v1`,
      envKey: LOCAL_TOKEN_ENV,
    });
    const nextEnv = upsertEnvValue(env, LOCAL_TOKEN_ENV, runtime.token);
    if (formatTomlFile(config) !== nextConfig) await writeAtomic(paths.configPath, nextConfig);
    if (env !== nextEnv) await writeAtomic(paths.envPath, nextEnv);
  } finally {
    await release();
  }
}

async function ensureLocalGateway(paths) {
  const runtime = await ensureDaemon(paths);
  await ensureLocalProviderConfig(paths, runtime);
  return runtime;
}

module.exports = {
  LOCAL_PROVIDER_ID,
  LOCAL_TOKEN_ENV,
  ensureDaemon,
  ensureLocalGateway,
  ensureLocalProviderConfig,
  isHealthy,
  readRuntime,
};
