import { useAccessibleClusters } from './useAccessibleClusters';
import { useActiveCluster } from './useActiveCluster';
import { useLastCluster } from './useLastCluster';

/**
 * The cluster that cluster-scoped navigation (sidebar links) should target: the active cluster from the URL, else the
 * last used cluster if still granted, else the first granted one. `undefined` when the user has no clusters (or the
 * list has not loaded on a non-cluster page) — callers then hide cluster navigation.
 *
 * An active cluster that is known not to be granted (the "not available" page) is skipped in favour of a granted
 * one, so the sidebar never links deeper into a cluster the user cannot open. While the list loads, the active
 * cluster is trusted so cluster pages don't flicker.
 */
export function usePreferredCluster(): string | undefined {
  const active = useActiveCluster();
  const [lastCluster] = useLastCluster();
  const { data: clusters } = useAccessibleClusters();

  if (!clusters) return active;
  const isGranted = (name: string | undefined): name is string =>
    name !== undefined && clusters.some((cluster) => cluster.name === name);
  if (isGranted(active)) return active;
  if (isGranted(lastCluster)) return lastCluster;
  return clusters[0]?.name;
}
