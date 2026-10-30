const { Readable } = require('stream');
const { URL } = require('url');
const WebSocket = require('ws');
const { ensureFresh } = require('./auth');

const DEFAULT_OPENAI_RESPONSES_URL = 'https://chatgpt.com/backend-api/codex/responses';
const FORWARDED_HEADERS = ['thread-id', 'session-id', 'x-chat-id', 'x-session-id'];
const STRIPPED_RESPONSE_HEADERS = new Set([
  'connection', 'content-length', 'date', 'keep-alive', 'proxy-authenticate',
  'proxy-authorization', 'server', 'set-cookie', 'te', 'trailer',
  'transfer-encoding', 'upgrade',
]);

function responseUrl(profile) {
  if (profile.kind !== 'provider') {
    return process.env.OPENAI_RESPONSES_URL || DEFAULT_OPENAI_RESPONSES_URL;
  }
  return `${String(profile.baseUrl || '').replace(/\/$/, '')}/responses`;
}

function websocketUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol === 'https:') parsed.protocol = 'wss:';
  else if (parsed.protocol === 'http:') parsed.protocol = 'ws:';
  return parsed.toString();
}

function upstreamHeaders(sourceHeaders, token, accountId) {
  const headers = {
    authorization: `Bearer ${token}`,
    'content-type': sourceHeaders['content-type'] || 'application/json',
    accept: sourceHeaders.accept || 'text/event-stream',
    'accept-encoding': 'identity',
    'user-agent': 'codex-cli',
  };
  if (accountId) headers['chatgpt-account-id'] = accountId;
  for (const name of FORWARDED_HEADERS) {
    const value = sourceHeaders[name];
    if (typeof value === 'string' && value.length <= 512 && /^[\x20-\x7e]+$/.test(value)) {
      headers[name] = value;
    }
  }
  return headers;
}

function usageFromHeaders(headers) {
  const result = {};
  for (const window of ['primary', 'secondary']) {
    const usedHeader = headers.get(`x-codex-${window}-used-percent`);
    if (usedHeader === null) continue;
    const used = Number(usedHeader);
    if (!Number.isFinite(used)) continue;
    const durationHeader = headers.get(`x-codex-${window}-window-minutes`);
    const resetHeader = headers.get(`x-codex-${window}-reset-at`);
    const duration = durationHeader === null ? Number.NaN : Number(durationHeader);
    const resetAt = resetHeader === null ? Number.NaN : Number(resetHeader);
    result[window] = {
      usedPercent: Math.max(0, Math.min(100, used)),
      windowDurationMins: Number.isFinite(duration) ? duration : null,
      resetsAt: Number.isFinite(resetAt) ? resetAt : null,
    };
  }
  return Object.keys(result).length ? result : null;
}

function usageFromEvent(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.type === 'codex.response.metadata' && value.headers && typeof value.headers === 'object') {
    const headers = new Headers();
    for (const [name, headerValue] of Object.entries(value.headers)) {
      if (typeof headerValue === 'string') headers.set(name, headerValue);
    }
    return usageFromHeaders(headers);
  }
  if (value.type !== 'response.completed') return null;
  const usage = value.response?.usage;
  return usage && typeof usage === 'object' ? { lastResponseUsage: usage } : null;
}

async function activeCredentials(registry, force = false) {
  const route = await registry.activeRoute();
  if (route.profile.kind === 'provider') {
    if (!route.token) throw new Error('The selected provider has no access token.');
    return route;
  }
  const refreshed = await ensureFresh(route.accountHome, { force });
  return { ...route, token: refreshed.token, accountId: refreshed.accountId || route.accountId };
}

async function readRequestBody(request, maximumBytes = 64 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) throw Object.assign(new Error('Request body is too large.'), { statusCode: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function proxyHttpResponse(request, response, registry) {
  const body = await readRequestBody(request);
  let route = await activeCredentials(registry);
  const send = () => fetch(responseUrl(route.profile), {
    method: 'POST',
    headers: upstreamHeaders(request.headers, route.token, route.accountId),
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(300_000),
  });
  let upstream = await send();
  if (upstream.status === 401 && route.profile.kind !== 'provider') {
    route = await activeCredentials(registry, true);
    upstream = await send();
  }
  const usage = usageFromHeaders(upstream.headers);
  if (usage) void registry.updateUsage(route.profile.id, usage).catch(() => undefined);
  response.statusCode = upstream.status;
  for (const [name, value] of upstream.headers) {
    if (!STRIPPED_RESPONSE_HEADERS.has(name.toLowerCase())) response.setHeader(name, value);
  }
  response.setHeader('cache-control', 'no-cache');
  if (!upstream.body) return response.end();
  Readable.fromWeb(upstream.body).on('error', () => response.destroy()).pipe(response);
}

function createWebSocketProxy({ registry, authorize }) {
  const server = new WebSocket.WebSocketServer({ noServer: true, perMessageDeflate: true });

  server.on('connection', async (downstream, request) => {
    let route;
    try {
      route = await activeCredentials(registry);
    } catch (error) {
      downstream.close(1011, error.message.slice(0, 120));
      return;
    }
    const upstream = new WebSocket(websocketUrl(responseUrl(route.profile)), {
      headers: upstreamHeaders(request.headers, route.token, route.accountId),
      perMessageDeflate: true,
      handshakeTimeout: 15_000,
      followRedirects: false,
    });
    const pending = [];
    let opened = false;

    downstream.on('message', (data, isBinary) => {
      if (isBinary) return downstream.close(1003, 'Binary frames are unsupported.');
      if (!opened) pending.push(data);
      else if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: false });
    });
    downstream.on('close', (code, reason) => {
      if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
        upstream.close(code || 1000, reason);
      }
    });
    upstream.on('open', () => {
      opened = true;
      for (const message of pending.splice(0)) upstream.send(message, { binary: false });
    });
    upstream.on('message', (data, isBinary) => {
      if (isBinary) {
        downstream.close(1003, 'Upstream sent an unsupported binary frame.');
        return;
      }
      try {
        const usage = usageFromEvent(JSON.parse(data.toString('utf8')));
        if (usage) void registry.updateUsage(route.profile.id, usage).catch(() => undefined);
      } catch {}
      if (downstream.readyState === WebSocket.OPEN) downstream.send(data, { binary: false });
    });
    upstream.on('close', (code, reason) => {
      if (downstream.readyState === WebSocket.OPEN) downstream.close(code || 1011, reason);
    });
    upstream.on('error', () => {
      if (downstream.readyState === WebSocket.OPEN) downstream.close(1011, 'Upstream WebSocket failed.');
    });
  });

  function handleUpgrade(request, socket, head) {
    if (!authorize(request)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    server.handleUpgrade(request, socket, head, (websocket) => {
      server.emit('connection', websocket, request);
    });
  }

  return { handleUpgrade };
}

module.exports = {
  DEFAULT_OPENAI_RESPONSES_URL,
  activeCredentials,
  createWebSocketProxy,
  proxyHttpResponse,
  responseUrl,
  upstreamHeaders,
  usageFromEvent,
  usageFromHeaders,
  websocketUrl,
};
