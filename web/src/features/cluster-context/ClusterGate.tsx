import { useEffect } from 'react';
import { Outlet } from 'react-router';
import { ClusterListError, ClusterListPending } from './ClusterListStates';
import { ClusterNotAvailablePage } from './ClusterNotAvailablePage';
import { useAccessibleClusters } from './useAccessibleClusters';
import { useActiveCluster } from './useActiveCluster';
import { useLastCluster } from './useLastCluster';
import { useRecentClusters } from './useRecentClusters';

/**
 * Layout route element of `/c/:cluster` (SW-5): renders the cluster pages only for a cluster in the user's list,
 * otherwise {@link ClusterNotAvailablePage}. Every shown granted cluster is remembered as the last used one (SW-3)
 * and moved to the front of the user's recent clusters (SW-8).
 *
 * A failed background refetch keeps the cached list, so a transient error never hides the page being viewed.
 */
export function ClusterGate() {
  const cluster = useActiveCluster() ?? '';
  const { data: clusters, error, refetch } = useAccessibleClusters();
  const [, setLastCluster] = useLastCluster();
  const { remember } = useRecentClusters();
  const isGranted = clusters?.some((candidate) => candidate.name === cluster) ?? false;

  useEffect(() => {
    if (!isGranted) return;
    setLastCluster(cluster);
    remember(cluster);
  }, [isGranted, cluster, setLastCluster, remember]);

  if (!clusters) {
    return error ? <ClusterListError error={error} onRetry={() => void refetch()} /> : <ClusterListPending />;
  }
  return isGranted ? <Outlet /> : <ClusterNotAvailablePage cluster={cluster} />;
}
