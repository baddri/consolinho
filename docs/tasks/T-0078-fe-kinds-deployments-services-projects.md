---
id: T-0078
title: Descriptors for Deployments, Services, Projects and Namespaces (columns, status, details sections)
status: done
owner: frontend-engineer
checkpoint: 2
depends_on: [T-0075]
paths: [web/src/features/resources/registry/kinds/deployments.tsx, web/src/features/resources/registry/kinds/services.tsx, web/src/features/resources/registry/kinds/projects.tsx, web/src/features/resources/registry/kinds/namespaces.tsx, web/src/features/resources/registry/registry.ts, web/src/features/resources/registry/kinds/kinds.test.tsx]
review_rounds: 0
---

## Goal
Complete the six CP2 kinds (DATA-1) by adding descriptors only — the proof that "adding a kind = one descriptor file +
register it" holds (ADR-0023 §3). List columns per UI-3, details sections per UI-4, nav placement per UI-2.

## Scope
- In: four descriptor files + their `DetailsSection` components (colocated in the kind file or `kinds/<plural>/`),
  registration, render tests.
- Out: any change to generic pages — if one is needed, stop and note it in the Work log for the architect (it means
  the descriptor shape is missing something).
- Carried T-0075 review nits (optional): Pod details Node as a link to the Node (once a nodes kind exists, else leave text) and show init containers (`registry/kinds/pods.tsx`, `details/sections/PodDetails.tsx`).

## Contract / design notes
- Models from `shared/k8s/models.ts` (T-0070). No BE change.
- **Deployments** (Workloads, after Pods): Name, Namespace, Status ("`ready` of `desired` pods"; `ResourceStatusLabel`
  green when equal, orange while progressing, red when the `Available` condition is False), Labels (`labelsColumn`),
  Pod selector (`matchLabels` as `k=v,…`, links to the Pods list with `?label=`), Created. Details: desired / current /
  ready / updated / available replicas, strategy (type + maxSurge/maxUnavailable), selector, conditions table (type,
  status, reason, message, last update `RelativeTime`).
- **Services** (Networking): Name, Namespace, Type, Cluster IP, Ports (`80/TCP → 8080`, comma-joined), Selector (link
  to Pods list with `?label=`; "—" without selector). Details: type, cluster IP(s), ports table (name, port, protocol,
  target port, node port), selector (link), session affinity.
- **Projects** (Home, first; `ProjectModel`, cluster-scoped, OpenShift only — hidden by discovery elsewhere): Name
  (link), Display name (`openshift.io/display-name`), Status (`status.phase`), Requester (`openshift.io/requester`),
  Created. Details: status, display name, description, requester. `deleteRequiresName: true`.
- **Namespaces** (Administration): Name, Display name, Status, Created; same details minus requester when absent;
  `deleteRequiresName: true`.
- Use the shared helpers (`nameColumn`, `namespaceColumn`, `ageColumn`, `labelsColumn`, `ResourceLink`,
  `resourcePath`) from T-0073; selectors → label-selector strings via one helper (put it next to `labelsColumn`).

## Context pack
- Docs: spec §4.8 UI-2, UI-3, UI-4; ADR-0023 §3.
- Exemplars: `web/src/features/resources/registry/kinds/pods.tsx` and `configmaps.tsx` (T-0073/T-0075 — copy their
  shape exactly), `web/src/features/resources/details/MetadataSection.tsx` (DescriptionList style).
- Touch points: `web/src/features/resources/registry/registry.ts` (register four entries),
  `web/src/features/resources/registry/columns.tsx`, `web/src/features/resources/paths.ts:resourcePath`, fixtures from
  T-0070 (`shop` Deployment `web`, Service `web`, projects incl. `openshift-monitoring`; `lab-1` has no projects).

## Acceptance criteria
- [x] Each kind (QG-3): list renders fixture rows with the spec columns; details tab renders its section.
- [x] Nav now shows Projects/Events, Pods/Deployments/ConfigMaps, Services, Namespaces on `dev-1`; no Projects on `lab-1`.
- [x] Service and Deployment selector links open `/k8s/ns/shop/pods?label=app%3Dweb` showing only the matching pods.
- [x] Deleting a project/namespace asks for its name (`deleteRequiresName: true`; modal itself is T-0076).
- [x] No generic-page files changed. Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-20 frontend-engineer: started; merged cp/2-proxy-browser (T-0073/T-0075).
- 2026-11-20 frontend-engineer: 4 descriptors + `DetailItem`/`NamespaceDetails` helpers in kinds/, `labelSelectorString` +
  `PodSelectorLink` in columns.tsx, kinds.test.tsx (11 tests). Updated router/AppShell tests for the new kinds (Projects
  landing, nav sections). No generic page changed; carried pod nits not done. check-fe.sh green (643 tests).

## Review
- 2026-11-20 frontend-architect: **APPROVE** (round 1). `scripts/check-fe.sh`: lint/typecheck/build ok, 642/643 — the one
  failure (`BulkGrantWizard.test.tsx` USR-2) was a timing flake under parallel load and passes when run alone. Columns
  and details match spec UI-2/3/4 for all four kinds. Deployment status (red on Available=False, green when ready =
  desired, else orange) is correct. Projects come from discovery (OpenShift only), Namespaces always under
  Administration, as in OCP. `deleteRequiresName` is set on both. `PodSelectorLink` encodes with `URLSearchParams`
  (`label=app%3Dweb`) and `useResourceFilters` decodes it. No generic page changed.
- Merge: the worktree base (339f1d1) predates T-0074 (c82b549), but there's no file overlap (T-0074 doesn't touch
  registry.ts or the app tests). I checked a merged copy (c82b549 + this diff): 651 tests pass and typecheck is
  clean, so the orchestrator can merge cp/2-proxy-browser before committing.
- Nits (optional):
  - `registry/columns.tsx:62` `labelSelectorString`: ignores `matchExpressions`. A Deployment selected only by
    expressions shows "—", and a mixed one links to a broader pod list. Note it in the TSDoc or append expressions later.
  - `registry/kinds/DetailItem.tsx`: duplicates `details/sections/PodDetails.tsx:Item`. Acceptable for now; follow-up:
    move it to `components/` (or `details/`) and use it from PodDetails. Kind sections now live in two places
    (`details/sections/` for Pod/ConfigMap, colocated in kind files here); pick one when that follow-up lands.

## Handover notes
- Kinds registered in nav order: Projects(home 10), Events(home 20), Pods/Deployments/ConfigMaps (workloads 10/20/30),
  Services (networking 10), Namespaces (administration 10). `/c/dev-1` now lands on the Projects list.
- Selector links: `PodSelectorLink` (columns.tsx) → `resourcePath(..., PodModel, { search: 'label=app%3Dweb' })`.
- Projects/Namespaces share `NamespaceDetails` (requester row only when annotated) and `namespaceLikeColumns()`.
- `kinds/DetailItem.tsx` duplicates PodDetails' local `Item`; follow-up could make PodDetails use it.
- Delete-by-name only asserted via the descriptor flag; end-to-end check belongs to T-0076's modal tests.
