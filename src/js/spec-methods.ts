import type { P4Arg, P4Result, P4Spec, P4SpecType } from './types';

/** Spec types that get generated convenience methods on {@link P4}. */
export const SPEC_TYPES: readonly P4SpecType[] = [
  'client',
  'label',
  'branch',
  'change',
  'stream',
  'job',
  'user',
  'group',
  'depot',
  'server',
];

/**
 * The host of the generated methods (structurally satisfied by `P4`).
 * Kept separate from `P4` itself to avoid a circular module dependency.
 */
export interface P4SpecMethodHost {
  fetch(type: string, ...args: P4Arg[]): Promise<P4Spec>;
  save(type: string, spec: P4Spec, ...args: P4Arg[]): Promise<P4Result[]>;
  delete(type: string, ...args: P4Arg[]): Promise<P4Result[]>;
  iterate(type: string, ...args: P4Arg[]): AsyncGenerator<P4Spec>;
}

/** Generated spec convenience methods, e.g. `fetchClient` / `iterateChanges`. */
export interface P4SpecMethods {
  fetchClient(...args: P4Arg[]): Promise<P4Spec>;
  saveClient(spec: P4Spec, ...args: P4Arg[]): Promise<P4Result[]>;
  deleteClient(...args: P4Arg[]): Promise<P4Result[]>;
  iterateClients(...args: P4Arg[]): AsyncGenerator<P4Spec>;

  fetchLabel(...args: P4Arg[]): Promise<P4Spec>;
  saveLabel(spec: P4Spec, ...args: P4Arg[]): Promise<P4Result[]>;
  deleteLabel(...args: P4Arg[]): Promise<P4Result[]>;
  iterateLabels(...args: P4Arg[]): AsyncGenerator<P4Spec>;

  fetchBranch(...args: P4Arg[]): Promise<P4Spec>;
  saveBranch(spec: P4Spec, ...args: P4Arg[]): Promise<P4Result[]>;
  deleteBranch(...args: P4Arg[]): Promise<P4Result[]>;
  iterateBranches(...args: P4Arg[]): AsyncGenerator<P4Spec>;

  fetchChange(...args: P4Arg[]): Promise<P4Spec>;
  saveChange(spec: P4Spec, ...args: P4Arg[]): Promise<P4Result[]>;
  deleteChange(...args: P4Arg[]): Promise<P4Result[]>;
  iterateChanges(...args: P4Arg[]): AsyncGenerator<P4Spec>;

  fetchStream(...args: P4Arg[]): Promise<P4Spec>;
  saveStream(spec: P4Spec, ...args: P4Arg[]): Promise<P4Result[]>;
  deleteStream(...args: P4Arg[]): Promise<P4Result[]>;
  iterateStreams(...args: P4Arg[]): AsyncGenerator<P4Spec>;

  fetchJob(...args: P4Arg[]): Promise<P4Spec>;
  saveJob(spec: P4Spec, ...args: P4Arg[]): Promise<P4Result[]>;
  deleteJob(...args: P4Arg[]): Promise<P4Result[]>;
  iterateJobs(...args: P4Arg[]): AsyncGenerator<P4Spec>;

  fetchUser(...args: P4Arg[]): Promise<P4Spec>;
  saveUser(spec: P4Spec, ...args: P4Arg[]): Promise<P4Result[]>;
  deleteUser(...args: P4Arg[]): Promise<P4Result[]>;
  iterateUsers(...args: P4Arg[]): AsyncGenerator<P4Spec>;

  fetchGroup(...args: P4Arg[]): Promise<P4Spec>;
  saveGroup(spec: P4Spec, ...args: P4Arg[]): Promise<P4Result[]>;
  deleteGroup(...args: P4Arg[]): Promise<P4Result[]>;
  iterateGroups(...args: P4Arg[]): AsyncGenerator<P4Spec>;

  fetchDepot(...args: P4Arg[]): Promise<P4Spec>;
  saveDepot(spec: P4Spec, ...args: P4Arg[]): Promise<P4Result[]>;
  deleteDepot(...args: P4Arg[]): Promise<P4Result[]>;
  iterateDepots(...args: P4Arg[]): AsyncGenerator<P4Spec>;

  fetchServer(...args: P4Arg[]): Promise<P4Spec>;
  saveServer(spec: P4Spec, ...args: P4Arg[]): Promise<P4Result[]>;
  deleteServer(...args: P4Arg[]): Promise<P4Result[]>;
  iterateServers(...args: P4Arg[]): AsyncGenerator<P4Spec>;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Plural form of a capitalized spec type, used for the `iterate*` methods. */
function pluralize(type: string): string {
  const suffix = capitalize(type);
  return /(?:ch|sh|s|x|z)$/.test(type) ? `${suffix}es` : `${suffix}s`;
}

/**
 * Install the generated spec convenience methods on a class prototype.
 *
 * Called once from the `P4` module; the methods simply forward to
 * `fetch`/`save`/`delete`/`iterate` with the spec type bound.
 */
export function installSpecMethods(host: P4SpecMethodHost): void {
  const proto = host as unknown as Record<string, unknown>;

  for (const type of SPEC_TYPES) {
    const suffix = capitalize(type);

    proto[`fetch${suffix}`] = function (this: P4SpecMethodHost, ...args: P4Arg[]): Promise<P4Spec> {
      return this.fetch(type, ...args);
    };

    proto[`save${suffix}`] = function (
      this: P4SpecMethodHost,
      spec: P4Spec,
      ...args: P4Arg[]
    ): Promise<P4Result[]> {
      return this.save(type, spec, ...args);
    };

    proto[`delete${suffix}`] = function (this: P4SpecMethodHost, ...args: P4Arg[]): Promise<P4Result[]> {
      return this.delete(type, ...args);
    };

    proto[`iterate${pluralize(type)}`] = function (
      this: P4SpecMethodHost,
      ...args: P4Arg[]
    ): AsyncGenerator<P4Spec> {
      return this.iterate(type, ...args);
    };
  }
}
