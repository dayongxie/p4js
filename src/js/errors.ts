import type { P4Message, P4Result } from './types';

/** Optional data attached to a {@link P4Error}. */
export interface P4ErrorOptions {
  /** Server-reported errors. */
  errors?: string[];
  /** Server-reported warnings. */
  warnings?: string[];
  /** Structured server messages. */
  messages?: P4Message[];
  /** Results of the command that raised the error (when available). */
  results?: P4Result[];
  /** The Perforce command that failed, e.g. `"submit"`. */
  command?: string;
  /** Whether the failure was caused by `P4.cancel()`. */
  cancelled?: boolean;
  /** Underlying cause, if any. */
  cause?: unknown;
}

/**
 * Error raised by the p4js API when a Perforce command reports errors or
 * warnings (subject to the instance exception level).
 */
export class P4Error extends Error {
  /** Server-reported errors (never empty for a command failure). */
  readonly errors: string[];

  /** Server-reported warnings. */
  readonly warnings: string[];

  /** Structured server messages. */
  readonly messages: P4Message[];

  /** Results that were produced before the error was raised. */
  readonly results: P4Result[];

  /** The command that failed, e.g. `"sync"`. */
  readonly command?: string;

  /** True when the command was cancelled through `P4.cancel()`. */
  readonly cancelled: boolean;

  /**
   * @param message Error message. Defaults to the first error, then the first
   * warning, then a generic message.
   * @param options Additional data attached to the error.
   */
  constructor(message?: string, options: P4ErrorOptions = {}) {
    const errors = options.errors ?? [];
    const warnings = options.warnings ?? [];
    const text = message ?? errors[0] ?? warnings[0] ?? 'Perforce command failed.';

    super(text, options.cause === undefined ? undefined : { cause: options.cause });

    this.name = 'P4Error';
    this.errors = [...errors];
    this.warnings = [...warnings];
    this.messages = options.messages === undefined ? [] : [...options.messages];
    this.results = options.results === undefined ? [] : [...options.results];
    this.command = options.command;
    this.cancelled = options.cancelled ?? false;

    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, P4Error);
    }
  }
}
