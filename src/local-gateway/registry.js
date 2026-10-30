const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');
const { accountHome, providerHome, safeId } = require('./paths');

const INDEX_VERSION = 1;

async function writeAtomic(filePath, contents, mode = 0o600) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  await fs.promises.writeFile(temporary, contents, { encoding: 'utf8', mode });
  await fs.promises.rename(temporary, filePath);
}

function emptyState() {
  return {
    version: INDEX_VERSION,
    revision: 0,
    activeId: null,
    profiles: [],
    pendingAdd: null,
  };
}

function normalizeUsage(usage, now = Date.now()) {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return usage || null;
  const next = { ...usage };
  const nowSeconds = Math.floor(now / 1000);
  for (const name of ['primary', 'secondary']) {
    const window = usage[name];
    if (!window || typeof window !== 'object' || Array.isArray(window)) continue;
    const resetAt = Number(window.resetsAt ?? window.resets_at);
    const duration = Number(window.windowDurationMins ?? window.window_duration_minutes);
    const normalized = { ...window };
    if (Number.isFinite(resetAt) && resetAt <= nowSeconds) {
      normalized.usedPercent = 0;
      if (Number.isFinite(duration) && duration > 0) {
        normalized.resetsAt = nowSeconds + Math.round(duration * 60);
      }
    }
    next[name] = normalized;
  }
  return next;
}

function normalizeState(value, now = Date.now()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyState();
  const profiles = Array.isArray(value.profiles)
    ? value.profiles
      .filter((profile) => profile && typeof profile === 'object' && typeof profile.id === 'string')
      .map((profile) => ({
        ...profile,
        kind: profile.kind === 'provider' ? 'provider' : 'default',
        usage: normalizeUsage(profile.usage, now),
      }))
    : [];
  const activeId = profiles.some((profile) => profile.id === value.activeId) ? value.activeId : null;
  return {
    version: INDEX_VERSION,
    revision: Number.isInteger(value.revision) ? value.revision : 0,
    activeId,
    profiles,
    pendingAdd: value.pendingAdd && typeof value.pendingAdd === 'object' ? value.pendingAdd : null,
  };
}

class ProfileRegistry {
  constructor(paths) {
    this.paths = paths;
  }

  async ensure() {
    await Promise.all([
      fs.promises.mkdir(this.paths.accountsRoot, { recursive: true }),
      fs.promises.mkdir(this.paths.providersRoot, { recursive: true }),
      fs.promises.mkdir(this.paths.runtimeRoot, { recursive: true }),
    ]);
    try {
      await fs.promises.access(this.paths.indexPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await writeAtomic(this.paths.indexPath, `${JSON.stringify(emptyState(), null, 2)}\n`);
    }
  }

  async read() {
    await this.ensure();
    return normalizeState(JSON.parse(await fs.promises.readFile(this.paths.indexPath, 'utf8')));
  }

  async runExclusive(operation) {
    await this.ensure();
    const release = await lockfile.lock(this.paths.indexPath, {
      realpath: false,
      stale: 30_000,
      update: 10_000,
      retries: { retries: 50, factor: 1.2, minTimeout: 20, maxTimeout: 250, randomize: true },
    });
    try {
      const state = await this.read();
      const result = await operation(state);
      state.revision += 1;
      await writeAtomic(this.paths.indexPath, `${JSON.stringify(normalizeState(state), null, 2)}\n`);
      return result;
    } finally {
      await release();
    }
  }

  async select(id) {
    const profileId = safeId(id);
    return this.runExclusive((state) => {
      const profile = state.profiles.find((item) => item.id === profileId);
      if (!profile) throw new Error('Profile not found.');
      state.activeId = profileId;
      profile.lastSeenAt = new Date().toISOString();
      return profile;
    });
  }

  async activeRoute() {
    const state = await this.read();
    const profile = state.profiles.find((item) => item.id === state.activeId);
    if (!profile) throw new Error('No active Codex profile is selected.');
    if (profile.kind === 'provider') {
      const credentialsPath = path.join(providerHome(this.paths, profile.id), 'credentials.json');
      const credentials = JSON.parse(await fs.promises.readFile(credentialsPath, 'utf8'));
      return { profile, token: credentials.accessToken, accountId: null };
    }
    return {
      profile,
      accountHome: accountHome(this.paths, profile.id),
      token: null,
      accountId: profile.accountId || null,
    };
  }

  async updateUsage(id, patch, now = Date.now()) {
    const profileId = safeId(id);
    return this.runExclusive((state) => {
      const profile = state.profiles.find((item) => item.id === profileId);
      if (!profile) return null;
      profile.usage = normalizeUsage({ ...(profile.usage || {}), ...(patch || {}) }, now);
      profile.usage.updatedAt = new Date(now).toISOString();
      profile.usage.fetchedAt = profile.usage.updatedAt;
      profile.usage.status = 'ready';
      profile.updatedAt = profile.usage.updatedAt;
      return profile.usage;
    });
  }
}

module.exports = {
  INDEX_VERSION,
  ProfileRegistry,
  emptyState,
  normalizeState,
  normalizeUsage,
  writeAtomic,
};
