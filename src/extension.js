const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vscode = require('vscode');
const {
  appendProviderConfig,
  createProviderSlug,
  createUniqueEnvKey,
  formatTomlFile,
  readEnvValue,
  readRootModelProvider,
  removeEnvValue,
  stripManagedProviderConfig,
  upsertEnvValue,
} = require('./provider-config');
const { resolveReauthenticationProfile } = require('./profile-selection');
const { SerialQueue } = require('./serial-queue');
const { StoreTransactionQueue } = require('./store-transaction');

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

function getProfileInfo(contents, fallback) {
  const auth = JSON.parse(contents);
  const candidates = [auth.email, auth.account_email, auth.user?.email, auth.tokens?.email];
  const token = auth.tokens?.id_token || auth.id_token;
  if (typeof token === 'string') {
    try {
      const payload = token.split('.')[1];
      if (payload) {
        const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        candidates.unshift(claims.email, claims['https://api.openai.com/profile']?.email);
      }
    } catch {
      // A malformed ID token must not hide an explicit account identifier in auth.json.
    }
  }
  const email = candidates.find((value) => typeof value === 'string' && value.includes('@'));
  const accountId = auth.tokens?.account_id || auth.account_id;
  const normalizedAccountId = typeof accountId === 'string' && accountId ? accountId : null;
  const normalizedEmail = email ? email.toLocaleLowerCase() : null;
  if (!normalizedAccountId && !normalizedEmail) {
    throw new Error(`${fallback} does not contain a Codex account identity.`);
  }
  return {
    name: email || normalizedAccountId,
    identity: normalizedAccountId ? `account:${normalizedAccountId}` : `email:${normalizedEmail}`,
    accountId: normalizedAccountId,
    email: normalizedEmail,
  };
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
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`,
  );
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  try {
    await fs.promises.copyFile(source, temporary);
    await fs.promises.rename(temporary, target);
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
    await fs.promises.rename(temporary, target);
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
    status: 'ready',
    fetchedAt: receivedAt,
    updatedAt: receivedAt,
    planType: typeof snapshot.planType === 'string' ? snapshot.planType : null,
    ordinaryUsageAllowed: typeof result.ordinaryUsageAllowed === 'boolean' ? result.ordinaryUsageAllowed : null,
    primary,
    secondary,
  };
}

function classifyUsageError(error) {
  const message = error?.message || String(error);
  if (error?.code === 'AUTH_EXPIRED' || /\b(?:401|403)\b|unauthori|forbidden|token expired|authentication expired/i.test(message)) {
    return { code: 'AUTH_EXPIRED', message: 'Authentication expired.' };
  }
  if (/timed out|timeout/i.test(message)) return { code: 'TIMEOUT', message };
  if (/network|connect|econn|socket/i.test(message)) return { code: 'NETWORK', message };
  return { code: 'UNKNOWN', message };
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
            const error = new Error(message.error.message || 'Codex could not read usage limits.');
            error.code = message.error.code;
            finish(error);
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
    this.stateQueue = new StoreTransactionQueue(this.statePath);
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
          ? parsed.profiles.map((profile) => ({
            ...profile,
            kind: profile.kind || DEFAULT_KIND,
            usage: profile.usage
              ? { ...profile.usage, fetchedAt: profile.usage.fetchedAt || profile.usage.checkedAt || null }
              : profile.usage,
          }))
          : [],
        pendingAdd: parsed.pendingAdd && typeof parsed.pendingAdd === 'object'
          ? {
            restoreProfileId: typeof parsed.pendingAdd.restoreProfileId === 'string' ? parsed.pendingAdd.restoreProfileId : null,
            reauthenticateProfileId: typeof parsed.pendingAdd.reauthenticateProfileId === 'string'
              ? parsed.pendingAdd.reauthenticateProfileId
              : null,
          }
          : null,
      };
    } catch (error) {
      if (error.code === 'ENOENT') return { activeId: null, profiles: [], pendingAdd: null };
      throw new Error(`Could not read profiles: ${error.message}`);
    }
  }

  async writeState(state) {
    await writeAtomic(this.statePath, JSON.stringify(state, null, 2));
  }

  runExclusive(operation) {
    return this.stateQueue.run(operation);
  }

  list(options = {}) {
    return this.runExclusive(() => this.listLocked(options));
  }

  async listLocked(options = {}) {
    let state;
    let addError = null;
    try {
      state = await this.syncCurrentLocked(options);
    } catch (error) {
      state = await this.readState();
      if (!state.pendingAdd) throw error;
      addError = error.code === 'REAUTH_ACCOUNT_MISMATCH'
        ? error.message
        : 'Could not read the new Codex authentication file.';
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
    return this.runExclusive(() => this.syncCurrentLocked(options));
  }

  getDueUsageTargets(options = {}) {
    return this.runExclusive(() => this.getDueUsageTargetsLocked(options));
  }

  async getDueUsageTargetsLocked({
    now = Date.now(),
    requestedIds = new Set(),
    hotIds = new Set(),
    includeScheduled = true,
  } = {}) {
    const state = await this.syncCurrentLocked();
    const targets = [];
    let nextDueIn = ACTIVE_USAGE_INTERVAL_MS;
    for (const profile of state.profiles) {
      if ((profile.kind || DEFAULT_KIND) !== DEFAULT_KIND) continue;
      const profilePath = path.join(this.profilesDirectory, `${profile.id}.json`);
      if (!(await exists(profilePath))) continue;
      const active = profile.id === state.activeId;
      const fetchedAt = Date.parse(profile.usage?.fetchedAt || '');
      const hot = active || hotIds.has(profile.id);
      const requested = requestedIds.has(profile.id);
      if (!hot && !requested) continue;
      if (!requested && !includeScheduled) continue;
      if (Number.isFinite(fetchedAt) && now - fetchedAt < MIN_USAGE_REQUEST_INTERVAL_MS) {
        nextDueIn = Math.min(nextDueIn, MIN_USAGE_REQUEST_INTERVAL_MS - (now - fetchedAt));
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

  getActiveId() {
    return this.runExclusive(async () => (await this.readState()).activeId);
  }

  commitUsage(target, usage, refreshedAuth) {
    return this.runExclusive(async () => {
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
    });
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
    const matchingProfile = findProfile(state.profiles, info, fingerprint);
    const reauthenticateProfileId = state.pendingAdd?.reauthenticateProfileId;
    let current = matchingProfile;
    if (reauthenticateProfileId) {
      current = resolveReauthenticationProfile(state.profiles, info, matchingProfile, reauthenticateProfileId);
    }
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
      const explicitReauthentication = reauthenticateProfileId === current.id;

      if (profileExists && current.fingerprint !== fingerprint) {
        const [storedContents, profileStat] = await Promise.all([
          fs.promises.readFile(profilePath),
          fs.promises.stat(profilePath),
        ]);
        storedStat = profileStat;
        if (explicitReauthentication) {
          shouldStoreCurrent = true;
        } else {
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
      if (explicitReauthentication && current.usage) {
        current.usage = {
          ...current.usage,
          status: 'stale',
          fetchedAt: null,
        };
        delete current.usage.errorCode;
        delete current.usage.error;
      }
      current.lastSeenAt = new Date().toISOString();
    }
    state.activeId = current.id;
    state.pendingAdd = null;
    await this.writeState(state);
    return state;
  }

  activate(id) {
    return this.runExclusive(() => this.activateLocked(id));
  }

  async activateLocked(id) {
    // Persist the freshest access/refresh tokens of the account we are leaving.
    const state = await this.syncCurrentLocked();
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

  validateProviderInput(name, baseUrl) {
    const cleanName = String(name || '').trim();
    const cleanBaseUrl = String(baseUrl || '').trim();
    if (!cleanName) throw new Error('Provider name is required.');
    if (!cleanBaseUrl) throw new Error('Base URL is required.');
    let parsedUrl;
    try {
      parsedUrl = new URL(cleanBaseUrl);
    } catch {
      throw new Error('Base URL must be a valid URL.');
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('Base URL must use http or https.');
    return { cleanName, cleanBaseUrl };
  }

  addProvider(input) {
    return this.runExclusive(() => this.addProviderLocked(input));
  }

  async addProviderLocked({ name, baseUrl, token }) {
    const { cleanName, cleanBaseUrl } = this.validateProviderInput(name, baseUrl);
    const cleanToken = String(token || '').trim();
    if (!cleanToken) throw new Error('Access token is required.');
    if (/[\r\n]/.test(cleanToken)) throw new Error('Access token must be a single line.');

    const state = await this.syncCurrentLocked();
    const normalizedName = cleanName.toLocaleLowerCase();
    const duplicate = state.profiles.find((profile) =>
      (profile.kind || DEFAULT_KIND) === PROVIDER_KIND
      && String(profile.name || '').trim().toLocaleLowerCase() === normalizedName
    );
    if (duplicate) throw new Error(`A provider named "${cleanName}" already exists.`);
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
      envKey: createUniqueEnvKey(cleanName, state.profiles),
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

  updateProvider(input) {
    return this.runExclusive(() => this.updateProviderLocked(input));
  }

  async updateProviderLocked({ id, name, baseUrl, token }) {
    const { cleanName, cleanBaseUrl } = this.validateProviderInput(name, baseUrl);
    const cleanToken = String(token || '').trim();
    if (/[\r\n]/.test(cleanToken)) throw new Error('Access token must be a single line.');
    const state = await this.syncCurrentLocked();
    const profile = state.profiles.find((item) => item.id === id && (item.kind || DEFAULT_KIND) === PROVIDER_KIND);
    if (!profile) throw new Error('Provider profile not found.');

    const normalizedName = cleanName.toLocaleLowerCase();
    const duplicate = state.profiles.find((item) =>
      item.id !== id
      && (item.kind || DEFAULT_KIND) === PROVIDER_KIND
      && String(item.name || '').trim().toLocaleLowerCase() === normalizedName
    );
    if (duplicate) throw new Error(`A provider named "${cleanName}" already exists.`);

    const envContents = await this.readTextIfExists(this.envPath);
    const tokenToStore = cleanToken || readEnvValue(envContents, profile.envKey);
    if (!tokenToStore) throw new Error('Access token is required.');
    await writeAtomic(this.envPath, upsertEnvValue(envContents, profile.envKey, tokenToStore));

    profile.name = cleanName;
    profile.baseUrl = cleanBaseUrl;
    profile.updatedAt = new Date().toISOString();
    const active = state.activeId === profile.id;
    if (active) {
      const configContents = await this.readTextIfExists(this.configPath);
      await this.backupConfig();
      await writeAtomic(this.configPath, appendProviderConfig(configContents, profile));
      profile.lastSeenAt = new Date().toISOString();
    }
    await this.writeState(state);
    return { name: profile.name, active };
  }

  beginAddProfile(reauthenticateProfileId = null) {
    return this.runExclusive(() => this.beginAddProfileLocked(reauthenticateProfileId));
  }

  async beginAddProfileLocked(reauthenticateProfileId = null) {
    // Save the latest tokens without calling Codex logout, which could revoke the session.
    const state = await this.syncCurrentLocked();
    if (reauthenticateProfileId) {
      const profile = state.profiles.find((item) =>
        item.id === reauthenticateProfileId && (item.kind || DEFAULT_KIND) === DEFAULT_KIND
      );
      if (!profile) throw new Error('The profile selected for re-authentication was not found.');
      if (!profile.accountId && !profile.email) {
        throw new Error('The saved profile does not contain a verifiable Codex account identity.');
      }
    }
    state.pendingAdd = {
      restoreProfileId: state.activeId,
      reauthenticateProfileId,
    };
    await this.applyDefaultConfig(state);
    await fs.promises.rm(this.authPath, { force: true });
    state.activeId = null;
    await this.writeState(state);
  }

  cancelAddProfile() {
    return this.runExclusive(() => this.cancelAddProfileLocked());
  }

  async cancelAddProfileLocked() {
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

  delete(id) {
    return this.runExclusive(() => this.deleteLocked(id));
  }

  async deleteLocked(id) {
    const state = await this.syncCurrentLocked();
    const profile = state.profiles.find((item) => item.id === id);
    if (!profile) throw new Error('Profile not found.');
    const active = profile.id === state.activeId;
    if ((profile.kind || DEFAULT_KIND) === PROVIDER_KIND) {
      const configContents = await this.readTextIfExists(this.configPath);
      await this.backupConfig();
      await writeAtomic(this.configPath, formatTomlFile(stripManagedProviderConfig(configContents, [profile.provider])));
      const envContents = await this.readTextIfExists(this.envPath);
      await writeAtomic(this.envPath, removeEnvValue(envContents, profile.envKey));
    } else {
      await fs.promises.rm(path.join(this.profilesDirectory, `${profile.id}.json`), { force: true });
      if (profile.id === state.activeId) await fs.promises.rm(this.authPath, { force: true });
    }
    state.profiles = state.profiles.filter((item) => item.id !== id);
    if (active) state.activeId = null;
    await this.writeState(state);
    return { active };
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
            const usageError = classifyUsageError(error);
            const lastSuccessfulUpdate = target.usage?.updatedAt
              || (target.usage?.error ? null : target.usage?.fetchedAt)
              || null;
            await this.store.commitUsage(target, {
              ...target.usage,
              status: 'error',
              fetchedAt: new Date().toISOString(),
              updatedAt: lastSuccessfulUpdate,
              errorCode: usageError.code,
              error: usageError.message,
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
    this.messageQueue = new SerialQueue();
  }

  async resolveWebviewView(view) {
    let disposed = false;
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [] };
    view.webview.onDidReceiveMessage((message) => {
      void this.messageQueue.run(() => this.handleMessage(message));
    });
    view.onDidDispose(() => {
      disposed = true;
      if (this.view === view) this.view = undefined;
      this.usagePoller?.setExpanded([]);
    });
    view.webview.html = this.getLoadingHtml();
    const [html] = await Promise.all([this.getHtml(view.webview), delay(800)]);
    if (!disposed && this.view === view) view.webview.html = html;
  }

  getLoadingHtml() {
    const nonce = crypto.randomBytes(16).toString('base64');
    return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}';"><style nonce="${nonce}">html,body{box-sizing:border-box;margin:0;width:100vw;height:100vh;overflow:hidden;background:var(--vscode-sideBar-background)}body{position:fixed;inset:0}.loading-logo{position:fixed;top:50%;left:50%;display:block;width:44px;height:44px;transform:translate(-50%,-50%);color:var(--vscode-descriptionForeground)}.loading-base{opacity:.48}.loading-highlight{color:var(--vscode-foreground)}.loading-sweep{opacity:0;transform:translateX(-12px);animation:loading-shimmer 1.2s cubic-bezier(.45,0,.55,1) infinite}@keyframes loading-shimmer{0%{opacity:0;transform:translateX(-12px)}18%{opacity:.7}50%{opacity:1}82%{opacity:.7}100%{opacity:0;transform:translateX(36px)}}@media(prefers-reduced-motion:reduce){.loading-highlight{display:none}}</style><title>Codex Profiles</title></head><body><svg class="loading-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Loading Codex Profiles"><defs><radialGradient id="loading-fade"><stop offset="0" stop-color="white"/><stop offset=".48" stop-color="white" stop-opacity=".7"/><stop offset="1" stop-color="black" stop-opacity="0"/></radialGradient><filter id="loading-blur" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="1.5"/></filter><mask id="loading-mask" maskUnits="userSpaceOnUse"><ellipse class="loading-sweep" cx="0" cy="12" rx="8" ry="16" fill="url(#loading-fade)" filter="url(#loading-blur)"/></mask></defs><g class="loading-base"><path d="M4 7h14m-3-3 3 3-3 3"/><path d="M20 17H6m3 3-3-3 3-3"/></g><g class="loading-highlight" mask="url(#loading-mask)"><path d="M4 7h14m-3-3 3 3-3 3"/><path d="M20 17H6m3 3-3-3 3-3"/></g></svg></body></html>`;
  }

  async handleMessage(message) {
    if (!message || typeof message !== 'object') return;
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
      if (message.type === 'beginAdd' || message.type === 'reauthenticate') {
        const reauthenticateProfileId = message.type === 'reauthenticate' ? String(message.id || '') : null;
        const activeId = await this.store.getActiveId();
        await this.usagePoller?.waitForProfiles([activeId, reauthenticateProfileId]);
        await this.store.beginAddProfile(reauthenticateProfileId);
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
      if (message.type === 'updateProvider') {
        const result = await this.store.updateProvider({
          id: String(message.id || ''),
          name: message.name,
          baseUrl: message.baseUrl,
          token: message.token,
        });
        if (result.active) {
          await vscode.commands.executeCommand('workbench.action.restartExtensionHost');
        } else {
          await this.sendState();
          this.post({ type: 'providerUpdated' });
        }
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
        const id = String(message.id || '');
        await this.usagePoller?.waitForProfiles([id]);
        const result = await this.store.delete(id);
        if (result.active) {
          await vscode.commands.executeCommand('workbench.action.restartExtensionHost');
        } else {
          await this.sendState();
        }
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
        authExpired: profile.usage?.errorCode === 'AUTH_EXPIRED',
        busy: busyIds.has(profile.id),
      })),
    });
  }
  post(message) {
    const view = this.view;
    if (!view) return;
    void view.webview.postMessage(message).then(
      undefined,
      (error) => console.error('Codex Profiles: could not post a webview message', error),
    );
  }

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
