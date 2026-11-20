---
id: T-0029
title: Real cluster switcher, landing redirect, "no clusters assigned" and "cluster not available" pages
status: done
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0028, T-0024]
paths: [web/src/features/cluster-context/, web/src/app/router.tsx, web/src/app/layout/AppSidebar.tsx, web/src/app/layout/navigation.ts, web/src/app/**/*.test.tsx, web/src/features/home/, web/src/features/auth/UserMenu.test.tsx]
review_rounds: 2
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
- [x] SW-1/SW-2: as `alice` the switcher lists exactly her enabled granted clusters in contract order with env labels;
      `prod-eu-1` shows "Read only"; as `ines` (globally read-only) every entry shows "Read only" (fixture/MSW).
- [x] SW-2: loading skeleton, error toggle with working retry, "No clusters" disabled for `bob`.
- [x] SW-3: `/` goes to the stored last cluster when still granted, else the first; stale stored name ignored.
- [x] SW-4/QG-3: `bob` on `/` sees the no-clusters EmptyState with his username; `admin` without grants (MSW
      override) also sees the Administration link and hint.
- [x] SW-5: `/c/does-not-exist/overview` and `/c/<ungranted>/overview` render the same "not available" page.
- [x] SW-6: query options asserted (focus refetch + 5 min interval) — unit test on the hook's options or fake timers.
- [x] Existing cluster-switch tests adapted (fixtures instead of placeholders). TSDoc. Build, lint, tests green.

## Work log
- 2026-11-19 frontend-engineer: started; read FRONTEND.md, ADR-0014 (+amendment), spec SW-1..6/GRANT-6, contract §6.

- 2026-11-19 frontend-engineer: implemented `useAccessibleClusters`, `ClusterSwitcher` (loading/error/empty), `useLastCluster`,
  `usePreferredCluster`, `LandingRedirect`, `NoClustersPage`, `ClusterGate`/`ClusterNotAvailablePage`; router `/` and
  `c/:cluster` wired; sidebar uses the preferred cluster and hides cluster sections without clusters. Removed
  `clusters.ts` (placeholders). Adapted app tests (admin persona only holds `dev-1`). lint/typecheck/test (338)/build green.
- 2026-11-19 frontend-engineer (round 1 fixes): `UserMenu.test.tsx` now uses granted targets — `ines` →
  `/c/prod-us-1/overview` (her only grant; `dev-1` isn't granted to her), `alice` stays on `prod-eu-1`, `bob` → `/`,
  `admin` → `/c/dev-1/overview`; the failed-logout test asserts the Overview heading before and after. Nits done:
  read-only admin sees "ask another administrator" (new test); toggle accessible name carries the cues
  ("Cluster prod-eu-1 (prod, read only), switch cluster"); loading toggle named only by the skeleton's screen-reader
  text. My files: lint/typecheck/tests (339)/build green. Full-repo lint and `UsersListPage.test.tsx` fail only in
  the in-progress T-0030 files under `features/admin/users/`.

## Review
**2026-11-19 frontend-architect — round 1: CHANGES_REQUESTED** (one test-only fix; the production code is approved as is)

Checks (run by reviewer): `npm run lint` (0 warnings), `typecheck`, `test -- --run` (28 files / 338 tests), `build`
all green.

Verified against spec / contract:
- Order (Q6, contract §6): the component renders the server order unchanged (`ClusterSwitcher.tsx:69`, `LandingRedirect`
  picks `clusters[0]`); the MSW handler sorts by `compareEnvironment` then ordinal name, so it matches the backend.
  The tests cover prod→staging (`alice`) and prod→dev (`ines`). Sorting is a server responsibility, so no FE
  three-environment test is needed.
- Environment colours: shared `EnvironmentLabel` (prod red / staging orange / dev green), in both the toggle and the
  options. OK.
- Effective "Read only" (SW-2, contract §6): driven only by `accessMode`. The test gives `ines` an RW grant and still
  expects "Read only" on every option. OK.
- SW-4/GRANT-6: the text matches the spec exactly. The admin variant links to `/admin/users` and to
  `/admin/users/<me>/access` (both routes exist in `features/admin/routes.tsx`). `bob` gets the disabled
  "No clusters" toggle and the cluster nav is hidden. OK.
- SW-5: unknown, ungranted and granted-but-disabled clusters all render the same page, with no difference in text,
  links or timing (everything comes from the same list), and `lastCluster` is not written. The name in the page
  comes from the URL, and React escapes it. The switcher shows "Select a cluster" there. OK.
- Leakage / ADR-0014 amendment: `['api','clusters']` has no user segment. That is correct here, because the cache is
  per session and is cleared by `clearSessionCache` on logout or session end. Every observer
  (`ClusterSwitcher`/`AppSidebar` in `AppShell`, `ClusterGate`, `LandingRedirect`) sits under `RequireSession`.
  `session.test.tsx` and `UserMenu.test.tsx` still assert that the cache after the session holds only
  `[['api','system','info']]`, and the cluster query is now observed in those trees, so the invariant is tested. OK.
- localStorage: only `fleetconsole.lastCluster` (a name). Every reader checks it against the granted list, and a
  value left by another user on the same browser cannot reveal anything (it is used only if the current user also
  holds that cluster). Storage failures are swallowed. OK.

Rulings on the questions raised:
- **Sidebar fallback when the URL cluster is known-ungranted** (`usePreferredCluster.ts:19-24`): accepted. This is
  better than the task text: the sidebar never offers deep links into a cluster the user can't open, and it adds no
  information (the user typed that name). Trusting the active cluster while the list loads avoids flicker. Keep the
  TSDoc as written.
- **30 s staleTime + focus refetch + 5 min interval**: accepted. `GET /api/clusters` reads only the DB (grants ⋈
  clusters, contract §6) and never calls a managed cluster, so the number of clusters doesn't change the cost.
  Per tab the worst case is about one request per 30 s while the user keeps switching focus, plus one every 5 min
  while visible (`refetchIntervalInBackground` defaults to false). For 100 users that is well under 1 req/s of
  indexed reads. No change.
- **Env + "Read only" labels in the toggle**: accepted and wanted. The production colour must stay visible where the
  user is working (the same reason OCP colours the context), and seeing "Read only" there saves a failed write in
  CP2. `flexWrap nowrap` keeps the masthead on one line.
- **displayName as the option `description`**: accepted. This is idiomatic PF `SelectOption`, it only appears when
  it differs from the name, and it doesn't break the CP2 typeahead structure.

Required:
1. `web/src/features/auth/UserMenu.test.tsx:10,25,34,82,90` — these tests render `/c/prod-eu-1/overview` as `ines`,
   `bob` and `admin`, who hold no grant on that cluster. They now pass against the "not available" page, and the
   failed-logout test (`:82-90`) asserts that we "stay" on a page the user can't see. That makes the tests misleading
   about the state they cover, and it was caused by this task's behaviour change. — Fix: use a granted cluster per
   persona: `ines` → `/c/dev-1/overview` (or `prod-us-1`), `alice` → keep `prod-eu-1`, `bob` → `/` (no-clusters page;
   the masthead assertions are unchanged), `admin` → `/c/dev-1/overview` at `:82` and `:90`. Add
   `web/src/features/auth/UserMenu.test.tsx` to this task's `paths`.

Optional (nits, not blocking):
- `NoClustersPage.tsx:36-50`: a read-only admin (ADM-2) is told to "grant yourself access" but can't. Consider
  `me.isReadOnly` → keep "Go to Administration", and replace the hint with "Ask another administrator to grant you
  access." (No import from `features/admin` is needed, because `me` already carries `isReadOnly`.)
- `ClusterSwitcher.tsx:91`: the toggle's `aria-label` replaces its content, so screen-reader users lose the
  environment and "Read only" cues. Consider `Cluster prod-eu-1 (prod, read only), switch cluster`, or drop the
  aria-label and rely on the content plus `aria-describedby`. Test queries would change accordingly.
- `ClusterSwitcher.tsx:60-61`: both the toggle `aria-label` and the Skeleton `screenreaderText` say "Loading
  clusters". One is enough.

Follow-up captured (reviewer edited the todo tasks): admin mutations must invalidate `accessibleClustersQueryKey`
(imported from `@/features/cluster-context`): T-0033 (enable/disable/delete in the shared hooks), T-0035 (reuse those
hooks), T-0034 (edit changes display name/env), T-0039 (grant create/change/revoke), T-0040 (bulk grant). Each has an
acceptance criterion for it.

**2026-11-19 frontend-architect — round 2: APPROVE**

Checks (run by reviewer, scoped to exclude the in-progress T-0030 under `features/admin/users`):
`npx eslint --max-warnings 0 src/features/cluster-context src/app src/features/auth` clean; `npm run typecheck` ok;
`npx vitest run --exclude 'src/features/admin/users/**'` 28 files / 339 tests green; `npm run build` ok.

- Required item 1 is resolved. `UserMenu.test.tsx` now opens a granted page for each persona: `ines` → `prod-us-1`
  (her only fixture grant; correct, since `dev-1` was only granted inside a round-1 test), `alice` →
  `prod-eu-1`, `bob` → `/` (no-clusters page in the shell), `admin` → `dev-1`. The failed-logout test now asserts
  the Overview heading both before and after the failure, so it proves the user stays on a real page.
- Nit 1 is done. `NoClustersPage.tsx:44-57`: a read-only admin keeps "Go to Administration" and gets "ask another
  administrator" instead of the self-grant link, with a new test (`clusterContext.test.tsx:172`).
- Nit 2 is done. `ClusterSwitcher.tsx:41-45` `toggleLabel` reuses `environmentLabel().text`, so the accessible name
  and the visible label can't drift. Tests updated.
- Nit 3 is done. The loading toggle's name comes only from the skeleton's screen-reader text.

No further findings.

## Handover notes
- Public API (`features/cluster-context/index.ts`): `ClusterGate`, `ClusterSwitcher`, `clusterSwitchPath`, `LandingRedirect`,
  `NoClustersPage`, `accessibleClustersQueryKey` (`['api','clusters']` — admin grant/cluster mutations should invalidate
  it), `useAccessibleClusters`, `useActiveCluster`, `useLastCluster`, `usePreferredCluster`. `PLACEHOLDER_CLUSTERS`,
  `DEFAULT_CLUSTER`, `ClusterSummary` are gone.
- `useAccessibleClusters()` returns `UseQueryResult<AccessibleCluster[]>`; the error type is `ApiError` through the
  registered default (T-0045 `queryRegister.ts`) — spelling it out is a lint error (`no-unnecessary-type-arguments`).
- Small refinement vs. the task text: `usePreferredCluster` skips an active cluster that is known *not* to be granted
  (the "not available" page) and falls back to last/first granted, so the sidebar never links deeper into a cluster the
  user can't open. While the list loads the active cluster is trusted (no flicker).
- `ClusterGate`/`LandingRedirect`: pending → spinner "Loading clusters"; error without cached data → `ErrorState`
  "Could not load your clusters" + Retry; a failed background refetch keeps the cached list.
- The switcher toggle also shows the env + "Read only" label of the active cluster; options show `displayName` as the
  PF option description when it differs from the name.
- `useLastCluster` uses `useSyncExternalStore` (same-tab writes + `storage` event); storage failures are ignored.
- Test impact: the default mock persona `admin` only has `dev-1`, so full-app tests on other clusters as admin now see
  the "not available" page. `app/` tests and `features/auth/UserMenu.test.tsx` use granted targets per persona.
- Switcher toggle accessible name: `Cluster <name> (<env>[, read only]), switch cluster` — tests query by it.
- MSW handler for `GET /api/clusters` already existed (mocks); no mock changes needed.
