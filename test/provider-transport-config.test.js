const test = require('node:test');
const assert = require('node:assert/strict');
const {
  appendProviderConfig,
  createEnvKey,
  findCompatibleEnvKey,
  resolveProviderEnvKey,
} = require('../src/provider-config');
const { normalizeState } = require('../src/local-gateway/registry');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createGatewayPaths } = require('../src/local-gateway/paths');
const {
  ensureExternalProviderConfig,
  ensureLocalProviderConfig,
  LOCAL_PROVIDER_ID,
  LOCAL_TOKEN_ENV,
} = require('../src/local-gateway/coordinator');

test('provider env keys are deterministic and migrate missing legacy keys', () => {
  assert.equal(createEnvKey('Open Router'), 'OPEN_ROUTER_ACCESS_TOKEN');
  const state = normalizeState({
    profiles: [
      { id: 'provider-one', kind: 'provider', name: 'OpenRouter' },
      { id: 'provider-two', kind: 'provider', name: 'OpenRouter' },
    ],
  });
  assert.equal(state.profiles[0].envKey, 'OPENROUTER_ACCESS_TOKEN');
  assert.equal(state.profiles[1].envKey, 'OPENROUTER_2_ACCESS_TOKEN');
  assert.equal(resolveProviderEnvKey({ envKey: 'CUSTOM_TOKEN', name: 'Ignored' }), 'CUSTOM_TOKEN');
  assert.ok(!state.profiles.some((profile) => profile.envKey === 'undefined'));
  assert.equal(
    findCompatibleEnvKey('OPENROUTER_API_KEY=existing\n', 'OPENROUTER_ACCESS_TOKEN', 'OpenRouter'),
    'OPENROUTER_API_KEY',
  );
});

test('provider config enables websocket transport only when selected', () => {
  const websocket = appendProviderConfig('', {
    provider: 'example',
    name: 'Example',
    baseUrl: 'https://provider.example/v1',
    envKey: 'EXAMPLE_ACCESS_TOKEN',
    transport: 'websocket',
  });
  assert.match(websocket, /supports_websockets = true/);

  const responses = appendProviderConfig('', {
    provider: 'example',
    name: 'Example',
    baseUrl: 'https://provider.example/v1',
    envKey: 'EXAMPLE_ACCESS_TOKEN',
    transport: 'responses',
  });
  assert.match(responses, /supports_websockets = false/);
});

test('external provider config preserves the token under a migrated env key', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-provider-config-'));
  try {
    const paths = createGatewayPaths(root);
    await ensureExternalProviderConfig(paths, {
      provider: 'openrouter',
      name: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      transport: 'responses',
    }, 'token-value-for-test');
    const env = await fs.readFile(paths.envPath, 'utf8');
    const config = await fs.readFile(paths.configPath, 'utf8');
    assert.match(env, /^OPENROUTER_ACCESS_TOKEN=token-value-for-test$/m);
    assert.match(config, /env_key = "OPENROUTER_ACCESS_TOKEN"/);
    assert.doesNotMatch(config, /env_key = "undefined"/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('external provider config reuses a compatible existing env name', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-provider-env-'));
  try {
    const paths = createGatewayPaths(root);
    await fs.mkdir(path.dirname(paths.envPath), { recursive: true });
    await fs.writeFile(paths.envPath, 'OPENROUTER_API_KEY=old-value\n');
    await ensureExternalProviderConfig(paths, {
      provider: 'openrouter',
      name: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
    }, 'new-token');
    const env = await fs.readFile(paths.envPath, 'utf8');
    const config = await fs.readFile(paths.configPath, 'utf8');
    assert.match(env, /^OPENROUTER_API_KEY=new-token$/m);
    assert.match(config, /env_key = "OPENROUTER_API_KEY"/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('local gateway uses the stable gateway provider and token names', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-local-provider-'));
  try {
    const paths = createGatewayPaths(root);
    await fs.mkdir(path.dirname(paths.envPath), { recursive: true });
    await fs.writeFile(paths.envPath, 'GATEWAY_ACCESS_TOKEN=old-token\n');
    await ensureLocalProviderConfig(paths, {
      port: 62656,
      token: 'gateway-token',
    });
    const env = await fs.readFile(paths.envPath, 'utf8');
    const config = await fs.readFile(paths.configPath, 'utf8');
    assert.equal(LOCAL_PROVIDER_ID, 'gateway');
    assert.equal(LOCAL_TOKEN_ENV, 'GATEWAY_ACCESS_TOKEN');
    assert.match(config, /model_provider = "gateway"/);
    assert.match(config, /\[model_providers\."gateway"\]/);
    assert.match(config, /name = "Codex Profiles"/);
    assert.match(config, /env_key = "GATEWAY_ACCESS_TOKEN"/);
    assert.match(env, /^GATEWAY_ACCESS_TOKEN=gateway-token$/m);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
