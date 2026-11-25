---
id: T-0341
title: Fleet status data — useFleetStatus over the NDJSON stream, MSW fleet handler, e2e fake Tables
status: done
owner: frontend-engineer
checkpoint: 5c
depends_on: [T-0330, T-0340]
paths: [web/src/features/fleet/api, web/src/mocks/handlers/fleet.ts, web/src/mocks/handlers/index.ts, web/src/mocks/fixtures/fleetStatus.ts, web/src/mocks/fixtures/index.ts, web/e2e/support/fakeClusterHealth.ts, web/e2e/support/fakeKubeApi.ts, docs/architecture/FRONTEND.md]
review_rounds: 1
---

## Goal
FLT-6 data layer: progressive rows from `GET /api/fleet/status` (contract §2, ADR-0041), cancellable, auto-refreshing,
plus the MSW handler that streams per-cluster scenarios with delays and the e2e fake apiserver answers the real
backend needs (contract §2.2/§3).

## Scope
- In: `features/fleet/api/{fleetStatus.ts, useFleetStatus.ts, useFleetRows.ts}` + tests, MSW handler + fixtures,
  `web/e2e/support/fakeClusterHealth.ts` hooked into `fakeKubeApi.ts`, FRONTEND.md § Data fetching paragraph.
- Out: rendering (T-0342).

## Contract / design notes
- **Read** `fetchFleetStatus(signal): AsyncGenerator<FleetClusterStatus>` — `apiClient.GET('/api/fleet/status',
  { parseAs: 'stream', signal })`; non-ok → the shared `ApiError` (ProblemDetails `code`, so 503 `Fleet.Busy` is
  distinguishable; 401 handled globally as everywhere); body → `TextDecoderStream` → `ndjsonLines()` → `JSON.parse`
  per line (a malformed line throws — it's a bug, not a state).
- **Query** `useFleetStatus()`: TanStack `experimental_streamedQuery` (v5.108, `queryFn: ({ signal }) =>
  fetchFleetStatus(signal)`, `reducer` folding lines into `Record<clusterName, FleetClusterStatus>`, `initialValue
  {}`, `refetchMode: 'append'` so a refresh keeps the previous lines visible and replaces them as new ones arrive).
  Key `fleetStatusQueryKey = ['api', 'fleet', 'status']`; `refetchInterval: 60_000`, `refetchIntervalInBackground:
  false` (FLT-6), `staleTime: 0`, `retry: false` (the page shows the error + Retry). Expose `{ byName, isFetching,
  error, refetch, dataUpdatedAt }`. If append semantics prove wrong under test (stale lines for clusters that lost
  access), fall back to a component-state hook like `events/useEventStream.ts` and record it — do not hand-roll both.
- **Rows** `useFleetRows()`: joins `useAccessibleClusters()` (from `@/features/cluster-context`) with `byName`:
  `FleetRow = { cluster: AccessibleCluster; status?: FleetClusterStatus; pending: boolean }`; while fetching, rows
  without a line are `pending`; when a fetch completes, rows still without a line are **dropped** (contract §2.2);
  clusters present only in the stream (list cache older) are added from `status.cluster`.
- **MSW** `mocks/handlers/fleet.ts`: `GET /api/fleet/status` → `ReadableStream` writing one line per accessible
  cluster of the session user (reuse the access logic `handlers/clusters.ts` uses; export a helper there if needed),
  each after its scenario delay. Scenario table `mocks/fixtures/fleetStatus.ts` (by cluster name): `prod-eu-1`
  healthy + 2 updates available; `prod-us-1` clusterOperators `forbidden` (Restricted); `prod-k8s-1` Kubernetes
  (`kubernetesVersion` only); `staging-eu-1` progressing to the next version; `dev-1` healthy; `dev-2` 1 degraded
  operator + 1 NotReady node; `lab-1` `failure: 'timeout'` after 5 s; delays 100–1500 ms so progressive rendering is
  visible. T-0331's k8s fixtures mirror these (keep both in sync; comment pointing at each other).
  Query param `?mockFleet=busy` (or a `db` toggle as other handlers do) → 503 `Fleet.Busy` for the error state test.
- **e2e fake** `web/e2e/support/fakeClusterHealth.ts`: `GET /api/v1/nodes` and
  `/apis/config.openshift.io/v1/clusteroperators` answer a `meta.k8s.io/v1` `Table` (columnDefinitions `Name`,
  `Status` / `Available`, `Progressing`, `Degraded`; `includeObject=None`) when `Accept` asks for Table, else a JSON
  list; `GET /apis/config.openshift.io/v1/clusterversions/version` JSON; `/version` JSON. `fakeKubeApi.ts` gets only
  the dispatch hook (keep it small; T-0311 precedent). An unreachable cluster for QG5C-2 is T-0344's job.
- **FRONTEND.md**: one short paragraph under Data fetching: NDJSON streams via `streamedQuery` (or the fallback),
  key, refresh semantics.

## Context pack
- Docs: `docs/specs/CP5-api-contract.md` §2, §2.2, §3; ADR-0041; FRONTEND.md § Data fetching rules.
- Exemplars: `shared/k8s/ndjson.ts:ndjsonLines`, `features/resources/events/useEventStream.ts` (stream + abort);
  `features/cluster-context/useAccessibleClusters.ts`; `mocks/handlers/clusters.ts` (access filter, session user);
  `web/e2e/support/fakeWorkloadsApi.ts` (separate fake module hooked into `fakeKubeApi.ts`).
- Touch points: `shared/api/types.ts` Fleet aliases (T-0330); `shared/api/schema.gen.ts` `/api/fleet/status` (L103);
  `node_modules/@tanstack/query-core/build/modern/streamedQuery.d.ts` (grep `refetchMode`, `reducer`).
- OCP reference: none (fleet invention).

## Acceptance criteria
- [x] Hook test (MSW): rows appear one by one in arrival order; pending until their line; dropped at stream end when absent.
- [x] Unmount / refetch aborts the request (signal asserted); refresh keeps previous rows until replaced.
- [x] 503 `Fleet.Busy` surfaces as `ApiError` with that code.
- [x] e2e fake serves Table vs JSON by `Accept` (unit test in `web/e2e/support` if the folder has one, else covered by T-0344).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-25 frontend-engineer: started.
- 2026-11-25 frontend-engineer: streamedQuery (append) + `{current, previous, complete, settled}` reducer with start/end
  sentinels (append alone kept stale lines); useFleetRows join; MSW fleet handler + scenario table; e2e fakeClusterHealth
  with unit test; FRONTEND.md paragraph. Scoped checks green. Full gate: build ok, 1491/1492 tests (ResourceDetailsTab
  flaked under load, passes alone); lint+typecheck red only from others' AppShell.test.tsx WIP. Also touched mocks/index.ts (1 export).

## Review
- 2026-11-25 frontend-architect, round 1: **APPROVE**. Scoped `check-fe.sh` green (lint, typecheck, 115 tests).
  - The start/end markers are FE-only: `useFleetStatus.ts:fleetStatusStream` wraps the generator, nothing is added on the wire, and the contract §2 framing (bare NDJSON, end = body EOF) is unchanged. Sound against query-core 5.108 `streamedQuery`: in `append` mode the reducer gets the cached `prev`, so without a start marker the reducer can't tell where a new stream begins. Yielding `start` only after the first line keeps the data through a 503 refresh, and `end` only on EOF keeps an aborted stream from counting as complete.
  - `hasCompleted` is a justified addition: it stops dropped clusters from flashing back to "Checking…" every 60 s. It is documented in Handover for T-0342.
  - No buffering: `fetchFleetStatus` reads line by line through `ndjsonLines()`, and `reader.cancel()` runs in `finally`. The MSW stream enqueues per timer and clears the timers on abort or cancel.
  - Note: the FRONTEND.md paragraph and its query-key row were already committed with 2aa2b5c (T-0331), so they are not in this diff.
  - Nit (optional) `useFleetStatus.ts:118`: `refetch: () => void refetch()` gets a new identity on every render. Wrap it in `useCallback` if T-0342 puts it in deps.
  - Nit (optional) `useFleetStatus.ts:109-110`: `data` and the `useMemo` recompute `query.data ?? EMPTY` twice; use one.
  - Nit (optional) `useFleetRows.ts:24-28`: once `hasCompleted` is set, a newly granted cluster that is listed but has no line stays hidden (not "Checking…") until its line arrives. This is acceptable, but say so in the TSDoc. Also re-wrap the over-long TSDoc line.

## Handover notes
- API (`features/fleet/api`): `fetchFleetStatus(signal)`, `useFleetStatus()` → `{ byName, hasCompleted, isFetching, error,
  refetch, dataUpdatedAt }` (`hasCompleted` replaces the design's implicit "fetch completed": stays true across refreshes so
  dropped clusters don't flash back as "Checking…"), `useFleetRows()` → `{ rows, isLoading, clustersError, ...status }`,
  pure `joinFleetRows`/`reduceFleetStatus` for T-0342 tests. No `api/index.ts`; import the modules directly.
- Append-mode fix: the stream yields `start` (with the first line) and `end` sentinels; the reducer moves the last complete
  stream to `previous`, so refresh keeps rows and only a *completed* stream drops absent clusters.
- MSW: `mocks/handlers/fleet.ts` (untyped: openapi-msw types the ndjson body as one object); `setMockFleetLatency(0)` in
  tests (exported via `@/mocks`); busy = page URL `?mockFleet=busy`. `accessibleClustersOf(user)` extracted in
  `handlers/clusters.ts`. Admin sees dev-1, prod-k8s-1, lab-1 only; other scenarios need another mock user.
- `dev-2` is declared Kubernetes + disabled in `fixtures/clusters.ts`; its scenario is OpenShift-shaped (DIST-5, mirrors T-0331).
- e2e: `fakeClusterHealth.ts` (healthy 4.18.12, 3 nodes, 3 operators) hooked into `fakeKubeApi.ts` after the watch check;
  unit test `e2e/support/fakeClusterHealth.test.ts` runs in Vitest. No UI change, so no style probe.
