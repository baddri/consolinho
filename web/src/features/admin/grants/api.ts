import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { currentUserQueryKey } from '@/features/auth';
import { accessibleClustersQueryKey } from '@/features/cluster-context';
import {
  apiClient,
  isApiError,
  unwrap,
  unwrapNoContent,
  type CreateGrantRequest,
  type Grant,
  type UpdateGrantRequest,
} from '@/shared/api';
import { adminKeys } from '../queryKeys';

/** Loads `GET /api/admin/users/{username}/grants` (USR-7): the clusters a user can reach, sorted by cluster name. */
export function useUserGrants(username: string) {
  return useQuery({
    queryKey: adminKeys.userGrants(username),
    queryFn: ({ signal }): Promise<Grant[]> =>
      unwrap(apiClient.GET('/api/admin/users/{username}/grants', { params: { path: { username } }, signal })),
  });
}

/** Loads `GET /api/admin/clusters/{name}/grants` (CLU-8, US-9): who can access a cluster, sorted by username. */
export function useClusterGrants(clusterName: string) {
  return useQuery({
    queryKey: adminKeys.clusterGrants(clusterName),
    queryFn: ({ signal }): Promise<Grant[]> =>
      unwrap(
        apiClient.GET('/api/admin/clusters/{name}/grants', {
          params: { path: { name: clusterName } },
          signal,
        }),
      ),
  });
}

/**
 * Loads `GET /api/admin/groups/{groupName}/grants` (GPG-2): the group's Cluster access tab, sorted by cluster name.
 * Unknown or invalid group names give `[]`, never a 404.
 */
export function useGroupGrants(groupName: string) {
  return useQuery({
    queryKey: adminKeys.groupGrants(groupName),
    queryFn: ({ signal }): Promise<Grant[]> =>
      unwrap(
        apiClient.GET('/api/admin/groups/{groupName}/grants', { params: { path: { groupName } }, signal }),
      ),
  });
}

/**
 * Refreshes what a failed grant command proved stale: a 404/409 (revoked, changed or created meanwhile) refetches
 * every admin query so the tables and the picker's "already has access" marks catch up; a 403 `Auth.ReadOnly` /
 * `Auth.Forbidden` means our `me` is outdated (ADR-0014 §6).
 */
function invalidateAfterError(queryClient: QueryClient, error: unknown): void {
  if (!isApiError(error)) return;
  if (error.status === 404 || error.status === 409) {
    void queryClient.invalidateQueries({ queryKey: adminKeys.all });
  }
  if (error.status === 403 && (error.code === 'Auth.ReadOnly' || error.code === 'Auth.Forbidden')) {
    void queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
  }
}

/**
 * After any successful grant change: invalidate the admin prefix (both grant lists, user/cluster grant counts,
 * credential usage, audit) **and** the signed-in user's switcher list — an admin granting or revoking their own
 * access (GRANT-6) sees the switcher update without a reload (T-0029 review).
 */
function invalidateAfterSuccess(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: adminKeys.all });
  void queryClient.invalidateQueries({ queryKey: accessibleClustersQueryKey });
}

/**
 * Applies `update` to the cached subject (user or group) and cluster grant lists that contain `grant` (before they
 * refetch).
 */
function updateCachedLists(
  queryClient: QueryClient,
  grant: Grant,
  update: (grants: Grant[]) => Grant[],
): void {
  const subjectKey =
    grant.subjectKind === 'user'
      ? adminKeys.userGrants(grant.subjectName)
      : adminKeys.groupGrants(grant.subjectName);
  for (const key of [subjectKey, adminKeys.clusterGrants(grant.clusterName)]) {
    queryClient.setQueryData<Grant[]>(key, (current) => (current === undefined ? current : update(current)));
  }
}

/**
 * `POST /api/admin/grants` (GRANT-1/2): 201 `Grant`; 409 `Grants.AlreadyExists` for a second grant of the same user
 * and cluster; unknown user / cluster / credential or a credential of another cluster are 400 field errors. The
 * `apiClient` middleware adds the CSRF header.
 */
export function useCreateGrant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateGrantRequest): Promise<Grant> =>
      unwrap(apiClient.POST('/api/admin/grants', { body })),
    onSuccess: () => invalidateAfterSuccess(queryClient),
    onError: (error) => invalidateAfterError(queryClient, error),
  });
}

/** Variables of {@link useUpdateGrant}: the grant's id plus the `UpdateGrantRequest` body. */
export type UpdateGrantVariables = UpdateGrantRequest & { grantId: string };

/**
 * `PUT /api/admin/grants/{grantId}` (GRANT-3, ADM-4): changes access mode and/or credential with the grant's
 * `version`; a stale one is 409 `Concurrency.Conflict`. The returned grant replaces the cached rows.
 */
export function useUpdateGrant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ grantId, ...body }: UpdateGrantVariables): Promise<Grant> =>
      unwrap(apiClient.PUT('/api/admin/grants/{grantId}', { params: { path: { grantId } }, body })),
    onSuccess: (grant) => {
      updateCachedLists(queryClient, grant, (list) =>
        list.map((item) => (item.id === grant.id ? grant : item)),
      );
      invalidateAfterSuccess(queryClient);
    },
    onError: (error) => invalidateAfterError(queryClient, error),
  });
}

/** `DELETE /api/admin/grants/{grantId}` (GRANT-3): 204; the row leaves the cached lists before they refetch. */
export function useRevokeGrant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (grant: Grant): Promise<void> =>
      unwrapNoContent(
        apiClient.DELETE('/api/admin/grants/{grantId}', { params: { path: { grantId: grant.id } } }),
      ),
    onSuccess: (_data, grant) => {
      updateCachedLists(queryClient, grant, (list) => list.filter((item) => item.id !== grant.id));
      invalidateAfterSuccess(queryClient);
    },
    onError: (error) => invalidateAfterError(queryClient, error),
  });
}

/** `true` for a 404: the grant was revoked meanwhile. */
export function isGrantGone(error: unknown): boolean {
  return isApiError(error) && error.status === 404;
}
