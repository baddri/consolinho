import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient, unwrap, type AuditPage } from '@/shared/api';
import { adminKeys, type AuditQueryFilters } from '../queryKeys';

/**
 * Loads `GET /api/admin/audit` (AUD-2, AUD-4) as an infinite query: `filters` is the resolved request (incl. computed
 * `from`/`to`) and the whole query key; each further page passes the previous page's opaque `nextCursor` (keyset
 * paging, newest first), so the key never changes while paging. Admins and read-only admins may call it (AUD-5).
 * Failures are `ApiError`s (a hand-edited filter → 400 with field errors).
 */
export function useAuditLog(filters: AuditQueryFilters) {
  return useInfiniteQuery({
    queryKey: adminKeys.audit(filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }): Promise<AuditPage> =>
      unwrap(
        apiClient.GET('/api/admin/audit', {
          params: { query: pageParam === undefined ? filters : { ...filters, cursor: pageParam } },
          signal,
        }),
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}
