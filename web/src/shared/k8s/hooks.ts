import { hashKey, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { ApiError } from '@/shared/api';
import { k8sGet, k8sListAll, type ListOptions } from './client';
import type { K8sModel } from './models';
import { k8sQueryKeys } from './queryKeys';
import type { ObjectMeta } from './types';
import { watchManagerFor, type LiveStatus, type WatchTarget } from './watchManager';

/** Result of {@link useK8sList} / {@link useK8sGet}. */
export interface K8sLiveResult<D> {
  data: D | undefined;
  /** An `ApiError` (registered error type); `Kubernetes.*` codes for API-server errors, `Proxy.*` for the proxy's. */
  error: ApiError | null;
  isPending: boolean;
  liveStatus: LiveStatus;
  refetch(): void;
}

/**
 * Keeps `target`'s query live through the shared watch: acquires it while `enabled` and the key is mounted, and
 * syncs it with the cached `resourceVersion` whenever the data changes (first load, relist). Returns its status.
 */
function useWatch(
  target: WatchTarget,
  enabled: boolean,
  resourceVersion: string | undefined,
  updatedAt: number,
) {
  const manager = watchManagerFor(useQueryClient());
  const hash = hashKey(target.queryKey);

  useEffect(() => (enabled ? manager.acquire(target) : undefined), [manager, target, enabled]);
  useEffect(() => {
    if (enabled && resourceVersion !== undefined) manager.sync(target, resourceVersion);
    // `updatedAt` re-syncs after a relist that returned the same version (the stream was stopped by then).
  }, [manager, target, enabled, resourceVersion, updatedAt]);

  return useSyncExternalStore(
    useCallback((listener: () => void) => manager.subscribe(hash, listener), [manager, hash]),
    () => manager.getStatus(hash),
  );
}

/**
 * A live list of `model` objects (ADR-0022 §3–4, DATA-3/5): pages through the full list once (`staleTime: Infinity`),
 * then a shared watch patches the cache, so additions, changes and deletions appear without refetching. Two
 * components with the same cluster/model/namespace/selectors share one list query and one stream; changing any of
 * them closes the old stream. List items carry `apiVersion`/`kind` (stamped from the model).
 */
export function useK8sList<T>(
  cluster: string,
  model: K8sModel,
  opts: ListOptions & { enabled?: boolean },
): K8sLiveResult<T[]> {
  const { namespace, labelSelector, fieldSelector, enabled = true } = opts;
  const target = useMemo<WatchTarget>(() => {
    const listOpts: ListOptions = {
      namespace: model.namespaced ? namespace : undefined,
      labelSelector,
      fieldSelector,
    };
    return {
      cluster,
      model,
      opts: listOpts,
      queryKey: k8sQueryKeys.list(cluster, model, listOpts),
      mode: 'list',
    };
  }, [cluster, model, namespace, labelSelector, fieldSelector]);

  const query = useQuery({
    queryKey: target.queryKey,
    queryFn: ({ signal }) => k8sListAll<T>(cluster, model, target.opts, signal),
    staleTime: Infinity,
    enabled,
  });
  const liveStatus = useWatch(target, enabled, query.data?.resourceVersion, query.dataUpdatedAt);
  const { refetch } = query;

  return {
    data: query.data?.items,
    error: query.error,
    isPending: query.isPending,
    liveStatus,
    refetch: useCallback(() => void refetch(), [refetch]),
  };
}

/**
 * One object, kept live (ADR-0022 §6) by a watch on `fieldSelector=metadata.name=<name>`, so details and the YAML
 * editor see out-of-band changes. A `DELETED` event refetches; its 404 (`Kubernetes.NotFound`) becomes `error` —
 * note that TanStack Query keeps the last `data` next to that error, so check `error` first.
 */
export function useK8sGet<T extends { metadata?: ObjectMeta }>(
  cluster: string,
  model: K8sModel,
  namespace: string | undefined,
  name: string,
  opts: { enabled?: boolean } = {},
): K8sLiveResult<T> {
  const { enabled = true } = opts;
  const scopedNamespace = model.namespaced ? namespace : undefined;
  const target = useMemo<WatchTarget>(
    () => ({
      cluster,
      model,
      opts: { namespace: scopedNamespace, fieldSelector: `metadata.name=${name}` },
      queryKey: k8sQueryKeys.get(cluster, model, scopedNamespace, name),
      mode: 'object',
    }),
    [cluster, model, scopedNamespace, name],
  );

  const query = useQuery({
    queryKey: target.queryKey,
    queryFn: ({ signal }) => k8sGet<T>(cluster, model, scopedNamespace, name, signal),
    staleTime: Infinity,
    enabled,
  });
  const liveStatus = useWatch(target, enabled, query.data?.metadata?.resourceVersion, query.dataUpdatedAt);
  const { refetch } = query;

  return {
    data: query.data,
    error: query.error,
    isPending: query.isPending,
    liveStatus,
    refetch: useCallback(() => void refetch(), [refetch]),
  };
}
