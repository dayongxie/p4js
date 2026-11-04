#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');

function log(message) {
  console.log(`[build] ${message}`);
}

function runNode(script, args) {
  execFileSync(process.execPath, [script, ...args], { cwd: root, stdio: 'inherit' });
}

function copyIfPossible(source, dest) {
  try {
    fs.copyFileSync(source, dest);
    return true;
  } catch (error) {
    // Windows may hold the previously loaded addon open (for example when a
    // long-running Node process is using it). Keep the existing artifact so
    // `npm test` can still run against the last build.
    if (error.code === 'EBUSY' || error.code === 'EPERM' || error.code === 'EACCES') {
      console.warn(`[build] cannot update ${dest} (${error.code}); keeping the existing file`);
      return false;
    }
    throw error;
  }
}

function copyDlls(dest) {
  const bin = path.resolve(process.env.P4SSL_ROOT || path.join(root, 'third_party', 'openssl'), 'bin');
  if (!fs.existsSync(bin)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(bin)) {
    if (/^(libssl|libcrypto).*\.dll$/i.test(entry)) {
      copyIfPossible(path.join(bin, entry), path.join(dest, entry));
    }
  }
}

function main() {
  const gyp = require.resolve('node-gyp/bin/node-gyp.js');
  const tsc = require.resolve('typescript/bin/tsc');

  log('building native module');
  runNode(gyp, ['rebuild']);

  log('building TypeScript');
  runNode(tsc, ['-p', path.join(root, 'tsconfig.json')]);

  const native = path.join(root, 'build', 'Release', 'p4js_native.node');
  if (!fs.existsSync(native)) {
    throw new Error(`native module not found: ${native}`);
  }
  const dist = path.join(root, 'dist');
  fs.mkdirSync(dist, { recursive: true });
  copyIfPossible(native, path.join(dist, 'p4js_native.node'));
  copyDlls(dist);
  log('done');
}

try {
  main();
} catch (error) {
  console.error(`[build] ${error.stack || error.message}`);
  process.exit(1);
}
