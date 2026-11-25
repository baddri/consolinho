---
id: T-0370
title: List pages render the first 250-item page at once and defer row access reviews (OCP incremental load)
status: done
owner: frontend-engineer
checkpoint: 5.5
depends_on: []
paths: [web/src/shared/k8s, web/src/features/resources/list, web/src/features/resources/actions, web/src/features/resources/registry/types.ts, web/src/features/resources/workloads, web/src/features/resources/storage/pvcs, web/src/mocks/k8s]
review_rounds: 0
---

## Goal
The human reports that our list pages feel slower than the real OCP console, especially with "All namespaces", as
if we waited for every object. That is true. `useK8sList` resolves only after `k8sListAll` has fetched every
`limit=250` page, so the table shows skeleton rows until the last page arrives. OCP shows the first page as soon as
it lands and appends the rest (`bulkAddToList`).

A second cost appears once the rows render. Every visible row mounts `useResourceActions`, which runs 3 common
SelfSubjectAccessReviews plus the kind's own (Deployments add scale, pause, restart and more). With All namespaces
that becomes N namespaces × 3–8 POSTs through the proxy, and they queue behind the browser's 6 HTTP/1.1 connections
(one is already held by the watch). OCP's `LazyActionMenu` resolves actions only on kebab hover or open.

Backend: no change is needed. The proxy streams through YARP `IHttpForwarder` with no buffering or compression
middleware. `AuthorizeProxyRequestHandler` serves grants from a cached snapshot, and GETs are not audited.

## Scope
- In:
  - Part A: incremental list loading in `shared/k8s`.
  - Part B: lazy row-kebab access reviews.
- Out:
  - Search one-shot lists (`k8sListAll` stays as is).
  - Virtualisation.
  - Server-side pagination UI.
  - Backend.

If the session runs long, finish and hand in Part A, and leave Part B for a follow-up task.

## Contract / design notes
**Part A: stream pages into the list query (OCP `watchK8sList` → `incrementallyLoad`).**
- `client.ts`: add `async function* k8sListPages<T>(cluster, model, opts, signal): AsyncGenerator<K8sListChunk<T>>`.
  - Chunk: `{ items: T[]; restart?: true; resourceVersion?: string }`. Items get `withTypeMeta`.
  - `resourceVersion` is set only on the last page.
  - A 410 on a `continue` token yields `{ items: [], restart: true }`, then relists once. A second 410 throws, as today.
  - Re-implement `k8sListAll` as a fold over `k8sListPages` (one paging loop; search keeps its API and tests).
- `hooks.ts` `useK8sList`:
  - `queryFn: streamedQuery<K8sListChunk<T>, K8sListState<T>>({ streamFn, reducer, initialValue, refetchMode: 'replace' })`.
  - `K8sListState<T> = K8sListData<T> & { complete: boolean }`, and `initialValue` is `{ items: [], resourceVersion: '', complete: false }`.
  - Reducer:
    - `restart` → items `[]`.
    - Otherwise append the items.
    - A chunk with `resourceVersion` → `complete: true` + version.
  - Exemplar: `features/fleet/api/useFleetStatus.ts:useFleetStatus`.
  - `'replace'` keeps today's relist behaviour: old rows stay until the full relist ends, and the watch manager's 410 → `invalidateQueries` path is unchanged.
- The watch starts only after the last page. Pass `useWatch(…, complete ? resourceVersion : undefined, …)`. The
  existing `resourceVersion !== undefined` guard already defers `manager.sync`. `watchManager.setQueryData` must keep
  `complete` (spread the old state).
- `isPending` is now false after the first page. `ConsoleDataView` `loaded` then flips on page 1, as OCP's `loaded`
  does. Show no extra spinner (OCP shows none). `liveStatus` stays `loading` until the watch syncs.

**Part B: access reviews on demand (OCP `LazyActionMenu` `onToggleHover`).**
- `KindActionArgs` gets `checkAccess: boolean`, and `useResourceActions` gets the matching option.
  - Every `useActionAccess` call ANDs it into `enabled`: the common patch/update/delete checks and every kind hook (`grep -rln useActionAccess web/src/features/resources`).
  - The details page passes `true`.
- `ResourceRowActions` / `RowActions`:
  - Hold `const [active, setActive] = useState(false)` and pass `checkAccess: active`.
  - Render `ActionsColumn` with `actionsToggle={({ onToggle, isOpen, isDisabled, toggleRef }) => <MenuToggle variant="plain" ref={toggleRef} aria-label="Kebab toggle" icon={<EllipsisVIcon />} isExpanded={isOpen} isDisabled={isDisabled} onClick={(e) => { setActive(true); onToggle(e); }} onMouseEnter={() => setActive(true)} onFocus={() => setActive(true)} />}`.
  - Keep PF's default toggle markup and label, and check the ARIA against `ActionsColumn`'s default.
- While inactive, items are `isAriaDisabled` (the `isChecking` state). The SSAR (60 s cache, shared per namespace)
  usually resolves between hover and click.

## Context pack
- Docs:
  - `FRONTEND.md` § Data fetching rules (L144–152; update the "Lists use watch" bullet: first page renders, the watch starts after the last page).
  - ADR-0022 §3–4, §9.
- Exemplars:
  - `web/src/features/fleet/api/useFleetStatus.ts:useFleetStatus` + `reduceFleetStatus` (streamedQuery + reducer).
  - `web/src/shared/k8s/hooks.test.tsx` L81–180 (`useK8sList` tests).
- Touch points:
  - `shared/k8s/client.ts:k8sListAll` (L85), `K8sListData` (L19), `LIST_PAGE_SIZE`.
  - `shared/k8s/hooks.ts:useK8sList` (L51), `useWatch` (L24).
  - `shared/k8s/watchManager.ts` L83–86, L275.
  - `features/resources/list/ResourceDataView.tsx:useResourceDataView` (L114, `loaded` L172).
  - `features/resources/actions/ResourceRowActions.tsx:RowActions`, `actions/useResourceActions.tsx:useResourceActions`.
  - `actions/useActionAccess.ts:useActionAccess`, `registry/types.ts:KindActionArgs` (L101).
  - Kind hooks: `workloads/deployments/useDeploymentActions.tsx`, `replicasets/useReplicaSetActions.tsx`, `deploymentconfigs/useDeploymentConfigActions.tsx`, `replicationcontrollers/useReplicationControllerActions.tsx`, `scale/useEditCountAction.tsx`, `scale/useRestartRollout.ts`, `storage/pvcs/useExpandPVCAction.tsx`.
- OCP reference:
  - `/home/bad/works/openshift-console/frontend/packages/console-dynamic-plugin-sdk/src/app/k8s/actions/k8s.ts:watchK8sList` (L80–175: `incrementallyLoad`, first page `loaded`, then `bulkAddToList`, then WS from the last `resourceVersion`).
  - `packages/console-shared/src/components/actions/LazyActionMenu.tsx:LazyActionMenu` (L54–105).

## Acceptance criteria
- [x] A 3-page list (MSW, 600 items) renders rows after page 1 while pages 2–3 are still pending (test with a delayed handler). The final row count is 600, and the watch request carries page 3's `resourceVersion` and starts only after it.
- [x] `continue` 410 mid-paging restarts once without duplicate rows. Relist after a watch 410 keeps the old rows until it completes (existing tests stay green).
- [x] An All-namespaces list with rows in 5 namespaces sends **0** SelfSubjectAccessReviews on render. Hovering or focusing one kebab sends that namespace's checks. Details-page actions still check on mount.
- [x] Kebab keyboard and ARIA are unchanged (existing `ResourceActions.test.tsx` green). `FRONTEND.md` data-fetching bullet updated.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-25 frontend-engineer: Part A `k8sListPages` + `streamedQuery` list (watch after last page, `complete` kept
  by the watch manager); Part B `checkAccess` on `KindActionArgs`/`useResourceActions`, row kebab activates on
  hover/focus/click via a PF-default `actionsToggle`. Tests: incremental 600-pod list, continue-410 restart, 0 SSARs on
  an all-namespaces render. FRONTEND.md data-fetching bullet updated.
- 2026-11-25 frontend-engineer (fix round 1): `useK8sList` staleTime is Infinity only for a `complete` list, so a
  stream cut short relists on remount (test: unmount after page 1, remount → 600 rows + 1 watch; fails without fix).
  `useCronJobActions` passes `checkAccess` to both reviews (test: no SSAR on CronJobs list render). The 100 ms sleeps
  in ResourceActions.test are kept: they guard negative assertions ("no more reviews"), which waitFor can't express.

## Review
**Round 1 — frontend-architect, 2026-11-25: CHANGES_REQUESTED**
- `web/src/shared/k8s/hooks.ts:104` — a first stream cancelled mid-paging leaves a partial list in the cache for good.
  The cause: streamedQuery writes each page with `setQueryData` (manual), and query-core then makes that state the
  `#revertState` (`query.ts` L990–992). When the last observer leaves (namespace switch or navigating away during an
  All-namespaces load), `cancel({ revert: true })` restores page 1 with `complete:false` and status `success`. With
  `staleTime: Infinity` a remount inside gcTime never refetches, and the watch never starts (`liveStatus` stays
  `connecting`), so the rows after page 1 are lost. The same happens after a mid-stream error once retries run out.
  Fix: `staleTime: ({ state }) => (state.data?.complete ? Infinity : 0)` so a remount relists (replace mode keeps the
  partial rows). Add a hooks test: unmount after page 1, remount, expect 600 rows and a watch.
- `web/src/features/resources/workloads/cronjobs/cronJobDetails.tsx:63-67` — `useCronJobActions` ignores `checkAccess`,
  so the CronJobs list still sends 2 SSARs per namespace on render (this breaks AC 3). Fix: destructure `checkAccess`
  and pass it as the 4th argument of both `useActionAccess` calls.
- Verified OK: the kebab toggle matches PF `ActionsColumn`'s default (label, plain variant, icon, `isExpanded`,
  `isDisabled`, ref), so ARIA and keyboard behaviour are unchanged. The details menu passes `checkAccess: true`. The
  watch gets only the last page's version. `continue` 410 → restart marker → no duplicates. A replace-mode relist and
  `applyListEvents` both keep `complete`. Gating the RS/RC/DC owner fetches behind `checkAccess` is a welcome extra.
- Nit (optional): `useK8sList` doesn't expose `complete`. Decision consumers (`useRelatedHPA`, `useRetryRollout`,
  `CsvSubscriptionTab` "not found") can now act on page 1 alone; that is harmless below 250 objects. Consider an
  `isComplete` field in a follow-up.
- Gate: the full check-fe run had 8 timeout failures (projectSelector, ResourceYamlTab) under machine load. Both files
  passed when re-run on their own (35/35), so these look like flakes and not regressions.
- Nit (optional): `ResourceActions.test.tsx:203,225` use fixed 100 ms sleeps. Prefer asserting after a `waitFor` on a
  later, deterministic signal.

## Handover notes
- `k8sListPages` (client.ts) is the one paging loop; `k8sListAll` folds it (Search unchanged).
- `useK8sList` cache = `K8sListState` (`complete` flag); `useWatch` gets the version only when `complete`.
  `applyListEvents` spreads the old state so `complete` survives watch flushes.
- `isPending` turns false on page 1 (ConsoleDataView `loaded` flips then); `liveStatus` stays `connecting` until watched.
- `KindActionArgs.checkAccess` (required): every kind hook ANDs it into its reviews' `enabled`, incl.
  `useNodeActions` (compute/, outside listed paths, one-line change) and the RS/RC `useResourceAccess` calls.
- Row kebab toggle replicates PF's default `MenuToggle` (label "Kebab toggle", plain, RhUiEllipsisVerticalFillIcon).
- No ui-probe run: no visual change (toggle markup identical to PF's default).
