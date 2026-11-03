/**
 * Boilerplate shared by the integration test files.
 *
 * Every file gets one isolated p4d (fresh server root, client root, enviro file
 * and ticket file). When the suite prerequisites are missing (no dist/ build or
 * no p4d) the hooks stay inert and every test skips itself cleanly with the
 * reason returned by {@link checkPrerequisites}.
 */

import { after, before, describe } from 'node:test';

import { checkPrerequisites, skipUnlessReady } from './env.mjs';
import { setupP4d } from './p4d.mjs';

/**
 * Define a `describe()` block whose tests share one isolated p4d.
 *
 * @param {string} name describe() title
 * @param {Parameters<typeof setupP4d>[0]} options setupP4d options (label/transport/...)
 * @param {(helpers: {
 *   getCtx: () => (Awaited<ReturnType<typeof setupP4d>> | undefined),
 *   requireCtx: (t: import('node:test').TestContext) => (Awaited<ReturnType<typeof setupP4d>> | null),
 *   prerequisites: ReturnType<typeof checkPrerequisites>,
 * }) => void} register callback that registers the tests
 */
export function defineP4dSuite(name, options, register) {
  const prerequisites = checkPrerequisites();
  describe(name, () => {
    let ctx;

    before(async () => {
      if (!prerequisites.ok) return;
      ctx = await setupP4d(options);
    });

    after(async () => {
      if (ctx) await ctx.teardown();
    });

    const requireCtx = (t) => {
      if (!skipUnlessReady(t, prerequisites)) return null;
      if (!ctx) {
        t.skip('isolated p4d setup was skipped');
        return null;
      }
      return ctx;
    };

    register({ getCtx: () => ctx, requireCtx, prerequisites });
  });
}
