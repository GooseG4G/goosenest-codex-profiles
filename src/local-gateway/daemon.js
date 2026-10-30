const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const { createGatewayPaths } = require('./paths');
const { ProfileRegistry, writeAtomic } = require('./registry');
const { createWebSocketProxy, proxyHttpResponse } = require('./proxy');

const paths = createGatewayPaths(process.env.CODEX_ROOT);
const registry = new ProfileRegistry(paths);
const token = process.env.CODEX_PROFILES_DAEMON_TOKEN || crypto.randomBytes(32).toString('base64url');

function authorize(request) {
  return request.headers.authorization === `Bearer ${token}`;
}

function json(response, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    'content-type': 'application/json',
    'content-length': body.length,
    'cache-control': 'no-store',
  });
  response.end(body);
}

async function handle(request, response) {
  if (!authorize(request)) return json(response, 401, { detail: 'Invalid local gateway token.' });
  const url = new URL(request.url, 'http://127.0.0.1');
  if (request.method === 'GET' && url.pathname === '/health') {
    return json(response, 200, { status: 'ok', pid: process.pid });
  }
  if (request.method === 'GET' && url.pathname === '/control/state') {
    return json(response, 200, await registry.read());
  }
  if (request.method === 'POST' && url.pathname.startsWith('/control/select/')) {
    return json(response, 200, await registry.select(decodeURIComponent(url.pathname.slice('/control/select/'.length))));
  }
  if (request.method === 'POST' && ['/responses', '/v1/responses', '/api/v1/responses'].includes(url.pathname)) {
    return proxyHttpResponse(request, response, registry);
  }
  return json(response, 404, { detail: 'Not found.' });
}

async function start() {
  await registry.ensure();
  const server = http.createServer((request, response) => {
    Promise.resolve(handle(request, response)).catch((error) => {
      if (!response.headersSent) json(response, error.statusCode || 502, { detail: error.message });
      else response.destroy(error);
    });
  });
  const websocket = createWebSocketProxy({ registry, authorize });
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (!['/responses', '/v1/responses', '/api/v1/responses'].includes(url.pathname)) {
      socket.destroy();
      return;
    }
    websocket.handleUpgrade(request, socket, head);
  });
  server.listen(0, '127.0.0.1', async () => {
    const address = server.address();
    await writeAtomic(paths.runtimePath, `${JSON.stringify({
      version: 1,
      pid: process.pid,
      port: address.port,
      token,
      startedAt: new Date().toISOString(),
    }, null, 2)}\n`);
    if (process.send) process.send({ type: 'ready', port: address.port });
  });
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

start().catch(async (error) => {
  await fs.promises.mkdir(paths.runtimeRoot, { recursive: true }).catch(() => undefined);
  console.error(error);
  process.exit(1);
});
