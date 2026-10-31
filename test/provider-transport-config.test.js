const test = require('node:test');
const assert = require('node:assert/strict');
const { appendProviderConfig } = require('../src/provider-config');

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
