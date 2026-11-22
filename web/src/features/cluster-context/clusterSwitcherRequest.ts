import { useEffect } from 'react';

/** Open handlers of the mounted cluster switchers (normally exactly one, in the sidebar). */
const openHandlers = new Set<() => void>();

/**
 * Asks the sidebar's {@link ClusterSwitcher} to open its menu — e.g. "Select a cluster" on the cluster-not-available
 * page. A plain in-module signal: the switcher's open state stays local to it, and pages need no shared context.
 * Does nothing when no switcher is mounted.
 */
export function requestClusterSwitcherOpen(): void {
  openHandlers.forEach((open) => open());
}

/** Lets a cluster switcher react to {@link requestClusterSwitcherOpen} while it is mounted. Pass a stable callback. */
export function useClusterSwitcherOpenRequest(open: () => void): void {
  useEffect(() => {
    openHandlers.add(open);
    return () => {
      openHandlers.delete(open);
    };
  }, [open]);
}
