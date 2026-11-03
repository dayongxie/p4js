import { P4 } from '../dist/index.js';

const p4 = new P4({
  port: process.env.P4PORT,
  user: process.env.P4USER,
  client: process.env.P4CLIENT,
  charset: process.env.P4CHARSET || 'utf8',
});

try {
  await p4.connect();
  const info = await p4.run('info');
  console.log(JSON.stringify(info, null, 2));
} finally {
  await p4.disconnect();
}
