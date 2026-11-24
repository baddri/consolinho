---
id: T-0301
title: Services — Pods tab and Routes item (SVC-1, SVC-2)
status: todo
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
- [ ] `/k8s/ns/shop/services/web/pods` lists exactly the pods matching the selector; a selector-less Service's Pods tab shows the empty state (test).
- [ ] Details of Service `web` on dev-1 lists Routes `web` and `web-canary` (alternate backend) as links; on `prod-k8s-1` no Routes item (test).
- [ ] `routesForService` unit test (to, alternateBackends, other kinds ignored).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
