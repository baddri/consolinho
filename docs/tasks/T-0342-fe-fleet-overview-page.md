---
id: T-0342
title: Fleet overview page — status table, cells, filters, summary, refresh, row switch
status: done
owner: frontend-engineer
checkpoint: 5c
depends_on: [T-0330, T-0331, T-0340, T-0341]
paths: [web/src/features/fleet]
review_rounds: 1
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
- [x] FLT-2/3: columns and cells for every MSW scenario (`dev-2` Degraded, `prod-us-1` Restricted with tooltip, `prod-k8s-1` "—" Update/Operators, `lab-1` Unreachable after its delay).
- [x] FLT-5: default sort by severity then name; filters and summary links set the Status filter.
- [x] FLT-6: rows render progressively (pending spinner), Refresh refetches, auto-refresh paused when hidden (fake timers).
- [x] FLT-7/8: empty states; name click navigates to `/c/<name>/overview` and records the recent cluster.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-25 frontend-engineer: built `/fleet/overview` (ConsoleDataView, cells in `overview/cells/`, URL filters, summary, Refresh/Last checked, busy alert, empty state) and 10 page tests. Fixed T-0341 nits (stable `refetch`, `byName` memo) and added `refetchClusters` to `useFleetRows`. Probe against OCP `/k8s/cluster/nodes`: padding/typography match; only content-driven widths differ. check-fe green.

- 2026-11-25 frontend-engineer, fix round 1: the table fits at 1280 (894/894) and 1920 (1534/1534); see Handover. Busy alert title is now "Could not check the clusters" with `detail` as the body. Restricted tooltip uses PRODUCT_NAME. "Checking…" uses `Spinner isInline`. Zero summary counts are plain text. "Last checked" waits for `hasCompleted`. Dropped the `!isFetching` term. "Clear all filters" added to T-0350's scope. Fleet tests 16/16.
- 2026-11-25 frontend-engineer: `mocks/fixtures/fleetStatus.ts` dev-1 now reports 1 unschedulable node, matching T-0332's cordoned worker-2. The page test asserts the "1 unschedulable" line.

## Review
- 2026-11-25 frontend-architect, round 1: **APPROVE**. Fleet lint/tests clean (15/15); the gate's lint/typecheck failures are all in `features/resources/{cluster-settings,compute/nodes,registry/kinds}` (T-0332/T-0335 in flight), not in this diff.
- Departures accepted: Access column and `/c/<name>/overview` link are literal spec FLT-2; no react-markdown (not needed); `remember` on click is fine (ClusterGate also records it, so it is idempotent).
- `useFleetFilters` duplicates `admin/useAdminListFilters` (already generic over `FilterDefs`). Accepted for now; follow-up T-0350 moves it to `shared/table`.
- Checked: `hasCompleted` drives pending vs "—" (`fleetColumns.tsx:lineCell`, `ClusterStatusCell`); 60 s refresh with `refetchIntervalInBackground: false` plus a focus test; URL filters with replace; stable `refetch`; TSDoc present; no `any`; only public barrels of `cluster-context`/`resources` imported.
- Nit (optional): `FleetOverviewPage.tsx:126` — `!fleet.isFetching` makes the "No clusters" empty state flip to an empty table during each 60 s refresh. Rows come from the cluster list, so drop that term.
- Nit (optional): `fleetTableRows.ts:statusSortValue` — descending Status sort also reverses the name tiebreak. Acceptable.
- 2026-11-25 ux-designer, round 1: **CHANGES_REQUESTED**. Probe vs OCP `/k8s/cluster/nodes`: heading, toolbar (37px), pagination row, cell padding (8px 16px) and row height match. Empty state (bob), summary links → `?status=` chip, filtered-to-nothing row, and dark theme checked.
- 1. Table width: the table overflows horizontally at **1920** (table 1647px in a 1534px pane), but OCP nodes fits (1534/1534). At 1280 it overflows by 133px and the Update ("Update available") and Nodes ("6 of 6 Ready") cells wrap to two lines while the table scrolls. UX.md §5 says hide, don't squeeze or overflow (`useConsoleDataViewColumns.ts` LOW_PRIORITY). Fix: fit 1534px at 1920 and 894px at 1280 by narrowing the column widths or demoting Environment/Access, and keep the Status/Update/Nodes cells `nowrap`.
- 2. Busy alert repeats itself: title "The fleet status is busy" + body "The fleet status is busy. Try again in a few seconds." "Fleet status" is also an internal term (UX.md §11). Fix: use one title for both cases, "Could not check the clusters", and keep the ProblemDetails `detail` as the body (UX.md §10 Errors).
- 3. `cells/ClusterStatusCell.tsx` (and the restricted section tooltip): "Blocked by a FleetConsole policy" hard-codes the product name. Fix: use `PRODUCT_NAME` (UX.md §11).
- 4. "Checking…" uses `Spinner size="md"` (16px) next to 14px status icons. OCP inline loading is `Spinner isInline` (`console-shared/src/components/loading/Loading.tsx`, `LoadingInline`). Fix: `isInline`, so the spinner is 1em like the status icons.
- 5. Nit: zero counts ("0 degraded", "0 updating") are links that lead to "No clusters found". Fix: show a zero count as plain subtle text, not a link.
- 6. Nit: "Last checked now" shows during the first check, while Refresh is still spinning. Fix: hide it until the first run completes (`hasCompleted`).
- Out of scope (follow-up, app-wide): the shared `ConsoleFilterToolbar` says "Clear filters". OCP says "Clear all filters" (`console-app/locales/en/console-app.json:123`, PF `DataViewToolbar clearAllFilters`).
- 2026-11-25 ux-designer, round 2: **APPROVE**. All six items fixed. 1: the table fits at 1280 (894/894) and 1920 (1534/1534) with no wrapped cells; rows are 56px. 2: the alert title is "Could not check the clusters" and the body is the server's detail. 3: the tooltip uses `PRODUCT_NAME`. 4: the spinner is 14px, the same as the status icons. 5: only non-zero counts are links. 6: "Last checked" appears only after the first run. "Clear all filters" moved to T-0350.

## Handover notes
- No react-markdown: the task doesn't call for it.
- The row switch links straight to `clusterOverviewPath(name)` and calls `useRecentClusters().remember` on click. `clusterSwitchPath` from `/fleet` gives `/c/<name>` (root), not Overview.
- Added an **Access** column ("Read only" label) per spec FLT-2. Width (UX.md §5): Update, Environment, Type and Access hide below 2xl. Last checked is an additional column (`defaultVisible: false`; the heading shows it). Columns have minimum `width`s. Health cells are `nowrap`, except Operators, which wraps so 1280 fits.
- Status sort = `${severityRank} ${displayName}`, and pending/no-line rows rank last (`fleetTableRows.ts`).
- Restricted cells (status and section) have a focusable tooltip naming the forbidden resource, or "Blocked by a FleetConsole policy".
- `useFleetFilters.ts` duplicates the admin `useAdminListFilters` logic because of the feature boundary. Follow-up: move it to `shared/table`.
- The empty `.pf-v6-c-page__main-section` (0px vs OCP's 29px) shows up on every list page, not just this one. It is pre-existing and app-wide.

