import { useCallback, useMemo, useSyncExternalStore } from 'react';

/** Components using {@link useStoredValue}; notified when this tab writes any stored value. */
const listeners = new Set<() => void>();

/** Reads the raw string; storage is a convenience only, so any failure means "none". */
function readRaw(key: string | undefined): string | undefined {
  if (key === undefined) return undefined;
  try {
    return globalThis.localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined; // Storage blocked (private mode, policy).
  }
}

/** Writes the raw string and notifies subscribers; not persisting is acceptable. */
function writeRaw(key: string, raw: string): void {
  try {
    globalThis.localStorage.setItem(key, raw);
  } catch {
    // Ignore: callers treat stored values as hints with a fallback.
  }
  listeners.forEach((listener) => listener());
}

/** Subscribes to writes from this tab (`listeners`) and from other tabs (`storage` event). */
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  globalThis.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    globalThis.removeEventListener('storage', listener);
  };
}

/**
 * A value remembered in `localStorage[key]`, shared live by every component using the same key in this tab and in
 * other tabs. Storage failures are ignored: reading yields `undefined`, writing is a no-op for persistence.
 *
 * The store snapshot is the raw string (stable for `useSyncExternalStore`); `parse` turns it into `T` (return
 * `undefined` for malformed data) and `serialize` back. Pass **stable** functions (module-level), otherwise the value
 * is re-parsed every render. A write that serializes to the stored string is skipped, so effects may call the setter
 * freely. `key` `undefined` (e.g. the user is not known yet) means "nothing stored" and a no-op setter.
 */
export function useStoredValue<T>(
  key: string | undefined,
  parse: (raw: string) => T | undefined,
  serialize: (value: T) => string,
): [T | undefined, (value: T) => void] {
  const raw = useSyncExternalStore(subscribe, () => readRaw(key));
  const value = useMemo(() => (raw === undefined ? undefined : parse(raw)), [raw, parse]);
  const setValue = useCallback(
    (next: T) => {
      if (key === undefined) return;
      const serialized = serialize(next);
      if (readRaw(key) !== serialized) writeRaw(key, serialized);
    },
    [key, serialize],
  );
  return [value, setValue];
}
