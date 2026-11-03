import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const api = require('../../dist/index.js');

test('P4 options are applied to properties', () => {
  const p4 = new api.P4({
    port: 'p4.example.com:1666',
    user: 'alice',
    client: 'alice_ws',
    charset: 'utf8',
    exceptionLevel: 1,
    tagged: false,
    apiLevel: 72,
  });
  assert.equal(p4.port, 'p4.example.com:1666');
  assert.equal(p4.user, 'alice');
  assert.equal(p4.client, 'alice_ws');
  assert.equal(p4.charset, 'utf8');
  assert.equal(p4.exceptionLevel, 1);
  assert.equal(p4.tagged, false);
  assert.equal(p4.apiLevel, 72);
});

test('an unknown charset throws a clear error', () => {
  const p4 = new api.P4();
  assert.throws(
    () => {
      p4.charset = 'definitely-not-a-charset';
    },
    /charset|Unknown/i,
  );
});

test('runTickets() parses a ticket file', async () => {
  const file = path.join(os.tmpdir(), `p4js-tickets-${process.pid}-${Date.now()}.txt`);
  fs.writeFileSync(file, 'p4.example.com:1666=alice:ABC123\nnot-a-ticket\n');
  try {
    const p4 = new api.P4({ ticketFile: file });
    const tickets = await p4.runTickets();
    assert.deepEqual(tickets, [
      { Host: 'p4.example.com:1666', User: 'alice', Ticket: 'ABC123' },
    ]);
  } finally {
    fs.rmSync(file, { force: true });
  }
});
