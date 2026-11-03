#!/usr/bin/env node
// Build the native addon and stage it under prebuilds/<platform>-<arch>/.
//
// Usage:
//   node scripts/prebuild.mjs            # build + stage
//   node scripts/prebuild.mjs --no-build # stage the current build output

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const platformArch = `${process.platform}-${process.arch}`;
const outDir = path.join(root, 'prebuilds', platformArch);
const sevenZipDllPattern = /^(libssl|libcrypto).*\.dll$/i;

function log(message) {
  console.log(`[prebuild] ${message}`);
}

function readP4ApiVersion() {
  try {
    const text = fs.readFileSync(path.join(root, 'third_party', 'p4api', 'Version'), 'utf8');
    const release = text.match(/RELEASE\s*=\s*([^;]+);/);
    const patch = text.match(/PATCHLEVEL\s*=\s*([^;]+);/);
    if (release && patch) return `${release[1].trim()}/${patch[1].trim()}`;
    if (release) return release[1].trim();
    const dirVersion = text.match(/p4api-(\d+\.\d+)\.(\d+)/);
    if (dirVersion) return `${dirVersion[1]}/${dirVersion[2]}`;
  } catch {
    // optional
  }
  return 'unknown';
}

function readOpenSslVersion() {
  const candidates = [
    process.env.P4SSL_ROOT,
    path.join(root, 'third_party', 'openssl'),
  ].filter(Boolean);
  for (const prefix of candidates) {
    try {
      const header = fs.readFileSync(
        path.join(prefix, 'include', 'openssl', 'opensslv.h'),
        'utf8',
      );
      const match = header.match(/OPENSSL_VERSION_STR\s+"([^"]+)"/);
      if (match) return match[1];
    } catch {
      // try next candidate
    }
  }
  return 'unknown';
}

function gitCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

function build() {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'build.mjs')], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function main() {
  if (!process.argv.includes('--no-build')) build();

  const native = path.join(root, 'build', 'Release', 'p4js_native.node');
  if (!fs.existsSync(native)) {
    console.error(`[prebuild] native module not found: ${native}`);
    process.exit(1);
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.copyFileSync(native, path.join(outDir, 'p4js_native.node'));

  const sslBin = path.join(root, 'third_party', 'openssl', 'bin');
  if (fs.existsSync(sslBin)) {
    for (const entry of fs.readdirSync(sslBin)) {
      if (sevenZipDllPattern.test(entry)) {
        fs.copyFileSync(path.join(sslBin, entry), path.join(outDir, entry));
      }
    }
  }

  const manifest = {
    name: pkg.name,
    version: pkg.version,
    napi: 8,
    platform: process.platform,
    arch: process.arch,
    file: 'p4js_native.node',
    p4api: readP4ApiVersion(),
    openssl: readOpenSslVersion(),
    commit: gitCommit(),
    builtAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const files = fs.readdirSync(outDir).sort();
  log(`staged ${platformArch}: ${files.join(', ')}`);
  log(`output: ${outDir}`);
}

try {
  main();
} catch (error) {
  console.error(`[prebuild] ${error.stack || error.message}`);
  process.exit(1);
}
