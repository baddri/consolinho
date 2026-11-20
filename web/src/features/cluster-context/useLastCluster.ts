import { useStoredValue } from '@/shared/hooks';

const STORAGE_KEY = 'fleetconsole.lastCluster';

/** The stored value is the cluster name itself. */
const asName = (raw: string): string => raw;

/**
 * The last cluster the user looked at, remembered in `localStorage['fleetconsole.lastCluster']` (FRONTEND.md
 * "Routing"). Convenience only: the value may name a cluster the user lost access to, so readers must check it against
 * {@link useAccessibleClusters} before using it. Written by `ClusterGate` whenever a granted cluster is shown.
 */
export function useLastCluster(): [string | undefined, (name: string) => void] {
  return useStoredValue(STORAGE_KEY, asName, asName);
}
