import { loadNative } from './native';

export { P4 } from './p4';
export { P4Error } from './errors';
export { P4Map } from './map';

export type { P4MapDirection } from './map';
export type {
  P4Arg,
  P4ExceptionLevel,
  P4Message,
  P4Options,
  P4Progress,
  P4Result,
  P4Spec,
  P4SpecType,
  P4SpecValue,
  P4Ticket,
} from './types';

/** Version of the p4js JavaScript API. */
export const version = '0.1.0';

/** Identify the underlying native Perforce client build. */
export function identify(): string {
  return loadNative().identify();
}
