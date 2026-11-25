import { useQuery } from '@tanstack/react-query';
import { INVENTORY_LIMIT, k8sListPage, modelKey, pageCount, type K8sModel } from '@/shared/k8s';

/** Options of {@link useResourceCount}. */
export interface ResourceCountOptions {
  fieldSelector?: string;
  labelSelector?: string;
  /** `false` while the kind isn't known to be served. */
  enabled?: boolean;
}

/** A counted first page: the count plus the page's items for counts within the page (Not Ready, Pending). */
export interface ResourceCount<T> {
  count: number;
  /** `false` when the server only returned `continue`: render "`<count>`+". */
  exact: boolean;
  items: T[];
}

/** Query key of a count: cluster first, like every k8s key (`['k8s', cluster, 'count', kind, selectors]`). */
export function resourceCountQueryKey(cluster: string, model: K8sModel, opts: ResourceCountOptions = {}) {
  return ['k8s', cluster, 'count', modelKey(model), opts.fieldSelector ?? '', opts.labelSelector ?? ''] as const;
}

/**
 * Inventory count of `model` across all namespaces (OVW-4): **one** `limit=INVENTORY_LIMIT` list request, never
 * paginated and not watched (30 s `staleTime`). `remainingItemCount` makes the count exact; a bare `continue` (the
 * API server omits the remainder for selector-filtered lists) gives a lower bound (`exact: false`).
 */
export function useResourceCount<T>(cluster: string, model: K8sModel, opts: ResourceCountOptions = {}) {
  const { fieldSelector, labelSelector, enabled = true } = opts;
  return useQuery({
    queryKey: resourceCountQueryKey(cluster, model, { fieldSelector, labelSelector }),
    queryFn: async ({ signal }): Promise<ResourceCount<T>> => {
      const page = await k8sListPage<T>(cluster, model, { limit: INVENTORY_LIMIT, fieldSelector, labelSelector }, signal);
      return { ...pageCount(page), items: page.items };
    },
    enabled,
    staleTime: 30_000,
  });
}

/** "12" or "500+" for an inexact count. */
export function countText(count: number, exact: boolean): string {
  return exact ? String(count) : `${count}+`;
}
