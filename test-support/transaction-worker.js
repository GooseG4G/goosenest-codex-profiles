const fs = require('node:fs');
const { StoreTransactionQueue } = require('../src/store-transaction');

const [, , lockTarget, eventPath, id, wait] = process.argv;
const queue = new StoreTransactionQueue(lockTarget);

queue.run(async () => {
  await fs.promises.appendFile(eventPath, `start:${id}\n`);
  await new Promise((resolve) => setTimeout(resolve, Number(wait)));
  await fs.promises.appendFile(eventPath, `end:${id}\n`);
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
