---
id: T-0364
title: Add fieldSelector to useResourceDataView and move the Node Pods tab onto it
status: todo
owner: frontend-engineer
checkpoint: 5b
depends_on: [T-0333]
paths: [web/src/features/resources/list/ResourceDataView.tsx, web/src/features/resources/compute/nodes/NodePodsTab.tsx, web/src/features/resources/compute/nodes/nodePods.test.tsx]
review_rounds: 0
---

## Goal
T-0333 built the Node Pods tab on `ConsoleDataView` + `useK8sList({ fieldSelector })` because the engine hook
`useResourceDataView` takes no field selector, duplicating the filter wiring (filter values, `onFilterChange`,
filter nodes, row id, row actions). Give the engine a `fieldSelector` option and drop the duplicate.

## Scope
- In: `ResourceDataViewOptions.fieldSelector?: string` passed through to `useK8sList`; `NodePodsTab` uses
  `useResourceDataView({ descriptor: nodePodsDescriptor, cluster, scope: 'all', fieldSelector })` and keeps only the
  count line, the Owner cell and the Owner filter definition.
- Out: behaviour changes. The T-0333 tests (`nodePods.test.tsx`) must pass unchanged, except imports.

## Contract / design notes
- `fieldSelector` joins the list query key like `labelSelector` (check `useK8sList` already keys on it).
- If the engine renders filter nodes from `descriptor.filters`, the lazy `nodePodsView()` cache can shrink to the
  descriptor only. Keep the lazy build (registry -> nodes -> pods import cycle, see T-0333 Handover).

## Context pack
- Touch points: `list/ResourceDataView.tsx:useResourceDataView` (L90+), `ResourceDataViewOptions` (~L40);
  `compute/nodes/NodePodsTab.tsx:NodePodsTab`, `nodePodsView`; exemplar caller `details/ResourcePodsTab.tsx:ResourcePodsTab`.
- OCP reference: `/home/bad/works/openshift-console/frontend/packages/console-app/src/components/nodes/NodeDetailsPage.tsx`
  (pods tab = `PodsPage` with `fieldSelector`).

## Acceptance criteria
- [ ] `useResourceDataView` accepts `fieldSelector`; Node Pods tab built on it; no duplicated filter wiring left.
- [ ] `nodePods.test.tsx` green (MSW asserts `fieldSelector=spec.nodeName=<node>`).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
