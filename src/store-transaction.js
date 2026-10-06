const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');
const { SerialQueue } = require('./serial-queue');

class StoreTransactionQueue {
  constructor(lockTarget) {
    this.lockTarget = lockTarget;
    this.localQueue = new SerialQueue();
  }

  run(operation) {
    return this.localQueue.run(async () => {
      await fs.promises.mkdir(path.dirname(this.lockTarget), { recursive: true });
      const release = await lockfile.lock(this.lockTarget, {
        realpath: false,
        stale: 30_000,
        update: 10_000,
        retries: {
          retries: 50,
          factor: 1.2,
          minTimeout: 20,
          maxTimeout: 250,
          randomize: true,
        },
      });
      try {
        return await operation();
      } finally {
        await release();
      }
    });
  }
}

module.exports = { StoreTransactionQueue };
