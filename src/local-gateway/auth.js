const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');
const { writeAtomic } = require('./registry');

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const REFRESH_URL = 'https://auth.openai.com/oauth/token';

function decodeExpiration(token) {
  try {
    const payload = token.split('.')[1];
    const padding = '='.repeat((4 - (payload.length % 4)) % 4);
    return Number(JSON.parse(Buffer.from(`${payload}${padding}`, 'base64url').toString('utf8')).exp || 0);
  } catch {
    return 0;
  }
}

function credentials(auth) {
  const tokens = auth?.tokens && typeof auth.tokens === 'object' ? auth.tokens : {};
  return {
    token: tokens.access_token || auth?.access_token || auth?.OPENAI_API_KEY || null,
    accountId: tokens.account_id || auth?.account_id || null,
  };
}

async function readAuth(home) {
  const authPath = path.join(home, 'auth.json');
  const auth = JSON.parse(await fs.promises.readFile(authPath, 'utf8'));
  if (!auth || typeof auth !== 'object' || Array.isArray(auth)) throw new Error('Invalid auth.json.');
  return { authPath, auth };
}

async function ensureFresh(home, { force = false, fetchImpl = fetch } = {}) {
  const initial = await readAuth(home);
  const current = credentials(initial.auth);
  const expiresAt = current.token ? decodeExpiration(current.token) : 0;
  if (current.token && !force && (!expiresAt || expiresAt > Date.now() / 1000 + 120)) return current;

  const release = await lockfile.lock(initial.authPath, {
    realpath: false,
    stale: 30_000,
    update: 10_000,
    retries: { retries: 30, factor: 1.2, minTimeout: 25, maxTimeout: 300, randomize: true },
  });
  try {
    const { authPath, auth } = await readAuth(home);
    const reread = credentials(auth);
    const rereadExpiration = reread.token ? decodeExpiration(reread.token) : 0;
    if (reread.token && !force && (!rereadExpiration || rereadExpiration > Date.now() / 1000 + 120)) return reread;
    const tokens = auth.tokens && typeof auth.tokens === 'object' ? auth.tokens : {};
    if (!tokens.refresh_token) throw new Error('Codex profile has no refresh token.');
    const response = await fetchImpl(REFRESH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: CLIENT_ID,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Token refresh failed (${response.status}).`);
    const refreshed = await response.json();
    for (const key of ['access_token', 'refresh_token', 'id_token']) {
      if (refreshed[key]) tokens[key] = refreshed[key];
    }
    auth.tokens = tokens;
    auth.last_refresh = new Date().toISOString();
    await writeAtomic(authPath, JSON.stringify(auth));
    const result = credentials(auth);
    if (!result.token) throw new Error('Token refresh returned no access token.');
    return result;
  } finally {
    await release();
  }
}

module.exports = { CLIENT_ID, REFRESH_URL, credentials, decodeExpiration, ensureFresh, readAuth };
