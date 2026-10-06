const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vscode = require('vscode');

const VIEW_ID = 'codexProfiles.profilesView';
const AUTH_READ_RETRY_COUNT = 5;
const AUTH_READ_RETRY_DELAY_MS = 250;
const DEFAULT_KIND = 'default';
const PROVIDER_KIND = 'provider';

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
        profiles.push({ id: profile.id, kind, name: profile.name, active: profile.id === state.activeId });
      }
    }
    return { profiles, awaitingSignIn: state.pendingAdd !== null, addError };
  }

  syncCurrent(options = {}) {
    const synchronize = () => this.syncCurrentLocked(options);
    this.syncQueue = this.syncQueue.then(synchronize, synchronize);
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

class ProfilesViewProvider {
  constructor(context, store) { this.context = context; this.store = store; this.view = undefined; }

  async resolveWebviewView(view) {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [] };
    view.webview.html = await this.getHtml(view.webview);
    view.webview.onDidReceiveMessage((message) => this.handleMessage(message));
  }

  async handleMessage(message) {
    try {
      if (message.type === 'ready' || message.type === 'refresh') return await this.sendState();
      if (message.type === 'activate') {
        await this.store.activate(String(message.id || ''));
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
        return;
      }
      if (message.type === 'beginAdd') {
        await this.store.beginAddProfile();
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
        return;
      }
      if (message.type === 'addProvider') {
        await this.store.addProvider({
          name: message.name,
          baseUrl: message.baseUrl,
          token: message.token,
        });
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
        return;
      }
      if (message.type === 'cancelAdd') {
        await this.store.cancelAddProfile();
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
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
    }
  }

  async sendState(options = {}) { this.post({ type: 'state', ...(await this.store.list(options)) }); }
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
    vscode.window.registerWebviewViewProvider(VIEW_ID, provider),
    vscode.commands.registerCommand('codexProfiles.open', () => vscode.commands.executeCommand(`${VIEW_ID}.focus`)),
    vscode.commands.registerCommand('codexProfiles.refresh', () => provider.sendState()),
  );
}

function deactivate() {}
module.exports = { activate, deactivate };
