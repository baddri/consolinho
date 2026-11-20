---
id: T-0072
title: Cluster switcher with search and recents, environment band, keep-context switching
status: todo
owner: frontend-engineer
checkpoint: 2
depends_on: [T-0055]
paths: [web/src/features/cluster-context/, web/src/shared/hooks/, web/src/app/layout/AppShell.tsx, web/src/app/layout/AppShell.test.tsx]
review_rounds: 0
---

## Goal
Make reaching any of 40 clusters fast and safe (US-1..3): a searchable switcher with a "Recent" group (SW-7, SW-8),
switching that keeps path and filters (SW-9), and an environment band under the masthead for production/staging
(SW-10). No Kubernetes calls — this task runs in parallel with T-0070/T-0071.

## Scope
- In: rewrite `ClusterSwitcher` on PF `MenuContainer` + `MenuToggle` + `Menu` (`MenuSearch`/`MenuSearchInput`/
  `SearchInput`, `MenuGroup` "Recent" / "All clusters", `MenuList`/`MenuItem`); `useRecentClusters`; generic
  `shared/hooks/useStoredValue` and `useLastCluster` refactored onto it; `clusterSwitchPath` keeps search and falls
  back to the cluster root; `EnvironmentBanner` in `AppShell` via `Page banner`.
- Out: namespace selector (T-0074), nav contents (T-0073), Ctrl+K shortcut (backlog).

## Contract / design notes
- No backend change: `GET /api/clusters` (CP1 §6) gives `name`, `displayName`, `environment`, effective `accessMode`
  (`CP2-api-contract.md` §6).
- `useStoredValue<T>(key: string, parse: (raw: string) => T | undefined, serialize: (value: T) => string):
  [T | undefined, (value: T) => void]` — the `useSyncExternalStore` + `storage` event pattern lifted from
  `useLastCluster` (same-tab listeners, storage failures ignored). Keys keep the `fleetconsole.` prefix (T-0055 is
  user-facing only). `useLastCluster` keeps its public signature.
- `useRecentClusters(): { recent: AccessibleCluster[]; remember(name: string): void }` —
  `localStorage['fleetconsole.recentClusters.<username>']` (JSON string array, newest first, max 5, de-duplicated);
  `recent` is filtered to clusters still in `useAccessibleClusters()` (SW-8). `ClusterGate` calls `remember` next to
  `setLastCluster`. Username from `useCurrentUser()` (auth public API).
- Switcher behaviour: search input focused when the menu opens (focus through the `SearchInput` `innerRef` the
  component owns — FRONTEND.md "UI conventions"); case-insensitive substring over name, displayName and environment
  label text (`environmentLabel(env).text` and the enum value); Enter (`onSearch`) opens the first match; empty →
  "No clusters match `<text>`"; "Recent" group omitted when empty or while searching (show all matches once);
  items keep `ClusterBadges` (name, env label, "Read only") with displayName as description; the active cluster is
  marked selected. Loading/error/empty toggles unchanged (keep existing tests green).
- `clusterSwitchPath(location: { pathname: string; search: string }, cluster: string): string` → same rest-of-path
  + search on the target; from non-cluster pages or the cluster root → `/c/<target>` (landing, T-0073 resolves it).
  Update the one caller in the switcher.
- `EnvironmentBanner`: renders nothing outside `/c/:cluster` and for development; production → PF
  `<Banner status="danger">`, staging → `status="warning"`, text "Production cluster `prod-eu-1`" / "Staging cluster
  `…`" (short, it is a band). Exported from cluster-context; `AppShell` passes it as `<Page banner={…}>`.

## Context pack
- Docs: FRONTEND.md § "Routing — the URL is the context" (L58–L95), § "UI conventions"; spec §4.5 SW-7..10, §5
  "Masthead"; PF6 Menu "with search input"/"context selector" examples on patternfly.org (Menus → Menu).
- Exemplars: `web/src/features/cluster-context/ClusterSwitcher.tsx:ClusterBadges|toggleLabel` (keep),
  `web/src/features/cluster-context/useLastCluster.ts:L1-L48` (store pattern to lift),
  `web/src/shared/ui/TypeaheadSelect.tsx` (PF filtering + empty-result pattern already in the repo).
- Touch points: `web/src/features/cluster-context/ClusterSwitcher.tsx:ClusterSwitcher`,
  `web/src/features/cluster-context/clusterSwitchPath.ts:clusterSwitchPath` + `clusterSwitchPath.test.ts`,
  `web/src/features/cluster-context/ClusterGate.tsx:L20-L25` (remember recent next to `setLastCluster`),
  `web/src/features/cluster-context/index.ts`, `web/src/app/layout/AppShell.tsx:AppShell` (`banner` prop exists on
  PF `Page`, see `@patternfly/react-core` `Page.d.ts` `banner?`), `web/src/features/cluster-context/clusterContext.test.tsx:L28-L105`
  (switcher tests to extend), `web/src/mocks/fixtures/clusters.ts` (6 clusters: prod-eu-1, prod-us-1, staging-eu-1,
  dev-1, dev-2, lab-1). Fill the search with `user.paste`; first full-app render uses `test/coldStart.ts`.

## Acceptance criteria
- [ ] SW-7: typing `us` shows only `prod-us-1`; `staging` (environment) matches `staging-eu-1`; Enter navigates to the
      first match; no match → "No clusters match `zzz`"; search box has focus on open.
- [ ] SW-8: after visiting dev-1 then prod-eu-1 the "Recent" group lists prod-eu-1, dev-1 (max 5, per username); a
      recent cluster no longer granted is not shown; group absent for a fresh user.
- [ ] SW-9: on `/c/dev-1/k8s/ns/shop/pods?label=app%3Dweb` choosing dev-2 lands on
      `/c/dev-2/k8s/ns/shop/pods?label=app%3Dweb`; from `/admin/users` → `/c/dev-2`.
- [ ] SW-10: band shown for prod/staging with the cluster name, absent for dev and on admin pages.
- [ ] Toggle accessible name still repeats env and read-only cues; existing SW-1..6 tests green.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
