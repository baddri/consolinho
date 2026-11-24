---
id: T-0342
title: Fleet overview page — status table, cells, filters, summary, refresh, row switch
status: todo
owner: frontend-engineer
checkpoint: 5c
depends_on: [T-0330, T-0331, T-0340, T-0341]
paths: [web/src/features/fleet]
review_rounds: 0
---

## Goal
FLT-2..FLT-8: the "Fleet overview" list page at `/fleet/overview`, one row per accessible cluster, statuses filling
in progressively, rendered with the shared health rules.

## Scope
- In: `FleetOverviewPage` (replaces the T-0340 placeholder), column/cell components, filters, summary line, refresh,
  empty/error states, tests. Files under `features/fleet/` except `api/` (T-0341).
- Out: bulk actions, mutations (FLT-8), background polling server-side (Q4).

## Contract / design notes
- **Page** (UX.md §5 list rules): `ListPageHeader`-equivalent heading "Fleet overview" with a "Refresh" secondary
  button (spinner while `isFetching`) and "Last checked" hint; `ConsoleDataView` compact, sortable, pagination.
- **Columns**: Name (display name, link → switch cluster, `cluster.name` muted when different), Status, Version,
  Update, Operators, Nodes, Environment, Type (OpenShift / Kubernetes), Last checked (`Timestamp` of `checkedAt`).
  Low-priority columns per UX.md §5.
- **Cells** — all values from `shared/health` (T-0330), no rules here:
  Status = `clusterHealth(status)` → icon + text per UX.md §5 (L147–151): Unreachable, Token invalid → red
  exclamation; Degraded → yellow triangle; Updating → sync icon; Restricted → ban icon (T-0343 confirms)
  + `Tooltip` naming `restricted[]`; Healthy → green check; pending → `Spinner size="md"` + "Checking…". Version = `clusterVersionText`.
  Update = `clusterUpdate` copy (contract §2.1), "—" when null. Operators = "All available" or "`<n>` degraded,
  `<m>` unavailable" linking to `clusterSettingsPath(name, 'clusteroperators')` (from `@/features/resources`),
  "Restricted" when forbidden, "—" on Kubernetes. Nodes = "`<ready>` of `<total>` Ready" (Not Ready count in warning
  text), second line "`<n>` unschedulable" when > 0, linking to the cluster's Nodes list (`resourcePath`). A cell
  whose section is `notFound` → "—".
- **Sort** default Status severity (`HEALTH_SEVERITY`, pending last) then display name (FLT-5). **Filters**: Name
  (text), Status (multi, incl. "Checking"), Environment, Type — URL-synced like other lists. **Summary line**
  *(fleet)* above the table: "`<n>` clusters · `<d>` degraded · `<u>` unreachable · `<p>` updating", each count a
  `Button variant="link" isInline` that sets the Status filter.
- **Row switch** (FLT-8): name link = the switcher's navigation: `clusterSwitchPath` + `useRecentClusters` record,
  target `clusterOverviewPath(name)` (from `@/features/resources`). If the switcher exposes a "switch to cluster"
  hook, use it; otherwise compose those two exports — no copy of switcher internals.
- **States**: no accessible clusters → `EmptyState` "No clusters" / "You don't have access to any cluster. Ask a
  FleetConsole administrator for access." (FLT-7); filters to nothing → UX.md §5 "Clear all filters"; `Fleet.Busy`
  / other error → inline `Alert` danger above the table with "Try again" (rows from the last successful run stay).
- No masthead/theme change: the fleet perspective keeps the neutral masthead (QG5C-3).

## Context pack
- Docs: spec §5c.1 FLT-2..8; UX.md §5 (list rules, status icon mapping); contract §2.1 cells.
- Exemplars: `features/admin/` clusters list page (`ConsoleDataView` + filters + URL sync in the fleet perspective);
  `shared/ui/data-view/ConsoleDataView.tsx`.
- Touch points: `features/fleet/api/useFleetRows.ts`, `useFleetStatus.ts` (T-0341); `shared/health/clusterHealth.ts`;
  `@/features/cluster-context` `clusterSwitchPath`, `useRecentClusters`; `@/features/resources` `clusterOverviewPath`,
  `clusterSettingsPath`, `resourcePath` (T-0331).
- OCP reference: list look = `/home/bad/works/openshift-console/frontend/public/components/factory/list-page.tsx`
  + `packages/console-app/src/components/nodes/NodesPage.tsx` (status cell with secondary line); page itself is a fleet invention.

## Acceptance criteria
- [ ] FLT-2/3: columns and cells for every MSW scenario (`dev-2` Degraded, `prod-us-1` Restricted with tooltip, `prod-k8s-1` "—" Update/Operators, `lab-1` Unreachable after its delay).
- [ ] FLT-5: default sort by severity then name; filters and summary links set the Status filter.
- [ ] FLT-6: rows render progressively (pending spinner), Refresh refetches, auto-refresh paused when hidden (fake timers).
- [ ] FLT-7/8: empty states; name click navigates to `/c/<name>/overview` and records the recent cluster.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
