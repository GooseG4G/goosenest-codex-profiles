const assert = require('node:assert/strict');
const { EventEmitter, once } = require('node:events');
const { PassThrough } = require('node:stream');
const test = require('node:test');
const { startDeviceAuth } = require('../src/device-auth');

function fakeCodexProcess() {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.killed = false;
  child.kill = () => {
    child.killed = true;
    child.exitCode = 0;
    child.emit('close', 0);
  };
  let buffered = '';
  child.stdin.on('data', (chunk) => {
    buffered += chunk.toString();
    for (;;) {
      const newline = buffered.indexOf('\n');
      if (newline < 0) break;
      const line = buffered.slice(0, newline);
      buffered = buffered.slice(newline + 1);
      const message = JSON.parse(line);
      if (message.method === 'initialize') {
        child.stdout.write(`${JSON.stringify({ id: message.id, result: {} })}\n`);
      } else if (message.method === 'account/login/start') {
        child.stdout.write(`${JSON.stringify({
          id: message.id,
          result: {
            type: 'chatgptDeviceCode',
            loginId: 'login-1',
            userCode: 'ABCD-EFGH',
            verificationUrl: 'https://auth.openai.com/device',
          },
        })}\n`);
      }
    }
  });
  return child;
}

test('device auth runs app-server in the background and exposes its code', async () => {
  const child = fakeCodexProcess();
  let spawnCall;
  const completed = new EventEmitter();
  const started = await startDeviceAuth({
    executable: 'codex-test',
    codexHome: 'isolated-home',
    spawnProcess: (executable, args, options) => {
      spawnCall = { executable, args, options };
      return child;
    },
    onComplete: () => completed.emit('done'),
  });

  assert.equal(spawnCall.executable, 'codex-test');
  assert.deepEqual(spawnCall.args, ['app-server', '--stdio']);
  assert.equal(spawnCall.options.windowsHide, true);
  assert.equal(spawnCall.options.env.CODEX_HOME, 'isolated-home');
  assert.equal(started.userCode, 'ABCD-EFGH');
  assert.equal(started.verificationUrl, 'https://auth.openai.com/device');

  const completion = once(completed, 'done');
  child.stdout.write(`${JSON.stringify({
    method: 'account/login/completed',
    params: { loginId: 'login-1', success: true },
  })}\n`);
  await completion;
  await started.flow.stop();
});

test('device auth accepts snake_case login payloads and completion status', async () => {
  const child = fakeCodexProcess();
  const started = await startDeviceAuth({
    executable: 'codex-test',
    codexHome: 'isolated-home',
    spawnProcess: () => child,
  });
  assert.equal(started.userCode, 'ABCD-EFGH');
  const completion = new Promise((resolve) => {
    child.stdout.write(`${JSON.stringify({
      method: 'account/login/completed',
      params: { login_id: 'login-1', status: 'authorized' },
    })}\n`);
    resolve();
  });
  await completion;
  await started.flow.stop();
});
