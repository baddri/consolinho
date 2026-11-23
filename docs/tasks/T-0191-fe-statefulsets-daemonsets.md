---
id: T-0191
title: StatefulSets and DaemonSets — lists, details, Pods tab, actions
status: done
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
- [x] WL-2: both lists show OCP's columns; details show OCP tabs; Pods tab lists `db-0..2` / `node-agent` pods (test).
- [x] WL-3: StatefulSet `db` "Edit Pod count" → scale PATCH; ring arrows scale; "Restart rollout" patches `restartedAt` (tests).
- [x] WL-4: DaemonSet details show Current/Desired counts; "Restart rollout" present; no count item (test).
- [x] ACT-4: RO cluster → kind items aria-disabled with reason (test).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23 frontend-engineer: started; base ff-merged to cp/4-workloads (28020c1).
- 2026-11-23 frontend-engineer: descriptors + workloads/{statefulsets,daemonsets} helpers/actions + 12 tests; full gate green
  (BulkGrantWizard 5 s load timeout passed alone). Probe: OCP ref :9000 down, probe hardwired to :5199 → ran our-side only
  on :5245 (scratchpad copy); DS/SS details metrics match Deployment details. In review.

## Review
- 2026-11-23 ux-designer, round 1: **APPROVE** (mock :5249, 1280 light; ref console :9000 down → compared against source).
- Lists — Name, Status "N of M pods" link to Pods tab, Labels, Pod selector, kebab; same as OCP `workload-table.tsx` `ReplicasCount` (STS `status.replicas/spec.replicas`, DS `currentNumberScheduled/desiredNumberScheduled`) — OK.
- Details — "StatefulSet details"/"DaemonSet details" heading, ring above the grid, summary with Pod/Node selector and Tolerations, then Containers, Volumes; same as OCP `stateful-set.tsx` L28-55 and `daemon-set.tsx` L47-87 — OK.
- STS ring has up/down arrows; DS ring is read-only ("2 Pods"), Current/Desired count in the right column; same as OCP `daemon-set.tsx` L36-42, L55 — OK. STS has no right column (PDB only, out of scope) — accepted.
- Tabs Details, YAML, Pods, Events (OCP L129-134 / L152-157 minus Metrics/Environment, out of scope); the Pods tabs list db-0.. / node-agent pods owned by SS/DS — OK.
- Actions — STS: Edit Pod count, Restart rollout, Edit labels, Edit annotations, Edit StatefulSet, Delete StatefulSet; DS: the same without Edit Pod count. Order matches OCP `stateful-set-provider.ts` / `daemon-set-provider.ts` (ModifyCount first, then common). Restart rollout is the spec fleet addition — OK.
- Info, non-blocking: OCP's DS ring label adds failed pods to `currentNumberScheduled` (`pod-ring-utils.ts` L138); ours omits them. Only visible with failed daemon pods; possible follow-up.
- 2026-11-23 frontend-architect, round 1: **APPROVE**. Targeted gate green (lint/typecheck, 12 tests).
  - Deviations accepted: Status = OCP `workload-table.tsx:ReplicasCount` (SS `status.replicas`/`spec.replicas`, DS
    `currentNumberScheduled`/`desiredNumberScheduled`, plain link to `/pods`), which overrides the task text; no SS right column
    (OCP has only PDB there) and no Environment/Metrics tabs are within scope.
  - Nit (optional): `statefulSetDesired` defaults to 1 while OCP `ReplicasCount` uses `?? 0`. The API server always sets the
    field, so the difference is cosmetic.
  - Follow-up (already in Handover): point `scale.test.tsx` at `useStatefulSetActions` instead of its stand-in.

## Handover notes
- Helpers/actions in `workloads/statefulsets/statefulSetDetails.tsx` and `workloads/daemonsets/daemonSetDetails.tsx`;
  descriptor files stay thin and re-export `StatefulSetResource` / `DaemonSetResource` (scale.test imports it).
- Status column follows OCP `ReplicasCount`, not the task text: SS `status.replicas of spec.replicas`, DS
  `currentNumberScheduled of desiredNumberScheduled` (task said ready/numberReady). Plain "N of M pods" link to the Pods
  tab like Deployments/ReplicaSets (no `ResourceStatusLabel` icon — OCP shows none here).
- DS ring: shared read-only `PodRing` fed `{spec.replicas: desired, status.readyReplicas: current}` to match OCP's
  DaemonSet ring label branch; no PodRing change.
- SS has no right-column items (OCP's only one is the PDB field, out of scope). Environment/Metrics tabs omitted (scope).
- `scale.test.tsx` still uses its own `useStatefulSetScaleActions` stand-in; could switch to the descriptor (follow-up, outside paths).
- OCP-side probe not run (reference console :9000 was down).
