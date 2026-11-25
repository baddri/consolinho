---
id: T-0336
title: Cluster overview dashboard — Details, Status, Inventory, Activity cards (moves features/home)
status: todo
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
- [ ] OVW-1: grid with four cards at `/c/<cluster>/overview`; Home > Overview first nav item.
- [ ] OVW-2/3: `dev-2` Status card Degraded (operator popover lists the degraded one); `staging-eu-1` Updating + Ongoing activity; `prod-eu-1` update alert; `prod-k8s-1` Kubernetes version, no Operators item.
- [ ] OVW-4: counts with "+" when only `continue` is returned (MSW test with a small limit); one request per count.
- [ ] OVW-6: a forbidden ClusterOperators read (`prod-us-1` RO persona) leaves the other cards intact.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
