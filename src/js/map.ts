import { createNativeMap, type NativeMap } from './native';

/** Direction accepted by {@link P4Map.translate}. */
export type P4MapDirection = 'lhs' | 'rhs' | 'forward' | 'reverse';

const DIRECTION_CODES: Record<P4MapDirection, number> = {
  lhs: 0,
  forward: 0,
  rhs: 1,
  reverse: 1,
};

/**
 * A Perforce path mapping (`p4 map` / `P4Map`).
 *
 * @example
 * const map = new P4Map('//depot/... //workspace/...');
 * map.translate('//depot/file.txt'); // '//workspace/file.txt'
 */
export class P4Map {
  private nativeMap: NativeMap;

  /**
   * @param args Map lines such as `"//depot/... //client/..."`, or `[lhs, rhs]` pairs.
   */
  constructor(...args: (string | string[])[]) {
    this.nativeMap = createNativeMap();
    for (const arg of args) {
      if (typeof arg === 'string') {
        this.nativeMap.insertLine(arg);
        continue;
      }
      if (Array.isArray(arg)) {
        if (arg.length === 0) continue;
        if (arg.length === 1) {
          this.nativeMap.insertLine(arg[0]);
          continue;
        }
        if (arg.length === 2) {
          this.nativeMap.insert(arg[0], arg[1]);
          continue;
        }
        throw new TypeError(
          `P4Map constructor array arguments must be [lhs, rhs] or [line]; received ${arg.length} entries.`,
        );
      }
      throw new TypeError('P4Map constructor arguments must be strings or string arrays.');
    }
  }

  /**
   * Insert a mapping line (`"//depot/... //client/..."`) or a `lhs`/`rhs` pair.
   */
  insert(lineOrLhs: string, rhs?: string): void {
    if (rhs === undefined) {
      this.nativeMap.insertLine(lineOrLhs);
      return;
    }
    this.nativeMap.insert(lineOrLhs, rhs);
  }

  /** Translate a single path. `lhs`/`forward` map left-to-right; `rhs`/`reverse` map right-to-left. */
  translate(input: string, direction: P4MapDirection = 'lhs'): string {
    return this.nativeMap.translate(input, DIRECTION_CODES[direction]);
  }

  /** Translate an array of paths. */
  translateArray(input: string, direction: P4MapDirection = 'lhs'): string[] {
    return this.nativeMap.translateArray(input, DIRECTION_CODES[direction]);
  }

  /** Number of mapping entries. */
  count(): number {
    return this.nativeMap.count();
  }

  /** Reverse the direction of every mapping entry. */
  reverse(): void {
    this.nativeMap.reverse();
  }

  /** Remove every mapping entry. */
  clear(): void {
    this.nativeMap.clear();
  }

  /** True when the map has no entries. */
  isEmpty(): boolean {
    return this.nativeMap.count() === 0;
  }

  /** The mapping in string form (`p4 map -o` style). */
  toString(): string {
    return this.nativeMap.asString();
  }

  /** The mapping lines as an array of strings. */
  toArray(): string[] {
    return this.nativeMap.asArray();
  }

  /** Left-hand side of the mapping at `index`. */
  lhs(index: number): string {
    return this.nativeMap.lhs(index);
  }

  /** Right-hand side of the mapping at `index`. */
  rhs(index: number): string {
    return this.nativeMap.rhs(index);
  }

  /** Mapping type at `index` (`"include"`, `"exclude"`, `"overlay"`, `"one-to-many"`). */
  type(index: number): string {
    const code = this.nativeMap.type(index);
    return ['include', 'exclude', 'overlay', 'one-to-many'][code] ?? String(code);
  }

  /** Join two maps into a new map. */
  static join(a: P4Map, b: P4Map): P4Map {
    return P4Map.fromNative(a.nativeMap.join(b.nativeMap));
  }

  private static fromNative(nativeMap: NativeMap): P4Map {
    const map = new P4Map();
    map.nativeMap = nativeMap;
    return map;
  }
}
