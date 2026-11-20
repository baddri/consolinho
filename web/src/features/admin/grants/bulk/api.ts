import { useMutation, useQueryClient } from '@tanstack/react-query';
import { accessibleClustersQueryKey } from '@/features/cluster-context';
import { apiClient, unwrap, type BulkGrantRequest, type Grant } from '@/shared/api';
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ username, ...body }: BulkGrantVariables): Promise<Grant[]> =>
      unwrap(apiClient.POST('/api/admin/users/{username}/grants/bulk', { params: { path: { username } }, body })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.all });
      void queryClient.invalidateQueries({ queryKey: accessibleClustersQueryKey });
    },
  });
}
