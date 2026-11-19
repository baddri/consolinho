import type { QueryClient } from '@tanstack/react-query';
import type { DataRouter } from 'react-router';
import { clearSessionCache, currentUserQueryKey, sanitizeReturnUrl } from '@/features/auth';
import { createQueryClient, type QueryClientOptions } from './queryClient';

/** The parts of a data router the 401 handler needs (browser router in the app, memory router in tests). */
export type SessionRouter = Pick<DataRouter, 'state' | 'navigate'>;

/** Whether `pathname` is the login page, which needs no session and must never redirect to itself. */
function isLoginPath(pathname: string): boolean {
  return pathname === '/login' || pathname.startsWith('/login/');
}

/**
 * The app's reaction to any 401 from the Api (ADR-0014 §2, AUTH-11/12): go to `/login` with the current location as
 * `returnUrl`, then drop the cached data of the ended session (`clearSessionCache`).
 *
 * - No-op when the router is on — or already navigating to — `/login` (redirect-loop guard, and several queries
 *   failing at once only redirect once).
 * - Adds `reason=session_ended` iff a `me` result was cached, i.e. the user *had* a session; a first visit gets no
 *   message.
 * - Navigation replaces the current history entry (Back must not return to a page that needs the dead session) and
 *   is committed before the cache is cleared, so no guarded query is still mounted to refetch.
 */
export function handleUnauthenticated(router: SessionRouter, queryClient: QueryClient): void {
  const { location, navigation } = router.state;
  if (isLoginPath(location.pathname) || (navigation.location && isLoginPath(navigation.location.pathname))) {
    return;
  }
  const params = new URLSearchParams({
    returnUrl: sanitizeReturnUrl(`${location.pathname}${location.search}${location.hash}`),
  });
  if (queryClient.getQueryData(currentUserQueryKey) !== undefined) {
    params.set('reason', 'session_ended');
  }
  // flushSync: the guarded tree must be unmounted (committed, not just routed) before its cache entries are dropped.
  void router
    .navigate(`/login?${params.toString()}`, { replace: true, flushSync: true })
    .then(() => clearSessionCache(queryClient));
}

/** The router and QueryClient of one app instance, wired to each other. */
export interface AppRuntime<R extends SessionRouter> {
  router: R;
  queryClient: QueryClient;
}

/**
 * Creates the QueryClient and the router together and connects the QueryClient's 401 hook to
 * {@link handleUnauthenticated}. Used by `App` (browser router) and the test render helpers (memory router), so tests
 * exercise exactly the session handling the app ships.
 */
export function createAppRuntime<R extends SessionRouter>(
  createRouter: () => R,
  options: Omit<QueryClientOptions, 'onUnauthenticated'> = {},
): AppRuntime<R> {
  const router = createRouter();
  // The hook closes over `queryClient` itself; it only runs after a request failed, long after this returns.
  const queryClient: QueryClient = createQueryClient({
    ...options,
    onUnauthenticated: () => handleUnauthenticated(router, queryClient),
  });
  return { router, queryClient };
}
