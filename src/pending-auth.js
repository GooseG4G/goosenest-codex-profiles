const fs = require('fs');

function normalizePendingAdd(value) {
  if (!value || typeof value !== 'object') return null;
  const loginId = typeof value.loginId === 'string' ? value.loginId.trim() : '';
  if (!loginId) return null;
  return {
    loginId,
    reauthenticateProfileId: typeof value.reauthenticateProfileId === 'string'
      ? value.reauthenticateProfileId
      : null,
  };
}

async function readPendingAuth(
  authPath,
  {
    attempts = 1,
    delayMs = 0,
    readFile = fs.promises.readFile,
    wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  } = {},
) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const contents = await readFile(authPath);
      JSON.parse(contents.toString('utf8'));
      return contents;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await wait(delayMs);
    }
  }
  if (lastError?.code === 'ENOENT') return null;
  throw lastError || new Error('Could not read device authentication.');
}

module.exports = { normalizePendingAdd, readPendingAuth };
