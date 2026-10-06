const test = require('node:test');
const assert = require('node:assert/strict');
const {
  appendProviderConfig,
  createProviderSlug,
  createUniqueEnvKey,
  readRootModelProvider,
  stripManagedProviderConfig,
} = require('../src/provider-config');

test('provider identifiers remain valid for non-ASCII display names', () => {
  assert.equal(createProviderSlug('Мой Провайдер'), 'provider');
  assert.equal(createProviderSlug('Open Router / EU'), 'open-router-eu');
});

test('environment keys are unique after name normalization', () => {
  const profiles = [{ envKey: 'FOO_BAR_ACCESS_TOKEN' }, { envKey: 'FOO_BAR_2_ACCESS_TOKEN' }];
  assert.equal(createUniqueEnvKey('foo-bar', profiles), 'FOO_BAR_3_ACCESS_TOKEN');
});

test('provider config uses a quoted TOML key and remains discoverable', () => {
  const config = appendProviderConfig('model = "gpt-5"\n', {
    provider: 'provider',
    name: 'Мой Провайдер',
    baseUrl: 'https://example.com/v1',
    envKey: 'PROVIDER_ACCESS_TOKEN',
  });
  assert.match(config, /\[model_providers\."provider"]\n/);
  assert.equal(readRootModelProvider(config), 'provider');
});

test('managed provider cleanup supports legacy bare and quoted table keys', () => {
  const config = [
    'model_provider = "foo-bar"',
    '',
    '[model_providers.foo-bar]',
    'name = "Legacy"',
    '',
    '[model_providers."other"]',
    'name = "Other"',
  ].join('\n');
  const cleaned = stripManagedProviderConfig(config, ['foo-bar']);
  assert.doesNotMatch(cleaned, /^model_provider\s*=/m);
  assert.doesNotMatch(cleaned, /Legacy/);
  assert.match(cleaned, /\[model_providers\."other"]\nname = "Other"/);
});
