const { Readable, Transform } = require('stream');
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
  const planType = headers.get('x-codex-plan-type');
  if (planType) result.planType = planType;
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
  if (value.type === 'codex.rate_limits') {
    const limits = value.rate_limits || {};
    const result = usageFromHeaders(new Headers(value.headers || {})) || {};
    if (typeof value.plan_type === 'string') result.planType = value.plan_type;
    if (typeof limits.allowed === 'boolean') result.ordinaryUsageAllowed = limits.allowed;
    for (const [name, source] of [['primary', limits.primary], ['secondary', limits.secondary]]) {
      if (!source || typeof source !== 'object') continue;
      result[name] = {
        usedPercent: source.used_percent,
        windowDurationMins: source.window_minutes,
        resetsAt: source.reset_at,
      };
    }
    return Object.keys(result).length ? result : null;
  }
  if (value.type !== 'response.completed') return null;
  const usage = value.response?.usage;
  return usage && typeof usage === 'object' ? { lastResponseUsage: usage } : null;
}

function usageCaptureStream(registry, profileId) {
  let buffered = '';
  return new Transform({
    transform(chunk, encoding, callback) {
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      buffered += text;
      const lines = buffered.split(/\r?\n/);
      buffered = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        try {
          const usage = usageFromEvent(JSON.parse(line.slice(5).trim()));
          if (usage) void registry.updateUsage(profileId, usage).catch(() => undefined);
        } catch {
          // Non-JSON SSE frames are forwarded unchanged and ignored for usage.
        }
      }
      callback(null, chunk);
    },
    flush(chunkCallback) {
      if (buffered.startsWith('data:')) {
        try {
          const usage = usageFromEvent(JSON.parse(buffered.slice(5).trim()));
          if (usage) void registry.updateUsage(profileId, usage).catch(() => undefined);
        } catch {}
      }
      chunkCallback();
    },
  });
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

async function proxyHttpResponse(request, response, registry, credentials = activeCredentials) {
  const body = await readRequestBody(request);
  let route = await credentials(registry);
  const send = () => fetch(responseUrl(route.profile), {
    method: 'POST',
    headers: upstreamHeaders(request.headers, route.token, route.accountId),
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(300_000),
  });
  let upstream = await send();
  if (upstream.status === 401 && route.profile.kind !== 'provider') {
    route = await credentials(registry, true);
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
  const stream = Readable.fromWeb(upstream.body)
    .pipe(usageCaptureStream(registry, route.profile.id));
  stream.on('error', () => response.destroy()).pipe(response);
}

function connectWebSocket(url, headers) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, {
      headers,
      perMessageDeflate: true,
      handshakeTimeout: 15_000,
      followRedirects: false,
    });
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    socket.once('open', () => {
      if (settled) return;
      settled = true;
      resolve(socket);
    });
    socket.once('unexpected-response', (_request, response) => {
      const error = Object.assign(
        new Error(`Upstream WebSocket handshake failed (${response.statusCode}).`),
        { statusCode: response.statusCode },
      );
      response.resume();
      fail(error);
    });
    socket.once('error', fail);
  });
}

async function connectWebSocketWithAuthRefresh(
  registry,
  request,
  connect = connectWebSocket,
  credentials = activeCredentials,
) {
  let route = await credentials(registry);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const upstream = await connect(
        websocketUrl(responseUrl(route.profile)),
        upstreamHeaders(request.headers, route.token, route.accountId),
      );
      return { route, upstream };
    } catch (error) {
      if (
        attempt === 0
        && route.profile.kind !== 'provider'
        && error?.statusCode === 401
      ) {
        route = await credentials(registry, true);
        continue;
      }
      throw error;
    }
  }
  throw new Error('Upstream WebSocket authentication failed.');
}

function createWebSocketProxy({ registry, authorize }) {
  const server = new WebSocket.WebSocketServer({ noServer: true, perMessageDeflate: true });

  server.on('connection', async (downstream, request) => {
    let route;
    let upstream;
    const pending = [];
    let opened = false;
    let downstreamClosed = false;

    downstream.on('message', (data, isBinary) => {
      if (isBinary) return downstream.close(1003, 'Binary frames are unsupported.');
      if (!opened) pending.push(data);
      else if (upstream?.readyState === WebSocket.OPEN) upstream.send(data, { binary: false });
    });
    downstream.on('close', (code, reason) => {
      downstreamClosed = true;
      if (upstream?.readyState === WebSocket.OPEN || upstream?.readyState === WebSocket.CONNECTING) {
        upstream.close(code || 1000, reason);
      }
    });

    try {
      ({ route, upstream } = await connectWebSocketWithAuthRefresh(registry, request));
    } catch (error) {
      downstream.close(1011, error.message.slice(0, 120));
      return;
    }
    if (downstreamClosed) {
      if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
        upstream.close(1000, 'Downstream closed before upstream connection completed.');
      }
      return;
    }
    opened = true;
    for (const message of pending.splice(0)) upstream.send(message, { binary: false });
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
  connectWebSocketWithAuthRefresh,
  createWebSocketProxy,
  proxyHttpResponse,
  responseUrl,
  upstreamHeaders,
  usageFromEvent,
  usageFromHeaders,
  usageCaptureStream,
  websocketUrl,
};
