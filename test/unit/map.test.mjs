import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const api = require('../../dist/index.js');

test('P4Map inserts, translates and reverses mapping lines', () => {
  const map = new api.P4Map('//depot/main/... //ws/main/...');
  assert.equal(map.count(), 1);
  assert.equal(map.isEmpty(), false);
  assert.equal(map.translate('//depot/main/file.txt'), '//ws/main/file.txt');
  assert.equal(map.translate('//ws/main/file.txt', 'reverse'), '//depot/main/file.txt');
  assert.equal(map.lhs(0), '//depot/main/...');
  assert.equal(map.rhs(0), '//ws/main/...');
  assert.equal(map.type(0), 'include');
  assert.deepEqual(map.toArray(), ['//depot/main/... //ws/main/...']);
  assert.equal(map.toString(), '//depot/main/... //ws/main/...');

  const pair = new api.P4Map(['//depot/x/...', '//ws/x/...']);
  assert.equal(pair.translate('//depot/x/a'), '//ws/x/a');

  const joined = api.P4Map.join(map, new api.P4Map('//ws/main/... //local/main/...'));
  assert.equal(joined.count(), 1);
  assert.equal(joined.translate('//depot/main/file.txt'), '//local/main/file.txt');

  map.reverse();
  assert.equal(map.translate('//ws/main/file.txt'), '//depot/main/file.txt');

  map.clear();
  assert.equal(map.isEmpty(), true);
});

test('P4Map rejects malformed constructor arguments', () => {
  assert.throws(() => new api.P4Map(['a', 'b', 'c']), TypeError);
});
