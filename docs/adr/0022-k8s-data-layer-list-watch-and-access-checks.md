# 0022 — Kubernetes data layer: list + watch in TanStack Query, error mapping, access checks
**Status:** Accepted (2026-11-20) · **Builds on:** 0003, 0014, 0015, 0016 · **Spec:** CP2 §4.7 DATA, UI-9, UI-10

## Context
CP2 browses Kubernetes resources through the proxy `/api/clusters/{cluster}/k8s/{**path}` (raw Kubernetes API, spec
PRX-1). Lists must stay live (DATA-3), survive 2,000 objects (DATA-4), never run two identical watches (DATA-5), and
errors must render as ProblemDetails `detail` (proxy errors) or Kubernetes `Status.message` (API server errors).
FRONTEND.md already fixes "server state in TanStack Query only", query keys starting with `['k8s', cluster, …]`, and
`ApiError` as the registered default error type (ADR-0015). Q5 recommends plain chunked-HTTP watch, no WebSocket.

## Decision
1. **One module, `web/src/shared/k8s/`**, owns every Kubernetes call. `models.ts` (K8sModel descriptors: group,
   version, kind, plural, namespaced, label, labelPlural, abbr), `types.ts` (`kubernetes-types` re-exports + the
   OpenShift `Project`), `url.ts` (proxy URL building — the only place that knows `/api` vs `/apis/{group}`), `client.ts`
   (`k8sListAll`, `k8sGet`, `k8sUpdate`, `k8sDelete`, `k8sCreate`), `watch.ts` (stream reader), `watchManager.ts`
   (shared watches), `hooks.ts` (`useK8sList`, `useK8sGet`), `discovery.ts`, `access.ts` (`useCanI`), `queryKeys.ts`.
   Hooks take `cluster` as an explicit argument (shared code can't read the cluster-context feature).
2. **Errors are `ApiError`.** Non-2xx responses map to the registered `ApiError`: ProblemDetails (`Proxy.*`,
   `Auth.*`) via the existing reader; a Kubernetes `Status` body → `code = "Kubernetes.<reason>"` (e.g.
   `Kubernetes.Conflict`, `Kubernetes.NotFound`, `Kubernetes.Forbidden`, `Kubernetes.Invalid`, `Kubernetes.Expired`),
   `title = reason`, `detail = message`; network failure → status 0; aborts are rethrown. The registered error type is
   unchanged, so the global 401 handler keeps working — the proxy returns 401 only for a missing session (upstream 401
   becomes 502 `Proxy.CredentialRejected`, PRX-5).
3. **Lists: the query cache is the source of truth, the watch patches it.** `useK8sList` runs a `useQuery` whose
   function pages through `limit=250`/`continue` (DATA-3) and stores `{ items, resourceVersion }`; it restarts the list
   once if a `continue` token expires (410). `staleTime: Infinity` — freshness comes from the watch, not refetches.
   After success the hook acquires a watch from that `resourceVersion` (`watch=1&allowWatchBookmarks=true`).
   Events are buffered and applied in one `setQueryData` every `WATCH_FLUSH_MS` (100 ms), upserting/removing by
   `metadata.uid`; BOOKMARK only advances the stored `resourceVersion`.
4. **Watch lifecycle.** `watchManager` ref-counts watches by query key: one stream per key per tab (DATA-5), aborted
   when the last subscriber unmounts or the key changes (cluster/namespace/selector switch). Clean stream end (proxy
   caps at 300 s, Q6) → immediate re-watch from the last `resourceVersion`; HTTP error / network error → status
   `paused`, retry with exponential backoff 1 s → 30 s (reset after a successful connect); `410 Gone` (HTTP or an
   `ERROR` event with code 410) → `invalidateQueries` (relist), whose new `resourceVersion` starts a new watch. A
   watch that gets 401 stops (the session handler navigates away); 403/404 stop without retry. The manager exposes
   `liveStatus: 'connecting' | 'live' | 'paused'` per key via `useSyncExternalStore`.
5. **Streams** are read with `fetch` + `response.body.pipeThrough(new TextDecoderStream())` and a small NDJSON line
   splitter (`TransformStream`, unit-tested with split chunks). No WebSocket, no EventSource.
6. **Single objects** (`useK8sGet`) use the same pattern with `fieldSelector=metadata.name=<name>` so details and the
   YAML editor see out-of-band changes (UI-7 "This object changed on the cluster"). *Amended (T-0071):* the object
   watch starts without `resourceVersion` (synthetic `ADDED` re-delivers the object; its own rv is usually outside the
   watch window) and restarts the same way on 410 instead of refetching; `DELETED` refetches → 404 `error` while
   TanStack keeps the last `data`, so pages check `error` before `data`.
7. **Query keys** (factories in `shared/k8s/queryKeys.ts`, never inline), `modelKey = "<group>/<version>/<plural>"`:
   `['k8s', cluster, 'list', modelKey, namespace ?? '', labelSelector ?? '', fieldSelector ?? '']`,
   `['k8s', cluster, 'get', modelKey, namespace ?? '', name]`, `['k8s', cluster, 'discovery']`,
   `['k8s', cluster, 'access', verb, group, resource, namespace ?? '', name ?? '']`.
   Mutations (`k8sUpdate`, `k8sDelete`) write the returned object into the `get` key and leave lists to the watch.
8. **Discovery** (DATA-2): `GET /api` + `GET /apis` once per cluster per session (`staleTime: Infinity`) → set of served
   `group/version`. While pending or on error, assume the Kubernetes baseline (`v1`, `apps/v1`) so the nav never flashes
   empty and OpenShift-only kinds stay hidden.
9. **Access checks** (UI-9): `useCanI(cluster, { verb, model, namespace?, name? })` POSTs a
   `SelfSubjectAccessReview` (CSRF header like every non-GET); `staleTime`/`gcTime` 60 s, de-duplicated by key. Errors
   resolve to "allowed" — the server stays the authority and its 403 is shown — so a flaky SSAR never locks the UI.
   List rows check at namespace level (no `name`), so a 2,000-row list costs one SSAR per visible namespace.
10. **Big lists** (DATA-4): client-side filter + sort over the cached array, then PatternFly `Pagination` (default 50
   rows/page). No virtualisation: PF `Table` virtualisation needs an extra extension and custom row measuring, while
   pagination is idiomatic PF and bounds DOM size. The name filter uses `useDeferredValue`.

## Consequences
- Generic pages never touch `fetch`; tests drive everything through MSW (`web/src/mocks/k8s`, T-0070), including
  streamed watch responses and 410.
- One watch per visible list; background tabs keep their watch (acceptable at CP2 scale; revisit with CP6 limits).
- Kubernetes `Status` codes become `Kubernetes.*` `ApiError` codes; UI code matches on `status`/`code`, never on
  message text.
- `retryTransientFailures` retries a 502/504 once; `Proxy.CredentialRejected` therefore costs one extra request —
  accepted for simplicity.
