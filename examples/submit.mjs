import path from 'node:path';
import { P4 } from '../dist/index.js';

const file = process.argv[2];
if (!file) {
  console.error('usage: node examples/submit.mjs <absolute-client-path> [description]');
  process.exit(2);
}

const p4 = new P4({
  port: process.env.P4PORT,
  user: process.env.P4USER,
  client: process.env.P4CLIENT,
  charset: process.env.P4CHARSET || 'utf8',
});

try {
  await p4.connect();
  await p4.run('add', path.resolve(file));

  const change = await p4.fetchChange();
  change.Description = process.argv[3] || `p4js: add ${path.basename(file)}`;
  const results = await p4.runSubmit(change);

  const submitted = results.find((entry) => typeof entry === 'object' && entry.change);
  console.log(submitted ? `submitted change ${submitted.change}` : 'submitted');
} finally {
  await p4.disconnect();
}
