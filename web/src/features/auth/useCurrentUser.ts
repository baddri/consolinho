import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiClient, unwrap, type CurrentUser } from '@/shared/api';

/** Query key of the signed-in user (`GET /api/auth/me`). The app's 401 handler reads it to detect an ended session. */
export const currentUserQueryKey = ['api', 'auth', 'me'] as const;

/** How long a `me` result counts as fresh: the Api's session revalidation interval (ADR-0009, AUTH-11). */
const CURRENT_USER_STALE_TIME_MS = 60_000;

/**
 * The signed-in user from `GET /api/auth/me` — the only source of identity, role and read-only state (ADR-0014 §1).
 * There is no auth store or context: every consumer shares this one query.
 *
 * Refetched when the window regains focus once older than 60 s, so role/read-only changes made by another admin
 * appear without a reload. A 401 is not handled here: the app's QueryClient reacts to it once, globally, and its
 * default retry policy never retries 4xx responses (`createQueryClient`, ADR-0014 §2).
 */
export function useCurrentUser(): UseQueryResult<CurrentUser> {
  return useQuery({
    queryKey: currentUserQueryKey,
    queryFn: ({ signal }) => unwrap(apiClient.GET('/api/auth/me', { signal })),
    staleTime: CURRENT_USER_STALE_TIME_MS,
    refetchOnWindowFocus: true,
  });
}
