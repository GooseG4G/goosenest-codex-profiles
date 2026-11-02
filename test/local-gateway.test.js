const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const WebSocket = require('ws');
const { Readable } = require('node:stream');
const { createGatewayPaths, providerHome } = require('../src/local-gateway/paths');
const { ProfileRegistry, writeAtomic } = require('../src/local-gateway/registry');
const { normalizeUsage } = require('../src/local-gateway/registry');
const {
  connectWebSocketWithAuthRefresh,
  upstreamHeaders,
  usageFromEvent,
  usageFromHeaders,
  websocketUrl,
} = require('../src/local-gateway/proxy');
const { proxyHttpResponse } = require('../src/local-gateway/proxy');

test('expired usage windows reset from the current time', () => {
  const now = Date.UTC(2026, 9, 30, 12, 0, 0);
  const usage = normalizeUsage({
    primary: { usedPercent: 100, windowDurationMins: 300, resetsAt: now / 1000 - 1 },
    secondary: { usedPercent: 45, windowDurationMins: 10_080, resetsAt: now / 1000 + 60 },
  }, now);
  assert.equal(usage.primary.usedPercent, 0);
  assert.equal(usage.primary.resetsAt, now / 1000 + 18_000);
  assert.equal(usage.status, 'stale');
  assert.equal(usage.secondary.usedPercent, 45);
});

test('responses headers keep the explicit allowlist', () => {
  const headers = upstreamHeaders({
    'content-type': 'application/json',
    accept: 'text/event-stream',
    'x-session-id': 'session-7',
    cookie: 'private=value',
    'openai-beta': 'untrusted',
  }, 'oauth-token', 'account-7');
  assert.equal(headers.authorization, 'Bearer oauth-token');
  assert.equal(headers['chatgpt-account-id'], 'account-7');
  assert.equal(headers['x-session-id'], 'session-7');
  assert.equal(headers.cookie, undefined);
  assert.equal(headers['openai-beta'], undefined);
});

test('websocket mode keeps the same explicit upstream header allowlist', () => {
  const headers = upstreamHeaders({ 'openai-beta': 'untrusted' }, 'token', null);
  assert.equal(headers['openai-beta'], undefined);
  assert.equal(websocketUrl('https://example.test/v1/responses'), 'wss://example.test/v1/responses');
});

test('local WebSocket retries one default-profile handshake after a 401', async () => {
  const routes = [
    { profile: { kind: 'default', id: 'profile-1' }, token: 'stale' },
    { profile: { kind: 'default', id: 'profile-1' }, token: 'fresh' },
  ];
  const credentialsCalls = [];
  const connectCalls = [];
  const socket = {};
  let attempt = 0;
  const result = await connectWebSocketWithAuthRefresh(
    {},
    { headers: {} },
    async (_url, headers) => {
      connectCalls.push(headers.authorization);
      if (attempt++ === 0) throw Object.assign(new Error('unauthorized'), { statusCode: 401 });
      return socket;
    },
    async (_registry, force) => {
      credentialsCalls.push(Boolean(force));
      return routes[credentialsCalls.length - 1];
    },
  );

  assert.equal(result.upstream, socket);
  assert.deepEqual(credentialsCalls, [false, true]);
  assert.deepEqual(connectCalls, ['Bearer stale', 'Bearer fresh']);
});

test('local WebSocket does not refresh a provider after a 401', async () => {
  const credentialsCalls = [];
  await assert.rejects(
    connectWebSocketWithAuthRefresh(
      {},
      { headers: {} },
      async () => { throw Object.assign(new Error('unauthorized'), { statusCode: 401 }); },
      async (_registry, force) => {
        credentialsCalls.push(Boolean(force));
        return { profile: { kind: 'provider', id: 'provider-1', baseUrl: 'https://provider.example/v1' }, token: 'provider-token' };
      },
    ),
    /unauthorized/,
  );
  assert.deepEqual(credentialsCalls, [false]);
});

test('local WebSocket stops after one forced refresh failure', async () => {
  const credentialsCalls = [];
  await assert.rejects(
    connectWebSocketWithAuthRefresh(
      {},
      { headers: {} },
      async () => { throw Object.assign(new Error('unauthorized'), { statusCode: 401 }); },
      async (_registry, force) => {
        credentialsCalls.push(Boolean(force));
        return { profile: { kind: 'default', id: 'profile-1' }, token: force ? 'fresh' : 'stale' };
      },
    ),
    /unauthorized/,
  );
  assert.deepEqual(credentialsCalls, [false, true]);
});

test('local HTTP proxy retries one default-profile request after a 401', async () => {
  const responses = [
    { status: 401, headers: new Headers(), body: null },
    { status: 200, headers: new Headers(), body: null },
  ];
  const routes = [
    { profile: { kind: 'default', id: 'profile-1' }, token: 'stale' },
    { profile: { kind: 'default', id: 'profile-1' }, token: 'fresh' },
  ];
  const credentialsCalls = [];
  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (_url, options) => {
    requests.push(options.headers.authorization);
    return responses.shift();
  };
  const request = Readable.from([Buffer.from('{}')]);
  request.headers = { 'content-type': 'application/json' };
  const response = new (require('node:stream').Writable)({ write(_chunk, _encoding, callback) { callback(); } });
  response.setHeader = () => undefined;
  response.end = () => undefined;

  try {
    await proxyHttpResponse(
      request,
      response,
      {},
      async (_registry, force) => {
        credentialsCalls.push(Boolean(force));
        return routes[credentialsCalls.length - 1];
      },
    );
  } finally {
    global.fetch = originalFetch;
  }

  assert.deepEqual(credentialsCalls, [false, true]);
  assert.deepEqual(requests, ['Bearer stale', 'Bearer fresh']);
  assert.equal(response.statusCode, 200);
});

test('usage is collected from response headers and websocket events', () => {
  const headers = new Headers({
    'x-codex-primary-used-percent': '73',
    'x-codex-primary-window-minutes': '300',
    'x-codex-primary-reset-at': '1234',
  });
  assert.deepEqual(usageFromHeaders(headers), {
    primary: { usedPercent: 73, windowDurationMins: 300, resetsAt: 1234 },
  });
  assert.deepEqual(usageFromEvent({
    type: 'response.completed',
    response: { usage: { input_tokens: 12, output_tokens: 3 } },
  }), { lastResponseUsage: { input_tokens: 12, output_tokens: 3 } });
});

test('usage metadata keeps plan and windows from response headers and rate-limit events', () => {
  const headers = new Headers({
    'x-codex-plan-type': 'free',
  });
  assert.deepEqual(usageFromHeaders(headers), {
    planType: 'free',
  });
  assert.deepEqual(usageFromEvent({
    type: 'codex.rate_limits',
    plan_type: 'free',
    rate_limits: {
      allowed: true,
      primary: { used_percent: 100, window_minutes: 43200, reset_at: 1234 },
    },
  }), {
    planType: 'free',
    ordinaryUsageAllowed: true,
    primary: { usedPercent: 100, windowDurationMins: 43200, resetsAt: 1234 },
  });
});

test('local daemon proxies Responses over HTTP and WebSocket', { timeout: 20_000 }, async (t) => {
  const temporaryRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-profiles-gateway-test-'));
  const upstreamServer = http.createServer((request, response) => {
    assert.equal(request.headers.authorization, 'Bearer provider-token');
    assert.equal(request.headers['x-session-id'], 'session-http');
    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'x-codex-primary-used-percent': '27',
      'x-codex-primary-window-minutes': '300',
      'x-codex-primary-reset-at': '2000000000',
    });
    response.end('data: {"type":"response.completed","response":{"usage":{"input_tokens":1}}}\n\n');
  });
  const upstreamWebSocket = new WebSocket.WebSocketServer({ noServer: true });
  upstreamServer.on('upgrade', (request, socket, head) => {
    assert.equal(request.headers.authorization, 'Bearer provider-token');
    assert.equal(request.headers['openai-beta'], undefined);
    upstreamWebSocket.handleUpgrade(request, socket, head, (websocket) => {
      upstreamWebSocket.emit('connection', websocket, request);
    });
  });
  upstreamWebSocket.on('connection', (websocket) => {
    websocket.once('message', (message) => {
      assert.equal(JSON.parse(message.toString()).type, 'response.create');
      websocket.send(JSON.stringify({ type: 'response.completed', response: { usage: { output_tokens: 2 } } }));
    });
  });
  upstreamServer.listen(0, '127.0.0.1');
  await once(upstreamServer, 'listening');
  const upstreamPort = upstreamServer.address().port;

  const paths = createGatewayPaths(temporaryRoot);
  const registry = new ProfileRegistry(paths);
  await registry.ensure();
  await fs.promises.mkdir(providerHome(paths, 'provider-1'), { recursive: true });
  await writeAtomic(
    path.join(providerHome(paths, 'provider-1'), 'credentials.json'),
    JSON.stringify({ accessToken: 'provider-token' }),
  );
  await registry.runExclusive((state) => {
    state.activeId = 'provider-1';
    state.profiles = [{
      id: 'provider-1',
      kind: 'provider',
      name: 'Mock provider',
      baseUrl: `http://127.0.0.1:${upstreamPort}`,
    }];
  });

  const gatewayToken = 'local-gateway-token';
  const daemon = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'local-gateway', 'daemon.js')], {
    env: { ...process.env, CODEX_ROOT: temporaryRoot, GATEWAY_ACCESS_TOKEN: gatewayToken },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    daemon.kill();
    upstreamWebSocket.close();
    upstreamServer.close();
    await fs.promises.rm(temporaryRoot, { recursive: true, force: true });
  });

  let runtime;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      runtime = JSON.parse(await fs.promises.readFile(paths.runtimePath, 'utf8'));
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  if (!runtime) {
    const stderr = await new Promise((resolve) => {
      let output = '';
      daemon.stderr.on('data', (chunk) => { output += chunk; });
      setTimeout(() => resolve(output), 100);
    });
    assert.fail(`daemon did not start: ${stderr}`);
  }

  const response = await fetch(`http://127.0.0.1:${runtime.port}/v1/responses`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${gatewayToken}`,
      'content-type': 'application/json',
      'x-session-id': 'session-http',
    },
    body: JSON.stringify({ model: 'test' }),
  });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /response.completed/);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await registry.read();
    if (state.profiles[0]?.usage?.lastResponseUsage?.input_tokens === 1) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const httpState = await registry.read();
  assert.equal(httpState.profiles[0].usage.lastResponseUsage.input_tokens, 1);
  assert.equal(httpState.profiles[0].lastSeenAt, httpState.profiles[0].usage.updatedAt);

  const downstreamWebSocket = new WebSocket(`ws://127.0.0.1:${runtime.port}/v1/responses`, {
    headers: { authorization: `Bearer ${gatewayToken}`, 'x-session-id': 'session-ws' },
  });
  await once(downstreamWebSocket, 'open');
  downstreamWebSocket.send(JSON.stringify({ type: 'response.create', model: 'test' }));
  const [message] = await once(downstreamWebSocket, 'message');
  assert.equal(JSON.parse(message.toString()).type, 'response.completed');
  downstreamWebSocket.close();
});
