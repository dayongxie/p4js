import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { P4Spec } from './types';

const requireAddon = createRequire(__filename);

/** A structured message included in a native envelope. */
export interface NativeMessage {
  severity: number;
  code: number;
  text: string;
  args?: Record<string, string>;
}

/** One result entry produced by the native layer. */
export type NativeResult =
  | { kind: 'string'; value: string }
  | { kind: 'binary'; value: Buffer }
  | { kind: 'dict'; value: P4Spec }
  | { kind: 'spec'; value: P4Spec }
  | { kind: 'track'; value: string }
  | { kind: 'message'; severity: number; code: number; text: string; args?: Record<string, string> };

/** Envelope returned by {@link NativeP4.run}. */
export interface NativeEnvelope {
  results: NativeResult[];
  errors: string[];
  warnings: string[];
  messages: NativeMessage[];
  trackOutput: string[];
}

/** The native `NativeP4` class instance surface. */
export interface NativeP4 {
  getProp(name: string): string | number | boolean | undefined;
  setProp(name: string, value: string | number | boolean | null): void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  run(args: string[], inputs?: (string | Buffer)[]): Promise<NativeEnvelope>;
  serverLevel(): Promise<number>;
  serverUnicode(): Promise<boolean>;
  serverCaseInsensitive(): Promise<boolean>;
  parseSpec(type: string, form: string): P4Spec;
  formatSpec(type: string, spec: P4Spec): string;
  isIgnored(path: string): boolean;
  env(name: string): string | undefined;
  setEnv(name: string, value: string | null): void;
  protocol(name: string): string | undefined;
  setProtocol(name: string, value: string): void;
  setProgress(progress: object | null): void;
  cancel(): void;
}

/** The native `NativeMap` class instance surface. */
export interface NativeMap {
  insertLine(line: string): void;
  insert(lhs: string, rhs: string): void;
  translate(input: string, direction: number): string;
  translateArray(input: string, direction: number): string[];
  count(): number;
  reverse(): void;
  clear(): void;
  asString(): string;
  asArray(): string[];
  lhs(index: number): string;
  rhs(index: number): string;
  type(index: number): number;
  join(other: NativeMap): NativeMap;
}

/** Constructor signature of the native `NativeP4` class. */
export interface NativeP4Constructor {
  new (): NativeP4;
}

/** Constructor signature of the native `NativeMap` class. */
export interface NativeMapConstructor {
  new (): NativeMap;
}

/** The CommonJS native addon module shape. */
export interface NativeModule {
  NativeP4: NativeP4Constructor;
  NativeMap: NativeMapConstructor;
  identify(): string;
  version: string;
}

const NATIVE_FILE = 'p4js_native.node';
const PREBUILT_DIR = `${process.platform}-${process.arch}`;

function candidatePaths(): string[] {
  return [
    path.join(__dirname, NATIVE_FILE),
    path.join(__dirname, '..', 'build', 'Release', NATIVE_FILE),
    path.join(__dirname, '..', 'prebuilds', PREBUILT_DIR, NATIVE_FILE),
    path.join(__dirname, 'prebuilds', PREBUILT_DIR, NATIVE_FILE),
  ];
}

/**
 * Make sure a Windows addon can find OpenSSL DLLs shipped next to it. This is
 * a no-op on other platforms.
 *
 * Windows resolves an addon's dependent DLLs through PATH, so the directory
 * holding the addon (and its libssl/libcrypto DLLs) must be on PATH while the
 * addon is loaded. PATH belongs to the whole process and is inherited by every
 * child process started later, so the previous value is returned for
 * {@link loadNative} to restore once the addon and its DLLs are loaded:
 * leaking the entry would shadow unrelated executables — for example a
 * `dist/p4.js` sitting next to the addon would win over `p4.exe` when a later
 * child process runs `p4`.
 *
 * @param candidate Absolute path of the native addon file.
 * @returns The PATH value to restore, or `undefined` when PATH was unchanged.
 */
function prepareDllSearch(candidate: string): string | undefined {
  if (process.platform !== 'win32') return undefined;
  const dir = path.dirname(candidate);
  const current = process.env.PATH ?? '';
  const parts = current.split(path.delimiter);
  if (parts.includes(dir)) return undefined;
  process.env.PATH = `${dir}${path.delimiter}${current}`;
  return current;
}

function isNativeModule(value: unknown): value is NativeModule {
  if (typeof value !== 'object' || value === null) return false;
  const module = value as Record<string, unknown>;
  return typeof module.NativeP4 === 'function' && typeof module.NativeMap === 'function';
}

let cached: NativeModule | undefined;

/**
 * Load (and cache) the native addon.
 *
 * The addon is looked up next to the compiled JavaScript first (the `dist`
 * layout) and then in the node-gyp build output (`build/Release`).
 *
 * @throws Error with a descriptive message when the addon cannot be loaded.
 */
export function loadNative(): NativeModule {
  if (cached !== undefined) return cached;

  const failures: string[] = [];
  for (const candidate of candidatePaths()) {
    if (!existsSync(candidate)) {
      failures.push(`  - ${candidate} (file not found)`);
      continue;
    }
    let restorePath: string | undefined;
    try {
      restorePath = prepareDllSearch(candidate);
      const loaded: unknown = requireAddon(candidate);
      if (!isNativeModule(loaded)) {
        failures.push(`  - ${candidate} (missing NativeP4/NativeMap exports)`);
        continue;
      }
      cached = loaded;
      return loaded;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      failures.push(`  - ${candidate} (load failed: ${detail})`);
    } finally {
      // The addon and its DLLs are loaded now; drop the process-wide PATH
      // change so child processes keep resolving ordinary executables normally.
      if (restorePath !== undefined) process.env.PATH = restorePath;
    }
  }

  throw new Error(
    [
      'Unable to load the p4js native addon.',
      'Tried the following locations:',
      ...failures,
      'Use a platform prebuild from prebuilds/, or build the native module with "npm run build:native" (or "npm run build").',
    ].join('\n'),
  );
}

/** Create a native Perforce client instance. */
export function createNativeP4(): NativeP4 {
  return new (loadNative().NativeP4)();
}

/** Create a native Perforce map instance. */
export function createNativeMap(): NativeMap {
  return new (loadNative().NativeMap)();
}
