#!/usr/bin/env node
// Validate the package contents before npm publish.
//
// Runs from prepublishOnly; also useful locally:
//   node scripts/check-publish.mjs

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const pkg = require(path.join(root, 'package.json'));

function fail(message) {
  console.error(`[publish] ${message}`);
  process.exit(1);
}

if (pkg.name === 'p4js') {
  fail('the unscoped npm name "p4js" is owned by another publisher; use a scoped name');
}
if (pkg.private === true) {
  fail('package.json still has "private": true');
}
if (!pkg.version) {
  fail('package.json has no version');
}

for (const file of ['dist/index.js', 'dist/index.d.ts']) {
  if (!fs.existsSync(path.join(root, file))) {
    fail(`missing ${file}; run "npm run build:js"`);
  }
}

const requiredPrebuilds = [
  'win32-x64',
  'darwin-x64',
  'darwin-arm64',
];
for (const platformArch of requiredPrebuilds) {
  const dir = path.join(root, 'prebuilds', platformArch);
  const native = path.join(dir, 'p4js_native.node');
  if (!fs.existsSync(native) || fs.statSync(native).size === 0) {
    fail(`missing prebuild: ${path.relative(root, native)}`);
  }
  if (!fs.existsSync(path.join(dir, 'manifest.json'))) {
    fail(`missing prebuild manifest for ${platformArch}`);
  }
}

const tag = process.env.GITHUB_REF_NAME;
if (tag && tag.startsWith('v') && pkg.version !== tag.slice(1)) {
  fail(`tag ${tag} does not match package version ${pkg.version}`);
}

console.log(
  `[publish] ${pkg.name}@${pkg.version}: dist + ${requiredPrebuilds.length} prebuilds OK` +
    (tag ? ` (tag ${tag})` : ''),
);
