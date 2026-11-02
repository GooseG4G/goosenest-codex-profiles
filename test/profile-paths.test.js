const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { accountHome, createGatewayPaths } = require('../src/local-gateway/paths');

test('account homes use two directory shards and keep the complete id', () => {
  const paths = createGatewayPaths('C:/codex');
  assert.equal(
    accountHome(paths, 'abcdef01-2345-4678-9abc-def012345678'),
    path.join('C:/codex', 'profiles', 'accounts', 'ab', 'cd', 'abcdef01-2345-4678-9abc-def012345678'),
  );
});

