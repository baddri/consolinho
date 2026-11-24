import { useMutation, useQueryClient } from '@tanstack/react-query';
import { accessibleClustersQueryKey } from '@/features/cluster-context';
import {
  apiClient,
  unwrap,
  type BulkGrantRequest,
  type BulkGroupGrantRequest,
  type Grant,
} from '@/shared/api';
import { adminKeys } from '../../queryKeys';

/** Variables of {@link useBulkGrant}: whose access, plus the `BulkGrantRequest` body. */
export type BulkGrantVariables = BulkGrantRequest & { username: string };

/**
 * `POST /api/admin/users/{username}/grants/bulk` (GRANT-4): 200 with every created grant, or a 400 whose field errors
 * are keyed `items[i].clusterName` / `items[i].credentialId` and nothing is written (all-or-nothing). Success
 * invalidates the admin prefix and the switcher list (an admin bulk-granting themselves, T-0029 review). The
 * `apiClient` middleware adds the CSRF header.
 */
export function useBulkGrant() {
  return useMutation({
    mutationFn: ({ username, ...body }: BulkGrantVariables): Promise<Grant[]> =>
      unwrap(apiClient.POST('/api/admin/users/{username}/grants/bulk', { params: { path: { username } }, body })),
    onSuccess: useInvalidateAfterBulkGrant(),
  });
}

/** Variables of {@link useBulkGroupGrant}: which group, plus the `BulkGroupGrantRequest` body. */
export type BulkGroupGrantVariables = BulkGroupGrantRequest & { groupName: string };

/**
 * `POST /api/admin/groups/{groupName}/grants/bulk` (GPG-3): like {@link useBulkGrant} with one `priority` for every
 * item; a taken priority, an existing grant or an unknown cluster is a 400 keyed `items[i].…` and nothing is written.
 * Same invalidation as the user bulk (a member admin may gain clusters in the switcher).
 */
export function useBulkGroupGrant() {
  return useMutation({
    mutationFn: ({ groupName, ...body }: BulkGroupGrantVariables): Promise<Grant[]> =>
      unwrap(
        apiClient.POST('/api/admin/groups/{groupName}/grants/bulk', {
          params: { path: { groupName } },
          body,
        }),
      ),
    onSuccess: useInvalidateAfterBulkGrant(),
  });
}

/** Success handler of both bulk grants: refetch the admin prefix and the switcher list. */
function useInvalidateAfterBulkGrant() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: adminKeys.all });
    void queryClient.invalidateQueries({ queryKey: accessibleClustersQueryKey });
  };
}
