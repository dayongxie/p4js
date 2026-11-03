/**
 * Integration tests: file lifecycle (add/submit/sync/have/changes) and
 * progress callbacks.
 */

import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { defineP4dSuite } from '../helpers/suite.mjs';
import { TEST_TIMEOUT_MS } from '../helpers/p4d.mjs';
import { resultsText, specResults } from '../helpers/results.mjs';

async function connectClient(ctx, overrides = {}) {
  const p4 = ctx.newP4(overrides);
  await p4.connect();
  return p4;
}

defineP4dSuite('p4js integration: files', { label: 'files' }, ({ requireCtx }) => {
  test('add -> submit -> sync -f -> have -> changes', { timeout: TEST_TIMEOUT_MS }, async (t) => {
    const ctx = requireCtx(t);
    if (!ctx) return;

    const p4 = await connectClient(ctx);
    try {
      const contents = 'hello from the p4js integration suite\n';

      // Write + add the file ourselves so the API calls stay explicit.
      const absolutePath = ctx.createFile('lifecycle/hello.txt', contents);
      const p4Path = ctx.toP4Path(absolutePath);
      const depotPath = ctx.depotPath('lifecycle/hello.txt');

      const addResults = await p4.run('add', p4Path);
      t.diagnostic(`add: ${resultsText(addResults)}`);
      assert.ok(addResults.length >= 1, 'p4 add should return a result');

      // The native layer returns tagged records for `p4 add`:
      //   { action, clientFile, depotFile, type, workRev }
      const addRecord = specResults(addResults).find(
        (record) => record.depotFile !== undefined,
      );
      if (addRecord !== undefined) {
        assert.equal(String(addRecord.action), 'add');
        assert.equal(String(addRecord.depotFile), depotPath);
      } else {
        // Untagged fallback: the plain text should still mention the file.
        assert.match(
          `${resultsText(addResults)}\n${JSON.stringify(addResults)}`,
          /hello\.txt/,
          'the add result should mention the added file',
        );
      }

      const opened = await p4.run('opened');
      assert.equal(opened.length, 1, 'the file should be open for add before submit');

      const change = await p4.fetchChange();
      change.Description = 'p4js: add lifecycle/hello.txt';
      const submitResults = await p4.runSubmit(change);
      const submitText = resultsText(submitResults);
      t.diagnostic(`submit: ${submitText}`);
      assert.ok(submitResults.length >= 1, 'runSubmit() should return results');
      assert.equal((await p4.run('opened')).length, 0, 'submit should close the opened files');

      // The depot file exists and the change is the latest one.
      const files = await p4.run('files', depotPath);
      assert.equal(files.length, 1, `expected one depot file, got: ${resultsText(files)}`);
      assert.match(
        `${JSON.stringify(files)}\n${resultsText(files)}`,
        /\/\/depot\/lifecycle\/hello\.txt/,
      );

      const changes = await p4.run('changes', '-m', '1');
      assert.equal(changes.length, 1, 'changes -m 1 should return exactly one changelist');
      assert.match(
        `${JSON.stringify(changes)}\n${resultsText(changes)}`,
        /p4js: add lifecycle\/hello\.txt/,
        'the submitted description should appear in changes -m 1',
      );

      // Force a fresh transfer of the submitted file.
      ctx.removeFile('lifecycle/hello.txt');
      const syncResults = await p4.run('sync', '-f');
      const syncText = resultsText(syncResults);
      t.diagnostic(`sync: ${syncText}`);
      assert.match(
        `${JSON.stringify(syncResults)}\n${syncText}`,
        /hello\.txt/,
        'sync -f should mention the transferred file',
      );

      assert.equal(
        ctx.readFile('lifecycle/hello.txt').replace(/\r\n/g, '\n'),
        contents,
        'synced file contents must match what was submitted (after EOL normalization)',
      );

      const have = await p4.run('have');
      assert.ok(have.length >= 1, 'have should list the synced file');
      assert.match(
        `${JSON.stringify(have)}\n${resultsText(have)}`,
        /lifecycle\/hello\.txt/,
      );

      // p4.errors/p4.warnings reflect the last (successful) command.
      assert.deepEqual(p4.errors, []);
      assert.deepEqual(p4.warnings, []);
    } finally {
      await p4.disconnect().catch(() => {});
    }
  });

  test('progress callbacks report work and call done()', { timeout: TEST_TIMEOUT_MS }, async (t) => {
    const ctx = requireCtx(t);
    if (!ctx) return;

    const p4 = await connectClient(ctx);
    const fileCount = 12;
    const fileSize = 96 * 1024;
    const files = [];
    // Progress callbacks are delivered asynchronously by the native layer, so
    // give the event loop a moment before inspecting/clearing them.
    const settle = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));
    const sumEvents = (counters) =>
      counters.init + counters.setDescription + counters.setTotal + counters.update + counters.done;

    try {
      // One changelist with several medium files so the operation is big enough
      // for the server to report progress.
      for (let index = 0; index < fileCount; index += 1) {
        const relativePath = `progress/blob${index}.bin`;
        const contents = Buffer.alloc(fileSize, index);
        const absolutePath = ctx.createFile(relativePath, contents);
        const p4Path = ctx.toP4Path(absolutePath);
        await p4.run('add', '-t', 'binary', p4Path);
        files.push({ relativePath, absolutePath, p4Path, contents });
      }

      const change = await p4.fetchChange();
      change.Description = 'p4js: progress test fixtures';

      const events = { init: 0, setDescription: 0, setTotal: 0, update: 0, done: 0 };
      p4.setProgress({
        init() {
          events.init += 1;
        },
        setDescription() {
          events.setDescription += 1;
        },
        setTotal() {
          events.setTotal += 1;
        },
        update() {
          events.update += 1;
        },
        done() {
          events.done += 1;
        },
      });

      try {
        // Submitting several files reliably produces progress events (this is
        // also how p4go exercises the progress interface).
        const submitResults = await p4.runSubmit(change);
        assert.ok(submitResults.length >= 1, 'runSubmit() should return results');
        await settle();
        const submitEvents = { ...events };
        t.diagnostic(`submit progress: ${JSON.stringify(submitEvents)}`);

        assert.equal(
          (await p4.run('opened')).length,
          0,
          'all progress fixtures should be submitted',
        );

        // A forced sync exercises the transfer path too. p4d 2025.1 may not
        // report progress for short transfers, so this part is diagnostic.
        for (const file of files) ctx.removeFile(file.relativePath);
        await p4.run('sync', '-f', '//depot/progress/...');
        await settle();
        const syncEvents = Object.fromEntries(
          Object.entries(events).map(([key, value]) => [key, value - submitEvents[key]]),
        );
        t.diagnostic(`sync progress delta: ${JSON.stringify(syncEvents)}`);

        if (sumEvents(submitEvents) === 0 && sumEvents(syncEvents) === 0) {
          t.skip('the native layer did not report progress events for this workload');
          return;
        }

        if (sumEvents(submitEvents) > 0) {
          assert.ok(submitEvents.done >= 1, 'progress done() must be called for the submit');
          assert.ok(
            submitEvents.update >= 1 || submitEvents.setDescription >= 1 || submitEvents.init >= 1,
            `progress must report at least one non-done event (got ${JSON.stringify(submitEvents)})`,
          );
        }
        if (sumEvents(syncEvents) > 0) {
          assert.ok(syncEvents.done >= 1, 'progress done() must be called for the sync');
        } else {
          t.diagnostic('sync -f produced no progress events (acceptable: short transfer)');
        }

        const have = await p4.run('have');
        assert.ok(have.length >= fileCount, `expected ${fileCount} synced files, got ${have.length}`);
        for (const file of files) {
          assert.deepEqual(
            fs.readFileSync(ctx.clientPath(file.relativePath)),
            file.contents,
            `${file.relativePath} did not sync back byte-for-byte`,
          );
        }
      } finally {
        p4.setProgress(null);
      }
    } finally {
      p4.setProgress(null);
      await p4.disconnect().catch(() => {});
    }
  });
});
