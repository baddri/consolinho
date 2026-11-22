import { useAccessibleClusters } from './useAccessibleClusters';
import { useActiveCluster } from './useActiveCluster';

/**
 * `true` when the URL names a cluster that the loaded cluster list does not contain — the case in which
 * `ClusterGate` shows "Cluster … is not available". `false` outside `/c/:cluster` and while the list loads (so
 * cluster pages don't flicker). The sidebar uses it to drop the cluster sections there (T-0097).
 */
export function useIsActiveClusterUnavailable(): boolean {
  const active = useActiveCluster();
  const { data: clusters } = useAccessibleClusters();
  if (active === undefined || !clusters) return false;
  return !clusters.some((cluster) => cluster.name === active);
}
