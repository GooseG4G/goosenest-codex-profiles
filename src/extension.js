const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vscode = require('vscode');

const VIEW_ID = 'codexProfiles.profilesView';
const AUTH_READ_RETRY_COUNT = 5;
const AUTH_READ_RETRY_DELAY_MS = 250;
const DEFAULT_KIND = 'default';
const PROVIDER_KIND = 'provider';
const ACTIVE_USAGE_INTERVAL_MS = 60 * 1000;
const MIN_USAGE_REQUEST_INTERVAL_MS = 60 * 1000;
const USAGE_REQUEST_TIMEOUT_MS = 20 * 1000;
const SCRATCH_ROOT = path.join(os.tmpdir(), 'goosenest-codex-profiles');
const ORPHAN_SCRATCH_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

async function cleanOrphanedScratchHomes(now = Date.now()) {
  await fs.promises.mkdir(SCRATCH_ROOT, { recursive: true });
  const entries = await fs.promises.readdir(SCRATCH_ROOT, { withFileTypes: true });
  await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    const scratchHome = path.join(SCRATCH_ROOT, entry.name);
    try {
      const ownerContents = await fs.promises.readFile(path.join(scratchHome, '.owner.json'), 'utf8')
        .catch(() => fs.promises.readFile(path.join(scratchHome, 'owner.json'), 'utf8'));
      const owner = JSON.parse(ownerContents);
      if (owner.pid !== process.pid && !isProcessAlive(owner.pid)) {
        await fs.promises.rm(scratchHome, { recursive: true, force: true });
      }
    } catch {
      const stat = await fs.promises.stat(scratchHome).catch(() => null);
      if (stat && now - stat.mtimeMs >= ORPHAN_SCRATCH_MAX_AGE_MS) {
        await fs.promises.rm(scratchHome, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  }));
}

function getCodexHome() {
  const configured = vscode.workspace.getConfiguration('codexProfiles').get('codexHome', '');
  return configured.trim() || path.join(os.homedir(), '.codex');
}

function createProfileId(name) {
  const slug = name.trim().toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return `${slug || 'profile'}-${crypto.randomBytes(4).toString('hex')}`;
}

function createProviderSlug(name) {
  return name.trim().toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'provider';
}

function createEnvKey(name) {
  const key = name.trim().toUpperCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');
  return `${key || 'PROVIDER'}_ACCESS_TOKEN`;
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function normalizeTomlSpacing(contents) {
  return contents
    .replace(/^(?:[ \t]*\r?\n)+/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

function formatTomlFile(contents) {
  const normalized = normalizeTomlSpacing(contents);
  return normalized ? `${normalized}\n` : '';
}

function stripManagedProviderConfig(contents, providers) {
  const providerSet = new Set(providers.filter(Boolean));
  const lines = contents.split(/\r?\n/);
  const output = [];
  let skippingProvider = false;
  let inRootTable = true;

  for (const line of lines) {
    const tableMatch = line.match(/^\s*\[([^\]]+)]\s*$/);
    if (tableMatch) {
      inRootTable = false;
      const providerMatch = tableMatch[1].match(/^model_providers\.([^\].]+)(?:\.|$)/);
      skippingProvider = providerMatch ? providerSet.has(providerMatch[1]) : false;
      if (skippingProvider) continue;
    }
    if (skippingProvider) continue;
    if (inRootTable && /^\s*model_provider\s*=/.test(line)) continue;
    output.push(line);
  }

  return normalizeTomlSpacing(output.join('\n'));
}

function appendProviderConfig(contents, profile) {
  const base = stripManagedProviderConfig(contents, [profile.provider]);
  const providerBlock = [
    `[model_providers.${profile.provider}]`,
    `name = ${tomlString(profile.name)}`,
    `base_url = ${tomlString(profile.baseUrl)}`,
    `env_key = ${tomlString(profile.envKey)}`,
    'wire_api = "responses"',
  ].join('\n');
  const rootProvider = `model_provider = ${tomlString(profile.provider)}`;
  return formatTomlFile(`${rootProvider}\n\n${base ? `${base}\n\n` : ''}${providerBlock}`);
}

function readRootModelProvider(contents) {
  for (const line of contents.split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) return null;
    const match = line.match(/^\s*model_provider\s*=\s*(['"])(.*?)\1\s*(?:#.*)?$/);
    if (match) return match[2];
  }
  return null;
}

function upsertEnvValue(contents, key, value) {
  const lines = contents.split(/\r?\n/);
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^\\s*(?:export\\s+)?${escaped}\\s*=`);
  let replaced = false;
  const nextLines = lines.map((line) => {
    if (!pattern.test(line)) return line;
    replaced = true;
    return `${key}=${value}`;
  });
  if (!replaced) nextLines.push(`${key}=${value}`);
  return `${nextLines.filter((line, index) => line || index < nextLines.length - 1).join('\n').trimEnd()}\n`;
}

function removeEnvValue(contents, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^\\s*(?:export\\s+)?${escaped}\\s*=`);
  return `${contents.split(/\r?\n/).filter((line) => !pattern.test(line)).join('\n').trimEnd()}\n`;
}

function getProfileInfo(contents, fallback) {
  try {
    const auth = JSON.parse(contents);
    const candidates = [auth.email, auth.account_email, auth.user?.email, auth.tokens?.email];
    const token = auth.tokens?.id_token || auth.id_token;
    if (typeof token === 'string') {
      const payload = token.split('.')[1];
      if (payload) {
        const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        candidates.unshift(claims.email, claims['https://api.openai.com/profile']?.email);
      }
    }
    const email = candidates.find((value) => typeof value === 'string' && value.includes('@'));
    const accountId = auth.tokens?.account_id || auth.account_id;
    const normalizedAccountId = typeof accountId === 'string' && accountId ? accountId : null;
    const normalizedEmail = email ? email.toLocaleLowerCase() : null;
    if (normalizedAccountId || normalizedEmail) {
      return {
        name: email || normalizedAccountId,
        identity: normalizedAccountId ? `account:${normalizedAccountId}` : `email:${normalizedEmail}`,
        accountId: normalizedAccountId,
        email: normalizedEmail,
      };
    }
  } catch {
    // The profile is still tracked by its content hash; no secret is exposed to the webview.
  }
  return { name: fallback, identity: null, accountId: null, email: null };
}

function findProfile(profiles, info, fingerprint) {
  const authProfiles = profiles.filter((profile) => (profile.kind || DEFAULT_KIND) === DEFAULT_KIND);
  if (info.accountId) {
    const accountMatch = authProfiles.find((profile) =>
      profile.accountId === info.accountId || profile.identity === `account:${info.accountId}`
    );
    if (accountMatch) return accountMatch;
  }
  if (info.email) {
    const emailMatch = authProfiles.find((profile) =>
      (!info.accountId || !profile.accountId)
      && (profile.email === info.email || profile.identity === `email:${info.email}`)
    );
    if (emailMatch) return emailMatch;
  }
  return authProfiles.find((profile) => profile.fingerprint === fingerprint);
}

function getAuthFreshness(contents, modifiedAt) {
  try {
    const parsed = JSON.parse(contents);
    const refreshAt = typeof parsed.last_refresh === 'string' ? Date.parse(parsed.last_refresh) : NaN;
    return { refreshAt: Number.isFinite(refreshAt) ? refreshAt : null, modifiedAt };
  } catch {
    return { refreshAt: null, modifiedAt };
  }
}

function compareFreshness(left, right) {
  if (left.refreshAt !== null && right.refreshAt !== null && left.refreshAt !== right.refreshAt) {
    return left.refreshAt - right.refreshAt;
  }
  if (left.refreshAt !== null && right.refreshAt === null) return 1;
  if (left.refreshAt === null && right.refreshAt !== null) return -1;
  return left.modifiedAt - right.modifiedAt;
}

async function exists(filePath) {
  try { await fs.promises.access(filePath); return true; } catch { return false; }
}

async function copyAtomic(source, target) {
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.tmp`);
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  try {
    await fs.promises.copyFile(source, temporary);
    await fs.promises.copyFile(temporary, target);
  } finally {
    await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
  }
}

async function writeAtomic(target, contents) {
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`,
  );
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  try {
    await fs.promises.writeFile(temporary, contents, { mode: 0o600 });
    await fs.promises.copyFile(temporary, target);
  } finally {
    await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
  }
}

let codexExecutablePromise;

async function findCodexExecutable() {
  if (!codexExecutablePromise) {
    codexExecutablePromise = (async () => {
      const extensionPath = vscode.extensions.getExtension('openai.chatgpt')?.extensionPath;
      if (extensionPath) {
        const binPath = path.join(extensionPath, 'bin');
        try {
          for (const entry of await fs.promises.readdir(binPath, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            const executable = path.join(binPath, entry.name, process.platform === 'win32' ? 'codex.exe' : 'codex');
            if (await exists(executable)) return executable;
          }
        } catch {
          // Fall back to PATH when the OpenAI extension layout changes.
        }
      }

      const executableName = process.platform === 'win32' ? 'codex.exe' : 'codex';
      for (const directory of String(process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
        const executable = path.join(directory.replace(/^"|"$/g, ''), executableName);
        if (await exists(executable)) return executable;
      }
      throw new Error('Codex executable was not found.');
    })();
  }
  return codexExecutablePromise;
}

function normalizeRateLimitWindow(window) {
  if (!window || !Number.isFinite(window.usedPercent)) return null;
  return {
    usedPercent: Math.max(0, Math.min(100, Math.round(window.usedPercent))),
    windowDurationMins: Number.isFinite(window.windowDurationMins) ? window.windowDurationMins : null,
    resetsAt: Number.isFinite(window.resetsAt) ? window.resetsAt : null,
  };
}

function normalizeUsageResponse(result) {
  const snapshot = result?.rateLimitsByLimitId?.codex || result?.rateLimits;
  if (!snapshot) throw new Error('Codex did not return usage limits.');
  const primary = normalizeRateLimitWindow(snapshot.primary);
  const secondary = normalizeRateLimitWindow(snapshot.secondary);
  if (!primary && !secondary) throw new Error('Codex returned no usage windows.');
  const receivedAt = new Date().toISOString();
  return {
    checkedAt: receivedAt,
    updatedAt: receivedAt,
    planType: typeof snapshot.planType === 'string' ? snapshot.planType : null,
    ordinaryUsageAllowed: typeof result.ordinaryUsageAllowed === 'boolean' ? result.ordinaryUsageAllowed : null,
    primary,
    secondary,
  };
}

async function readCodexUsage(codexHome) {
  const executable = await findCodexExecutable();
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['app-server', '--stdio'], {
      env: { ...process.env, CODEX_HOME: codexHome },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let response;
    let initialized = false;
    let settled = false;

    const timeout = setTimeout(() => {
      child.kill();
      finish(new Error('Timed out while reading Codex usage limits.'));
    }, USAGE_REQUEST_TIMEOUT_MS);

    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(normalizeUsageResponse(response));
    }

    function send(message) {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    }

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      for (;;) {
        const newline = stdout.indexOf('\n');
        if (newline < 0) break;
        const line = stdout.slice(0, newline).trim();
        stdout = stdout.slice(newline + 1);
        if (!line) continue;
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message.id === 1 && !initialized) {
          initialized = true;
          send({ method: 'initialized' });
          send({
            id: 2,
            method: 'account/rateLimits/read',
            params: { excludeResetCreditDetails: true },
          });
        } else if (message.id === 2) {
          if (message.error) {
            finish(new Error(message.error.message || 'Codex could not read usage limits.'));
          } else {
            response = message.result;
            child.stdin.end();
          }
        }
      }
    });
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk.toString()}`.slice(-2000); });
    child.on('error', finish);
    child.on('close', (code) => {
      if (response) finish();
      else finish(new Error(stderr.trim() || `Codex app-server exited with code ${code}.`));
    });

    send({
      id: 1,
      method: 'initialize',
      params: {
        clientInfo: {
          name: 'goosenest-codex-profiles',
          version: vscode.extensions.getExtension('goosenest.codex-profiles')?.packageJSON.version || '0.0.0',
        },
        capabilities: { experimentalApi: true },
      },
    });
  });
}

class ProfileStore {
  constructor(context) {
    this.profilesDirectory = path.join(context.globalStorageUri.fsPath, 'auth-profiles');
    this.configSnapshotsDirectory = path.join(context.globalStorageUri.fsPath, 'config-profiles');
    this.statePath = path.join(context.globalStorageUri.fsPath, 'profiles.json');
    this.syncQueue = Promise.resolve();
  }

  get authPath() { return path.join(getCodexHome(), 'auth.json'); }
  get configPath() { return path.join(getCodexHome(), 'config.toml'); }
  get envPath() { return path.join(getCodexHome(), '.env'); }

  async readState() {
    try {
      const parsed = JSON.parse(await fs.promises.readFile(this.statePath, 'utf8'));
      return {
        activeId: typeof parsed.activeId === 'string' ? parsed.activeId : null,
        profiles: Array.isArray(parsed.profiles)
          ? parsed.profiles.map((profile) => ({ ...profile, kind: profile.kind || DEFAULT_KIND }))
          : [],
        pendingAdd: parsed.pendingAdd && typeof parsed.pendingAdd === 'object'
          ? { restoreProfileId: typeof parsed.pendingAdd.restoreProfileId === 'string' ? parsed.pendingAdd.restoreProfileId : null }
          : null,
      };
    } catch (error) {
      if (error.code === 'ENOENT') return { activeId: null, profiles: [], pendingAdd: null };
      throw new Error(`Could not read profiles: ${error.message}`);
    }
  }

  async writeState(state) {
    await fs.promises.mkdir(path.dirname(this.statePath), { recursive: true });
    const temporary = `${this.statePath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    await fs.promises.writeFile(temporary, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
    await fs.promises.copyFile(temporary, this.statePath);
    await fs.promises.rm(temporary, { force: true });
  }

  async list(options = {}) {
    let state;
    let addError = null;
    try {
      state = await this.syncCurrent(options);
    } catch (error) {
      state = await this.readState();
      if (!state.pendingAdd) throw error;
      addError = 'Could not read the new Codex authentication file.';
    }
    const profiles = [];
    for (const profile of state.profiles) {
      const kind = profile.kind || DEFAULT_KIND;
      if (kind === PROVIDER_KIND) {
        profiles.push({
          id: profile.id,
          kind,
          name: profile.name,
          provider: profile.provider,
          baseUrl: profile.baseUrl,
          envKey: profile.envKey,
          active: profile.id === state.activeId,
        });
      } else if (await exists(path.join(this.profilesDirectory, `${profile.id}.json`))) {
        profiles.push({
          id: profile.id,
          kind,
          name: profile.name,
          active: profile.id === state.activeId,
          usage: profile.usage || null,
        });
      }
    }
    return { profiles, awaitingSignIn: state.pendingAdd !== null, addError };
  }

  syncCurrent(options = {}) {
    const synchronize = () => this.syncCurrentLocked(options);
    this.syncQueue = this.syncQueue.then(synchronize, synchronize);
    return this.syncQueue;
  }

  async getDueUsageTargets({
    now = Date.now(),
    requestedIds = new Set(),
    hotIds = new Set(),
    includeScheduled = true,
  } = {}) {
    const state = await this.syncCurrent();
    const targets = [];
    let nextDueIn = ACTIVE_USAGE_INTERVAL_MS;
    for (const profile of state.profiles) {
      if ((profile.kind || DEFAULT_KIND) !== DEFAULT_KIND) continue;
      const profilePath = path.join(this.profilesDirectory, `${profile.id}.json`);
      if (!(await exists(profilePath))) continue;
      const active = profile.id === state.activeId;
      const checkedAt = Date.parse(profile.usage?.checkedAt || '');
      const hot = active || hotIds.has(profile.id);
      const requested = requestedIds.has(profile.id);
      if (!hot && !requested) continue;
      if (!requested && !includeScheduled) continue;
      if (Number.isFinite(checkedAt) && now - checkedAt < MIN_USAGE_REQUEST_INTERVAL_MS) {
        nextDueIn = Math.min(nextDueIn, MIN_USAGE_REQUEST_INTERVAL_MS - (now - checkedAt));
        continue;
      }
      const contents = await fs.promises.readFile(profilePath);
      targets.push({
        id: profile.id,
        active,
        hot,
        profilePath,
        contents,
        fingerprint: crypto.createHash('sha256').update(contents).digest('hex'),
        usage: profile.usage || null,
      });
    }
    return {
      targets: targets.sort((left, right) => Number(right.active) - Number(left.active)),
      nextDueIn,
    };
  }

  async getActiveId() {
    return (await this.readState()).activeId;
  }

  async commitUsage(target, usage, refreshedAuth) {
    const commit = async () => {
      const state = await this.readState();
      const profile = state.profiles.find((item) => item.id === target.id);
      if (!profile || (profile.kind || DEFAULT_KIND) !== DEFAULT_KIND) return;

      if (refreshedAuth) {
        try {
          const [currentContents, currentStat] = await Promise.all([
            fs.promises.readFile(target.profilePath),
            fs.promises.stat(target.profilePath),
          ]);
          const currentFingerprint = crypto.createHash('sha256').update(currentContents).digest('hex');
          const refreshedFingerprint = crypto.createHash('sha256').update(refreshedAuth).digest('hex');
          const info = getProfileInfo(refreshedAuth.toString('utf8'), profile.name);
          const sameAccount = profile.accountId
            ? info.accountId === profile.accountId
            : profile.email
              ? info.email === profile.email
              : true;
          const currentFreshness = getAuthFreshness(currentContents.toString('utf8'), currentStat.mtimeMs);
          const refreshedFreshness = getAuthFreshness(refreshedAuth.toString('utf8'), Date.now());
          const snapshotUnchanged = currentFingerprint === target.fingerprint;
          const refreshClearlyNewer = refreshedFreshness.refreshAt !== null
            && (currentFreshness.refreshAt === null || refreshedFreshness.refreshAt > currentFreshness.refreshAt);
          if (
            sameAccount
            && refreshedFingerprint !== currentFingerprint
            && (snapshotUnchanged || refreshClearlyNewer)
          ) {
            JSON.parse(refreshedAuth.toString('utf8'));
            await copyAtomic(target.profilePath, `${target.profilePath}.bak`);
            await writeAtomic(target.profilePath, refreshedAuth);
            profile.fingerprint = refreshedFingerprint;
            profile.lastRefresh = refreshedFreshness.refreshAt === null
              ? null
              : new Date(refreshedFreshness.refreshAt).toISOString();
            profile.updatedAt = new Date().toISOString();
          }
        } catch (error) {
          console.error(`Codex Profiles: refreshed auth for ${target.id} was not stored`, error);
        }
      }

      profile.usage = usage;
      await this.writeState(state);
    };
    this.syncQueue = this.syncQueue.then(commit, commit);
    return this.syncQueue;
  }

  async readAuthSnapshot(retry = false) {
    const attempts = retry ? AUTH_READ_RETRY_COUNT : 1;
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const [contents, authStat] = await Promise.all([
          fs.promises.readFile(this.authPath),
          fs.promises.stat(this.authPath),
        ]);
        const parsed = JSON.parse(contents.toString('utf8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('auth.json does not contain a JSON object.');
        }
        return { contents, authStat };
      } catch (error) {
        lastError = error;
        if (attempt + 1 < attempts) await delay(AUTH_READ_RETRY_DELAY_MS);
      }
    }
    if (lastError?.code === 'ENOENT') return null;
    throw lastError;
  }

  async syncCurrentLocked({ retry = false } = {}) {
    const state = await this.readState();
    const activeProvider = readRootModelProvider(await this.readTextIfExists(this.configPath));
    if (activeProvider) {
      const providerProfile = state.profiles.find((profile) =>
        (profile.kind || DEFAULT_KIND) === PROVIDER_KIND && profile.provider === activeProvider
      );
      if (providerProfile) {
        state.activeId = providerProfile.id;
        providerProfile.lastSeenAt = new Date().toISOString();
        await this.writeState(state);
        return state;
      }
    }
    const snapshot = await this.readAuthSnapshot(retry);
    if (!snapshot) return state;
    const { contents, authStat } = snapshot;
    const fingerprint = crypto.createHash('sha256').update(contents).digest('hex');
    const freshness = getAuthFreshness(contents.toString('utf8'), authStat.mtimeMs);
    const fallback = `Profile ${state.profiles.length + 1}`;
    const info = getProfileInfo(contents.toString('utf8'), fallback);
    let current = findProfile(state.profiles, info, fingerprint);
    if (!current) {
      const id = createProfileId(info.name);
      const now = new Date().toISOString();
      current = {
        id,
        kind: DEFAULT_KIND,
        name: info.name,
        identity: info.identity,
        accountId: info.accountId,
        email: info.email,
        fingerprint,
        lastRefresh: freshness.refreshAt === null ? null : new Date(freshness.refreshAt).toISOString(),
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
      };
      await writeAtomic(path.join(this.profilesDirectory, `${id}.json`), contents);
      state.profiles.push(current);
    } else {
      const profilePath = path.join(this.profilesDirectory, `${current.id}.json`);
      const profileExists = await exists(profilePath);
      let shouldStoreCurrent = !profileExists;
      let storedStat = null;

      if (profileExists && current.fingerprint !== fingerprint) {
        const [storedContents, profileStat] = await Promise.all([
          fs.promises.readFile(profilePath),
          fs.promises.stat(profilePath),
        ]);
        storedStat = profileStat;
        const storedFreshness = getAuthFreshness(storedContents.toString('utf8'), storedStat.mtimeMs);
        shouldStoreCurrent = compareFreshness(freshness, storedFreshness) >= 0;
        if (!shouldStoreCurrent) {
          current.fingerprint = crypto.createHash('sha256').update(storedContents).digest('hex');
          current.lastRefresh = storedFreshness.refreshAt === null
            ? null
            : new Date(storedFreshness.refreshAt).toISOString();
          await copyAtomic(this.authPath, `${this.authPath}.bak`);
          await copyAtomic(profilePath, this.authPath);
        }
      }

      if (profileExists && !storedStat && (!current.createdAt || !current.updatedAt)) {
        storedStat = await fs.promises.stat(profilePath);
      }
      const storedCreatedAt = storedStat
        ? new Date(Number.isFinite(storedStat.birthtimeMs) ? storedStat.birthtimeMs : storedStat.mtimeMs).toISOString()
        : new Date().toISOString();
      current.createdAt ??= storedCreatedAt;
      current.updatedAt ??= current.lastRefresh || (storedStat ? new Date(storedStat.mtimeMs).toISOString() : storedCreatedAt);

      current.name = info.name;
      current.identity = info.identity;
      current.accountId = info.accountId;
      current.email = info.email;
      if (shouldStoreCurrent || current.fingerprint === fingerprint) {
        current.fingerprint = fingerprint;
        current.lastRefresh = freshness.refreshAt === null ? null : new Date(freshness.refreshAt).toISOString();
      }
      if (shouldStoreCurrent) {
        await writeAtomic(profilePath, contents);
        current.updatedAt = new Date().toISOString();
      }
      current.lastSeenAt = new Date().toISOString();
    }
    state.activeId = current.id;
    state.pendingAdd = null;
    await this.writeState(state);
    return state;
  }

  async activate(id) {
    // Persist the freshest access/refresh tokens of the account we are leaving.
    const state = await this.syncCurrent();
    const profile = state.profiles.find((item) => item.id === id);
    if (!profile) throw new Error('Profile not found.');
    if ((profile.kind || DEFAULT_KIND) === PROVIDER_KIND) {
      await this.applyProviderProfile(profile, state);
      return profile.name;
    }
    const source = path.join(this.profilesDirectory, `${profile.id}.json`);
    if (!(await exists(source))) throw new Error('The selected profile file was not found.');
    if (await exists(this.authPath)) await copyAtomic(this.authPath, `${this.authPath}.bak`);
    await copyAtomic(source, this.authPath);
    await this.applyDefaultConfig(state);
    state.activeId = id;
    await this.writeState(state);
    return profile.name;
  }

  getManagedProviders(state) {
    return state.profiles
      .filter((profile) => (profile.kind || DEFAULT_KIND) === PROVIDER_KIND)
      .map((profile) => profile.provider)
      .filter(Boolean);
  }

  async readTextIfExists(filePath) {
    try {
      return await fs.promises.readFile(filePath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return '';
      throw error;
    }
  }

  async backupConfig() {
    if (await exists(this.configPath)) await copyAtomic(this.configPath, `${this.configPath}.bak`);
  }

  async applyDefaultConfig(state) {
    const contents = await this.readTextIfExists(this.configPath);
    if (state.activeId) await writeAtomic(path.join(this.configSnapshotsDirectory, `${state.activeId}.toml`), contents);
    await this.backupConfig();
    await writeAtomic(this.configPath, formatTomlFile(stripManagedProviderConfig(contents, this.getManagedProviders(state))));
  }

  async applyProviderProfile(profile, state) {
    if (!profile.provider || !profile.baseUrl || !profile.envKey) throw new Error('Provider profile is incomplete.');
    const contents = await this.readTextIfExists(this.configPath);
    if (state.activeId) await writeAtomic(path.join(this.configSnapshotsDirectory, `${state.activeId}.toml`), contents);
    await this.backupConfig();
    await writeAtomic(this.configPath, appendProviderConfig(contents, profile));
    profile.lastSeenAt = new Date().toISOString();
    state.activeId = profile.id;
    await this.writeState(state);
  }

  async addProvider({ name, baseUrl, token }) {
    const cleanName = String(name || '').trim();
    const cleanBaseUrl = String(baseUrl || '').trim();
    const cleanToken = String(token || '').trim();
    if (!cleanName) throw new Error('Provider name is required.');
    if (!cleanBaseUrl) throw new Error('Base URL is required.');
    if (!cleanToken) throw new Error('Access token is required.');
    let parsedUrl;
    try {
      parsedUrl = new URL(cleanBaseUrl);
    } catch {
      throw new Error('Base URL must be a valid URL.');
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('Base URL must use http or https.');

    const state = await this.syncCurrent();
    const baseSlug = createProviderSlug(cleanName);
    let provider = baseSlug;
    let suffix = 2;
    while (state.profiles.some((profile) => profile.provider === provider)) {
      provider = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
    const now = new Date().toISOString();
    const profile = {
      id: createProfileId(`provider-${provider}`),
      kind: PROVIDER_KIND,
      name: cleanName,
      provider,
      baseUrl: cleanBaseUrl,
      envKey: createEnvKey(cleanName),
      createdAt: now,
      updatedAt: now,
      lastSeenAt: null,
    };

    const envContents = await this.readTextIfExists(this.envPath);
    await writeAtomic(this.envPath, upsertEnvValue(envContents, profile.envKey, cleanToken));
    state.profiles.push(profile);
    await this.applyProviderProfile(profile, state);
    return profile.name;
  }

  async beginAddProfile() {
    // Save the latest tokens without calling Codex logout, which could revoke the session.
    const state = await this.syncCurrent();
    state.pendingAdd = { restoreProfileId: state.activeId };
    await this.applyDefaultConfig(state);
    await fs.promises.rm(this.authPath, { force: true });
    state.activeId = null;
    await this.writeState(state);
  }

  async cancelAddProfile() {
    const state = await this.readState();
    const restoreProfileId = state.pendingAdd?.restoreProfileId ?? null;
    if (restoreProfileId) {
      const profile = state.profiles.find((item) => item.id === restoreProfileId);
      if (profile && (profile.kind || DEFAULT_KIND) === PROVIDER_KIND) {
        await this.applyProviderProfile(profile, state);
      } else {
        const source = path.join(this.profilesDirectory, `${restoreProfileId}.json`);
        if (await exists(source)) {
          await this.applyDefaultConfig(state);
          await copyAtomic(source, this.authPath);
          state.activeId = restoreProfileId;
        }
      }
    }
    state.pendingAdd = null;
    await this.writeState(state);
  }

  async delete(id) {
    const state = await this.syncCurrent();
    const profile = state.profiles.find((item) => item.id === id);
    if (!profile) throw new Error('Profile not found.');
    if (profile.id === state.activeId) throw new Error('The active profile cannot be deleted.');
    if ((profile.kind || DEFAULT_KIND) === PROVIDER_KIND) {
      const configContents = await this.readTextIfExists(this.configPath);
      await this.backupConfig();
      await writeAtomic(this.configPath, formatTomlFile(stripManagedProviderConfig(configContents, [profile.provider])));
      const envContents = await this.readTextIfExists(this.envPath);
      await writeAtomic(this.envPath, removeEnvValue(envContents, profile.envKey));
    } else {
      await fs.promises.rm(path.join(this.profilesDirectory, `${profile.id}.json`), { force: true });
    }
    state.profiles = state.profiles.filter((item) => item.id !== id);
    await this.writeState(state);
  }

}

class UsagePoller {
  constructor(store, onUpdate) {
    this.store = store;
    this.onUpdate = onUpdate;
    this.running = false;
    this.timer = undefined;
    this.inFlight = new Map();
    this.pendingIds = new Set();
    this.hotIds = new Set();
    this.scratchHomePromise = undefined;
    this.disposed = false;
  }

  start() {
    void cleanOrphanedScratchHomes()
      .catch((error) => console.error('Codex Profiles: scratch cleanup failed', error))
      .finally(() => {
        if (!this.disposed) void this.tick();
      });
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    if (!this.running) void this.removeScratchHome();
  }

  getBusyIds() {
    return new Set(this.inFlight.keys());
  }

  async waitForProfiles(ids) {
    const waits = [...new Set(ids.filter(Boolean))]
      .map((id) => this.inFlight.get(id)?.completed)
      .filter(Boolean);
    await Promise.all(waits);
  }

  setExpanded(ids) {
    const nextHotIds = new Set(ids.filter(Boolean));
    for (const id of nextHotIds) {
      if (!this.hotIds.has(id) && !this.inFlight.has(id)) this.pendingIds.add(id);
    }
    this.hotIds = nextHotIds;
    if (this.pendingIds.size && !this.running) {
      clearTimeout(this.timer);
      this.timer = undefined;
      void this.tick();
    }
  }

  async getScratchHome() {
    if (!this.scratchHomePromise) {
      const scratchHome = path.join(SCRATCH_ROOT, crypto.randomUUID());
      this.scratchHomePromise = fs.promises.mkdir(scratchHome, { recursive: true })
        .then(async () => {
          await writeAtomic(path.join(scratchHome, '.owner.json'), Buffer.from(JSON.stringify({
            pid: process.pid,
            timestamp: Date.now(),
          })));
          return scratchHome;
        })
        .catch((error) => {
          this.scratchHomePromise = undefined;
          throw error;
        });
    }
    return this.scratchHomePromise;
  }

  async removeScratchHome() {
    const scratchHomePromise = this.scratchHomePromise;
    this.scratchHomePromise = undefined;
    if (!scratchHomePromise) return;
    const scratchHome = await scratchHomePromise.catch(() => null);
    if (scratchHome) {
      await fs.promises.rm(scratchHome, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async notify() {
    try {
      await this.onUpdate();
    } catch (error) {
      console.error('Codex Profiles: could not publish usage state', error);
    }
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    let nextDueIn = ACTIVE_USAGE_INTERVAL_MS;
    try {
      let includeScheduled = true;
      do {
        const requestedIds = new Set(this.pendingIds);
        this.pendingIds.clear();
        const due = await this.store.getDueUsageTargets({
          requestedIds,
          hotIds: this.hotIds,
          includeScheduled,
        });
        const { targets } = due;
        nextDueIn = Math.min(nextDueIn, due.nextDueIn);
        includeScheduled = false;
        for (const target of targets) {
          let release;
          const completed = new Promise((resolve) => { release = resolve; });
          this.inFlight.set(target.id, { completed, release });
        }
        if (targets.length) await this.notify();
        for (const target of targets) {
          let scratchAuthPath;
          try {
            const codexHome = target.active ? getCodexHome() : await this.getScratchHome();
            if (!target.active) {
              scratchAuthPath = path.join(codexHome, 'auth.json');
              await writeAtomic(scratchAuthPath, target.contents);
            }
            const usage = await readCodexUsage(codexHome);
            const refreshedAuth = target.active
              ? null
              : await fs.promises.readFile(scratchAuthPath).catch(() => null);
            await this.store.commitUsage(target, usage, refreshedAuth);
            await this.notify();
          } catch (error) {
            console.error(`Codex Profiles: usage refresh failed for ${target.id}`, error);
            const lastSuccessfulUpdate = target.usage?.updatedAt
              || (target.usage?.error ? null : target.usage?.checkedAt)
              || null;
            await this.store.commitUsage(target, {
              ...target.usage,
              checkedAt: new Date().toISOString(),
              updatedAt: lastSuccessfulUpdate,
              error: error.message || String(error),
            }, null);
            await this.notify();
          } finally {
            if (scratchAuthPath) await fs.promises.rm(scratchAuthPath, { force: true }).catch(() => undefined);
            const operation = this.inFlight.get(target.id);
            this.inFlight.delete(target.id);
            operation?.release();
            await this.notify();
          }
        }
      } while (this.pendingIds.size);
    } catch (error) {
      console.error('Codex Profiles: usage polling failed', error);
    } finally {
      this.running = false;
      if (this.disposed) await this.removeScratchHome();
      else if (this.pendingIds.size) void this.tick();
      else {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          this.timer = undefined;
          void this.tick();
        }, Math.max(0, nextDueIn));
      }
    }
  }
}

class ProfilesViewProvider {
  constructor(context, store) {
    this.context = context;
    this.store = store;
    this.view = undefined;
    this.usagePoller = undefined;
  }

  async resolveWebviewView(view) {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [] };
    view.webview.onDidReceiveMessage((message) => this.handleMessage(message));
    view.webview.html = this.getLoadingHtml();
    const [html] = await Promise.all([this.getHtml(view.webview), delay(650)]);
    view.webview.html = html;
  }

  getLoadingHtml() {
    const nonce = crypto.randomBytes(16).toString('base64');
    return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}';"><style nonce="${nonce}">html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--vscode-sideBar-background)}body{display:grid;place-items:center}.loading-mark{position:relative;width:44px;height:44px;overflow:hidden;color:var(--vscode-descriptionForeground)}.loading-logo{display:block;width:100%;height:100%;opacity:.62}.loading-mark::after{position:absolute;inset:0;content:'';background:linear-gradient(100deg,transparent 24%,color-mix(in srgb,var(--vscode-foreground) 42%,transparent) 48%,transparent 72%);background-position:140% 0;background-size:220% 100%;animation:loading-shimmer 650ms linear 1 forwards}@keyframes loading-shimmer{to{background-position:-120% 0}}@media(prefers-reduced-motion:reduce){.loading-mark::after{animation:none;background:transparent}}</style><title>Codex Profiles</title></head><body><span class="loading-mark"><svg class="loading-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Loading Codex Profiles"><path d="M4 7h14m-3-3 3 3-3 3"/><path d="M20 17H6m3 3-3-3 3-3"/></svg></span></body></html>`;
  }

  async handleMessage(message) {
    try {
      if (message.type === 'ready' || message.type === 'refresh') return await this.sendState();
      if (message.type === 'setExpandedUsage') {
        const ids = Array.isArray(message.ids) ? message.ids.map(String) : [];
        this.usagePoller?.setExpanded(ids);
        return;
      }
      if (message.type === 'activate') {
        const id = String(message.id || '');
        const activeId = await this.store.getActiveId();
        const busyIds = this.usagePoller?.getBusyIds() || new Set();
        if ([activeId, id].some((profileId) => profileId && busyIds.has(profileId))) {
          this.post({ type: 'activationWaiting', id });
        }
        await this.usagePoller?.waitForProfiles([activeId, id]);
        await this.store.activate(id);
        await vscode.commands.executeCommand('workbench.action.restartExtensionHost');
        return;
      }
      if (message.type === 'beginAdd') {
        await this.store.beginAddProfile();
        await vscode.commands.executeCommand('workbench.action.restartExtensionHost');
        return;
      }
      if (message.type === 'addProvider') {
        await this.store.addProvider({
          name: message.name,
          baseUrl: message.baseUrl,
          token: message.token,
        });
        await vscode.commands.executeCommand('workbench.action.restartExtensionHost');
        return;
      }
      if (message.type === 'cancelAdd') {
        await this.store.cancelAddProfile();
        await vscode.commands.executeCommand('workbench.action.restartExtensionHost');
        return;
      }
      if (message.type === 'signIn') {
        await vscode.commands.executeCommand('chatgpt.openSidebar');
        return;
      }
      if (message.type === 'retryAdd') return await this.sendState({ retry: true });
      if (message.type === 'delete') {
        await this.store.delete(String(message.id || ''));
        await this.sendState();
        return;
      }
      await this.sendState();
    } catch (error) {
      this.post({ type: 'error', message: error.message || String(error) });
      if (message.type === 'activate') this.post({ type: 'activationFailed' });
    }
  }

  async sendState(options = {}) {
    const state = await this.store.list(options);
    const busyIds = this.usagePoller?.getBusyIds() || new Set();
    this.post({
      type: 'state',
      ...state,
      profiles: state.profiles.map((profile) => ({
        ...profile,
        busy: busyIds.has(profile.id),
      })),
    });
  }
  post(message) { this.view?.webview.postMessage(message); }

  async getHtml(webview) {
    const nonce = crypto.randomBytes(16).toString('base64');
    const script = (await fs.promises.readFile(path.join(this.context.extensionUri.fsPath, 'build', 'dist', 'webview.js'), 'utf8'))
      .replace(/<\/script/gi, '<\\/script');
    const styles = await fs.promises.readFile(path.join(this.context.extensionUri.fsPath, 'build', 'dist', 'codex-profiles.css'), 'utf8');
    const serializedState = JSON.stringify(await this.store.list())
      .replace(/</g, '\\u003c')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
    return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';"><style nonce="${nonce}">html,body{margin:0}${styles}</style><title>Codex Profiles</title></head><body><div id="app"></div><script nonce="${nonce}">window.__CODEX_PROFILES_INITIAL_STATE__=${serializedState};${script}</script></body></html>`;
  }
}

async function activate(context) {
  const store = new ProfileStore(context);
  try {
    await store.syncCurrent();
  } catch (error) {
    console.error('Codex Profiles: automatic profile sync failed', error);
  }
  const provider = new ProfilesViewProvider(context, store);
  const usagePoller = new UsagePoller(store, () => provider.sendState());
  provider.usagePoller = usagePoller;
  usagePoller.start();
  let syncTimer;
  const authWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(getCodexHome(), 'auth.json'),
  );
  const scheduleSync = () => {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      provider.sendState({ retry: true }).catch((error) => console.error('Codex Profiles: auth.json sync failed', error));
    }, 400);
  };
  authWatcher.onDidCreate(scheduleSync);
  authWatcher.onDidChange(scheduleSync);
  authWatcher.onDidDelete(scheduleSync);
  context.subscriptions.push(
    authWatcher,
    { dispose: () => clearTimeout(syncTimer) },
    usagePoller,
    vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('codexProfiles.open', () => vscode.commands.executeCommand(`${VIEW_ID}.focus`)),
    vscode.commands.registerCommand('codexProfiles.refresh', () => provider.sendState()),
  );
}

function deactivate() {}
module.exports = { activate, deactivate };
