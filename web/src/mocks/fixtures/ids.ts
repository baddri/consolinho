/**
 * Deterministic GUID for fixture number `n` (`00000000-0000-4000-8000-00000000000a`). Ranges per entity keep ids
 * readable in test output: credentials 0x1xx, grants 0x2xx, audit 0xAxxx, ids created at runtime 0x9xxxxx.
 */
export function mockGuid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

/** FNV-1a 32-bit hash of `value` as 8 lowercase hex chars — the shape of a credential fingerprint (ADR-0004). */
export function fingerprintOf(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
