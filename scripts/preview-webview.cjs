const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const portIndex = process.argv.indexOf('--port');
const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT || 4174);
const dist = path.join(__dirname, '..', 'build', 'dist');

function profileState(mode) {
  const now = Math.floor(Date.now() / 1000);
  if (mode === 'empty') return { profiles: [] };
  if (mode === 'auth') return {
    profiles: [],
    awaitingSignIn: true,
    deviceAuth: {
      userCode: 'ABCD-EFGH',
      verificationUrl: 'https://auth.openai.com/device',
    },
  };
  if (mode === 'auth-loading') return {
    profiles: [],
    awaitingSignIn: true,
  };
  const providerActive = mode === 'provider-active';
  const many = mode === 'many';
  const defaultProfiles = Array.from({ length: many ? 20 : 1 }, (_, index) => ({
    id: `profile-${index + 1}`,
    kind: 'default',
    name: many ? `profile-${String(index + 1).padStart(2, '0')}@example.com` : 'pro@example.com',
    active: !providerActive && index === 0,
    lastUsedAt: new Date(Date.now() - (index + 1) * 3_600_000).toISOString(),
    busy: mode === 'loading',
    usage: mode === 'loading' ? null : {
      limits: {
        status: 'ready',
        primary: { usedPercent: many ? (index * 7) % 80 : 42, windowDurationMins: 300, resetsAt: now + 7_200 },
        secondary: { usedPercent: many ? (index * 11) % 70 : 18, windowDurationMins: 10_080, resetsAt: now + 86_400 },
      },
      resets: {
        status: 'ready',
        resetCredits: many ? [] : [
          { id: 'reset-1', status: 'available', resetType: 'codexRateLimits', title: 'Full reset', expiresAt: now + 7_200 },
          { id: 'reset-2', status: 'available', resetType: 'codexRateLimits', title: 'Full reset', expiresAt: now + 14_400 },
        ],
        availableResetCount: many ? 0 : 2,
      },
    },
    plan: mode === 'loading' ? null : { planType: many ? (index % 3 === 0 ? 'Pro' : index % 3 === 1 ? 'Team' : 'Plus') : 'Pro' },
  }));
  return {
    profiles: [
      ...defaultProfiles,
      {
        ...(many ? { id: 'profile-provider' } : { id: 'provider-1' }),
        kind: 'provider', name: 'Local provider', active: providerActive,
        baseUrl: 'https://provider.example/v1', transport: 'websocket',
        lastUsedAt: new Date(Date.now() - 86_400_000).toISOString(),
      },
    ],
  };
}

function html(mode) {
  const state = JSON.stringify(profileState(mode)).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="en"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <link rel="stylesheet" href="/codex-profiles.css">
    </head><body><div id="app"></div>
    <script>window.acquireVsCodeApi=()=>({getState:()=>({}),setState:()=>{},postMessage:()=>{}});window.__CODEX_PROFILES_INITIAL_STATE__=${state}</script>
    <script src="/webview.js"></script></body></html>`;
}

const server = http.createServer((request, response) => {
  if (request.url === '/webview.js') {
    response.writeHead(200, { 'content-type': 'text/javascript' });
    return response.end(fs.readFileSync(path.join(dist, 'webview.js')));
  }
  if (request.url === '/codex-profiles.css') {
    response.writeHead(200, { 'content-type': 'text/css' });
    return response.end(fs.readFileSync(path.join(dist, 'codex-profiles.css')));
  }
  const mode = new URL(request.url, 'http://127.0.0.1').searchParams.get('state') || 'ready';
  response.writeHead(200, { 'content-type': 'text/html' });
  return response.end(html(mode));
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`webview preview listening on ${port}\n`);
});
