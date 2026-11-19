import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiClient, unwrap, type AccessibleCluster } from '@/shared/api';

/**
 * Query key of the signed-in user's clusters (`GET /api/clusters`). Admin mutations that change grants or clusters
 * invalidate it so the switcher catches up (FRONTEND.md "Data fetching rules").
 */
export const accessibleClustersQueryKey = ['api', 'clusters'] as const;

/** Freshness options of the cluster list query (SW-6). */
const ACCESSIBLE_CLUSTERS_QUERY_OPTIONS = {
  staleTime: 30_000,
  refetchOnWindowFocus: true,
  refetchInterval: 5 * 60_000,
} as const;

/**
 * The clusters the signed-in user may switch to (SW-1): enabled clusters with a grant, the **effective** access mode
 * (read-only grant or globally read-only user, contract §6), already sorted by environment then name — never re-sort.
 *
 * Refetched on window focus and every 5 minutes (SW-6), so grants made by an admin appear without logging out.
 * Admins get only their own grants (GRANT-6). A 401 is handled globally by the QueryClient (ADR-0014 §2). `error` is
 * an `ApiError` (registered default error type, `shared/api/queryRegister.ts`).
 */
export function useAccessibleClusters(): UseQueryResult<AccessibleCluster[]> {
  return useQuery({
    queryKey: accessibleClustersQueryKey,
    queryFn: ({ signal }) => unwrap(apiClient.GET('/api/clusters', { signal })),
    ...ACCESSIBLE_CLUSTERS_QUERY_OPTIONS,
  });
}
