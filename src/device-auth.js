const { spawn } = require('child_process');

class DeviceAuthFlow {
  constructor(process, callbacks = {}) {
    this.process = process;
    this.callbacks = callbacks;
    this.requestId = 0;
    this.pending = new Map();
    this.buffer = '';
    this.loginId = '';
    this.completed = false;
    this.failed = false;
    this.stopping = false;
    this.stderr = '';

    process.stdout.on('data', (chunk) => this.onData(chunk));
    process.stderr.on('data', (chunk) => {
      this.stderr = `${this.stderr}${chunk.toString()}`.slice(-2_000);
    });
    process.on('error', (error) => this.fail(error));
    process.on('close', (code) => {
      if (!this.completed && !this.stopping) {
        this.fail(new Error(this.stderr.trim() || `Codex app-server exited with code ${code}.`));
      }
    });
  }

  write(message) {
    if (!this.process.stdin.writable) throw new Error('Codex app-server is not running.');
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  request(method, params, timeoutMs = 20_000) {
    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex ${method} request timed out.`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      try {
        this.write({ id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  onData(chunk) {
    this.buffer += chunk.toString();
    for (;;) {
      const newline = this.buffer.indexOf('\n');
      if (newline < 0) return;
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      if (Number.isInteger(message.id) && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message || String(message.error)));
        else pending.resolve(message.result);
        continue;
      }
      if (message.method !== 'account/login/completed') continue;
      const params = message.params || {};
      const completedLoginId = params.loginId || params.login_id;
      if (this.loginId && completedLoginId && completedLoginId !== this.loginId) continue;
      const successful = params.success === true
        || params.status === 'authorized'
        || params.status === 'completed';
      if (successful) {
        this.completed = true;
        this.callbacks.onComplete?.();
      } else {
        this.fail(new Error(params.error || 'Codex sign-in failed.'));
      }
    }
  }

  fail(error) {
    if (this.stopping || this.failed || this.completed) return;
    this.failed = true;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    this.callbacks.onError?.(error);
  }

  async cancel() {
    if (this.loginId && !this.completed) {
      try { await this.request('account/login/cancel', { loginId: this.loginId }, 2_000); } catch {}
    }
    await this.stop();
  }

  async stop() {
    this.stopping = true;
    if (this.process.exitCode !== null || this.process.killed) return;
    const closed = new Promise((resolve) => this.process.once('close', resolve));
    this.process.kill();
    await Promise.race([
      closed,
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
  }
}

async function startDeviceAuth({ executable, codexHome, onComplete, onError, spawnProcess = spawn }) {
  const child = spawnProcess(executable, ['app-server', '--stdio'], {
    env: { ...process.env, CODEX_HOME: codexHome },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const flow = new DeviceAuthFlow(child, { onComplete, onError });
  try {
    await flow.request('initialize', {
      clientInfo: {
        name: 'goosenest-codex-profiles',
        title: 'Goosenest Codex Profiles',
        version: '1',
      },
    });
    flow.write({ method: 'initialized' });
    const result = await flow.request('account/login/start', { type: 'chatgptDeviceCode' });
    if (result?.type !== 'chatgptDeviceCode') throw new Error('Codex returned an unsupported login flow.');
    flow.loginId = String(result.loginId || result.login_id || '');
    const userCode = String(result.userCode || result.user_code || '');
    const verificationUrl = String(result.verificationUrl || result.verification_url || '');
    if (!flow.loginId || !userCode || !verificationUrl) throw new Error('Codex returned an incomplete device-code response.');
    return { flow, userCode, verificationUrl };
  } catch (error) {
    await flow.stop();
    throw error;
  }
}

module.exports = { DeviceAuthFlow, startDeviceAuth };
