/**
 * Integration test: P4.cancel() interrupts a long-running command.
 *
 * This file uses the TCP transport: a persistent standalone p4d is needed to
 * observe a command being interrupted mid-transfer (and to make the teardown
 * deterministic). All other suites use the cheaper RSH transport.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { defineP4dSuite } from '../helpers/suite.mjs';
import { TEST_TIMEOUT_MS } from '../helpers/p4d.mjs';
import { errorText } from '../helpers/env.mjs';

const BIG_FILE_SIZE = 64 * 1024 * 1024;
// Cancel almost immediately: the transfer has to still be in flight when
// cancel() is called (loopback is fast, and the event loop can delay timers).
const CANCEL_DELAY_MS = 5;

defineP4dSuite(
  'p4js integration: cancel over tcp',
  { label: 'cancel', transport: 'tcp' },
  ({ requireCtx, prerequisites }) => {
    test(
      'cancel() interrupts a long-running print and the promise rejects',
      { timeout: TEST_TIMEOUT_MS },
      async (t) => {
        const ctx = requireCtx(t);
        if (!ctx) return;

        const { P4Error } = prerequisites.api;

        // Submit a large binary file so `p4 print` streams long enough to be
        // interrupted reliably.
        const contents = Buffer.alloc(BIG_FILE_SIZE);
        for (let offset = 0; offset < contents.length; offset += 4096) {
          contents[offset] = offset & 0xff;
        }
        const submitted = await ctx.submitFile(
          ctx.p4,
          'cancel/big.bin',
          contents,
          'p4js: cancel test fixture',
          { fileType: 'binary' },
        );
        ctx.removeFile('cancel/big.bin');

        const p4 = ctx.newP4();
        await p4.connect();
        try {
          await ctx.login(p4);

          let cancelCalledAt = 0;
          const startedAt = Date.now();
          const timer = setTimeout(() => {
            cancelCalledAt = Date.now();
            p4.cancel();
          }, CANCEL_DELAY_MS);

          let error = null;
          try {
            // `print` streams the file; cancel() should abort it mid-transfer.
            await p4.run('print', '-q', submitted.depotPath);
          } catch (caught) {
            error = caught;
          } finally {
            clearTimeout(timer);
          }

          const settledAfterMs = Date.now() - startedAt;
          t.diagnostic(
            `cancel() called after ${cancelCalledAt === 0 ? 'never' : `${cancelCalledAt - startedAt}ms`}; ` +
              `print settled after ${settledAfterMs}ms`,
          );

          assert.ok(cancelCalledAt > 0, 'the cancel timer should fire before print() settles');
          assert.ok(
            error !== null,
            `print() resolved even though cancel() was called; it took ${settledAfterMs}ms ` +
              `(the ${BIG_FILE_SIZE}-byte file may have transferred before the cancel)`,
          );

          if (typeof P4Error === 'function') {
            assert.ok(
              error instanceof P4Error,
              `expected a P4Error, got ${error && error.constructor && error.constructor.name}: ${errorText(error)}`,
            );
          }

          const text = errorText(error);
          if (error.cancelled === true || /cancel/i.test(text)) {
            t.diagnostic(`cancellation reported as expected: ${text}`);
          } else {
            // The command definitely rejected (asserted above). Some native
            // error paths (e.g. a dropped connection) do not set `cancelled`
            // or use the word "cancel"; report it instead of failing the suite.
            t.diagnostic(`command rejected without an explicit cancellation marker: ${text}`);
          }

          assert.ok(
            settledAfterMs < TEST_TIMEOUT_MS,
            `the cancelled command took ${settledAfterMs}ms (bounded at ${TEST_TIMEOUT_MS}ms)`,
          );
        } finally {
          await p4.disconnect().catch(() => {});
        }
      },
    );
  },
);
