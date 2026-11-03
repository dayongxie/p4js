import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { P4Error } from './errors';
import {
  createNativeP4,
  type NativeEnvelope,
  type NativeMessage,
  type NativeP4,
} from './native';
import { SPEC_TYPES, installSpecMethods, type P4SpecMethods } from './spec-methods';
import type {
  P4Arg,
  P4ExceptionLevel,
  P4Message,
  P4Options,
  P4Progress,
  P4Result,
  P4Spec,
  P4SpecType,
  P4Ticket,
} from './types';

const STRING_OPTIONS = [
  'port',
  'user',
  'client',
  'password',
  'charset',
  'cwd',
  'host',
  'ticketFile',
  'trustFile',
  'ignoreFile',
  'language',
  'prog',
  'version',
  'envinroFile',
] as const satisfies readonly (keyof P4Options)[];

const NUMBER_OPTIONS = [
  'apiLevel',
  'maxResults',
  'maxScanRows',
  'maxLockTime',
] as const satisfies readonly (keyof P4Options)[];

const BOOLEAN_OPTIONS = ['streams', 'tagged', 'track', 'graph', 'debug'] as const satisfies readonly (keyof P4Options)[];

/** Name field used to look up each record when iterating over a listing. */
const ITERATE_NAME_FIELDS: Readonly<Record<string, string>> = {
  client: 'client',
  label: 'label',
  branch: 'branch',
  change: 'change',
  stream: 'Stream',
  job: 'Job',
  user: 'User',
  group: 'group',
  depot: 'name',
  server: 'Name',
};

function isArgArray(value: P4Arg): value is readonly P4Arg[] {
  return Array.isArray(value);
}

/** Flatten nested argument arrays and stringify numbers/booleans. */
function flattenArgs(args: readonly P4Arg[]): string[] {
  const flat: string[] = [];
  for (const arg of args) {
    if (isArgArray(arg)) {
      flat.push(...flattenArgs(arg));
    } else if (typeof arg === 'string') {
      flat.push(arg);
    } else {
      flat.push(String(arg));
    }
  }
  return flat;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return String(error);
}

function isSpecResult(value: P4Result): value is P4Spec {
  return typeof value === 'object' && value !== null && !Buffer.isBuffer(value);
}

/** Keep only the user-visible results (specs, strings and binary data). */
function resultsFromEnvelope(envelope: NativeEnvelope): P4Result[] {
  const results: P4Result[] = [];
  for (const entry of envelope.results ?? []) {
    switch (entry.kind) {
      case 'string':
      case 'binary':
      case 'dict':
      case 'spec':
        results.push(entry.value);
        break;
      case 'track':
      case 'message':
        break;
    }
  }
  return results;
}

function toP4Messages(messages: readonly NativeMessage[]): P4Message[] {
  return messages.map((message) => {
    const mapped: P4Message = {
      severity: message.severity,
      code: message.code,
      text: message.text,
    };
    if (message.args !== undefined) mapped.args = { ...message.args };
    return mapped;
  });
}

/** Parse the contents of a Perforce ticket file. */
function parseTicketFile(content: string): P4Ticket[] {
  const tickets: P4Ticket[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    const equals = line.indexOf('=');
    if (equals <= 0) continue;

    const host = line.slice(0, equals).trim();
    const credentials = line.slice(equals + 1);
    const colon = credentials.indexOf(':');
    if (colon <= 0) continue;

    const user = credentials.slice(0, colon).trim();
    const ticket = credentials.slice(colon + 1).trim();
    if (host === '' || user === '' || ticket === '') continue;

    tickets.push({ Host: host, User: user, Ticket: ticket });
  }
  return tickets;
}

/**
 * A Perforce client.
 *
 * All asynchronous operations on one instance are serialized through an
 * internal promise queue. Modifying a property while an operation is in flight
 * throws an Error.
 */
export class P4 {
  private readonly native: NativeP4;

  private exceptionLevelValue: P4ExceptionLevel = 2;
  private connectedFlag = false;
  private cancelRequested = false;

  private commandErrors: string[] = [];
  private commandWarnings: string[] = [];
  private commandMessages: P4Message[] = [];
  private commandTrackOutput: string[] = [];

  private queue: Promise<void> = Promise.resolve();
  private pendingOperations = 0;

  /** Input supplied to the next command: raw text, text lines, or a spec. */
  input: string | string[] | P4Spec | null = null;

  /** Spec type used to format {@link input} when it is a spec object. */
  inputSpec: string | null = null;

  constructor(options: P4Options = {}) {
    this.native = createNativeP4();

    if (options.exceptionLevel !== undefined) {
      this.exceptionLevelValue = options.exceptionLevel;
    }

    for (const name of STRING_OPTIONS) {
      const value = options[name];
      if (value !== undefined) this.native.setProp(name, value);
    }
    for (const name of NUMBER_OPTIONS) {
      const value = options[name];
      if (value !== undefined) this.native.setProp(name, value);
    }
    for (const name of BOOLEAN_OPTIONS) {
      const value = options[name];
      if (value !== undefined) this.native.setProp(name, value);
    }
  }

  // ---------------------------------------------------------------------------
  // Properties
  // ---------------------------------------------------------------------------

  get port(): string {
    return this.getStringProp('port');
  }
  set port(value: string) {
    this.setPropValue('port', value);
  }

  get user(): string {
    return this.getStringProp('user');
  }
  set user(value: string) {
    this.setPropValue('user', value);
  }

  get client(): string {
    return this.getStringProp('client');
  }
  set client(value: string) {
    this.setPropValue('client', value);
  }

  get password(): string {
    return this.getStringProp('password');
  }
  set password(value: string) {
    this.setPropValue('password', value);
  }

  get charset(): string {
    return this.getStringProp('charset');
  }
  set charset(value: string) {
    this.setPropValue('charset', value);
  }

  get cwd(): string {
    return this.getStringProp('cwd');
  }
  set cwd(value: string) {
    this.setPropValue('cwd', value);
  }

  get host(): string {
    return this.getStringProp('host');
  }
  set host(value: string) {
    this.setPropValue('host', value);
  }

  get ticketFile(): string {
    return this.getStringProp('ticketFile');
  }
  set ticketFile(value: string) {
    this.setPropValue('ticketFile', value);
  }

  get trustFile(): string {
    return this.getStringProp('trustFile');
  }
  set trustFile(value: string) {
    this.setPropValue('trustFile', value);
  }

  get ignoreFile(): string {
    return this.getStringProp('ignoreFile');
  }
  set ignoreFile(value: string) {
    this.setPropValue('ignoreFile', value);
  }

  get language(): string {
    return this.getStringProp('language');
  }
  set language(value: string) {
    this.setPropValue('language', value);
  }

  get prog(): string {
    return this.getStringProp('prog');
  }
  set prog(value: string) {
    this.setPropValue('prog', value);
  }

  get version(): string {
    return this.getStringProp('version');
  }
  set version(value: string) {
    this.setPropValue('version', value);
  }

  get envinroFile(): string {
    return this.getStringProp('envinroFile');
  }
  set envinroFile(value: string) {
    this.setPropValue('envinroFile', value);
  }

  get apiLevel(): number {
    return this.getNumberProp('apiLevel');
  }
  set apiLevel(value: number) {
    this.setPropValue('apiLevel', value);
  }

  get maxResults(): number {
    return this.getNumberProp('maxResults');
  }
  set maxResults(value: number) {
    this.setPropValue('maxResults', value);
  }

  get maxScanRows(): number {
    return this.getNumberProp('maxScanRows');
  }
  set maxScanRows(value: number) {
    this.setPropValue('maxScanRows', value);
  }

  get maxLockTime(): number {
    return this.getNumberProp('maxLockTime');
  }
  set maxLockTime(value: number) {
    this.setPropValue('maxLockTime', value);
  }

  get streams(): boolean {
    return this.getBooleanProp('streams');
  }
  set streams(value: boolean) {
    this.setPropValue('streams', value);
  }

  get tagged(): boolean {
    return this.getBooleanProp('tagged');
  }
  set tagged(value: boolean) {
    this.setPropValue('tagged', value);
  }

  get track(): boolean {
    return this.getBooleanProp('track');
  }
  set track(value: boolean) {
    this.setPropValue('track', value);
  }

  get graph(): boolean {
    return this.getBooleanProp('graph');
  }
  set graph(value: boolean) {
    this.setPropValue('graph', value);
  }

  get debug(): boolean {
    return this.getBooleanProp('debug');
  }
  set debug(value: boolean) {
    this.setPropValue('debug', value);
  }

  /** 0 = never throw, 1 = throw on errors, 2 = throw on errors or warnings. */
  get exceptionLevel(): P4ExceptionLevel {
    return this.exceptionLevelValue;
  }
  set exceptionLevel(value: P4ExceptionLevel) {
    this.assertIdle('exceptionLevel');
    this.exceptionLevelValue = value;
  }

  /** Whether {@link connect} has completed and {@link disconnect} has not. */
  get connected(): boolean {
    const value = this.native.getProp('connected');
    return typeof value === 'boolean' ? value : this.connectedFlag;
  }

  /** The Perforce config file in effect (e.g. from P4CONFIG). */
  get configFile(): string {
    const value = this.native.getProp('configFile');
    if (typeof value === 'string' && value !== '') return value;
    return this.native.env('P4CONFIG') ?? '';
  }

  /** Errors reported by the most recent command. */
  get errors(): string[] {
    return [...this.commandErrors];
  }

  /** Warnings reported by the most recent command. */
  get warnings(): string[] {
    return [...this.commandWarnings];
  }

  /** Structured messages reported by the most recent command. */
  get messages(): P4Message[] {
    return [...this.commandMessages];
  }

  /** Track output reported by the most recent command. */
  get trackOutput(): string[] {
    return [...this.commandTrackOutput];
  }

  // ---------------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------------

  /** Connect to the Perforce server. */
  async connect(): Promise<this> {
    return this.enqueue(async () => {
      try {
        await this.native.connect();
      } catch (error) {
        throw this.nativeError('connect', error);
      }
      this.connectedFlag = true;
      return this;
    });
  }

  /** Disconnect from the Perforce server. */
  async disconnect(): Promise<void> {
    return this.enqueue(async () => {
      try {
        await this.native.disconnect();
      } catch (error) {
        throw this.nativeError('disconnect', error);
      }
      this.connectedFlag = false;
    });
  }

  /** Run a Perforce command and return its results. */
  run(...args: P4Arg[]): Promise<P4Result[]> {
    return this.enqueue(() => this.runInternal(args));
  }

  /** Server protocol level. */
  async getServerLevel(): Promise<number> {
    return this.enqueue(async () => {
      try {
        return await this.native.serverLevel();
      } catch (error) {
        throw this.nativeError('serverLevel', error);
      }
    });
  }

  /** Whether the server uses Unicode mode. */
  async getServerUnicode(): Promise<boolean> {
    return this.enqueue(async () => {
      try {
        return await this.native.serverUnicode();
      } catch (error) {
        throw this.nativeError('serverUnicode', error);
      }
    });
  }

  /** Whether the server is case-insensitive. */
  async getServerCaseInsensitive(): Promise<boolean> {
    return this.enqueue(async () => {
      try {
        return await this.native.serverCaseInsensitive();
      } catch (error) {
        throw this.nativeError('serverCaseInsensitive', error);
      }
    });
  }

  /** Fetch a spec (`p4 <type> -o ...args`). */
  async fetch(type: string, ...args: P4Arg[]): Promise<P4Spec> {
    return this.enqueue(async () => {
      const results = await this.runInternal([type, '-o', ...args]);
      const spec = results.find(isSpecResult);
      if (spec === undefined) {
        const message = `Command "p4 ${type} -o" did not return a spec.`;
        throw new P4Error(message, { command: type, errors: [message] });
      }
      return spec;
    });
  }

  /** Save a spec (`p4 <type> -i ...args`). */
  async save(type: string, spec: P4Spec, ...args: P4Arg[]): Promise<P4Result[]> {
    return this.enqueue(async () => {
      const form = this.formatSpec(type, spec);
      this.input = form;
      return this.runInternal([type, '-i', ...args]);
    });
  }

  /** Delete a spec (`p4 <type> -d ...args`). */
  async delete(type: string, ...args: P4Arg[]): Promise<P4Result[]> {
    return this.enqueue(() => this.runInternal([type, '-d', ...args]));
  }

  /** Iterate over all specs of `type`, yielding one fetched spec at a time. */
  async *iterate(type: string, ...args: P4Arg[]): AsyncGenerator<P4Spec> {
    const records = await this.run(`${type}s`, ...args);
    const nameField = ITERATE_NAME_FIELDS[type] ?? type;

    for (const record of records) {
      if (typeof record !== 'object' || Buffer.isBuffer(record)) continue;

      const raw = record[nameField] as string | string[] | undefined;
      const name = Array.isArray(raw) ? raw[0] : raw;
      if (typeof name !== 'string' || name === '') continue;

      yield await this.fetch(type, name);
    }
  }

  /**
   * Submit a changelist.
   *
   * @param form Optional change spec (object) or pre-formatted change form (string).
   */
  async runSubmit(form?: string | P4Spec, ...args: P4Arg[]): Promise<P4Result[]> {
    return this.enqueue(async () => {
      if (typeof form === 'string') {
        this.input = form;
      } else if (form !== undefined) {
        this.input = form;
        this.inputSpec = 'change';
      }
      return this.runInternal(this.withInputFlag('submit', args));
    });
  }

  /**
   * Shelve a changelist.
   *
   * @param form Optional change spec (object) or pre-formatted change form (string).
   */
  async runShelve(form?: string | P4Spec, ...args: P4Arg[]): Promise<P4Result[]> {
    return this.enqueue(async () => {
      if (typeof form === 'string') {
        this.input = form;
      } else if (form !== undefined) {
        this.input = form;
        this.inputSpec = 'change';
      }
      return this.runInternal(this.withInputFlag('shelve', args));
    });
  }

  /**
   * Delete a shelved changelist (`p4 shelve -d`).
   *
   * `-d` is added when missing. When `-c` is missing, a positional changelist
   * argument (e.g. `deleteShelve('123')`) is prefixed with `-c`; if no
   * changelist is provided, a P4Error is raised.
   */
  async deleteShelve(...args: P4Arg[]): Promise<P4Result[]> {
    return this.enqueue(async () => {
      const flat = flattenArgs(args);
      const needsChange = !flat.includes('-c');
      const finalArgs: P4Arg[] = [];

      if (!flat.includes('-d')) finalArgs.push('-d');

      let insertedChange = false;
      for (const arg of flat) {
        if (needsChange && !insertedChange && !arg.startsWith('-')) {
          finalArgs.push('-c');
          insertedChange = true;
        }
        finalArgs.push(arg);
      }

      if (needsChange && !insertedChange) {
        const message =
          'deleteShelve() requires a changelist: pass "-c <change>" or a positional changelist number.';
        throw new P4Error(message, { command: 'shelve', errors: [message] });
      }

      return this.runInternal(['shelve', ...finalArgs]);
    });
  }

  /**
   * Log in (`p4 login`). The password defaults to `p4.password`.
   *
   * @param password Password to log in with.
   */
  async runLogin(password?: string, ...args: P4Arg[]): Promise<P4Result[]> {
    return this.enqueue(async () => {
      this.input = password ?? this.password;
      return this.runInternal(['login', ...args]);
    });
  }

  /**
   * Change the current user's password (`p4 password`).
   *
   * @param oldPassword Current password; pass an empty string when none is set.
   * @param newPassword New password.
   */
  async runPassword(oldPassword: string, newPassword: string, ...args: P4Arg[]): Promise<P4Result[]> {
    return this.enqueue(async () => {
      this.input = oldPassword
        ? [oldPassword, newPassword, newPassword]
        : [newPassword, newPassword];

      try {
        return await this.runInternal(['password', ...args]);
      } catch (error) {
        if (
          error instanceof P4Error &&
          error.errors.some((text) => text.includes("Passwords don't match"))
        ) {
          const message = 'Password invalid.';
          throw new P4Error(message, {
            command: 'password',
            errors: [message],
            results: error.results,
          });
        }
        throw error;
      }
    });
  }

  /** Read and parse the configured ticket file. */
  async runTickets(): Promise<P4Ticket[]> {
    return this.enqueue(async () => {
      const ticketFile = this.ticketFile;
      if (ticketFile === '') {
        const message =
          'No ticket file configured: set p4.ticketFile (or the P4TICKETS environment variable) before calling runTickets().';
        throw new P4Error(message, { command: 'tickets', errors: [message] });
      }

      let content: string;
      try {
        content = await readFile(ticketFile, 'utf8');
      } catch (error) {
        const detail = toErrorMessage(error);
        const message = `Unable to read ticket file "${ticketFile}": ${detail}`;
        throw new P4Error(message, { command: 'tickets', errors: [message], cause: error });
      }

      return parseTicketFile(content);
    });
  }

  // ---------------------------------------------------------------------------
  // Local (synchronous) helpers
  // ---------------------------------------------------------------------------

  /** Parse a spec form into a spec object. */
  parseSpec(type: string, form: string): P4Spec {
    return this.native.parseSpec(type, form);
  }

  /** Format a spec object into a spec form. */
  formatSpec(type: string, spec: P4Spec): string {
    return this.native.formatSpec(type, spec);
  }

  /** True when the path is ignored according to the Perforce ignore rules. */
  isIgnored(filePath: string): boolean {
    return this.native.isIgnored(path.resolve(filePath));
  }

  /** Read a Perforce environment variable. */
  env(name: string): string | undefined {
    return this.native.env(name);
  }

  /** Set (or clear, with `null`) a Perforce environment variable. */
  setEnv(name: string, value: string | null): void {
    this.native.setEnv(name, value);
  }

  /** Read a Perforce protocol variable. */
  protocol(name: string): string | undefined {
    return this.native.protocol(name);
  }

  /** Set a Perforce protocol variable. */
  setProtocol(name: string, value: string): void {
    this.native.setProtocol(name, value);
  }

  /** Register (or clear, with `null`) the progress callback object. */
  setProgress(progress: P4Progress | null): void {
    this.native.setProgress(progress);
  }

  /** Cancel the operation currently in progress. */
  cancel(): void {
    this.native.cancel();
    this.cancelRequested = true;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    this.pendingOperations += 1;

    const result = this.queue.then(operation, operation);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );

    const settled = (): void => {
      this.pendingOperations -= 1;
    };
    result.then(settled, settled);

    return result;
  }

  private assertIdle(property: string): void {
    if (this.pendingOperations > 0) {
      throw new Error(`Cannot set p4.${property} while a Perforce operation is in progress.`);
    }
  }

  private nativeError(command: string, error: unknown): P4Error {
    const message = toErrorMessage(error);
    return new P4Error(message, { command, errors: [message], cause: error });
  }

  private getStringProp(name: string): string {
    const value = this.native.getProp(name);
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return '';
  }

  private getNumberProp(name: string): number {
    const value = this.native.getProp(name);
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private getBooleanProp(name: string): boolean {
    const value = this.native.getProp(name);
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized !== '' && normalized !== '0' && normalized !== 'false' && normalized !== 'no';
    }
    return false;
  }

  private setPropValue(name: string, value: string | number | boolean | null): void {
    this.assertIdle(name);
    this.native.setProp(name, value);
  }

  private buildInputs(commandArgs: readonly string[]): (string | Buffer)[] {
    const input = this.input;
    if (input === null) return [];
    if (typeof input === 'string') return [input];
    if (Array.isArray(input)) return [...input];

    const type = this.inputSpec ?? P4.deriveSpecType(commandArgs[0] ?? '');
    return [this.formatSpec(type, input)];
  }

  private static deriveSpecType(command: string): P4SpecType {
    const normalized = command.toLowerCase();
    if (normalized === 'submit' || normalized === 'shelve') return 'change';
    if ((SPEC_TYPES as readonly string[]).includes(normalized)) return normalized as P4SpecType;

    throw new Error(
      `Cannot derive a spec type for P4 command "${command}". ` +
        'Set p4.inputSpec to the spec type (for example "change") before running the command.',
    );
  }

  private withInputFlag(command: string, args: readonly P4Arg[]): P4Arg[] {
    const flat = flattenArgs(args);
    return flat.includes('-i') ? [command, ...flat] : [command, '-i', ...flat];
  }

  private recordEnvelope(envelope: NativeEnvelope): void {
    this.commandErrors = [...(envelope.errors ?? [])];
    this.commandWarnings = [...(envelope.warnings ?? [])];
    this.commandMessages = toP4Messages(envelope.messages ?? []);
    this.commandTrackOutput = [...(envelope.trackOutput ?? [])];
  }

  private throwIfNeeded(
    envelope: NativeEnvelope,
    results: P4Result[],
    command: string,
  ): void {
    const errors = envelope.errors ?? [];
    const warnings = envelope.warnings ?? [];

    const cancelled =
      this.cancelRequested || errors.some((text) => /cancel/i.test(text));
    this.cancelRequested = false;

    if (this.exceptionLevelValue === 0) return;

    const shouldThrow =
      errors.length > 0 || (this.exceptionLevelValue === 2 && warnings.length > 0);
    if (!shouldThrow) return;

    throw new P4Error(undefined, {
      errors,
      warnings,
      messages: this.commandMessages,
      results,
      command,
      cancelled,
    });
  }

  private async runInternal(args: readonly P4Arg[]): Promise<P4Result[]> {
    const flat = flattenArgs(args);
    if (flat.length === 0) {
      const message = 'p4.run() requires a command name.';
      throw new P4Error(message, { errors: [message] });
    }

    const command = flat[0];

    let inputs: (string | Buffer)[] | undefined;
    try {
      const built = this.buildInputs(flat);
      inputs = built.length > 0 ? built : undefined;
    } finally {
      this.input = null;
      this.inputSpec = null;
    }

    let envelope: NativeEnvelope;
    try {
      envelope = await this.native.run(flat, inputs);
    } catch (error) {
      throw this.nativeError(command, error);
    }

    this.recordEnvelope(envelope);

    const results = resultsFromEnvelope(envelope);
    this.throwIfNeeded(envelope, results, command);
    return results;
  }
}

/** The {@link P4} class also exposes generated spec convenience methods. */
export interface P4 extends P4SpecMethods {}

installSpecMethods(P4.prototype);
