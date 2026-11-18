---
id: T-0029
title: Real cluster switcher, landing redirect, "no clusters assigned" and "cluster not available" pages
status: todo
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0028, T-0024]
paths: [web/src/features/cluster-context/, web/src/app/router.tsx, web/src/app/layout/AppSidebar.tsx, web/src/app/layout/navigation.ts, web/src/app/**/*.test.tsx, web/src/features/home/]
review_rounds: 0
---

## Goal
Replace the placeholder cluster list with the user's granted clusters (SW-1..6): environment colour and read-only
badge in the switcher, sensible landing on `/`, a friendly page for users without grants and for clusters they
cannot access. Backend counterpart: T-0019 (`GET /api/clusters`); MSW until then. **Parallel group F5.**

## Scope
- In: feature `cluster-context`; router entries for `/` and `/c/:cluster`; sidebar default-cluster logic.
- Out: switcher search/recent/favourites (CP2), cluster pages content (CP2).

## Contract / design notes
Endpoint `GET /api/clusters` → `AccessibleCluster[]` (already sorted by env then name; do not re-sort). Query key
`['api','clusters']`, `staleTime: 30_000`, `refetchOnWindowFocus: true`, `refetchInterval: 5 * 60_000` (SW-6).

`features/cluster-context/index.ts` exports (remove `PLACEHOLDER_CLUSTERS`, `DEFAULT_CLUSTER`, `ClusterSummary`):
- `useAccessibleClusters(): UseQueryResult<AccessibleCluster[], ApiError>`.
- `ClusterSwitcher` — `Select` over the list: name + `EnvironmentLabel` + `Label` "Read only" when
  `accessMode === 'readOnly'` (effective mode already includes global read-only, contract §6). States (SW-2/4):
  loading → `Skeleton` inside the toggle; error → toggle text "Clusters unavailable — retry", clicking it refetches;
  empty → disabled toggle "No clusters". Keep `clusterSwitchPath` behaviour. Typeahead-ready structure (CP2).
- `useLastCluster(): [string | undefined, (name: string) => void]` — `localStorage['fleetconsole.lastCluster']`;
  written by `ClusterGate` when a granted cluster is shown.
- `LandingRedirect` (route `/` index) — pending spinner; last cluster if still in the list, else first →
  `Navigate replace` to `/c/<name>/overview` (SW-3); zero → `NoClustersPage`.
- `NoClustersPage` (SW-4) — `EmptyState` `CubesIcon`, title "No clusters assigned yet", body "You are logged in as
  `<username>`, but no clusters have been assigned to you. Ask a FleetConsole administrator to grant you access."
  Admins also get a primary "Go to Administration" link (`/admin/users`) and the hint "Admins need a grant too:
  grant yourself access from your user page." with a link to `/admin/users/<own username>/access` (GRANT-6).
- `ClusterGate` (element of route `c/:cluster`) — cluster in the list → `<Outlet/>`; not in the list →
  `ClusterNotAvailablePage`: "Cluster `<name>` is not available — it does not exist or you don't have access" +
  link to `/` (SW-5; identical text for unknown and ungranted).
- `usePreferredCluster(): string | undefined` — active cluster ?? last cluster (if granted) ?? first; used by
  `AppSidebar` for cluster nav links on non-cluster pages; cluster nav sections hidden when the user has none.

## Acceptance criteria
- [ ] SW-1/SW-2: as `alice` the switcher lists exactly her enabled granted clusters in contract order with env labels;
      `prod-eu-1` shows "Read only"; as `ines` (globally read-only) every entry shows "Read only" (fixture/MSW).
- [ ] SW-2: loading skeleton, error toggle with working retry, "No clusters" disabled for `bob`.
- [ ] SW-3: `/` goes to the stored last cluster when still granted, else the first; stale stored name ignored.
- [ ] SW-4/QG-3: `bob` on `/` sees the no-clusters EmptyState with his username; `admin` without grants (MSW
      override) also sees the Administration link and hint.
- [ ] SW-5: `/c/does-not-exist/overview` and `/c/<ungranted>/overview` render the same "not available" page.
- [ ] SW-6: query options asserted (focus refetch + 5 min interval) — unit test on the hook's options or fake timers.
- [ ] Existing cluster-switch tests adapted (fixtures instead of placeholders). TSDoc. Build, lint, tests green.

## Work log

## Review

## Handover notes
