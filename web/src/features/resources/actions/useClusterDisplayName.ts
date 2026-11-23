import { useAccessibleClusters } from '@/features/cluster-context';
import type { AccessibleCluster } from '@/shared/api';

/** The user's entry for `cluster` from the accessible-clusters list, or `undefined` while loading or unknown. */
export function useAccessibleCluster(cluster: string): AccessibleCluster | undefined {
  return useAccessibleClusters().data?.find((entry) => entry.name === cluster);
}

/**
 * The name mutation feedback shows for `cluster` (ACT-6, SAFE-1): its display name, falling back to the cluster name
 * while the list loads or when the display name is blank.
 */
export function useClusterDisplayName(cluster: string): string {
  const displayName = useAccessibleCluster(cluster)?.displayName.trim();
  return displayName === undefined || displayName === '' ? cluster : displayName;
}
