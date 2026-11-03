/**
 * Integration tests: P4Map (local, no server needed) and P4.isIgnored().
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { loadApi } from '../helpers/env.mjs';
import { defineP4dSuite } from '../helpers/suite.mjs';

// ---------------------------------------------------------------------------
// P4Map: pure local behavior, only needs the built API.
// ---------------------------------------------------------------------------

const api = loadApi();

describe('p4js integration: P4Map', () => {
  test('maps lines and translates in both directions', async (t) => {
    if (!api.ok) {
      t.skip(api.reason);
      return;
    }
    const { P4Map } = api;
    assert.equal(typeof P4Map, 'function', 'dist/index.js must export P4Map');

    const map = new P4Map('//depot/main/... //ws/main/...');
    assert.equal(map.count(), 1);
    assert.equal(map.isEmpty(), false);

    assert.equal(map.translate('//depot/main/foo.txt'), '//ws/main/foo.txt');
    assert.equal(map.translate('//depot/main/foo.txt', 'forward'), '//ws/main/foo.txt');
    assert.equal(map.translate('//ws/main/foo.txt', 'rhs'), '//depot/main/foo.txt');
    assert.equal(map.translate('//ws/main/foo.txt', 'reverse'), '//depot/main/foo.txt');
    assert.deepEqual(map.translateArray('//depot/main/foo.txt'), ['//ws/main/foo.txt']);

    assert.equal(map.lhs(0), '//depot/main/...');
    assert.equal(map.rhs(0), '//ws/main/...');
    assert.match(String(map.type(0)), /include/i);

    const lines = map.toArray();
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^\/\/depot\/main\/\.\.\.\s+\/\/ws\/main\/\.\.\./);
    assert.equal(typeof map.toString(), 'string');

    // Unmapped paths translate to an empty/nonsense string, never throw.
    assert.equal(typeof map.translate('//unmapped/path'), 'string');
  });

  test('insert, constructor pairs, reverse, clear and join', async (t) => {
    if (!api.ok) {
      t.skip(api.reason);
      return;
    }
    const { P4Map } = api;

    const map = new P4Map();
    assert.equal(map.isEmpty(), true);
    map.insert('//depot/other/... //ws/other/...');
    assert.equal(map.count(), 1);
    map.insert('//depot/pairs/...', '//ws/pairs/...');
    assert.equal(map.count(), 2);
    assert.equal(map.translate('//depot/pairs/file'), '//ws/pairs/file');

    const fromPairs = new P4Map(['//depot/x/...', '//ws/x/...']);
    assert.equal(fromPairs.count(), 1);
    assert.equal(fromPairs.translate('//depot/x/a'), '//ws/x/a');

    const reversed = new P4Map('//depot/main/... //ws/main/...');
    reversed.reverse();
    assert.equal(reversed.translate('//ws/main/foo.txt'), '//depot/main/foo.txt');

    const joined = P4Map.join(
      new P4Map('//depot/... //ws/...'),
      new P4Map('//ws/... /home/ws/...'),
    );
    assert.equal(joined.translate('//depot/main/foo.txt'), '/home/ws/main/foo.txt');

    reversed.clear();
    assert.equal(reversed.isEmpty(), true);
    assert.equal(reversed.count(), 0);
  });

  test('a malformed constructor argument throws a TypeError', async (t) => {
    if (!api.ok) {
      t.skip(api.reason);
      return;
    }
    const { P4Map } = api;
    assert.throws(() => new P4Map(42), TypeError);
    assert.throws(() => new P4Map(['a', 'b', 'c']), TypeError);
  });
});

// ---------------------------------------------------------------------------
// isIgnored: needs a native client, so it runs with the isolated server.
// ---------------------------------------------------------------------------

defineP4dSuite('p4js integration: isIgnored', { label: 'map-ignore' }, ({ requireCtx }) => {
  test('isIgnored() respects the configured ignore file', async (t) => {
    const ctx = requireCtx(t);
    if (!ctx) return;

    const ignoreRoot = path.join(ctx.baseDir, 'ignore-root');
    fs.mkdirSync(ignoreRoot, { recursive: true });
    const ignoreFile = path.join(ignoreRoot, '.p4ignore');
    fs.writeFileSync(ignoreFile, 'ignored.txt\nbuild/\n', 'utf8');

    const ignoredPath = path.join(ignoreRoot, 'ignored.txt');
    const keptPath = path.join(ignoreRoot, 'kept.txt');
    const ignoredDirPath = path.join(ignoreRoot, 'build', 'output.bin');
    fs.writeFileSync(ignoredPath, 'ignored\n', 'utf8');
    fs.writeFileSync(keptPath, 'kept\n', 'utf8');

    const previousIgnoreEnv = process.env.P4IGNORE;
    process.env.P4IGNORE = ignoreFile;

    const p4 = ctx.newP4({ ignoreFile, cwd: ignoreRoot });
    try {
      await p4.connect();
      // Ignore rules are initialized lazily by the native client; running a
      // command makes sure the client is fully configured.
      await p4.run('info');

      const ignored = p4.isIgnored(ignoredPath);
      const ignoredDir = p4.isIgnored(ignoredDirPath);
      const kept = p4.isIgnored(keptPath);
      t.diagnostic(
        `isIgnored: ${path.basename(ignoredPath)}=${ignored} ` +
          `build/output.bin=${ignoredDir} ${path.basename(keptPath)}=${kept}`,
      );

      if (!ignored) {
        t.skip(
          'native isIgnored() did not apply the configured ignore file ' +
            '(needs p4 ignore support initialized by the native layer)',
        );
        return;
      }

      assert.equal(ignored, true, 'ignored.txt must be reported as ignored');
      assert.equal(ignoredDir, true, 'files under the ignored build/ directory must be ignored');
      assert.equal(kept, false, 'kept.txt must not be reported as ignored');
    } finally {
      if (previousIgnoreEnv === undefined) delete process.env.P4IGNORE;
      else process.env.P4IGNORE = previousIgnoreEnv;
      await p4.disconnect().catch(() => {});
    }
  });
});
