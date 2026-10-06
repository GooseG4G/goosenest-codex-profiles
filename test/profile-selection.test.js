const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveReauthenticationProfile } = require('../src/profile-selection');

const profiles = [
  { id: 'first', kind: 'default', name: 'first@example.com', accountId: 'account-1', email: 'first@example.com' },
  { id: 'second', kind: 'default', name: 'second@example.com', accountId: 'account-2', email: 'second@example.com' },
];

test('re-authentication resolves the explicitly selected account', () => {
  const info = { name: 'first@example.com', accountId: 'account-1', email: 'first@example.com' };
  assert.equal(resolveReauthenticationProfile(profiles, info, profiles[0], 'first'), profiles[0]);
});

test('re-authentication rejects a different saved account', () => {
  const info = { name: 'second@example.com', accountId: 'account-2', email: 'second@example.com' };
  assert.throws(
    () => resolveReauthenticationProfile(profiles, info, profiles[1], 'first'),
    (error) => error.code === 'REAUTH_ACCOUNT_MISMATCH',
  );
});

test('re-authentication preserves legacy profiles without comparable identity fields', () => {
  const anonymousProfile = { id: 'anonymous', kind: 'default', name: 'Profile 3' };
  const info = { name: 'Profile 3', accountId: null, email: null };
  assert.equal(resolveReauthenticationProfile([anonymousProfile], info, null, 'anonymous'), anonymousProfile);
});
