---
id: T-0175
title: Details pages get kind tabs (ReplicaSets, Logs, Terminal) and a shared container select
status: todo
owner: frontend-engineer
checkpoint: 4a
depends_on: []
paths: [web/src/features/resources/paths.ts, web/src/features/resources/paths.test.ts, web/src/features/resources/routes.tsx, web/src/features/resources/details/useResourceTab.ts, web/src/features/resources/details/ResourceDetailsPage.tsx, web/src/features/resources/details/ResourceDetailsPage.test.tsx, web/src/features/resources/registry/types.ts, web/src/features/resources/registry/kinds/pods.tsx, web/src/features/resources/registry/kinds/deployments.tsx, web/src/features/resources/workloads]
review_rounds: 0
---

## Goal
ADR-0037 §1-2, LOG-1 (tab half), DEP-9 (tab half): URL-segment tabs `replicasets`, `logs`, `terminal` in OCP order,
opted in per kind, each a lazy module under `features/resources/workloads/`, plus the `ContainerSelect` both the Logs
and Terminal toolbars use. Later tasks fill the panels (T-0179, T-0180, T-0185).

## Scope
- In: tab list/order, `DetailsTab`, routes, `hasTab`, `TAB_TITLES`, descriptor `extraTabs`; Pod `['logs','terminal']`,
  Deployment `['replicasets']`; panel modules with a minimal body (PF `EmptyState` "Coming soon" is **not** OCP copy —
  render nothing but the tabpanel; the owning task replaces the file); `workloads/ContainerSelect.tsx` + test;
  `?container=` read/write helper `useSelectedContainer(pod)`.
- Out: panel content.

## Contract / design notes
- `RESOURCE_TABS = ['details','yaml','replicasets','pods','logs','events','terminal']`; titles "Details", "YAML",
  "ReplicaSets", "Pods", "Logs", "Events", "Terminal". `hasTab`: kind tabs only when in `descriptor.extraTabs`.
- Routes: `detailsTabs` gains `replicasets: () => import('./workloads/replicasets/DeploymentReplicaSetsTab')`,
  `logs: () => import('./workloads/logs/PodLogsTab')`, `terminal: () => import('./workloads/terminal/PodTerminalTab')`.
  Logs and Terminal panels are full height (`PageBody isFilled`-like, as the YAML tab branch in `ResourceTabs`); add
  them to that branch.
- `ContainerSelect({ pod, value, onChange, includeInit? })`: PF `Select` + `MenuToggle`, OCP `pod-logs.tsx`
  `containersToStatuses` look: each option = container name + status icon/text (`Status`); init containers in a
  `SelectGroup label="Init containers"`. `useSelectedContainer(pod): [name, set]` = `?container=` (replace, keeps
  other params), default = first non-init container; an unknown name falls back to the default.
- `resourcePath(..., { tab: 'logs', search: { container } })` keeps `?container=` deep-linkable (LOG-1).

## Context pack
- Docs: `FRONTEND.md` § Routing (details line, ADR-0037); `UX.md` §4 Tabs.
- Exemplars: `details/useResourceTab.ts` L4-24; `routes.tsx:detailsRoutes` L27-48 and the `detailsTabs` map L18-25;
  `ResourceDetailsPage.tsx:hasTab` L36-40, `TAB_TITLES` L28-34, `ResourceTabs` L196-235 (YAML full-height branch L218-229);
  `details/ResourcePodsTab.tsx` (lazy tab module shape, `useResourceDetails()`).
- OCP reference: `public/components/pod.tsx` L510-516 (Pod tab order), `public/components/deployment.tsx` L198-208
  (Deployment tab order); `public/components/pod-logs.tsx:containersToStatuses` L18-60 (container options).

## Acceptance criteria
- [ ] LOG-1: Pod tabs Details, YAML, Logs, Events, Terminal; `/…/pods/<name>/logs?container=c` deep-links and keeps `container`.
- [ ] DEP-9: Deployment tabs Details, YAML, ReplicaSets, Pods, Events; other kinds unchanged (tests).
- [ ] `ContainerSelect` groups init containers and shows per-container status (test).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
