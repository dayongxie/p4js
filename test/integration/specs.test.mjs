/**
 * Integration tests: client specs (fetch/save) and parseSpec/formatSpec.
 */

import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { defineP4dSuite } from '../helpers/suite.mjs';
import { normalizeSpecValue, resultsText } from '../helpers/results.mjs';

function normalizePath(value) {
  return String(value).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

async function connectClient(ctx, overrides = {}) {
  const p4 = ctx.newP4(overrides);
  await p4.connect();
  return p4;
}

defineP4dSuite('p4js integration: specs', { label: 'specs' }, ({ requireCtx }) => {
  test('fetchClient(), modify Description/Root, saveClient(), fetchClient() reflects the change', async (t) => {
    const ctx = requireCtx(t);
    if (!ctx) return;

    const p4 = await connectClient(ctx);
    try {
      const original = await p4.fetchClient();
      assert.equal(normalizeSpecValue(original.Client), ctx.clientName);
      assert.equal(normalizePath(original.Root), normalizePath(ctx.clientRoot));

      const updatedRoot = path.join(ctx.clientRoot, 'spec-root');
      fs.mkdirSync(updatedRoot, { recursive: true });
      const updatedDescription = `p4js integration test workspace ${Date.now()}`;

      original.Description = updatedDescription;
      original.Root = updatedRoot;
      await p4.saveClient(original);

      const fetched = await p4.fetchClient();
      t.diagnostic(`saved client spec: Root=${JSON.stringify(fetched.Root)}`);
      assert.equal(
        normalizeSpecValue(fetched.Description),
        updatedDescription,
        'Description must round-trip through saveClient/fetchClient',
      );
      assert.equal(
        normalizePath(fetched.Root),
        normalizePath(updatedRoot),
        'Root must round-trip through saveClient/fetchClient',
      );

      // Restore the shared workspace root for the rest of the file.
      fetched.Root = ctx.clientRoot;
      fetched.Description = `p4js integration test workspace (${ctx.clientName})`;
      await p4.saveClient(fetched);
      const restored = await p4.fetchClient();
      assert.equal(normalizePath(restored.Root), normalizePath(ctx.clientRoot));
    } finally {
      await p4.disconnect().catch(() => {});
    }
  });

  test('fetchClient(name) can address the client explicitly', async (t) => {
    const ctx = requireCtx(t);
    if (!ctx) return;

    const p4 = await connectClient(ctx);
    try {
      const spec = await p4.fetchClient(ctx.clientName);
      assert.equal(normalizeSpecValue(spec.Client), ctx.clientName);
      assert.equal(normalizePath(spec.Root), normalizePath(ctx.clientRoot));
    } finally {
      await p4.disconnect().catch(() => {});
    }
  });

  test('parseSpec/formatSpec round-trip a client spec', async (t) => {
    const ctx = requireCtx(t);
    if (!ctx) return;

    const p4 = await connectClient(ctx);
    try {
      const spec = await p4.fetchClient();
      const form = p4.formatSpec('client', spec);
      assert.equal(typeof form, 'string');
      assert.ok(form.length > 0, 'formatSpec() returned an empty form');
      assert.match(form, /^Client:/m, `formatted client spec looks wrong:\n${form}`);

      const parsed = p4.parseSpec('client', form);
      assert.equal(typeof parsed, 'object');
      for (const field of ['Client', 'Root', 'Description', 'View']) {
        assert.equal(
          normalizeSpecValue(parsed[field]),
          normalizeSpecValue(spec[field]),
          `field ${field} did not survive a parseSpec(formatSpec()) round-trip`,
        );
      }

      // Formatting must be stable (idempotent) for the fetched spec.
      const formAgain = p4.formatSpec('client', p4.parseSpec('client', form));
      assert.equal(formAgain, form, 'formatSpec() output is not stable across a round-trip');
    } finally {
      await p4.disconnect().catch(() => {});
    }
  });

  test('parseSpec/formatSpec round-trip a change spec', async (t) => {
    const ctx = requireCtx(t);
    if (!ctx) return;

    const p4 = await connectClient(ctx);
    try {
      const change = await p4.fetchChange();
      assert.equal(normalizeSpecValue(change.Change), 'new', 'a fresh change form should start at "new"');
      change.Description = 'p4js spec round-trip\nsecond line of the description';

      const form = p4.formatSpec('change', change);
      assert.ok(form.length > 0, 'formatSpec() returned an empty change form');
      assert.match(form, /^Change:/m);

      const parsed = p4.parseSpec('change', form);
      assert.equal(normalizeSpecValue(parsed.Change), 'new');
      assert.equal(
        normalizeSpecValue(parsed.Description),
        normalizeSpecValue(change.Description),
        'Description must survive the change spec round-trip',
      );
      assert.equal(p4.formatSpec('change', parsed), form);
    } finally {
      await p4.disconnect().catch(() => {});
    }
  });

  test('saved client spec is visible through a second client connection', async (t) => {
    const ctx = requireCtx(t);
    if (!ctx) return;

    const first = await connectClient(ctx);
    const second = await connectClient(ctx);
    try {
      const spec = await first.fetchClient();
      spec.Description = 'p4js visibility check';
      await first.saveClient(spec);

      const fetched = await second.fetchClient();
      assert.equal(normalizeSpecValue(fetched.Description), 'p4js visibility check');
      assert.equal(
        normalizePath(fetched.Root),
        normalizePath(ctx.clientRoot),
        `client root changed unexpectedly: ${resultsText([fetched])}`,
      );
    } finally {
      await first.disconnect().catch(() => {});
      await second.disconnect().catch(() => {});
    }
  });
});
