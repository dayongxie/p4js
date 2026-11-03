/**
 * Public types shared by the p4js API.
 */

/** Value of a single field in a Perforce spec (form). */
export type P4SpecValue = string | string[];

/**
 * A Perforce spec (form), for example the result of `p4 client -o`.
 * Fields are either scalar strings or arrays of strings (multi-line fields).
 */
export type P4Spec = Record<string, P4SpecValue>;

/**
 * A single argument passed to a Perforce command.
 * Arrays are flattened recursively, numbers and booleans are converted to strings.
 */
export type P4Arg = string | number | boolean | readonly P4Arg[];

/**
 * A single result returned by a Perforce command: a string, a binary buffer,
 * or a parsed spec object.
 */
export type P4Result = string | Buffer | P4Spec;

/** A message emitted by the Perforce server while a command was running. */
export interface P4Message {
  severity: number;
  code: number;
  text: string;
  args?: Record<string, string>;
}

/**
 * Progress callbacks accepted by `P4.setProgress`.
 *
 * The object is forwarded to the native layer, which invokes whichever of the
 * methods are present while a long-running command is executing.
 */
export interface P4Progress {
  /** Called when progress reporting starts (level is the progress level). */
  init?: (level?: number) => void;
  /** Called when the description of the current phase changes. */
  setDescription?: (description?: string, command?: string) => void;
  /** Called when the total amount of work is known (0 means unknown). */
  setTotal?: (total?: number) => void;
  /** Called with the current position of the operation. */
  update?: (position?: number) => void;
  /** Called when progress reporting finishes. */
  done?: () => void;
}

/** An entry read from the Perforce ticket file. */
export interface P4Ticket {
  Host: string;
  User: string;
  Ticket: string;
}

/** Determines when command failures raise a {@link P4Error}. */
export type P4ExceptionLevel = 0 | 1 | 2;

/** Spec types that have generated convenience methods on {@link P4}. */
export type P4SpecType =
  | 'client'
  | 'label'
  | 'branch'
  | 'change'
  | 'stream'
  | 'job'
  | 'user'
  | 'group'
  | 'depot'
  | 'server';

/**
 * Options accepted by the {@link P4} constructor.
 *
 * Every option is optional and is applied through the native `setProp` method
 * with the same name (except `exceptionLevel`, which is implemented in JS).
 */
export interface P4Options {
  port?: string;
  user?: string;
  client?: string;
  password?: string;
  charset?: string;
  cwd?: string;
  host?: string;
  ticketFile?: string;
  trustFile?: string;
  ignoreFile?: string;
  language?: string;
  apiLevel?: number;
  streams?: boolean;
  tagged?: boolean;
  track?: boolean;
  graph?: boolean;
  debug?: boolean;
  prog?: string;
  version?: string;
  maxResults?: number;
  maxScanRows?: number;
  maxLockTime?: number;
  /** Name kept as-is for compatibility with the native property name. */
  envinroFile?: string;
  /** 0 = never throw, 1 = throw on errors, 2 = throw on errors or warnings. */
  exceptionLevel?: P4ExceptionLevel;
}
