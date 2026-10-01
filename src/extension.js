const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vscode = require('vscode');

const VIEW_ID = 'codexProfiles.profilesView';

function getCodexHome() {
  const configured = vscode.workspace.getConfiguration('codexProfiles').get('codexHome', '');
  return configured.trim() || path.join(os.homedir(), '.codex');
}

function createProfileId(name) {
  const slug = name.trim().toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return `${slug || 'profile'}-${crypto.randomBytes(4).toString('hex')}`;
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
    if (email) return { name: email, identity: `email:${email.toLocaleLowerCase()}` };
    const accountId = auth.tokens?.account_id || auth.account_id;
    if (typeof accountId === 'string' && accountId) return { name: accountId, identity: `account:${accountId}` };
  } catch {
    // The profile is still tracked by its content hash; no secret is exposed to the webview.
  }
  return { name: fallback, identity: null };
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
    this.statePath = path.join(context.globalStorageUri.fsPath, 'profiles.json');
  }

  get authPath() { return path.join(getCodexHome(), 'auth.json'); }

  async readState() {
    try {
      const parsed = JSON.parse(await fs.promises.readFile(this.statePath, 'utf8'));
      return {
        activeId: typeof parsed.activeId === 'string' ? parsed.activeId : null,
        profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
      };
    } catch (error) {
      if (error.code === 'ENOENT') return { activeId: null, profiles: [] };
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

  async list() {
    const state = await this.syncCurrent();
    const profiles = [];
    for (const profile of state.profiles) {
      if (await exists(path.join(this.profilesDirectory, `${profile.id}.json`))) {
        profiles.push({ id: profile.id, name: profile.name, active: profile.id === state.activeId });
      }
    }
    return { profiles };
  }

  async syncCurrent() {
    const state = await this.readState();
    if (!(await exists(this.authPath))) return state;
    const [contents, authStat] = await Promise.all([
      fs.promises.readFile(this.authPath),
      fs.promises.stat(this.authPath),
    ]);
    const fingerprint = crypto.createHash('sha256').update(contents).digest('hex');
    const freshness = getAuthFreshness(contents.toString('utf8'), authStat.mtimeMs);
    const fallback = `Profile ${state.profiles.length + 1}`;
    const info = getProfileInfo(contents.toString('utf8'), fallback);
    let current = state.profiles.find((profile) =>
      (info.identity && profile.identity === info.identity) || profile.fingerprint === fingerprint
    );
    if (!current) {
      const id = createProfileId(info.name);
      current = {
        id,
        name: info.name,
        identity: info.identity,
        fingerprint,
        lastRefresh: freshness.refreshAt === null ? null : new Date(freshness.refreshAt).toISOString(),
      };
      await writeAtomic(path.join(this.profilesDirectory, `${id}.json`), contents);
      state.profiles.push(current);
    } else {
      const profilePath = path.join(this.profilesDirectory, `${current.id}.json`);
      const profileExists = await exists(profilePath);
      let shouldStoreCurrent = !profileExists;

      if (profileExists && current.fingerprint !== fingerprint) {
        const [storedContents, storedStat] = await Promise.all([
          fs.promises.readFile(profilePath),
          fs.promises.stat(profilePath),
        ]);
        const storedFreshness = getAuthFreshness(storedContents.toString('utf8'), storedStat.mtimeMs);
        shouldStoreCurrent = compareFreshness(freshness, storedFreshness) >= 0;
        if (!shouldStoreCurrent) {
          current.fingerprint = crypto.createHash('sha256').update(storedContents).digest('hex');
          current.lastRefresh = storedFreshness.refreshAt === null
            ? null
            : new Date(storedFreshness.refreshAt).toISOString();
        }
      }

      current.name = info.name;
      current.identity = info.identity;
      if (shouldStoreCurrent || current.fingerprint === fingerprint) {
        current.fingerprint = fingerprint;
        current.lastRefresh = freshness.refreshAt === null ? null : new Date(freshness.refreshAt).toISOString();
      }
      if (shouldStoreCurrent) await writeAtomic(profilePath, contents);
    }
    state.activeId = current.id;
    await this.writeState(state);
    return state;
  }

  async activate(id) {
    // Persist the freshest access/refresh tokens of the account we are leaving.
    const state = await this.syncCurrent();
    const profile = state.profiles.find((item) => item.id === id);
    if (!profile) throw new Error('Profile not found.');
    const source = path.join(this.profilesDirectory, `${profile.id}.json`);
    if (!(await exists(source))) throw new Error('The selected profile file was not found.');
    if (await exists(this.authPath)) await copyAtomic(this.authPath, `${this.authPath}.bak`);
    await copyAtomic(source, this.authPath);
    state.activeId = id;
    await this.writeState(state);
    return profile.name;
  }

  async delete(id) {
    const state = await this.syncCurrent();
    const profile = state.profiles.find((item) => item.id === id);
    if (!profile) throw new Error('Profile not found.');
    if (profile.id === state.activeId) throw new Error('The active profile cannot be deleted.');
    await fs.promises.rm(path.join(this.profilesDirectory, `${profile.id}.json`), { force: true });
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

  async sendState() { this.post({ type: 'state', ...(await this.store.list()) }); }
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
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, provider),
    vscode.commands.registerCommand('codexProfiles.open', () => vscode.commands.executeCommand(`${VIEW_ID}.focus`)),
    vscode.commands.registerCommand('codexProfiles.refresh', () => provider.sendState()),
  );
}

function deactivate() {}
module.exports = { activate, deactivate };
