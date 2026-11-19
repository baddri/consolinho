import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { currentUserQueryKey } from '@/features/auth';
import { accessibleClustersQueryKey } from '@/features/cluster-context';
import {
  apiClient,
  isApiError,
  unwrap,
  unwrapNoContent,
  type ClusterDetail,
  type ClusterListItem,
  type VersionRequest,
} from '@/shared/api';
import { adminKeys } from '../queryKeys';

/**
 * Loads `GET /api/admin/clusters` (CLU-7): every registered cluster with counts, worst credential expiry and newest
 * connection test, sorted by name by the server. Read-only admins may call it too (ADM-2).
 */
export function useClusters() {
  return useQuery({
    queryKey: adminKeys.clusters(),
    queryFn: ({ signal }): Promise<ClusterListItem[]> =>
      unwrap(apiClient.GET('/api/admin/clusters', { signal })),
  });
}

/** Loads `GET /api/admin/clusters/{name}`: the cluster detail representation, incl. its `version`. */
export function useCluster(name: string) {
  return useQuery({
    queryKey: adminKeys.cluster(name),
    queryFn: ({ signal }): Promise<ClusterDetail> =>
      unwrap(apiClient.GET('/api/admin/clusters/{name}', { params: { path: { name } }, signal })),
  });
}

/** Variables of enable / disable; `version` comes from the list row or detail the dialog was opened from. */
export type ClusterTransitionVariables = VersionRequest & { name: string };

/**
 * Refreshes what a failed cluster command proved stale: a 404/409 (version conflict, `Clusters.NotDisabled`, gone)
 * means the cluster changed, so every clusters query is refetched and a retry sends fresh data; a 403
 * `Auth.ReadOnly` / `Auth.Forbidden` means our `me` is outdated (ADR-0014 §6).
 */
function invalidateAfterError(queryClient: QueryClient, error: unknown): void {
  if (!isApiError(error)) return;
  if (error.status === 409 || error.status === 404) {
    void queryClient.invalidateQueries({ queryKey: adminKeys.clusters() });
  }
  if (error.status === 403 && (error.code === 'Auth.ReadOnly' || error.code === 'Auth.Forbidden')) {
    void queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
  }
}

/**
 * After any successful cluster lifecycle change: invalidate the whole admin prefix (list, grants, credentials, audit)
 * **and** the signed-in user's switcher list (`accessibleClustersQueryKey`), so the admin's own switcher, landing
 * page and `ClusterGate` catch up without waiting for its stale time (T-0029 review).
 */
function invalidateAfterSuccess(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: adminKeys.all });
  void queryClient.invalidateQueries({ queryKey: accessibleClustersQueryKey });
}

/**
 * Shared wiring of enable / disable (ADR-0015 §6): the returned `ClusterDetail` is written to
 * `adminKeys.cluster(name)`, then {@link invalidateAfterSuccess}. The `apiClient` middleware adds the CSRF header.
 */
function useClusterTransition(
  path: '/api/admin/clusters/{name}/enable' | '/api/admin/clusters/{name}/disable',
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, ...body }: ClusterTransitionVariables): Promise<ClusterDetail> =>
      unwrap(apiClient.POST(path, { params: { path: { name } }, body })),
    onSuccess: (cluster) => {
      queryClient.setQueryData(adminKeys.cluster(cluster.name), cluster);
      invalidateAfterSuccess(queryClient);
    },
    onError: (error) => invalidateAfterError(queryClient, error),
  });
}

/** `POST /api/admin/clusters/{name}/enable` (CLU-5): granted users see the cluster again. */
export function useEnableCluster() {
  return useClusterTransition('/api/admin/clusters/{name}/enable');
}

/** `POST /api/admin/clusters/{name}/disable` (CLU-5): hides the cluster from every switcher; grants are kept. */
export function useDisableCluster() {
  return useClusterTransition('/api/admin/clusters/{name}/disable');
}

/**
 * `DELETE /api/admin/clusters/{name}` (CLU-6): removes a **disabled** cluster with its credentials and grants (204);
 * an enabled cluster answers 409 `Clusters.NotDisabled`. On success the detail query is dropped (the cluster is gone)
 * before {@link invalidateAfterSuccess}.
 */
export function useDeleteCluster() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string): Promise<void> =>
      unwrapNoContent(apiClient.DELETE('/api/admin/clusters/{name}', { params: { path: { name } } })),
    onSuccess: (_data, name) => {
      queryClient.removeQueries({ queryKey: adminKeys.cluster(name) });
      invalidateAfterSuccess(queryClient);
    },
    onError: (error) => invalidateAfterError(queryClient, error),
  });
}
