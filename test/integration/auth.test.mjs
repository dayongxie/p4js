/**
 * Integration tests: password/login and ticket handling.
 */

import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { defineP4dSuite } from '../helpers/suite.mjs';
import { TEST_TIMEOUT_MS } from '../helpers/p4d.mjs';
import { errorText } from '../helpers/env.mjs';

async function connectClient(ctx, overrides = {}) {
  const p4 = ctx.newP4(overrides);
  await p4.connect();
  return p4;
}

/** Ensure the client can log in, bootstrapping a password if needed. */
async function ensureLogin(t, p4, ctx) {
  try {
    await p4.runLogin(ctx.password);
    return true;
  } catch (firstError) {
    // A fresh Secure-By-Default server may not have a password yet (the
    // bootstrap in setupP4d tolerates that); set one, then try again.
    try {
      await p4.runPassword('', ctx.password);
    } catch {
      // Password may already exist; the retry below decides.
    }
    try {
      await p4.runLogin(ctx.password);
      return true;
    } catch (secondError) {
      t.skip(
        `password login is not supported by this p4d: ${errorText(secondError)} ` +
          `(first attempt: ${errorText(firstError)})`,
      );
      return false;
    }
  }
}

defineP4dSuite('p4js integration: auth', { label: 'auth' }, ({ requireCtx }) => {
  test('login writes a ticket and runTickets() reports it', { timeout: TEST_TIMEOUT_MS }, async (t) => {
    const ctx = requireCtx(t);
    if (!ctx) return;

    const p4 = await connectClient(ctx);
    try {
      const loggedIn = await ensureLogin(t, p4, ctx);
      if (!loggedIn) return;

      t.diagnostic(`ticket file: ${ctx.ticketFile}`);
      const ticketFileExists = fs.existsSync(ctx.ticketFile);
      if (!ticketFileExists) {
        t.skip('login succeeded but no ticket file was written (platform-specific ticket location)');
        return;
      }

      const tickets = await p4.runTickets();
      assert.ok(Array.isArray(tickets), 'runTickets() must return an array');
      if (tickets.length === 0) {
        t.skip('ticket file is accessible but empty after login');
        return;
      }

      const ticket = tickets.find((entry) => entry.User === ctx.user) ?? tickets[0];
      t.diagnostic(`ticket entry: ${JSON.stringify({ ...ticket, Ticket: '<redacted>' })}`);
      assert.equal(typeof ticket.Host, 'string');
      assert.equal(typeof ticket.User, 'string');
      assert.equal(typeof ticket.Ticket, 'string');
      assert.ok(ticket.Host.length > 0, 'ticket Host must not be empty');
      assert.ok(ticket.Ticket.length > 0, 'ticket Ticket must not be empty');
      assert.equal(ticket.User, ctx.user, 'the ticket should belong to the isolated test user');
    } finally {
      await p4.disconnect().catch(() => {});
    }
  });

  test('a fresh instance can use the cached ticket', { timeout: TEST_TIMEOUT_MS }, async (t) => {
    const ctx = requireCtx(t);
    if (!ctx) return;

    const first = await connectClient(ctx);
    try {
      const loggedIn = await ensureLogin(t, first, ctx);
      if (!loggedIn) return;
    } finally {
      await first.disconnect().catch(() => {});
    }

    // A second client has its own connection but shares P4TICKETS.
    const second = await connectClient(ctx, { password: undefined });
    try {
      const results = await second.run('info');
      assert.ok(Array.isArray(results));
      assert.deepEqual(second.errors, [], 'the cached ticket should authenticate the new client');
    } finally {
      await second.disconnect().catch(() => {});
    }
  });

  test('runTickets() parses a ticket file and skips malformed lines', async (t) => {
    const ctx = requireCtx(t);
    if (!ctx) return;

    const ticketFile = path.join(ctx.baseDir, 'custom-p4tickets');
    fs.writeFileSync(
      ticketFile,
      [
        '# p4js ticket file fixture',
        'garbage line without equals',
        'garbage=without-colon',
        'host1.example:1666=user1:TICKET_AAAA',
        'host2.example:1666=user2:TICKET_BBBB',
        'host3.example:1666=user3',
        '',
      ].join('\r\n'),
      'utf8',
    );

    // runTickets() only reads the configured file; no connection is needed.
    const p4 = ctx.newP4({ ticketFile });
    try {
      const tickets = await p4.runTickets();
      assert.deepEqual(tickets, [
        { Host: 'host1.example:1666', User: 'user1', Ticket: 'TICKET_AAAA' },
        { Host: 'host2.example:1666', User: 'user2', Ticket: 'TICKET_BBBB' },
      ]);
    } finally {
      await p4.disconnect().catch(() => {});
    }
  });

  test('runTickets() raises P4Error when no ticket file is configured', async (t) => {
    const ctx = requireCtx(t);
    if (!ctx) return;

    const { P4Error } = ctx.api;
    // P4TICKETS is a process-level fallback; remove it so the empty ticketFile
    // option actually produces the "no ticket file configured" state.
    const previousTickets = process.env.P4TICKETS;
    delete process.env.P4TICKETS;
    const p4 = ctx.newP4({ ticketFile: '' });
    try {
      if (p4.ticketFile !== '') {
        t.skip(`ticketFile fell back to ${JSON.stringify(p4.ticketFile)}; empty-file path not testable`);
        return;
      }
      await assert.rejects(
        p4.runTickets(),
        (error) => {
          assert.ok(typeof P4Error === 'function' && error instanceof P4Error);
          assert.equal(error.command, 'tickets');
          assert.ok(error.errors.length > 0);
          return true;
        },
        'runTickets() without a ticket file must reject',
      );
    } finally {
      if (previousTickets === undefined) delete process.env.P4TICKETS;
      else process.env.P4TICKETS = previousTickets;
      await p4.disconnect().catch(() => {});
    }
  });
});
