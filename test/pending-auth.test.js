const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizePendingAdd, readPendingAuth } = require('../src/pending-auth');

test('pending add state preserves the login directory identifier', () => {
  assert.deepEqual(
    normalizePendingAdd({ loginId: 'login-123', reauthenticateProfileId: 'profile-1' }),
    { loginId: 'login-123', reauthenticateProfileId: 'profile-1' },
  );
  assert.equal(normalizePendingAdd({ reauthenticateProfileId: 'profile-1' }), null);
});

test('pending auth retries a file that appears after login completion', async () => {
  let reads = 0;
  let waits = 0;
  const contents = await readPendingAuth('auth.json', {
    attempts: 3,
    delayMs: 250,
    readFile: async () => {
      reads += 1;
      if (reads < 3) {
        const error = new Error('not found');
        error.code = 'ENOENT';
        throw error;
      }
      return Buffer.from('{"tokens":{"account_id":"account-1"}}');
    },
    wait: async (milliseconds) => {
      assert.equal(milliseconds, 250);
      waits += 1;
    },
  });

  assert.equal(reads, 3);
  assert.equal(waits, 2);
  assert.match(contents.toString('utf8'), /account-1/);
});
