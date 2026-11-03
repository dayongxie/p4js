import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const api = require('../../dist/index.js');

test('identify() reports the native P4API build', () => {
  const text = api.identify();
  assert.equal(typeof text, 'string');
  assert.match(text, /^p4js /);
  assert.match(text, /P4API/);
});

test('parseSpec/formatSpec round-trip a client spec with array fields', () => {
  const p4 = new api.P4();
  const form = [
    'Client:\tunit-test',
    '',
    'Root:\tC:\\unit',
    '',
    'View:',
    '\t//depot/a/... //unit-test/a/...',
    '\t//depot/b/... //unit-test/b/...',
    '',
  ].join('\n');

  const spec = p4.parseSpec('client', form);
  assert.equal(spec.Client, 'unit-test');
  assert.deepEqual(spec.View, [
    '//depot/a/... //unit-test/a/...',
    '//depot/b/... //unit-test/b/...',
  ]);

  const formatted = p4.formatSpec('client', {
    ...spec,
    Description: 'formatted by unit test',
    AltRoots: ['C:\\unit-alt1', 'C:\\unit-alt2'],
  });
  assert.match(formatted, /^Client:\s+unit-test/m);
  assert.match(formatted, /^View:/m);
  assert.match(formatted, /\/\/depot\/a\/\.\.\. \/\/unit-test\/a\/\.\.\./);
  assert.match(formatted, /^AltRoots:/m);
  assert.match(formatted, /C:\\unit-alt2/);
});

test('parseSpec/formatSpec round-trip a change spec', () => {
  const p4 = new api.P4();
  const spec = p4.parseSpec(
    'change',
    ['Change:\tnew', '', 'Client:\tunit-test', '', 'Description:', '\tunit change', ''].join('\n'),
  );
  assert.equal(spec.Change, 'new');
  assert.equal(spec.Description.trim(), 'unit change');

  const formatted = p4.formatSpec('change', { ...spec, Files: ['//depot/a.txt', '//depot/b.txt'] });
  assert.match(formatted, /^Change:\s+new/m);
  assert.match(formatted, /^Files:/m);
  assert.match(formatted, /\/\/depot\/a\.txt/);
  assert.match(formatted, /\/\/depot\/b\.txt/);
});

test('P4Error exposes errors, warnings and results', () => {
  const error = new api.P4Error('boom', {
    errors: ['first error'],
    warnings: ['a warning'],
    results: ['text'],
    command: 'submit',
  });
  assert.ok(error instanceof Error);
  assert.equal(error.message, 'boom');
  assert.deepEqual(error.errors, ['first error']);
  assert.deepEqual(error.warnings, ['a warning']);
  assert.deepEqual(error.results, ['text']);
  assert.equal(error.command, 'submit');
});
