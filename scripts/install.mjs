#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const p4api = path.resolve(process.env.P4API_ROOT || path.join(root, 'third_party', 'p4api'));
const p4ssl = path.resolve(process.env.P4SSL_ROOT || path.join(root, 'third_party', 'openssl'));

const checks = [
  [path.join(p4api, 'include', 'p4', 'clientapi.h'), 'P4API headers'],
  [path.join(p4ssl, 'include', 'openssl', 'opensslv.h'), 'OpenSSL headers'],
];

let ok = true;
for (const [file, label] of checks) {
  if (!fs.existsSync(file)) {
    console.log(`[install] missing ${label}: ${file}`);
    ok = false;
  }
}

if (!ok) {
  console.log('[install] run "npm run setup" before building the native module');
}

// Never fail npm install because the SDK has not been downloaded yet.
process.exit(0);
