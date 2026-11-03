/**
 * Small helpers to inspect `P4.run()` results in assertions.
 *
 * `run()` returns a mix of plain strings (untagged output), Buffers (binary
 * output) and spec objects (tagged/dict output), so tests should not assume a
 * single shape for commands whose output format depends on the native layer.
 */

/** Flatten any result mix into readable text. */
export function resultsText(results) {
  const parts = [];
  for (const result of results ?? []) {
    if (typeof result === 'string') {
      parts.push(result);
      continue;
    }
    if (Buffer.isBuffer(result)) {
      parts.push(result.toString('utf8'));
      continue;
    }
    if (result && typeof result === 'object') {
      for (const value of Object.values(result)) {
        if (Array.isArray(value)) parts.push(value.join(' '));
        else if (value !== undefined && value !== null) parts.push(String(value));
      }
    }
  }
  return parts.join('\n');
}

/** Only the object/spec results (tagged output). */
export function specResults(results) {
  return (results ?? []).filter(
    (result) => result !== null && typeof result === 'object' && !Buffer.isBuffer(result),
  );
}

/** Normalize a spec field (string or string[]) for comparisons. */
export function normalizeSpecValue(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).join('\n').trim();
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

/**
 * Read `p4 info` output whether the native layer returned a tagged dict (fields
 * `serverAddress` / `serverVersion`) or untagged text lines.
 *
 * @param {import('./env.mjs').loadApi extends never ? never : any[]} results
 */
export function readInfo(results) {
  const text = resultsText(results);
  const spec =
    specResults(results).find(
      (result) => result.serverAddress !== undefined || result.serverVersion !== undefined,
    ) ?? {};

  const pick = (field, label) => {
    if (spec[field] !== undefined) return normalizeSpecValue(spec[field]);
    const match = text.match(new RegExp(`^${label}:\\s*(.+)$`, 'm'));
    return match ? match[1].trim() : '';
  };

  return {
    serverAddress: pick('serverAddress', 'Server address'),
    serverVersion: pick('serverVersion', 'Server version'),
    spec,
    text,
  };
}
