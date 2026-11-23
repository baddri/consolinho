import { useQuery } from '@tanstack/react-query';
import pLimit from 'p-limit';
import { k8sListAll, modelKey, type K8sListData, type K8sModel, type K8sResource } from '@/shared/k8s';

/**
 * One limiter for every Search section (FRONTEND.md "Data fetching", SRCH-5): at most 6 lists in flight, so a dozen
 * selected kinds never queue behind the browser's 6 connections per origin in a burst that starves the rest of the app.
 */
const limiter = pLimit(6);

/** Search results stay fresh for 30 s: they are one-shot lists, not watched. */
const SEARCH_STALE_MS = 30_000;

/** Query key of one Search section; starts with `['k8s', cluster]` like every Kubernetes key (ADR-0022 §7). */
export function searchQueryKey(
  cluster: string,
  model: K8sModel,
  namespace: string | undefined,
  labelSelector: string,
) {
  return ['k8s', cluster, 'search', modelKey(model), namespace ?? '', labelSelector] as const;
}

/**
 * The objects of one Search result section (SRCH-2/5): a single `k8sListAll` of `model` (in `namespace`, all
 * namespaces when `undefined` or for cluster-scoped kinds) with the label selector, through the shared limiter. No
 * watch — N sections would otherwise hold N long-lived connections; the name filter is applied by the caller.
 */
export function useSearchResults(
  cluster: string,
  model: K8sModel,
  namespace: string | undefined,
  labelSelector: string,
) {
  const ns = model.namespaced ? namespace : undefined;
  return useQuery<K8sListData<K8sResource>>({
    queryKey: searchQueryKey(cluster, model, ns, labelSelector),
    queryFn: ({ signal }) =>
      limiter(() =>
        k8sListAll<K8sResource>(
          cluster,
          model,
          { namespace: ns, labelSelector: labelSelector || undefined },
          signal,
        ),
      ),
    staleTime: SEARCH_STALE_MS,
  });
}
