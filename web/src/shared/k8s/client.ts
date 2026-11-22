import { ApiError, apiErrorFromRejection, withCsrfHeader } from '@/shared/api';
import { k8sErrorFromResponse } from './errors';
import { apiVersionOf, type K8sModel, type PropagationPolicy } from './models';
import type { K8sList, K8sResource } from './types';
import { resourceApiPath } from './url';

/** Page size of {@link k8sListAll} (DATA-3): big enough for few round trips, small enough for a fast first page. */
export const LIST_PAGE_SIZE = 250;

/** Which objects a list or watch selects. Selectors use the Kubernetes syntax and are passed through unchanged. */
export interface ListOptions {
  /** Namespace of a namespaced kind; absent = all namespaces. Ignored for cluster-scoped kinds. */
  namespace?: string | undefined;
  labelSelector?: string | undefined;
  fieldSelector?: string | undefined;
}

/** A complete list: every item plus the `resourceVersion` a watch continues from (ADR-0022 §3). */
export interface K8sListData<T> {
  items: T[];
  resourceVersion: string;
}

/** Request options of {@link k8sFetch}. */
interface K8sRequestInit {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal | undefined;
}

/**
 * Sends one request through the Kubernetes proxy and returns the 2xx response; every failure is thrown as an
 * {@link ApiError} (aborts are rethrown). Same-origin with the session cookie and the CSRF header on non-GET
 * (contract §2). `fetch` is resolved at call time so MSW, which patches it after import, sees every request.
 */
export async function k8sFetch(path: string, init: K8sRequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  const request = withCsrfHeader(
    new Request(new URL(path, globalThis.location.origin), {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers,
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      ...(init.signal ? { signal: init.signal } : {}),
    }),
  );
  const response = await globalThis.fetch(request).catch(apiErrorFromRejection);
  if (!response.ok) {
    throw await k8sErrorFromResponse(response);
  }
  return response;
}

/** Reads a 2xx JSON body; an unreadable body becomes an {@link ApiError} (status 0, "Invalid response"). */
async function readJson<T>(response: Response): Promise<T> {
  return (await response.json().catch(apiErrorFromRejection)) as T;
}

/** GETs a JSON document by proxy path (discovery documents, which have no model). */
export async function k8sGetPath<T>(path: string, signal?: AbortSignal): Promise<T> {
  return readJson<T>(await k8sFetch(path, { signal }));
}

/**
 * Adds the `apiVersion`/`kind` the API server omits on list items (T-0070 notes), so every cached object is a
 * complete {@link K8sResource} — e.g. for the YAML view of a list row.
 */
function withTypeMeta<T>(item: T, model: K8sModel): T {
  return { apiVersion: apiVersionOf(model), kind: model.kind, ...(item as object) } as T;
}

/** Whether an error is the 410 of an expired `continue` token or `resourceVersion`. */
export function isExpired(error: unknown): boolean {
  return error instanceof ApiError && error.status === 410;
}

/**
 * Lists every object of `model` matching `opts`, paging with `limit=250` + `continue` (DATA-3), and returns the items
 * with the `resourceVersion` of the last page. A `continue` token that expires mid-way (410) restarts the list once
 * from the beginning; a second 410 is thrown.
 */
export async function k8sListAll<T>(
  cluster: string,
  model: K8sModel,
  opts: ListOptions,
  signal?: AbortSignal,
): Promise<K8sListData<T>> {
  const listOnce = async (): Promise<K8sListData<T>> => {
    const items: T[] = [];
    let continueToken: string | undefined;
    for (;;) {
      const path = resourceApiPath(cluster, model, {
        namespace: opts.namespace,
        query: {
          limit: String(LIST_PAGE_SIZE),
          continue: continueToken,
          labelSelector: opts.labelSelector,
          fieldSelector: opts.fieldSelector,
        },
      });
      const page = await k8sGetPath<K8sList<T>>(path, signal);
      for (const item of page.items) items.push(withTypeMeta(item, model));
      // An empty string means "no more pages", just like an absent token.
      continueToken = page.metadata.continue;
      if (!continueToken) {
        return { items, resourceVersion: page.metadata.resourceVersion ?? '' };
      }
    }
  };
  try {
    return await listOnce();
  } catch (error) {
    if (!isExpired(error)) throw error;
    return listOnce();
  }
}

/** Reads one object; a missing object throws a 404 {@link ApiError} with code `Kubernetes.NotFound`. */
export async function k8sGet<T>(
  cluster: string,
  model: K8sModel,
  namespace: string | undefined,
  name: string,
  signal?: AbortSignal,
): Promise<T> {
  return k8sGetPath<T>(resourceApiPath(cluster, model, { namespace, name }), signal);
}

/**
 * Replaces an object (PUT). `obj.metadata.resourceVersion` makes it an optimistic-concurrency update: a stale version
 * throws 409 `Kubernetes.Conflict`. Returns the stored object.
 */
export async function k8sUpdate<T extends K8sResource>(cluster: string, model: K8sModel, obj: T): Promise<T> {
  const path = resourceApiPath(cluster, model, {
    namespace: obj.metadata.namespace,
    name: obj.metadata.name,
  });
  return readJson<T>(await k8sFetch(path, { method: 'PUT', body: obj }));
}

/**
 * Deletes an object. Resolves once the API server accepted the deletion (finalizers may still be running). With a
 * `propagationPolicy` the request carries a `DeleteOptions` body, as OCP's delete modal sends; without one the API
 * server's default for the kind applies.
 */
export async function k8sDelete(
  cluster: string,
  model: K8sModel,
  namespace: string | undefined,
  name: string,
  propagationPolicy?: PropagationPolicy,
): Promise<void> {
  const body =
    propagationPolicy === undefined
      ? undefined
      : { kind: 'DeleteOptions', apiVersion: 'v1', propagationPolicy };
  const response = await k8sFetch(resourceApiPath(cluster, model, { namespace, name }), {
    method: 'DELETE',
    body,
  });
  // The Status body is not needed: cancel it so the connection is released.
  await response.body?.cancel();
}

/** Creates an object (POST) — e.g. a `SelfSubjectAccessReview` — and returns the server's answer. */
export async function k8sCreate<T>(
  cluster: string,
  model: K8sModel,
  namespace: string | undefined,
  obj: T,
): Promise<T> {
  return readJson<T>(
    await k8sFetch(resourceApiPath(cluster, model, { namespace }), { method: 'POST', body: obj }),
  );
}
