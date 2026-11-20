---
id: T-0078
title: Descriptors for Deployments, Services, Projects and Namespaces (columns, status, details sections)
status: todo
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
- [ ] Each kind (QG-3): list renders fixture rows with the spec columns; details tab renders its section.
- [ ] Nav now shows Projects/Events, Pods/Deployments/ConfigMaps, Services, Namespaces on `dev-1`; no Projects on `lab-1`.
- [ ] Service and Deployment selector links open `/k8s/ns/shop/pods?label=app%3Dweb` showing only the matching pods.
- [ ] Deleting a project/namespace asks for its name (T-0076 modal driven by `deleteRequiresName`).
- [ ] No generic-page files changed. Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
