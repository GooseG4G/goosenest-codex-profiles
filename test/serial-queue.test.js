const test = require('node:test');
const assert = require('node:assert/strict');
const { SerialQueue } = require('../src/serial-queue');

test('serial queue preserves order without overlapping operations', async () => {
  const queue = new SerialQueue();
  const events = [];
  let running = 0;
  const operation = (id, delay) => queue.run(async () => {
    running += 1;
    assert.equal(running, 1);
    events.push(`start:${id}`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    events.push(`end:${id}`);
    running -= 1;
  });

  await Promise.all([operation('first', 10), operation('second', 0)]);
  assert.deepEqual(events, ['start:first', 'end:first', 'start:second', 'end:second']);
});

test('serial queue continues after a rejected operation', async () => {
  const queue = new SerialQueue();
  await assert.rejects(queue.run(async () => { throw new Error('expected'); }));
  assert.equal(await queue.run(async () => 'recovered'), 'recovered');
});
