---
id: T-0364
title: Add fieldSelector to useResourceDataView and move the Node Pods tab onto it
status: done
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
- [x] `useResourceDataView` accepts `fieldSelector`; Node Pods tab built on it; no duplicated filter wiring left.
- [x] `nodePods.test.tsx` green (MSW asserts `fieldSelector=spec.nodeName=<node>`).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-25 frontend-engineer: `useResourceDataView` gains `fieldSelector`, `id` (column-prefs key) and returns `data`;
  `namespace: undefined` on a namespaced kind = all namespaces without the namespace hint. `NodePodsTab` now uses it
  (scope all, id `node-pods`, Owner keeps ≥lg by dropping `allNamespacesVisibility`); lazy build kept, descriptor only.

## Review
- Round 1 (frontend-architect, 2026-11-25): **APPROVE**. resources/{compute/nodes,list,details} tests pass (103/103). The `id`
  (column-prefs key, defaults to the plural) and `data` (rows after `rowFilter`) options are sound. `fieldSelector` is
  already in the list key (`queryKeys.ts:34`). The hint change is safe: list pages pass a namespace or ALL_NAMESPACES for
  namespaced kinds (cluster scope redirects), and every child tab passes the owner's namespace, so only NodePodsTab
  hits the new branch. The `Pick<Pod,'metadata'>` drain helpers are minimal and correct. Optional: ResourceDataView.tsx:96 is an over-long doc line.

## Handover notes
- `nodePods.test.tsx` unchanged. Drain helpers now take `Pick<Pod, 'metadata'>` so the engine's `K8sResource[]` fits.
- Gate: lint/typecheck/tests green on my files (first `check-fe.sh src/features/resources` run 586/586). Later runs
  fail only in T-0337's in-flight `operators/` + CSV `kinds.test` edits, not touched here.
- No visual change, so no ui-probe: same columns, breakpoints, filters, data-view id and empty/error states as before.
