const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { StoreTransactionQueue } = require('../src/store-transaction');

async function withTemporaryStore(run) {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-profiles-transaction-'));
  try {
    await run(path.join(directory, 'profiles.json'));
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
}

function assertSerialized(events) {
  assert.equal(events.length, 4);
  const firstId = events[0].slice('start:'.length);
  const secondId = firstId === 'first' ? 'second' : 'first';
  assert.deepEqual(events, [`start:${firstId}`, `end:${firstId}`, `start:${secondId}`, `end:${secondId}`]);
}

test('store transaction queue serializes independent store instances', async () => {
  await withTemporaryStore(async (lockTarget) => {
    const firstStore = new StoreTransactionQueue(lockTarget);
    const secondStore = new StoreTransactionQueue(lockTarget);
    const events = [];
    let running = 0;
    const operation = (store, id, wait) => store.run(async () => {
      running += 1;
      assert.equal(running, 1);
      events.push(`start:${id}`);
      await new Promise((resolve) => setTimeout(resolve, wait));
      events.push(`end:${id}`);
      running -= 1;
    });

    await Promise.all([
      operation(firstStore, 'first', 30),
      operation(secondStore, 'second', 0),
    ]);

    assertSerialized(events);
  });
});

test('store transaction queue releases its lock after an error', async () => {
  await withTemporaryStore(async (lockTarget) => {
    const firstStore = new StoreTransactionQueue(lockTarget);
    const secondStore = new StoreTransactionQueue(lockTarget);
    await assert.rejects(firstStore.run(async () => { throw new Error('expected'); }));
    assert.equal(await secondStore.run(async () => 'recovered'), 'recovered');
  });
});

test('store transaction queue serializes separate Node processes', async () => {
  await withTemporaryStore(async (lockTarget) => {
    const eventPath = path.join(path.dirname(lockTarget), 'events.log');
    const workerPath = path.join(__dirname, '..', 'test-support', 'transaction-worker.js');
    const runWorker = (id, wait) => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [workerPath, lockTarget, eventPath, id, String(wait)], {
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr || `Transaction worker exited with code ${code}.`));
      });
    });

    await Promise.all([runWorker('first', 40), runWorker('second', 10)]);
    const events = (await fs.promises.readFile(eventPath, 'utf8')).trim().split('\n');
    assertSerialized(events);
  });
});
