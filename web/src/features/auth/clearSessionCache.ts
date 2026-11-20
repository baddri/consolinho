import type { QueryClient } from '@tanstack/react-query';

/**
 * Drops everything the ended session cached: every query no mounted component observes, and all mutations
 * (ADR-0014 §2 and §5 — the next user of this browser must never see the previous user's data).
 *
 * Call it **after** navigating to `/login` has been committed (navigate with `flushSync: true`, then call this). At
 * that point the session-guarded tree is unmounted, so its queries have no observers left and go. Queries the login
 * page itself observes (only the anonymous `system/info`) stay: a plain `queryClient.clear()` would also discard the
 * login page's in-flight queries, whose observers would then never receive data. Called *before* the navigation, it
 * would not help either: the still-mounted guarded components would immediately rebuild and refetch their queries.
 */
export function clearSessionCache(queryClient: QueryClient): void {
  queryClient.removeQueries({ predicate: (query) => query.getObserversCount() === 0 });
  queryClient.getMutationCache().clear();
}
