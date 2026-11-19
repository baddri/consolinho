import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { apiClient, unwrapNoContent } from '@/shared/api';
import { clearSessionCache } from './clearSessionCache';

/** Where logout lands (AUTH-10): the login page with "You have been logged out." and no automatic OAuth redirect. */
const LOGGED_OUT_PATH = '/login?loggedOut=1';

/**
 * Logs out: `POST /api/auth/logout` (the shared client adds the CSRF header), then replaces the current history entry
 * with `/login?loggedOut=1` and finally drops the session's cached data (ADR-0014 §5).
 *
 * The navigation is committed first (`flushSync`) so no session-guarded query is still mounted — and refetches — when
 * the cache is cleared; see `clearSessionCache`.
 */
export function useLogout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Failures are always an `ApiError` (`unwrapNoContent`); TanStack types them as its default `Error`.
  return useMutation({
    mutationFn: () => unwrapNoContent(apiClient.POST('/api/auth/logout')),
    onSuccess: async () => {
      await navigate(LOGGED_OUT_PATH, { replace: true, flushSync: true });
      clearSessionCache(queryClient);
    },
  });
}
