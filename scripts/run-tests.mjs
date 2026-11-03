#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const nativeDir = path.join(root, 'dist');
const sslBin = path.resolve(process.env.P4SSL_ROOT || path.join(root, 'third_party', 'openssl'), 'bin');

function collectTests(dir) {
  if (!fs.existsSync(dir)) return [];
  if (fs.statSync(dir).isFile()) return dir.endsWith('.test.mjs') ? [dir] : [];
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...collectTests(full));
    else if (entry.name.endsWith('.test.mjs')) result.push(full);
  }
  return result;
}

if (!fs.existsSync(path.join(nativeDir, 'p4js_native.node'))) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'build.mjs')], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const env = { ...process.env };
const pathParts = [nativeDir];
if (fs.existsSync(sslBin)) pathParts.push(sslBin);
env.PATH = `${pathParts.join(path.delimiter)}${path.delimiter}${env.PATH || ''}`;

const requested = process.argv.slice(2);
const suites = [];
if (requested.length === 0) {
  suites.push(path.join(root, 'test', 'unit'), path.join(root, 'test', 'integration'));
} else {
  for (const arg of requested) {
    if (arg === '--unit' || arg === 'unit') suites.push(path.join(root, 'test', 'unit'));
    else if (arg === '--integration' || arg === 'integration') suites.push(path.join(root, 'test', 'integration'));
    else suites.push(path.resolve(root, arg));
  }
}

const files = suites.flatMap(collectTests);
if (files.length === 0) {
  console.log('[test] no test files found');
  process.exit(0);
}

const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: root,
  stdio: 'inherit',
  env,
});
process.exit(result.status ?? 1);
