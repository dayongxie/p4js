import { P4 } from '../dist/index.js';

const target = process.argv[2] || '//depot/...';

const p4 = new P4({
  port: process.env.P4PORT,
  user: process.env.P4USER,
  client: process.env.P4CLIENT,
  charset: process.env.P4CHARSET || 'utf8',
});

p4.setProgress({
  init: (type) => process.stderr.write(`progress init (${type})\n`),
  setDescription: (text, units) => process.stderr.write(`${text} [${units}]\n`),
  setTotal: (total) => process.stderr.write(`total ${total}\n`),
  update: (position) => process.stderr.write(`\r${position}`),
  done: (fail) => process.stderr.write(`\ndone (fail=${fail})\n`),
});

try {
  await p4.connect();
  const results = await p4.run('sync', '-f', target);
  console.log(`synced ${results.length} records`);
} finally {
  await p4.disconnect();
}
