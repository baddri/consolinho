import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap, type UserListItem } from '@/shared/api';
import { adminKeys } from '../queryKeys';

/**
 * Loads `GET /api/admin/users` (USR-1): every FleetConsole user, sorted by username by the server. Admin-only;
 * read-only admins may call it too (ADM-2). Failures are `ApiError`s; a 401 is handled by the QueryClient.
 */
export function useUsers() {
  return useQuery({
    queryKey: adminKeys.users(),
    queryFn: ({ signal }): Promise<UserListItem[]> => unwrap(apiClient.GET('/api/admin/users', { signal })),
  });
}
