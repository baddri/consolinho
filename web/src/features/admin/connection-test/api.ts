import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap, type ConnectionTestResult } from '@/shared/api';
import { invalidateAfterError, useTokenSubmit } from '../credentials/api';
import { adminKeys } from '../queryKeys';

/** Variables of {@link useTestCredential}. */
export interface TestCredentialVariables {
  credentialId: string;
  /** Namespaces whose RBAC rules the test also lists (NST-1); saved on the credential (NST-5); `[]` = none. */
  inspectNamespaces: string[];
  /** Aborts the request when the admin cancels or closes the dialog. */
  signal: AbortSignal;
}

/**
 * `POST /api/admin/clusters/{name}/credentials/{credentialId}/test` (TEST-1..5): runs the connection test with the
 * stored token and records it as the credential's last test (which bumps the credential's `version`). A command, not a
 * query: the result is returned to the caller, never cached by key, and nothing retries it. Whatever the outcome —
 * including a cancel, which the server may still have recorded — the admin prefix is refetched so every "Last test"
 * cell and the credential versions are current (TEST-5; a rotation racing the test answers 409).
 */
export function useTestCredential(clusterName: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ credentialId, inspectNamespaces, signal }: TestCredentialVariables): Promise<ConnectionTestResult> =>
      unwrap(
        apiClient.POST('/api/admin/clusters/{name}/credentials/{credentialId}/test', {
          params: { path: { name: clusterName, credentialId } },
          body: { inspectNamespaces },
          signal,
        }),
      ),
    onError: (error) => invalidateAfterError(queryClient, clusterName, error),
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminKeys.all }),
  });
}

/** Variables of {@link useTestToken}: the `TestTokenRequest` body plus the abort signal. */
export interface TestTokenVariables {
  /** The unsaved token; sent only in the request body (CRED-2). */
  token: string;
  /** The credential being rotated, for grant hints (TEST-4); `null` for a token with no credential yet. */
  credentialId: string | null;
  /** Namespaces whose RBAC rules the test also lists (NST-1); never saved for an unsaved token. */
  inspectNamespaces: string[];
  signal: AbortSignal;
}

/**
 * `POST /api/admin/clusters/{name}/test-token` (CRED-5): tests an unsaved token; the server records nothing but the
 * audit entry, so no query is invalidated. Returns a submit function built on `useTokenSubmit` (`gcTime: 0` +
 * `reset()`), so the token never stays in the mutation cache once the request settles. It is never part of a key, URL
 * or message.
 */
export function useTestToken(clusterName: string) {
  const queryClient = useQueryClient();
  return useTokenSubmit(
    ({ signal, ...body }: TestTokenVariables): Promise<ConnectionTestResult> =>
      unwrap(
        apiClient.POST('/api/admin/clusters/{name}/test-token', {
          params: { path: { name: clusterName } },
          body,
          signal,
        }),
      ),
    {
      onSuccess: () => undefined,
      onError: (error) => invalidateAfterError(queryClient, clusterName, error),
    },
  );
}
