---
id: T-0071
title: shared/k8s data layer — client, error mapping, list+watch hooks, discovery, useCanI
status: done
owner: frontend-engineer
checkpoint: 2
depends_on: [T-0070]
paths: [web/src/shared/k8s/, web/src/shared/api/errors.ts, web/src/shared/api/index.ts]
review_rounds: 1
---

## Goal
Implement ADR-0022: the one place the SPA talks to Kubernetes through the proxy. Live lists (DATA-3, DATA-5), single
objects with live updates, discovery (DATA-2), SSAR-based `useCanI` (UI-9) and `ApiError` mapping of proxy
ProblemDetails and Kubernetes `Status` errors (UI-10). No UI.

## Scope
- In: `url.ts`, `client.ts`, `errors.ts`, `ndjson.ts`, `watch.ts`, `watchManager.ts`, `queryKeys.ts`, `hooks.ts`,
  `discovery.ts`, `access.ts`, `index.ts` in `web/src/shared/k8s/`; export the rejection mapper from `shared/api/errors.ts`.
- Out: pages, registry, cluster-context (T-0072+). Polling fallback (FRONTEND.md mentions it; ADR-0022 replaces it with
  backoff re-watch — no polling).

## Contract / design notes
BE contract `docs/specs/CP2-api-contract.md` §1–4. Assumed and relied on (reconcile if BE deviates):
proxy base `/api/clusters/{encodeURIComponent(cluster)}/k8s`; query passed unchanged; watch = NDJSON over chunked
HTTP, unbuffered; proxy 401 only for a missing session; Kubernetes `Status` bodies passed through; SSAR POST needs CSRF
header and is allowed for read-only users/grants.

Signatures (all exported from `shared/k8s/index.ts`):
```ts
resourceApiPath(cluster: string, model: K8sModel, opts?: { namespace?: string; name?: string; query?: Record<string, string | undefined> }): string
k8sListAll<T>(cluster, model, opts: ListOptions, signal?): Promise<{ items: T[]; resourceVersion: string }>   // limit=250 + continue; one restart on 410
k8sGet<T>(cluster, model, namespace: string | undefined, name, signal?): Promise<T>
k8sUpdate<T extends K8sResource>(cluster, model, obj: T): Promise<T>              // PUT, Content-Type application/json
k8sDelete(cluster, model, namespace: string | undefined, name): Promise<void>
k8sCreate<T>(cluster, model, namespace: string | undefined, obj: T): Promise<T>   // used for SSAR
interface ListOptions { namespace?: string; labelSelector?: string; fieldSelector?: string }
type LiveStatus = 'connecting' | 'live' | 'paused'
useK8sList<T>(cluster: string, model: K8sModel, opts: ListOptions & { enabled?: boolean }):
  { data: T[] | undefined; error: ApiError | null; isPending: boolean; liveStatus: LiveStatus; refetch(): void }
useK8sGet<T>(cluster, model, namespace: string | undefined, name: string, opts?: { enabled?: boolean }):
  { data: T | undefined; error: ApiError | null; isPending: boolean; liveStatus: LiveStatus; refetch(): void }
useK8sDiscovery(cluster): { isServed(model: K8sModel): boolean; isPending: boolean }
useCanI(cluster, review: { verb: 'get'|'list'|'watch'|'update'|'patch'|'delete'|'create'; model: K8sModel; namespace?: string; name?: string },
  opts?: { enabled?: boolean }): { allowed: boolean | undefined; isPending: boolean }
k8sQueryKeys.{ all(cluster), list(cluster, model, opts), get(cluster, model, ns, name), discovery(cluster), access(cluster, review) }
```
- Errors (`errors.ts`): `k8sErrorFromResponse(response): Promise<ApiError>` — `application/problem+json` → reuse the
  ProblemDetails reader (export a `apiErrorFromProblemBody(response, body)` from `shared/api/errors.ts` built on
  `fromErrorResponse`); JSON with `kind: "Status"` → `code: "Kubernetes.<reason>"`, `title: reason`, `detail: message`;
  anything else → status text. Network/abort via the existing `fromRejection` (export it as `apiErrorFromRejection`).
  Every function throws only `ApiError` (registered type, `shared/api/queryRegister.ts`).
- Requests: `fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })`, CSRF via
  `withCsrfHeader` from `shared/api`. Resolve `globalThis.fetch` at call time (MSW, see `shared/api/client.ts:L38-L42`).
- Watch manager per ADR-0022 §3–5: ref-counted by serialized list key; flush every `WATCH_FLUSH_MS = 100`; backoff
  1 s doubling to 30 s on error, reset after a successful connect; clean end → immediate re-watch from last rv; 410 →
  `queryClient.invalidateQueries({ queryKey: listKey, exact: true })`; 401/403/404 → stop. Backoff delays injectable
  (module constants overridable in tests, or a `setWatchTimingForTests`) — never raise global test timeouts.
- `useK8sGet` watch uses `fieldSelector=metadata.name=<name>` (namespaced in `namespace`); a DELETED event
  invalidates the `get` key, so the refetch's 404 drives the page's not-found state.
- Discovery: `GET …/k8s/api` + `…/k8s/apis`; served set of `group/version`; baseline `{ 'v1', 'apps/v1' }` while
  pending/error. `staleTime: Infinity`.
- `useCanI`: `staleTime: 60_000`, `gcTime: 60_000`, `retry: false`; error → `allowed: true` (server is the authority).

## Context pack
- Docs: ADR-0022 (all), FRONTEND.md § "Data fetching rules".
- Exemplars: `web/src/shared/api/errors.ts:L62-L105` (`problemBody`, `fromErrorResponse`, `fromRejection` to reuse),
  `web/src/shared/api/client.ts:withCsrfHeader`, `web/src/features/cluster-context/useAccessibleClusters.ts`
  (query hook + key + TSDoc style), `web/src/features/cluster-context/useLastCluster.ts:L1-L36` (`useSyncExternalStore`
  store pattern for `liveStatus`).
- Touch points: `web/src/shared/api/errors.ts:fromErrorResponse|fromRejection` (export, no behaviour change),
  `web/src/shared/api/index.ts`, `web/src/app/queryClient.ts:retryTransientFailures` (unchanged; 4xx not retried),
  `web/src/mocks` `mockK8s` helpers (T-0070) for tests; `web/src/test/render.tsx:renderWithProviders` for hook tests
  (or `renderHook` with the app `AppProviders`).

## Acceptance criteria
- [x] `ndjson` splitter unit test: events split across chunks and multiple events per chunk.
- [x] Error mapping tests: `Proxy.CredentialRejected` 502, `Kubernetes.Conflict` 409, `Kubernetes.Forbidden` 403,
      network failure → status 0; abort rethrown.
- [x] `k8sListAll` pages through 600 mock pods in 3 requests and returns the last `resourceVersion`.
- [x] `useK8sList` (QG-3): add / modify / delete via `mockK8s` appear without refetch; `compact` → relist then live;
      watch error → `liveStatus: 'paused'` then `'live'` after reconnect; two components with the same key open one
      stream; unmount aborts it; changing namespace closes the old stream (DATA-5).
- [x] `useK8sGet` sees an out-of-band modification; `useK8sDiscovery` hides projects on `lab-1`; `useCanI` dedupes two
      identical checks into one POST and returns `false` for a view profile `delete`.
- [x] 401 from the proxy reaches the global handler (navigates to `/login`); 502 does not.
- [x] TSDoc on every exported function/hook. Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-20 frontend-engineer: started; ADR-0022 + contract §1–4 read.
- 2026-11-20 frontend-engineer: url/client/errors/ndjson/watch/watchManager/queryKeys/hooks/discovery/access done;
  3 test files (20 tests). Object watches start from the current state (seed rv → 410 in mock and real etcd).
  `scripts/check-fe.sh` green → in_review.
- 2026-11-20 frontend-engineer: round 1 fixes — streams closed within `minStreamMs` (1 s) or 2xx without body back
  off; object 410 restarts at once only from a saved rv, else backs off; nits fixed; 3 tests added. Green → in_review.

## Review
**Round 1 — frontend-architect: CHANGES_REQUESTED.** check-fe.sh green. ADR-0022 compliance, streaming (no buffering,
abort on unmount), dedup, list rv/410 handling, error mapping, `useCanI` keys, no `any` all OK. Declared deviations
accepted; ADR-0022 §6 amended (object watch from current state, check `error` before `data`; noted in T-0075).
Required:
- `web/src/shared/k8s/watchManager.ts:209` (+ `watch.ts:44`) — a clean end re-watches immediately with no floor, so a
  proxy/router that closes the stream at once (or a 2xx with no body) becomes a hot request loop per open list — treat
  a clean end that stayed open < ~1 s (`timing.minStreamMs`, test-overridable) as a failure (backoff path), and add a
  test for it.
- `web/src/shared/k8s/watchManager.ts:213-216` — object-mode 410 `continue`s without delay; if a watch from `''` also
  returns 410 it spins — only restart at once when `streamRv !== ''`, otherwise take the backoff path.
Nits (optional): `client.ts:147` comment says "drain" but the body is cancelled — reword; `watchManager.ts:109` TSDoc
line exceeds the line length used elsewhere.

**Round 2 — frontend-architect: APPROVE.** check-fe.sh green (51 files, 557 tests). Both required fixes verified:
`watchManager.ts:218-231` (clean end < `minStreamMs` → backoff, no backoff reset; object 410 restarts at once only from a
saved rv) and `watch.ts:43` (2xx without body → failure); nits fixed. Optional: a test for the immediate object restart
from a saved rv (one-branch path, low risk).

## Handover notes
- Public API in `shared/k8s/index.ts`; also `K8sListData`, `K8sLiveResult`, `AccessReview`, `LIST_PAGE_SIZE`,
  `proxyBasePath`, `setWatchTimingForTests` (tests: `onTestFinished(setWatchTimingForTests({...}))`).
- `shared/api` now exports `apiErrorFromProblemBody` / `apiErrorFromRejection` (aliases, no behaviour change).
- List items are stamped with `apiVersion`/`kind` from the model.
- `useK8sGet` watch starts without `resourceVersion` (synthetic ADDED) and re-watches from current state on 410 —
  an object's own rv is usually outside the watch window. DELETED → refetch → `error` 404 while TanStack keeps the
  old `data`: pages must check `error` first.
- Backoff resets only after a stream stayed open ≥ `minStreamMs`; tests override it via `setWatchTimingForTests`.
- Watch 401 → stop + refetch (so the global handler sees it); 403/404 → stop with `liveStatus: 'paused'`.
- Not done (ADR §7): mutations writing the returned object into the `get` key — `k8sUpdate/k8sDelete` are plain
  functions; the mutation hooks of T-0076/T-0077 should `setQueryData(k8sQueryKeys.get(...))`.
- `useCanI` reflects SA RBAC only; read-only grant/user gating stays with T-0076.
