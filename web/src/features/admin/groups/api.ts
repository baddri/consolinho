import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap, type GroupDetail, type GroupList } from '@/shared/api';
import { adminKeys } from '../queryKeys';

/**
 * Loads `GET /api/admin/groups` (GPG-1, UIG-2): host groups ∪ groups named in grants, `system:*` excluded, sorted by
 * name. A failed host listing is not an error: it comes back as `hostStatus` ≠ `ok` with the grant-only groups.
 */
export function useGroups() {
  return useQuery({
    queryKey: adminKeys.groups(),
    queryFn: ({ signal }): Promise<GroupList> => unwrap(apiClient.GET('/api/admin/groups', { signal })),
  });
}

/**
 * Loads `GET /api/admin/groups/{groupName}` (GPG-2): the group with its host members. An invalid name, or a group
 * neither on the host nor in any grant, fails with an `ApiError` 404 `Groups.NotFound`.
 */
export function useGroup(name: string) {
  return useQuery({
    queryKey: adminKeys.group(name),
    queryFn: ({ signal }): Promise<GroupDetail> =>
      unwrap(apiClient.GET('/api/admin/groups/{groupName}', { params: { path: { groupName: name } }, signal })),
  });
}
