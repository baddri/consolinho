import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'fleetconsole.lastCluster';

/** Components using {@link useLastCluster}; notified when this tab writes a new value. */
const listeners = new Set<() => void>();

/** Reads the remembered cluster; storage is a convenience only, so any failure means "none". */
function read(): string | undefined {
  try {
    return globalThis.localStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    return undefined; // Storage blocked (private mode, policy).
  }
}

/** Writes the remembered cluster and notifies subscribers; not persisting is acceptable. */
function write(name: string): void {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, name);
  } catch {
    // Ignore: the landing page falls back to the first cluster.
  }
  listeners.forEach((listener) => listener());
}

/** Subscribes to writes from this tab and from other tabs (`storage` event). */
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  globalThis.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    globalThis.removeEventListener('storage', listener);
  };
}

/**
 * The last cluster the user looked at, remembered in `localStorage['fleetconsole.lastCluster']` (FRONTEND.md
 * "Routing"). Convenience only: the value may name a cluster the user lost access to, so readers must check it against
 * {@link useAccessibleClusters} before using it. Written by `ClusterGate` whenever a granted cluster is shown.
 */
export function useLastCluster(): [string | undefined, (name: string) => void] {
  const lastCluster = useSyncExternalStore(subscribe, read);
  const setLastCluster = useCallback((name: string) => {
    if (read() !== name) write(name);
  }, []);
  return [lastCluster, setLastCluster];
}
