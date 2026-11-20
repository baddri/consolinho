import { Navigate } from 'react-router';
import { ClusterListError, ClusterListPending } from './ClusterListStates';
import { NoClustersPage } from './NoClustersPage';
import { useAccessibleClusters } from './useAccessibleClusters';
import { useLastCluster } from './useLastCluster';

/**
 * Element of the `/` index route (SW-3): replaces the URL with the root of the last used cluster if it is still
 * granted, else of the first cluster in contract order; the cluster's index route then picks its landing page
 * (Projects or Namespaces, ADR-0023). A stale remembered name is ignored. Users without clusters
 * see {@link NoClustersPage} (SW-4).
 */
export function LandingRedirect() {
  const { data: clusters, error, refetch } = useAccessibleClusters();
  const [lastCluster] = useLastCluster();

  if (!clusters) {
    return error ? <ClusterListError error={error} onRetry={() => void refetch()} /> : <ClusterListPending />;
  }
  const target = clusters.find((cluster) => cluster.name === lastCluster) ?? clusters[0];
  if (!target) {
    return <NoClustersPage />;
  }
  return <Navigate to={`/c/${encodeURIComponent(target.name)}`} replace />;
}
