/**
 * Integration tests: connect/info and exception levels.
 *
 * Runs against its own isolated p4d (RSH mode, fresh temp root) so the
 * developer's real Perforce environment is never touched. Skips cleanly when
 * dist/index.js or p4d is unavailable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { defineP4dSuite } from '../helpers/suite.mjs';
import { resultsText, readInfo } from '../helpers/results.mjs';
import { errorText } from '../helpers/env.mjs';

defineP4dSuite('p4js integration: connect + info', { label: 'connect' }, ({ requireCtx, prerequisites }) => {
  test('connect() then run("info") reports the isolated server', async (t) => {
    const ctx = requireCtx(t);
    if (!ctx) return;

    const { P4 } = prerequisites.api;
    // The test suite always passes explicit connection options.
    const p4 = new P4({
      port: ctx.port,
      user: ctx.user,
      client: ctx.clientName,
      charset: ctx.charset,
    });

    assert.equal(p4.connected, false, 'a fresh P4 instance must not be connected');

    await p4.connect();
    assert.equal(p4.connected, true, 'connect() should mark the client as connected');

    const results = await p4.run('info');
    assert.ok(Array.isArray(results), 'run() must resolve to an array of results');

    const info = readInfo(results);
    t.diagnostic(`p4 info: address=${info.serverAddress} version=${info.serverVersion}`);
    assert.ok(
      info.serverAddress !== '',
      `p4 info did not expose a server address (results: ${JSON.stringify(results)})`,
    );
    assert.ok(
      info.serverVersion !== '',
      `p4 info did not expose a server version (results: ${JSON.stringify(results)})`,
    );

    // The tagged dict, when the native layer returns one, points at our temp root.
    const reportedRoot = String(info.spec.serverRoot ?? '');
    if (reportedRoot !== '') {
      const normalize = (value) => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
      assert.equal(
        normalize(reportedRoot),
        normalize(ctx.serverRoot),
        'p4 info reports a server root outside the isolated test directory',
      );
    }

    assert.deepEqual(p4.errors, [], 'a successful command should not record errors');

    await p4.disconnect();
    assert.equal(p4.connected, false, 'disconnect() should mark the client as disconnected');
  });

  test('identify() describes the native Perforce client', async (t) => {
    const ctx = requireCtx(t);
    if (!ctx) return;

    const { identify } = prerequisites.api.module;
    if (typeof identify !== 'function') {
      t.skip('dist/index.js does not export identify()');
      return;
    }
    const text = identify();
    assert.equal(typeof text, 'string');
    assert.match(text, /p4js/i, 'identify() should mention p4js');
  });

  test('exceptionLevel 0 returns results and records p4.errors instead of throwing', async (t) => {
    const ctx = requireCtx(t);
    if (!ctx) return;

    const { P4 } = prerequisites.api;
    const p4 = new P4({
      port: ctx.port,
      user: ctx.user,
      client: ctx.clientName,
      charset: ctx.charset,
      exceptionLevel: 0,
    });
    await p4.connect();
    try {
      const results = await p4.run('bogus-command');
      assert.ok(Array.isArray(results), 'run() must always resolve to results at exceptionLevel 0');
      assert.ok(
        p4.errors.length > 0,
        'the failed command must be recorded in p4.errors at exceptionLevel 0',
      );
      assert.match(errorText(p4.errors.join('\n')), /bogus|unknown/i);
      // Last-command state is exposed even though nothing was thrown.
      assert.ok(Array.isArray(p4.warnings), 'p4.warnings must be an array');
      assert.ok(Array.isArray(p4.messages), 'p4.messages must be an array');
    } finally {
      await p4.disconnect().catch(() => {});
    }
  });

  test('exceptionLevel 1 rejects P4Error for a failed command', async (t) => {
    const ctx = requireCtx(t);
    if (!ctx) return;

    const { P4, P4Error } = prerequisites.api;
    const p4 = new P4({
      port: ctx.port,
      user: ctx.user,
      client: ctx.clientName,
      charset: ctx.charset,
      exceptionLevel: 1,
    });
    await p4.connect();
    try {
      await assert.rejects(
        p4.run('bogus-command'),
        (error) => {
          assert.ok(
            typeof P4Error === 'function' && error instanceof P4Error,
            `expected a P4Error, got ${error && error.constructor && error.constructor.name}: ${errorText(error)}`,
          );
          assert.equal(error.name, 'P4Error');
          assert.equal(error.command, 'bogus-command');
          assert.ok(error.errors.length > 0, 'P4Error.errors must describe the server failure');
          assert.match(errorText(error), /bogus|unknown/i);
          assert.equal(error.cancelled, false);
          assert.ok(Array.isArray(error.results), 'P4Error.results must be an array');
          return true;
        },
        'a failed command must reject at exceptionLevel 1',
      );
    } finally {
      await p4.disconnect().catch(() => {});
    }
  });

  test('exceptionLevel 2 (default) rejects on errors and is the default', async (t) => {
    const ctx = requireCtx(t);
    if (!ctx) return;

    const { P4, P4Error } = prerequisites.api;
    const p4 = new P4({
      port: ctx.port,
      user: ctx.user,
      client: ctx.clientName,
      charset: ctx.charset,
    });
    assert.equal(p4.exceptionLevel, 2, 'exceptionLevel must default to 2');

    await p4.connect();
    try {
      // Post-construction assignment must be allowed while idle.
      p4.exceptionLevel = 2;
      assert.equal(p4.exceptionLevel, 2);

      await assert.rejects(
        p4.run('bogus-command'),
        (error) => {
          assert.ok(
            typeof P4Error === 'function' && error instanceof P4Error,
            `expected a P4Error, got ${errorText(error)}`,
          );
          assert.ok(error.errors.length > 0, 'P4Error.errors must describe the server failure');
          return true;
        },
        'a failed command must reject at exceptionLevel 2',
      );
    } finally {
      await p4.disconnect().catch(() => {});
    }
  });

  test('exceptionLevel 2 throws for warnings (when a warning-only command is available)', async (t) => {
    const ctx = requireCtx(t);
    if (!ctx) return;

    const { P4 } = prerequisites.api;
    const level1 = new P4({
      port: ctx.port,
      user: ctx.user,
      client: ctx.clientName,
      charset: ctx.charset,
      exceptionLevel: 1,
    });
    await level1.connect();

    // An empty isolated workspace has no well-known command that emits only a
    // warning, so probe a few harmless candidates. If none produces a warning
    // the warning distinction cannot be exercised: skip rather than pretend.
    const candidates = [
      ['sync', '-f'],
      ['submit', '-d', 'p4js warning probe'],
      ['revert', '-a'],
      ['integrate', '//depot/p4js-warning-probe-a', '//depot/p4js-warning-probe-b'],
    ];

    let warningCommand;
    try {
      for (const command of candidates) {
        try {
          await level1.run(...command);
        } catch {
          // Errors are fine here: we only look for warning-only outcomes.
        }
        if (level1.warnings.length > 0 && level1.errors.length === 0) {
          warningCommand = command;
          break;
        }
      }
    } finally {
      await level1.disconnect().catch(() => {});
    }

    if (!warningCommand) {
      t.skip('no stable warning-only command is available on an empty isolated server');
      return;
    }
    t.diagnostic(`warning-only command: p4 ${warningCommand.join(' ')}`);

    const level2 = new P4({
      port: ctx.port,
      user: ctx.user,
      client: ctx.clientName,
      charset: ctx.charset,
      exceptionLevel: 2,
    });
    await level2.connect();
    try {
      await assert.rejects(
        level2.run(...warningCommand),
        (error) => {
          assert.ok(error.errors.length === 0, 'the command should not report errors');
          assert.ok(error.warnings.length > 0, 'P4Error.warnings must carry the warning text');
          return true;
        },
        'exceptionLevel 2 must reject when the server reports warnings',
      );
    } finally {
      await level2.disconnect().catch(() => {});
    }
  });
});
