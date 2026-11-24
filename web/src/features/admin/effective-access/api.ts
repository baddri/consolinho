import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap, type EffectiveAccess } from '@/shared/api';
import { adminKeys } from '../queryKeys';

/**
 * Loads `GET /api/admin/users/{username}/effective-access` (EFF-1..4): the clusters the user can open, each with the
 * winning grant and every losing candidate, computed by the same resolver as the proxy and the switcher (PREC-8).
 * Unknown user → `ApiError` 404 `Users.NotFound`.
 */
export function useEffectiveAccess(username: string) {
  return useQuery({
    queryKey: adminKeys.userEffectiveAccess(username),
    queryFn: ({ signal }): Promise<EffectiveAccess> =>
      unwrap(
        apiClient.GET('/api/admin/users/{username}/effective-access', { params: { path: { username } }, signal }),
      ),
  });
}
