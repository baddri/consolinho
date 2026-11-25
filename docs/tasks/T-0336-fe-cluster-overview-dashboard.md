---
id: T-0336
title: Cluster overview dashboard — Details, Status, Inventory, Activity cards (moves features/home)
status: done
owner: frontend-engineer
checkpoint: 5b
depends_on: [T-0335]
paths: [web/src/features/resources/overview, web/src/features/home, web/src/features/resources/routes.tsx, web/src/app/router.tsx, web/src/mocks/k8s/clusterFixtures.ts]
review_rounds: 0
---

## Goal
Lane O step 2: OVW-1..6 — replace the `/c/<cluster>/overview` placeholder with OCP's cluster dashboard minus the
Utilization card. The Status card uses the **shared** health rules (T-0330), the same function as the fleet page.

## Scope
- In: move the page into `features/resources/overview/` (delete `features/home/`, route moves from `app/router.tsx`
  into `resources/routes.tsx` as a lazy route), four cards, their hooks, tests.
- Out: Utilization card, Control plane and Alerts health items (Prometheus, Q6 gaps); Update button in the alert (Q9).

## Contract / design notes
- **Layout** (OCP `cluster-dashboard.tsx` + `Dashboard`/`DashboardGrid`): PF `Grid`/`GridItem` — left `lg=3`
  Details + Cluster inventory, main `lg=6` Status, right `lg=3` Activity; single column below `lg`. Page title
  "Overview" (OCP heading). Cards = PF `Card` with `CardHeader`/`CardTitle` as OCP `DashboardCard*` render
  (read OCP's `@console/shared/src/components/dashboard/dashboard-card/` for spacing; copy values to CSS module only
  if PF defaults differ). **OVW-6:** each card is its own component with its own queries, skeleton and inline
  error (`Alert` isInline plain, naming the read: "ClusterVersion: forbidden"); a card never throws to the page.
- **Details card** (OVW-2, `details-card.tsx`): rows *(fleet first)* Cluster (display name), Environment,
  Distribution from `useAccessibleClusters` (via `@/features/cluster-context`); then Cluster API address
  (`infrastructures/cluster` `status.apiServerURL`), Cluster ID, Infrastructure provider (`status.platformStatus.type`
  ?? `status.platform`), OpenShift version (`clusterVersionFacts().currentVersion`), Update channel; Kubernetes:
  Kubernetes version from `GET /version` (`k8sGetPath`) and no Cluster ID / channel rows. "Not available" per row on
  403/404. "View settings" link → `clusterSettingsPath` (OpenShift only).
- **Status card** (OVW-3): health items "Cluster" and "Operators" (OCP `HealthItem` look: icon + title + secondary
  text; Operators item opens a `Popover` listing degraded / unavailable / progressing ClusterOperators linking to
  their details, OCP `OperatorStatus.tsx`; plus a CSV `Failed` count line when OLM is served). Status values come
  from `clusterHealth({ clusterVersion: clusterVersionFacts(cv), clusterOperators: clusterOperatorFacts(cos), nodes:
  nodeFacts(nodes), kubernetesVersion, failure: null })` and per-item from the same facts — **no rule logic in this
  task**. Update available → inline info `Alert` "A cluster version update is available" with link to Cluster
  Settings (no Update action). Kubernetes: no Cluster/Operators items; a Nodes item instead *(fleet)*.
- **Inventory card** (OVW-4, `inventory-card.tsx`): Nodes (total; Not Ready count → Nodes list filtered by Status),
  Pods (total; Failed / Pending counts via `fieldSelector=status.phase=Failed|Pending`), StorageClasses,
  PersistentVolumeClaims (total; Pending counted within the page). Hook
  `useResourceCount(cluster, model, { fieldSelector? })` → `k8sListPage(..., { limit: INVENTORY_LIMIT })` +
  `pageCount`; key `['k8s', cluster, 'count', modelKey(model), fieldSelector ?? '']`, `staleTime` 30 s, **no watch,
  never paginate**; inexact counts render "`<n>`+" (decision recorded in spec §5b.7). Rows hidden when the kind is not
  served or the read is forbidden ("Not available").
- **Activity card** (OVW-5, `activity-card.tsx`/`ActivityBody.tsx`): "Ongoing" — cluster update in progress
  ("Updating to `<v>`", OCP `ClusterUpdateActivity`) else "There are no ongoing activities."; "Recent events" —
  `useEventStream` (all namespaces) rendered compact with warning icon on `type=Warning` (Q5: all events, warnings
  marked), `TogglePlay` Pause/Resume, "View all events" → events page path, "There are no recent events." empty.
  Reuse `events/EventStreamView` if it supports a compact/limited mode without changes; otherwise a small
  `RecentEventsList` here built on `useEventStream`.
- `features/home` disappears; `app/router.tsx` loses the `OverviewPage` import and route (resources routes provide
  it). Keep the router test green (T-0340 edits the fleet part of the same files earlier — rebase onto it).

## Context pack
- Docs: spec §5b.4 OVW-1..6, §7 Q5/Q6; FRONTEND.md § Data fetching rules.
- Exemplars: `features/resources/events/` (page + `useEventStream`), `shared/ui/TogglePlay.tsx`.
- Touch points: `shared/health/*`, `shared/k8s/client.ts:k8sListPage`/`pageCount` (T-0330); `cluster-settings/`
  `useClusterVersion` + CO status label (T-0335); `paths.ts:clusterSettingsPath`; `features/home/OverviewPage.tsx` (placeholder to delete).
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/dashboard/dashboards-page/cluster-dashboard/`
  `cluster-dashboard.tsx`, `details-card.tsx`, `status-card.tsx`, `inventory-card.tsx`, `activity-card.tsx`;
  `packages/console-shared/src/components/dashboard/activity-card/ActivityBody.tsx`;
  `packages/console-app/src/components/dashboards-page/OperatorStatus.tsx`.

## Acceptance criteria
- [x] OVW-1: grid with four cards at `/c/<cluster>/overview`; Home > Overview first nav item.
- [x] OVW-2/3: `dev-2` Status card Degraded (operator popover lists the degraded one); `staging-eu-1` Updating + Ongoing activity; `prod-eu-1` update alert; `prod-k8s-1` Kubernetes version, no Operators item.
- [x] OVW-4: counts with "+" when only `continue` is returned (MSW test with a small limit); one request per count.
- [x] OVW-6: a forbidden ClusterOperators read (`prod-us-1` RO persona) leaves the other cards intact.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-25 frontend-engineer: started; OCP dashboard cards (Details, Status, Inventory, Activity) researched.
- 2026-11-25 frontend-engineer: `resources/overview/` (4 cards, `useResourceCount`, lazy route); `features/home` removed;
  overview.test.tsx covers OVW-1..6; ui-probe vs OCP `/dashboards` at 1280/1600 clean except content-driven sizes.
- 2026-11-25 frontend-engineer: round 1 fixes: status icons wrapped in PF `Icon status` (the warning colour was probed in both themes), a
  "Cluster" `PageTabs` row, and a "View all events" footer link behind a Divider. Deviation: no fetch of 51; the stream already holds
  up to 500 events, so the link shows when `shown.length > 50`. The scoped gate is green (44 tests).

## Review
- Round 1 (frontend-architect, 2026-11-25): **CHANGES_REQUESTED**. Overview and router tests pass (43/43) and lint/typecheck are
  ok. The container query is idiomatic: it sets PF Grid's own `GridColumnEnd`/`Order` custom properties inside
  `@container`, since PF has no container breakpoints. No N+1: about seven fixed `limit`ed count requests, no
  pagination, no watch. Decisions accepted: OCP Pause/Resume link and copy, Restricted/Not available wording, counts
  within the page, the key factory staying in `overview/`, and the `k8sGetPath` export.
  - overview/InventoryCard.tsx:67 and overview/ActivityCard.tsx:44 — `pf-v6-u-danger-color-100` / `pf-v6-u-warning-color-100` don't exist in PF6 (0 hits in `@patternfly/patternfly`), so the icons render uncoloured — wrap them in PF `<Icon status="danger|warning" isInline>` (as `ClusterUpdateStatus` does) and assert nothing visual beyond that.
  - Optional: ClusterOverviewPage.tsx:15 — over-long doc line; wrap it.
- Round 1 (ux-designer, 2026-11-25): **CHANGES_REQUESTED**. Probed alice/prod-eu-1 against `:9000/dashboards` at 1280 and 1600: grid
  matches (1280: one column Status, Details, Inventory, Activity; 1600: 292/599/292 at x 346/654/1269), card titles 16px/600, no header padding/border drift; Details rows/"View settings", update Alert, Pause link and "Restricted" accepted.
  - Overview page — no tab row under the "Overview" h1; OCP always renders a single "Cluster" tab (PF Tabs `pf-m-page-insets`, 45px; cards start y=249 vs ours 204) — `public/components/dashboard/dashboards-page/dashboards.tsx` L98 `<HorizontalNav pages={allPages} noStatusBox />` — render the shared horizontal-nav tabs with one "Cluster" tab.
  - Activity card — "View events" header action; OCP's CardHeader has only the title, and "View all events" (→ all-namespaces Events) is a `<Divider/><CardFooter>` link shown only when more than 50 events exist — `cluster-dashboard/activity-card.tsx` L39-55, L181 — drop the header action, add the conditional footer link (fetch limit 51 to know).
  - Inventory/Activity status icons uncoloured — already listed by frontend-architect (PF `<Icon status>`); verify both themes after the fix.
- Round 2 (ux-designer, 2026-11-25): **APPROVE**. Probe vs `:9000/dashboards`: "Cluster" tab row `pf-m-page-insets` 45px at y=188 and first card at y=249, identical to OCP; Activity header has no actions; footer "View all events" after a `pf-v6-c-divider` only above 50 events (code L136-143 + OVW-5 test; mocks have fewer, so not rendered live, same as OCP); dark-theme warning icon `pf-m-warning` rgb(255,204,23), success/info coloured too.
- Round 2 (frontend-architect, 2026-11-25): **APPROVE**. The icons use PF `<Icon status isInline>` (InventoryCard:76, ActivityCard:55). The
  deviation is accepted: `stream.shown.length > 50` reuses the existing stream (up to 500), so no extra request.

## Handover notes
- Outside `paths`: `shared/k8s/index.ts` now exports `k8sGetPath` (Kubernetes `GET /version`); `app/router.test.tsx`
  "unlisted placeholder" test renamed and asserts the dashboard (the placeholder's param dump is gone).
- Layout: OCP's `DashboardGrid` switches on the dashboard width (> 992px), not the viewport, so this uses a CSS
  container query on the PageSection; at 1280 with the sidebar open both are one column, Status first.
- Count key factory `resourceCountQueryKey` lives in `overview/` (adds `labelSelector` for the CSV count,
  `!olm.copiedFrom`); move to `shared/k8s` if another feature needs counts.
- Status "Cluster" item uses the shared `clusterHealth` status: healthy = bare check, Updating, Degraded,
  `restricted` shown as "Restricted" (fleet word), unreachable/token = "Not available".
- Decision (OCP over task wording): Pause/Resume is OCP's inline link button with pause/play icons, not `TogglePlay`;
  ongoing text is OCP's "Updating cluster to <v>" + "Started <time>".
- Inventory: Nodes Not Ready and PVC Pending are counted within the one limited page; Pods Failed/Pending are two
  extra fieldSelector counts. Recent events capped at 50; "View events" header link → all-namespaces Events.
- OVW-6 test refreshes ines' expired prod-us-1 view credential in mockDb (the fixture one 502s every read).
- `clusterFixtures.ts` needed no change (scenarios already present).
