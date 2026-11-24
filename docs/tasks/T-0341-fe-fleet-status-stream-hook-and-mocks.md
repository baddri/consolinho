---
id: T-0341
title: Fleet status data — useFleetStatus over the NDJSON stream, MSW fleet handler, e2e fake Tables
status: todo
owner: frontend-engineer
checkpoint: 5c
depends_on: [T-0330, T-0340]
paths: [web/src/features/fleet/api, web/src/mocks/handlers/fleet.ts, web/src/mocks/handlers/index.ts, web/src/mocks/fixtures/fleetStatus.ts, web/src/mocks/fixtures/index.ts, web/e2e/support/fakeClusterHealth.ts, web/e2e/support/fakeKubeApi.ts, docs/architecture/FRONTEND.md]
review_rounds: 0
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
- [ ] Hook test (MSW): rows appear one by one in arrival order; pending until their line; dropped at stream end when absent.
- [ ] Unmount / refetch aborts the request (signal asserted); refresh keeps previous rows until replaced.
- [ ] 503 `Fleet.Busy` surfaces as `ApiError` with that code.
- [ ] e2e fake serves Table vs JSON by `Accept` (unit test in `web/e2e/support` if the folder has one, else covered by T-0344).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
