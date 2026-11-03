/**
 * Shared environment helpers for the p4js integration tests.
 *
 * The suite is designed to run against an isolated, throw-away Perforce server:
 *   - every test file gets its own temp directory under test/tmp/<name>-XXXX
 *   - P4ENVIRO / P4TICKETS point into that directory
 *   - P4CONFIG / P4PORT / P4USER / P4CLIENT are removed from the process
 *     environment so the developer's real Perforce setup can never leak in
 *   - p4d is located via P4D_BIN, then PATH, then the Windows default location
 *
 * Nothing in this module imports dist/index.js eagerly: the built JavaScript API
 * may legitimately be absent while the native module is still being built, and
 * in that case the tests must skip instead of crashing during import.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** Repository root (the directory that contains package.json and dist/). */
export const repoRoot = path.resolve(import.meta.dirname, '..', '..');

/** Directory that holds every temporary server/client tree. git-ignored. */
export const tmpRoot = path.join(repoRoot, 'test', 'tmp');

/** Built JavaScript entry point. */
export const distEntry = path.join(repoRoot, 'dist', 'index.js');

/** Native addon copied next to the built JavaScript by scripts/build.mjs. */
export const nativeEntry = path.join(repoRoot, 'dist', 'p4js_native.node');

/**
 * Where the JavaScript layer looks for the addon: next to dist/index.js first,
 * then the node-gyp build output. See src/js/native.ts.
 */
export const nativeCandidates = [
  nativeEntry,
  path.join(repoRoot, 'build', 'Release', 'p4js_native.node'),
];

/** Environment variables that must never leak from the developer's machine. */
export const MANAGED_ENV_KEYS = [
  'P4CONFIG',
  'P4PORT',
  'P4USER',
  'P4CLIENT',
  'P4PASSWD',
  'P4TICKETS',
  'P4ENVIRO',
  'P4CHARSET',
  'P4HOST',
  'P4IGNORE',
];

const DEFAULT_WINDOWS_P4D = 'C:\\Program Files\\Perforce\\DVCS\\p4d.exe';

function isFile(candidate) {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/**
 * Locate the p4d executable.
 *
 * Order: P4D_BIN override, then every PATH entry, then the default Windows
 * install location (the DVCS layout used by the Perforce "P4" installer).
 *
 * @returns {{ path: string, source: string } | null}
 */
export function locateP4d() {
  const override = process.env.P4D_BIN;
  if (override) {
    const resolved = path.resolve(override);
    if (isFile(resolved)) return { path: resolved, source: 'P4D_BIN' };
    // A bare P4D_BIN value (e.g. "p4d" or a name) still gets a PATH lookup.
    const found = findOnPath(override);
    if (found) return { path: found, source: 'P4D_BIN/PATH' };
  }

  const onPath = findOnPath('p4d');
  if (onPath) return { path: onPath, source: 'PATH' };

  if (process.platform === 'win32' && isFile(DEFAULT_WINDOWS_P4D)) {
    return { path: DEFAULT_WINDOWS_P4D, source: 'default' };
  }

  return null;
}

function findOnPath(command) {
  const pathValue = process.env.PATH || '';
  const exts =
    process.platform === 'win32'
      ? ['', '.exe', '.cmd', '.bat']
      : ['', '.exe'];
  const dirs = pathValue.split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, command + ext);
      if (isFile(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Load the built p4js API.
 *
 * Returns a small descriptor instead of throwing so that the callers can skip
 * cleanly when `npm run build` has not been run yet.
 *
 * @returns {{
 *   ok: boolean,
 *   reason: string,
 *   module: any,
 *   P4: any,
 *   P4Error: any,
 *   P4Map: any,
 *   parseSpec: any,
 *   formatSpec: any,
 * }}
 */
export function loadApi() {
  if (loadApi.cached) return loadApi.cached;

  const result = {
    ok: false,
    reason: '',
    module: null,
    P4: undefined,
    P4Error: undefined,
    P4Map: undefined,
    parseSpec: undefined,
    formatSpec: undefined,
  };

  if (!fs.existsSync(distEntry)) {
    result.reason = `dist/index.js not found (${distEntry}); run "npm run build" first`;
    loadApi.cached = result;
    return result;
  }
  if (!nativeCandidates.some((candidate) => fs.existsSync(candidate))) {
    result.reason =
      `native addon not found (looked in ${nativeCandidates.join(', ')}); ` +
      'run "npm run build" first';
    loadApi.cached = result;
    return result;
  }

  try {
    const mod = require(distEntry);
    result.module = mod;
    result.P4 = pickExport(mod, 'P4');
    result.P4Error = pickExport(mod, 'P4Error');
    result.P4Map = pickExport(mod, 'P4Map');
    result.parseSpec = pickExport(mod, 'parseSpec');
    result.formatSpec = pickExport(mod, 'formatSpec');
  } catch (error) {
    result.reason = `failed to load ${distEntry}: ${describeError(error)}`;
    loadApi.cached = result;
    return result;
  }

  if (typeof result.P4 !== 'function') {
    result.reason = `dist/index.js does not export a P4 class (exports: ${Object.keys(
      result.module || {},
    ).join(', ')})`;
    loadApi.cached = result;
    return result;
  }

  result.ok = true;
  loadApi.cached = result;
  return result;
}

function pickExport(mod, name) {
  if (mod && typeof mod === 'object') {
    if (mod[name] !== undefined) return mod[name];
    const dflt = mod.default;
    if (dflt && typeof dflt === 'object' && dflt[name] !== undefined) {
      return dflt[name];
    }
  }
  return undefined;
}

/**
 * Check everything the integration suite needs before it starts a server.
 *
 * @returns {{ ok: boolean, reason: string, api: ReturnType<typeof loadApi>, p4d: ReturnType<typeof locateP4d> }}
 */
export function checkPrerequisites() {
  const api = loadApi();
  const p4d = locateP4d();
  if (!api.ok) return { ok: false, reason: api.reason, api, p4d };
  if (!p4d) {
    return {
      ok: false,
      reason:
        'p4d executable not found; set P4D_BIN or install Perforce (looked on PATH and at the default Windows location)',
      api,
      p4d,
    };
  }
  return { ok: true, reason: '', api, p4d };
}

/**
 * Skip the current test when the suite prerequisites are missing.
 *
 * @param {import('node:test').TestContext} t
 * @param {{ ok: boolean, reason: string }} prerequisites
 * @returns {boolean} true when the test may continue
 */
export function skipUnlessReady(t, prerequisites) {
  if (prerequisites.ok) return true;
  t.skip(prerequisites.reason);
  return false;
}

/**
 * Create a unique temporary directory below test/tmp.
 *
 * @param {string} label short, filesystem-safe label (e.g. "connect")
 * @returns {string} absolute directory path
 */
export function createTempRoot(label) {
  fs.mkdirSync(tmpRoot, { recursive: true });
  const safeLabel = String(label || 'p4js')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'p4js';
  return fs.mkdtempSync(path.join(tmpRoot, `${safeLabel}-`));
}

/**
 * Best-effort recursive removal (p4d may still hold files open right after a
 * command finishes, especially on Windows).
 *
 * @param {string} dir
 * @param {{ attempts?: number, delayMs?: number }} [options]
 */
export async function removeTempRoot(dir, options = {}) {
  const attempts = options.attempts ?? 10;
  const delayMs = options.delayMs ?? 100;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
      return true;
    } catch {
      if (attempt === attempts) return false;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return false;
}

/** A unique, lowercase-perforce-safe client name. */
export function uniqueClientName(prefix = 'p4js') {
  const suffix = crypto.randomBytes(4).toString('hex');
  const base = `${prefix}_${process.pid}_${suffix}`
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '_')
    .slice(0, 80);
  return base;
}

/** The OS user name; used as the Perforce super user for a local server. */
export function osUserName() {
  try {
    return os.userInfo().username;
  } catch {
    return process.env.USERNAME || process.env.USER || 'p4js-user';
  }
}

/**
 * Quote a single argument for a `rsh:` P4PORT string.
 *
 * p4 parses the rsh command line shell-like, so paths that contain spaces (the
 * usual Windows "C:\\Program Files\\..." install) must be double quoted.
 */
export function quoteP4Arg(value) {
  const text = String(value);
  if (text === '') return '""';
  if (!/[\s"]/.test(text)) return text;
  return `"${text.replace(/"/g, '\\"')}"`;
}

/**
 * Build a P4PORT in RSH mode: P4 spawns p4d for every command and talks to it
 * over stdin/stdout. No listening port, no trust fingerprint handling.
 *
 * @param {{ p4dPath: string, serverRoot: string, logFile: string }} options
 */
export function buildRshPort({ p4dPath, serverRoot, logFile }) {
  const parts = [
    'rsh:' + quoteP4Arg(p4dPath),
    '-r',
    quoteP4Arg(serverRoot),
    '-L',
    quoteP4Arg(logFile),
    '-vserver=3',
    '-i',
  ];
  return parts.join(' ');
}

/**
 * Build the p4d argument list for a standalone TCP server.
 *
 * @param {{ serverRoot: string, port: number, logFile: string }} options
 */
export function buildTcpArgs({ serverRoot, port, logFile }) {
  return [
    '-C1',
    '-r',
    serverRoot,
    '-p',
    `127.0.0.1:${port}`,
    '-L',
    logFile,
    '-vserver=3',
  ];
}

/** Build the p4d argv that initializes a brand new server root. */
export function buildInitArgs({ serverRoot, logFile, unicode = false }) {
  const args = ['-C1', '-r', serverRoot, '-L', logFile, '-vserver=3'];
  if (unicode) args.push('-xi');
  return args;
}

/** Find a free TCP port on the loopback interface. */
export function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/**
 * Wait until something accepts TCP connections on 127.0.0.1:port.
 *
 * @param {number} port
 * @param {{ timeoutMs?: number, intervalMs?: number }} [options]
 */
export async function waitForTcpPort(port, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15000;
  const intervalMs = options.intervalMs ?? 100;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const connected = await new Promise((resolve) => {
      const socket = net.connect({ port, host: '127.0.0.1' });
      const finish = (value) => {
        socket.removeAllListeners();
        socket.destroy();
        resolve(value);
      };
      socket.once('connect', () => finish(true));
      socket.once('error', () => finish(false));
      socket.setTimeout(1000, () => finish(false));
    });
    if (connected) return true;
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * Publish an isolated Perforce environment into process.env.
 *
 * The native ClientApi reads P4ENVIRO/P4CONFIG/etc. from the process
 * environment, so this must run before any `new P4(...)` of the test file.
 *
 * @param {string} baseDir directory that will hold p4enviro and p4tickets
 * @returns {{ P4ENVIRO: string, P4TICKETS: string, restore: () => void }}
 */
export function applyIsolatedProcessEnv(baseDir) {
  const snapshot = new Map();
  for (const key of MANAGED_ENV_KEYS) snapshot.set(key, process.env[key]);

  const enviro = path.join(baseDir, 'p4enviro');
  const tickets = path.join(baseDir, 'p4tickets');

  for (const key of ['P4CONFIG', 'P4PORT', 'P4USER', 'P4CLIENT', 'P4PASSWD', 'P4CHARSET', 'P4HOST', 'P4IGNORE']) {
    delete process.env[key];
  }
  process.env.P4ENVIRO = enviro;
  process.env.P4TICKETS = tickets;

  return {
    P4ENVIRO: enviro,
    P4TICKETS: tickets,
    restore() {
      for (const key of MANAGED_ENV_KEYS) {
        const previous = snapshot.get(key);
        if (previous === undefined) delete process.env[key];
        else process.env[key] = previous;
      }
    },
  };
}

/**
 * A recorded sample of the user's real environment that must never be used by
 * the tests. Useful for diagnostics when a test accidentally talks elsewhere.
 */
export function describePerforceEnv() {
  const keys = ['P4PORT', 'P4USER', 'P4CLIENT', 'P4CONFIG', 'P4ENVIRO', 'P4TICKETS'];
  return Object.fromEntries(keys.map((key) => [key, process.env[key] ?? null]));
}

/** Render an unknown thrown value for logs/assertion messages. */
export function describeError(error) {
  if (error === undefined || error === null) return String(error);
  if (typeof error === 'string') return error;
  if (error instanceof Error) {
    const extra = [];
    if (Array.isArray(error.errors) && error.errors.length > 0) {
      extra.push(`errors=${JSON.stringify(error.errors)}`);
    }
    if (error.code !== undefined) extra.push(`code=${JSON.stringify(error.code)}`);
    return extra.length > 0 ? `${error.message} (${extra.join(', ')})` : error.message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/** Collect the human-readable text of a P4Error / Error / array of messages. */
export function errorText(error) {
  if (error === undefined || error === null) return '';
  if (typeof error === 'string') return error;
  const parts = [];
  if (typeof error.message === 'string') parts.push(error.message);
  if (Array.isArray(error.errors)) {
    for (const entry of error.errors) parts.push(errorText(entry));
  }
  if (Array.isArray(error.results)) {
    for (const entry of error.results) parts.push(errorText(entry));
  }
  if (typeof error === 'object' && parts.length === 0) {
    try {
      parts.push(JSON.stringify(error));
    } catch {
      parts.push(String(error));
    }
  }
  return parts.join('\n');
}
