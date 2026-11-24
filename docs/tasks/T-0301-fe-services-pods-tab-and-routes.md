---
id: T-0301
title: Services — Pods tab and Routes item (SVC-1, SVC-2)
status: done
owner: frontend-engineer
checkpoint: 5a
depends_on: [T-0300]
paths: [web/src/features/resources/registry/kinds/services.tsx, web/src/features/resources/registry/kinds/services.test.ts, web/src/features/resources/networking/services, web/src/features/resources/details/ResourcePodsTab.tsx, web/src/features/resources/details/ResourcePodsTab.test.tsx]
review_rounds: 0
---

## Goal
Service details get OCP's Pods tab (pods matching `spec.selector`) and a "Routes" item naming the Routes that send
traffic to the Service, so Marco can go Service → pods / routes without Search.

## Scope
- In: `podsSelector` on the Service descriptor; the engine's Pods tab never falls back to "all pods"; Routes item.
- Out: OCP networking-plugin "Service address" / "Service port mapping" redesign (we keep release-4.18 layout, SVC-1).

## Contract / design notes
- **Pods tab (SVC-1).** `serviceDescriptor.podsSelector = (s) => hasKeys(s.spec?.selector) ? { matchLabels: s.spec.selector } : undefined`.
  **Deviation from SVC-1 wording, follows OCP:** tabs are decided per kind before the object loads (`hasTab` in
  `ResourceDetailsPage.tsx`) and OCP's `useServiceTabs` always shows Pods, so a selector-less Service keeps the tab and
  it shows the Pods empty state ("No Pods found", the same `LoadError`/empty-state the Pods list uses), never every pod
  of the namespace. Fix the engine bug that would do that: `ResourcePodsTab.tsx:SelectorPodsTab` currently uses
  `podsSelector?.(obj) ?? {}` — when the selector is `undefined` render the empty state instead of listing. Record the
  deviation in the Work log for the PO.
- **Routes item (SVC-2).** New `networking/services/ServiceRoutes.tsx`: `ServiceRoutesItem({ obj })` — a `DetailsItem`
  "Routes" appended to `ServiceDetails`. Gets the cluster via `useActiveCluster()` (exemplar `workloads/pods/PodStatus.tsx`
  L28); `useK8sDiscovery(cluster).isServed(RouteModel)` false → item not rendered (Kubernetes). Otherwise one
  `useK8sList<RouteResource>(cluster, RouteModel, { namespace })` (shared watch, no per-route requests) filtered by
  pure `routesForService(routes, serviceName)` (matches `spec.to` and `spec.alternateBackends[]` with kind `Service`
  and that name). Each route a `ResourceLink` (RT badge) on its own line; none → `DASH`; list error → `DASH` (the item
  is secondary; no page-level error).

## Context pack
- Docs: FRONTEND.md § The resource registry (Pods tab sentence added by T-0300).
- Exemplars: `registry/kinds/jobs.tsx` (`podsSelector`); `components/ResourceLink.tsx:ResourceLink` (L53);
  `shared/k8s/discovery.ts:useK8sDiscovery` (L33).
- Touch points: `registry/kinds/services.tsx:ServiceDetails`, `serviceDescriptor`; `details/ResourcePodsTab.tsx:SelectorPodsTab`;
  `details/ResourceDetailsPage.tsx:hasTab` (read only — unchanged).
- OCP reference: *(np)* `gh api repos/openshift/networking-console-plugin/contents/src/views/services/details/hooks/useServiceTabs.ts`,
  `…/services/details/tabs/pods/ServicePods.tsx`; release-4.18 `frontend/public/components/service.jsx`
  (`gh api 'repos/openshift/console/contents/frontend/public/components/service.jsx?ref=release-4.18'`).

## Acceptance criteria
- [x] `/k8s/ns/shop/services/web/pods` lists exactly the pods matching the selector; a selector-less Service's Pods tab shows the empty state (test).
- [x] Details of Service `web` on dev-1 lists Routes `web` and `web-canary` (alternate backend) as links; on `prod-k8s-1` no Routes item (test).
- [x] `routesForService` unit test (to, alternateBackends, other kinds ignored).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-25 frontend-engineer: started; Service `podsSelector`, engine fix (undefined selector → "No Pods found"
  empty state, no pods request), `networking/services/ServiceRoutes.tsx` (`routesForService`, `ServiceRoutesItem`).
- **Deviation for PO (SVC-1):** a selector-less Service keeps the Pods tab (tabs decided per kind, OCP `useServiceTabs`)
  and shows the Pods empty state instead of hiding the tab.
- OCP probe: reference console not running on :9000, probed our side only (Routes links 14px/link colour).

## Review
- UX round 1 (2026-11-25, ux-designer): **APPROVE**. OCP ref console was down (:9000), so I probed our side only and checked against OCP source.
- Routes item (dev-1 `web`): DL group grid gap 8/16px, 24px to the previous group, the same as the other items. One `RT` ResourceLink per line, 14px, link colour rgb(0,102,204), 21px rows, 5 routes incl. `web-canary` (alternate backend). Absent on prod-k8s-1. OK. OCP has no Service "Routes" item (networking-console-plugin `tabs/details/ServiceDetails.tsx`). The matching follows `console-shared/src/utils/resource-utils.ts:getRoutesForServices` and adds alternateBackends. That fits OCP style, no finding.
- Pods tab: the selector table renders (OCP np `tabs/pods/ServicePods.tsx`). The selector-less empty state reuses `ConsoleDataView`'s zero-objects `EmptyState` "No Pods found" (OCP `No {{label}} found`), so it matches. No mock Service lacks a selector, so the unit test covers this state, not a screenshot. OCP np passes `selector: undefined` and would list every pod in the namespace. Our deviation is the better behaviour, no finding.
- 2026-11-25 frontend-architect, round 1: **APPROVE**. Targeted tests 15/15 green; lint ok; typecheck errors only in
  concurrent `storage/persistentvolumes` work (not this task). Engine change checked: the other `podsSelector` kinds
  (deployments, replicasets, statefulsets, daemonsets, jobs) return `spec.selector`, which the API requires, so nothing
  changes for them, and an `undefined` selector now gives the empty state instead of listing every pod in the namespace.
  `hasTab` is unchanged.
- Nit (optional) `registry/kinds/deploymentconfigs.tsx:46`, `replicationcontrollers.tsx:37` — `{ matchLabels: undefined }`
  still lists all pods when `spec.selector` is missing (this was already the case before this change; the API normally sets it). Could get the same `undefined` guard as a follow-up.
- Nit (optional) `details/ResourcePodsTab.tsx:25` — the selector-less empty state has no list toolbar, unlike the empty
  list `ConsoleDataView`. Acceptable because nothing can be filtered.

## Handover notes
- `SelectorPodsTab` now splits into `SelectedPods({selector})`; `podsSelector` returning `undefined` renders
  `EmptyState` "No Pods found" (same as `ConsoleDataView`'s empty list) and never lists the namespace.
- `ServiceRoutesItem` needs `useActiveCluster()` + discovery; hidden when `route.openshift.io` isn't served (also while
  discovery is pending, since the baseline lacks OpenShift groups). List errors show a dash.
- Routes list is one namespace watch (`useK8sList`), shared with the Routes list page cache.
- Tests: `details/ResourcePodsTab.test.tsx` (Service pods + selector-less), `networking/services/ServiceRoutes.test.tsx`.
- OCP release-4.18 `service.jsx` has no Routes item; it is spec SVC-2 (networking plugin era).
