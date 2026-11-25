import {
  experimental_streamedQuery as streamedQuery,
  hashKey,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { ApiError } from '@/shared/api';
import { k8sGet, k8sListPages, type K8sListChunk, type K8sListData, type ListOptions } from './client';
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
 * Cached state of a live list: the items so far and whether every page is in (`complete`; the version is the last
 * page's, which the watch continues from). The watch manager's updates keep `complete`.
 */
export type K8sListState<T> = K8sListData<T> & { complete: boolean };

const EMPTY_LIST: K8sListState<never> = { items: [], resourceVersion: '', complete: false };

/** Folds one {@link K8sListChunk} into the list state: a restart drops the items, the last page completes it. */
function reduceListChunk<T>(state: K8sListState<T>, chunk: K8sListChunk<T>): K8sListState<T> {
  const items = chunk.restart ? [] : [...state.items, ...chunk.items];
  return chunk.resourceVersion === undefined
    ? { ...state, items }
    : { items, resourceVersion: chunk.resourceVersion, complete: true };
}

/**
 * A live list of `model` objects (ADR-0022 §3–4, DATA-3/5): streams the list page by page into the cache once
 * (`staleTime: Infinity`), so rows show as soon as the first page lands and `isPending` turns false then (OCP
 * `incrementallyLoad`); after the last page a shared watch patches the cache, so additions, changes and deletions
 * appear without refetching. A relist (`refetch`, watch 410) keeps the old rows until it has every page
 * (`refetchMode: 'replace'`). Two
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
    queryFn: streamedQuery<K8sListChunk<T>, K8sListState<T>>({
      streamFn: ({ signal }) => k8sListPages<T>(cluster, model, target.opts, signal),
      reducer: reduceListChunk,
      initialValue: EMPTY_LIST,
      refetchMode: 'replace',
    }),
    // A stream cut short (unmount mid-paging, or an error after page 1) leaves an incomplete list in the cache; a
    // stale time of 0 makes the next mount relist it (replace mode keeps the partial rows meanwhile).
    staleTime: ({ state }) => (state.data?.complete ? Infinity : 0),
    enabled,
  });
  // The watch continues from the last page's version, so it starts only once every page is in (OCP `watchK8sList`).
  const resourceVersion = query.data?.complete ? query.data.resourceVersion : undefined;
  const liveStatus = useWatch(target, enabled, resourceVersion, query.dataUpdatedAt);
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
