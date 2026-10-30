const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const WebSocket = require('ws');
const { createGatewayPaths, providerHome } = require('../src/local-gateway/paths');
const { ProfileRegistry, writeAtomic } = require('../src/local-gateway/registry');
const { normalizeUsage } = require('../src/local-gateway/registry');
const { upstreamHeaders, usageFromEvent, usageFromHeaders, websocketUrl } = require('../src/local-gateway/proxy');

test('expired usage windows reset from the current time', () => {
  const now = Date.UTC(2026, 9, 30, 12, 0, 0);
  const usage = normalizeUsage({
    primary: { usedPercent: 100, windowDurationMins: 300, resetsAt: now / 1000 - 1 },
    secondary: { usedPercent: 45, windowDurationMins: 10_080, resetsAt: now / 1000 + 60 },
  }, now);
  assert.equal(usage.primary.usedPercent, 0);
  assert.equal(usage.primary.resetsAt, now / 1000 + 18_000);
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

  const daemonToken = 'local-daemon-token';
  const daemon = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'local-gateway', 'daemon.js')], {
    env: { ...process.env, CODEX_ROOT: temporaryRoot, CODEX_PROFILES_DAEMON_TOKEN: daemonToken },
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
      authorization: `Bearer ${daemonToken}`,
      'content-type': 'application/json',
      'x-session-id': 'session-http',
    },
    body: JSON.stringify({ model: 'test' }),
  });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /response.completed/);

  const downstreamWebSocket = new WebSocket(`ws://127.0.0.1:${runtime.port}/v1/responses`, {
    headers: { authorization: `Bearer ${daemonToken}`, 'x-session-id': 'session-ws' },
  });
  await once(downstreamWebSocket, 'open');
  downstreamWebSocket.send(JSON.stringify({ type: 'response.create', model: 'test' }));
  const [message] = await once(downstreamWebSocket, 'message');
  assert.equal(JSON.parse(message.toString()).type, 'response.completed');
  downstreamWebSocket.close();
});
