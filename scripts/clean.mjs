#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

function remove(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`[clean] removed ${dir}`);
}

remove(path.join(root, 'build'));
remove(path.join(root, 'dist'));
remove(path.join(root, 'test', 'tmp'));
