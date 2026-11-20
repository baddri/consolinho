import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { currentUserQueryKey } from '@/features/auth';
import {
  apiClient,
  isApiError,
  unwrap,
  unwrapNoContent,
  type AddCredentialRequest,
  type Credential,
  type Grant,
  type RotateCredentialTokenRequest,
} from '@/shared/api';
import { adminKeys } from '../queryKeys';

/**
 * Loads `GET /api/admin/clusters/{name}/credentials` (CRED-3/4): the cluster's credentials with token metadata,
 * expiry status and last test — never the token itself.
 */
export function useClusterCredentials(clusterName: string) {
  return useQuery({
    queryKey: adminKeys.clusterCredentials(clusterName),
    queryFn: ({ signal }): Promise<Credential[]> =>
      unwrap(
        apiClient.GET('/api/admin/clusters/{name}/credentials', {
          params: { path: { name: clusterName } },
          signal,
        }),
      ),
  });
}

/** Loads `GET /api/admin/clusters/{name}/grants`: who can access the cluster and through which credential (CRED-6). */
export function useClusterGrants(clusterName: string) {
  return useQuery({
    queryKey: adminKeys.clusterGrants(clusterName),
    queryFn: ({ signal }): Promise<Grant[]> =>
      unwrap(
        apiClient.GET('/api/admin/clusters/{name}/grants', { params: { path: { name: clusterName } }, signal }),
      ),
  });
}

/**
 * Refreshes what a failed credential command proved stale: 404/409 (deleted, renamed, rotated or newly in use
 * meanwhile) refetches the cluster's credentials; a 403 `Auth.ReadOnly` / `Auth.Forbidden` means our `me` is outdated.
 */
function invalidateAfterError(queryClient: QueryClient, clusterName: string, error: unknown): void {
  if (!isApiError(error)) return;
  if (error.status === 404 || error.status === 409) {
    void queryClient.invalidateQueries({ queryKey: adminKeys.clusterCredentials(clusterName) });
  }
  if (error.status === 403 && (error.code === 'Auth.ReadOnly' || error.code === 'Auth.Forbidden')) {
    void queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
  }
}

/**
 * After a successful change, writes the cluster's credential list from the response and invalidates the admin prefix:
 * the cluster detail (credential count, worst expiry), its grants (credential expiry), the fleet list and audit.
 */
function updateAfterSuccess(
  queryClient: QueryClient,
  clusterName: string,
  update: (credentials: Credential[]) => Credential[],
): void {
  queryClient.setQueryData<Credential[]>(adminKeys.clusterCredentials(clusterName), (current) =>
    current === undefined ? current : update(current),
  );
  void queryClient.invalidateQueries({ queryKey: adminKeys.all });
}

/**
 * Submit function of a mutation whose variables carry a token (CRED-2). TanStack Query keeps a mutation's variables
 * in its observer state and `MutationCache` until garbage collection; with `gcTime: 0` and `reset()` once the request
 * settles, the token is dropped from both right away. Errors still reject, so `useFormProblem` maps them; nothing
 * reads the mutation's `error`/`variables` afterwards.
 */
function useTokenSubmit<TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  callbacks: { onSuccess: (data: TData, variables: TVariables) => void; onError: (error: unknown) => void },
): (variables: TVariables) => Promise<TData> {
  const mutation = useMutation({ mutationFn, gcTime: 0, ...callbacks });
  const { mutateAsync, reset } = mutation;
  return useCallback(
    async (variables: TVariables) => {
      try {
        return await mutateAsync(variables);
      } finally {
        reset();
      }
    },
    [mutateAsync, reset],
  );
}

/**
 * `POST /api/admin/clusters/{name}/credentials` (CRED-1): adds a credential (201 `Credential`; 409
 * `Credentials.NameTaken`). Returns the submit function (see {@link useTokenSubmit}); the request body is never part
 * of a key or kept after the request settles. The `apiClient` middleware adds the CSRF header.
 */
export function useAddCredential(clusterName: string) {
  const queryClient = useQueryClient();
  return useTokenSubmit(
    (body: AddCredentialRequest): Promise<Credential> =>
      unwrap(
        apiClient.POST('/api/admin/clusters/{name}/credentials', { params: { path: { name: clusterName } }, body }),
      ),
    {
      onSuccess: (credential) =>
        updateAfterSuccess(queryClient, clusterName, (list) => [...list, credential]),
      onError: (error) => invalidateAfterError(queryClient, clusterName, error),
    },
  );
}

/** Variables of {@link useRotateCredentialToken}: the credential's id plus the `RotateCredentialTokenRequest` body. */
export type RotateCredentialVariables = RotateCredentialTokenRequest & { credentialId: string };

/**
 * `PUT /api/admin/clusters/{name}/credentials/{credentialId}/token` (CRED-5, ADM-4): replaces the token in place with
 * the optimistic `version`; 409 `Concurrency.Conflict` when it is stale (a connection test also bumps the version).
 * Returns the submit function (see {@link useTokenSubmit}).
 */
export function useRotateCredentialToken(clusterName: string) {
  const queryClient = useQueryClient();
  return useTokenSubmit(
    ({ credentialId, ...body }: RotateCredentialVariables): Promise<Credential> =>
      unwrap(
        apiClient.PUT('/api/admin/clusters/{name}/credentials/{credentialId}/token', {
          params: { path: { name: clusterName, credentialId } },
          body,
        }),
      ),
    {
      onSuccess: (credential) =>
        updateAfterSuccess(queryClient, clusterName, (list) =>
          list.map((item) => (item.id === credential.id ? credential : item)),
        ),
      onError: (error) => invalidateAfterError(queryClient, clusterName, error),
    },
  );
}

/**
 * `DELETE /api/admin/clusters/{name}/credentials/{credentialId}` (CRED-6): 204, or 409 `Credentials.InUse` while
 * grants use the credential. On success the row is removed from the cached list before the admin prefix refetches.
 */
export function useDeleteCredential(clusterName: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentialId: string): Promise<void> =>
      unwrapNoContent(
        apiClient.DELETE('/api/admin/clusters/{name}/credentials/{credentialId}', {
          params: { path: { name: clusterName, credentialId } },
        }),
      ),
    onSuccess: (_data, credentialId) =>
      updateAfterSuccess(queryClient, clusterName, (list) => list.filter((item) => item.id !== credentialId)),
    onError: (error) => invalidateAfterError(queryClient, clusterName, error),
  });
}

/** `true` for the Api's 409 `Credentials.InUse`: grants still use the credential (CRED-6). */
export function isCredentialInUse(error: unknown): boolean {
  return isApiError(error) && error.status === 409 && error.code === 'Credentials.InUse';
}

/** `true` for a 404: the credential (or its cluster) was deleted meanwhile. */
export function isCredentialGone(error: unknown): boolean {
  return isApiError(error) && error.status === 404;
}
