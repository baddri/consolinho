import { useCallback, useMemo } from 'react';
import { useAccessibleClusters } from '@/features/cluster-context';
import type { AccessibleCluster, ApiError, FleetClusterStatus } from '@/shared/api';
import { useFleetStatus, type FleetStatus, type FleetStatusByName } from './useFleetStatus';

/** One row of the fleet table: a cluster, its status line once it arrived, and whether it is still being checked. */
export interface FleetRow {
  cluster: AccessibleCluster;
  status?: FleetClusterStatus;
  /** No line yet and the stream is running ("Checking…"). */
  pending: boolean;
}

/** Result of {@link useFleetRows}. */
export interface FleetRows extends Omit<FleetStatus, 'byName'> {
  rows: readonly FleetRow[];
  /** The cluster list (`GET /api/clusters`) is still loading and no line has arrived. */
  isLoading: boolean;
  /** Error of the cluster list; the stream's error is {@link FleetStatus.error}. */
  clustersError: ApiError | null;
  /** Reloads the cluster list (the page's retry when it failed). */
  refetchClusters: () => void;
}

/**
 * Joins `rows` from the clusters list (so rows show up at once, in its environment-then-name order) with the stream's
 * lines (contract §2.2). Once a stream has completed, clusters without a line are dropped; before that they are
 * pending while fetching (and kept, not pending, after a failed first fetch, behind the page's error); clusters known only to the stream (the list cache
 * is older than a new grant) are appended in arrival order, built from `status.cluster`.
 */
export function joinFleetRows(
  clusters: readonly AccessibleCluster[],
  byName: FleetStatusByName,
  { isFetching, hasCompleted }: Pick<FleetStatus, 'isFetching' | 'hasCompleted'>,
): FleetRow[] {
  const listed = new Set(clusters.map((cluster) => cluster.name));
  const rows: FleetRow[] = [];
  for (const cluster of clusters) {
    const status = byName[cluster.name];
    if (status) rows.push({ cluster: status.cluster, status, pending: false });
    else if (!hasCompleted) rows.push({ cluster, pending: isFetching });
  }
  for (const status of Object.values(byName)) {
    if (!listed.has(status.cluster.name)) rows.push({ cluster: status.cluster, status, pending: false });
  }
  return rows;
}

/**
 * The fleet table's rows (FLT-6): every accessible cluster at once, pending while the stream runs, filled in as its
 * line arrives and dropped when the stream ends without one. Also passes the stream's state through (refresh, error,
 * last update) so the page needs one hook.
 */
export function useFleetRows(): FleetRows {
  const clusters = useAccessibleClusters();
  const { byName, ...status } = useFleetStatus();
  const { isFetching, hasCompleted } = status;
  const { refetch: refetchClusterList } = clusters;
  const refetchClusters = useCallback(() => void refetchClusterList(), [refetchClusterList]);
  const rows = useMemo(
    () => joinFleetRows(clusters.data ?? [], byName, { isFetching, hasCompleted }),
    [clusters.data, byName, isFetching, hasCompleted],
  );
  return {
    ...status,
    rows,
    isLoading: clusters.isPending && Object.keys(byName).length === 0,
    clustersError: clusters.error,
    refetchClusters,
  };
}
