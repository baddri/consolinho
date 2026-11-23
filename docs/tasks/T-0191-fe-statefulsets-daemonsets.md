---
id: T-0191
title: StatefulSets and DaemonSets — lists, details, Pods tab, actions
status: todo
owner: frontend-engineer
checkpoint: 4b
depends_on: [T-0189, T-0190]
paths: [web/src/features/resources/registry/kinds/statefulsets.tsx, web/src/features/resources/registry/kinds/daemonsets.tsx, web/src/features/resources/workloads/statefulsets, web/src/features/resources/workloads/daemonsets]
review_rounds: 0
---

## Goal
WL-2/3/4 for StatefulSets and DaemonSets, built on the T-0189 minimal descriptors and the T-0190 scale kit.

## Contract / design notes
- **StatefulSet** descriptor: columns Name, Namespace, Status (`<ready> of <desired> pods`, link to Pods tab — reuse
  `kinds/replicasets.tsx:replicaSetStatusColumn` pattern), Labels, Pod selector (OCP `stateful-set.tsx` list);
  `podsSelector` = `spec.selector.matchLabels`; summary with `WorkloadPodRing` (scalable) and pod selector/
  tolerations like Deployments; `useKindActions` → [Edit Pod count, Restart rollout] then common (ADR-0037 §3; OCP
  provider has no restart — fleet addition per spec WL-3). Tabs: Details, YAML, Pods, Events (OCP L129-134; no
  Environment — out of CP4 scope).
- **DaemonSet** descriptor: columns Name, Namespace, Status (`<numberReady> of <desiredNumberScheduled> pods`),
  Labels, Pod selector; `podsSelector`; read-only ring (`PodRing` without `scale`, OCP `daemon-set.tsx` L55);
  `DetailsSection` "Current count" / "Desired count" (`status.currentNumberScheduled` / `desiredNumberScheduled`,
  OCP `DaemonSetDetailsList` L36); actions [Restart rollout] then common.
- Status column on both uses the shared `ResourceStatusLabel` vocabulary; keep descriptor files thin, put helpers in
  `workloads/<kind>/`.

## Context pack
- Exemplars: `registry/kinds/deployments.tsx` (full workload descriptor), `registry/kinds/replicasets.tsx` L60-105
  (status column + actions); T-0190 `workloads/scale/*`.
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/stateful-set.tsx` (details L34, tabs
  L129-134, list columns); `public/components/daemon-set.tsx` (`DaemonSetDetailsList` L36, ring L55, tabs L152-157);
  `packages/console-app/src/actions/providers/stateful-set-provider.ts`, `daemon-set-provider.ts`.

## Acceptance criteria
- [ ] WL-2: both lists show OCP's columns; details show OCP tabs; Pods tab lists `db-0..2` / `node-agent` pods (test).
- [ ] WL-3: StatefulSet `db` "Edit Pod count" → scale PATCH; ring arrows scale; "Restart rollout" patches `restartedAt` (tests).
- [ ] WL-4: DaemonSet details show Current/Desired counts; "Restart rollout" present; no count item (test).
- [ ] ACT-4: RO cluster → kind items aria-disabled with reason (test).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
