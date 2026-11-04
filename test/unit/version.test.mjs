import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const api = require('../../dist/index.js');
const packageJson = require('../../package.json');

test('exported version matches package.json', () => {
  assert.equal(api.version, packageJson.version);
});
