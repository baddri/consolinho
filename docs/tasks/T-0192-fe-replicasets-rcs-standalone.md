---
id: T-0192
title: Standalone ReplicaSets and ReplicationControllers — Edit Pod count, owner link
status: done
owner: frontend-engineer
checkpoint: 4b
depends_on: [T-0189, T-0190]
paths: [web/src/features/resources/registry/kinds/replicasets.tsx, web/src/features/resources/registry/kinds/replicationcontrollers.tsx, web/src/features/resources/workloads/replicasets/useReplicaSetActions.tsx, web/src/features/resources/workloads/replicationcontrollers, web/src/features/resources/actions/useResourceAccess.ts]
review_rounds: 1
---

## Goal
WL-5: ReplicaSets and ReplicationControllers get "Edit Pod count" and OCP's Owner column/details link; RCs get a full
descriptor. Carries the CP4a follow-up "skip the `name: ''` SSAR in `useReplicaSetActions`".

## Contract / design notes
- ReplicaSet kind items: [Rollback (existing, Deployment-owned only), Edit Pod count] (ADR-0037 §3 — OCP order is
  ModifyCount, common, rollback; we keep kind items first). Edit Pod count via T-0190 `useEditCountAction`.
- ReplicationController descriptor (OCP `replication-controller.tsx`): columns Name, Namespace, Status
  (`<status.replicas> of <spec.replicas> pods`, reuse `replicaSetStatusColumn` shape), Phase
  (`openshift.io/deployment.phase` annotation, blank when absent), Owner, Created; `podsSelector` = `spec.selector`;
  details: Owner link + "Deployment revision" (`openshift.io/deployment-config.latest-version`) when DC-owned; tabs
  Details, YAML, Pods, Events. Actions: [Edit Pod count] then common. **"Rollback" and "Cancel rollout" for DC-owned
  RCs are T-0193** — leave a `useReplicationControllerActions` hook that T-0193 extends.
- Owner link: both kinds show an "Owner" column (OCP `replica-set.tsx` L183 `OwnerReferences`) and an Owner details
  item; use the existing `ObjectReferenceLink`/`ResourceLink` with `findModel` on the ownerReference; unknown kinds
  render plain text.
- Follow-up: `useResourceAccess(cluster, review, { enabled? })` — when `enabled === false` no SSAR is issued and the
  result is `{ allowed: false, loading: false }`; `useReplicaSetActions` passes `enabled: !!ownerName`. TSDoc it.

## Context pack
- Exemplars: `workloads/replicasets/useReplicaSetActions.tsx` (L19 the `name: ''` SSAR), `kinds/replicasets.tsx`
  L60-105; `components/ObjectReferenceLink.tsx`; `actions/useResourceAccess.ts:useResourceAccess` (L55).
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/replica-set.tsx` (L183, L245);
  `public/components/replication-controller.tsx`; `packages/console-app/src/actions/providers/replicaset-provider.ts`,
  `replication-controllers-provider.ts`.

## Acceptance criteria
- [x] WL-5: `legacy-rs` and `legacy-rc` have "Edit Pod count" → scale PATCH (tests); Deployment-owned RSs and DC-owned RCs show the owner link in list and details.
- [x] RC list shows OCP columns incl. Phase; Pods tab lists the RC's pods (test).
- [x] RSs without a Deployment owner issue no SSAR for `deployments` (test counts SSAR requests).
- [x] ACT-4: RO → Edit Pod count aria-disabled with reason.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23 frontend-engineer: RS kind items [Rollback, Edit Pod count]; `useResourceAccess` gains `{ enabled }`; full RC
  descriptor (Status, Phase, Owner, Created; Phase/count details, revision row, Containers/Volumes, Pods tab) in
  `workloads/replicationcontrollers/`; `standaloneControllers.test.tsx` (7 tests). Gate green.

## Review
- 2026-11-23 ux-designer round 1: **APPROVE** (mock `prod-eu-1`/`shop`, alice RO; OCP ref console down, judged against source).
  - RC list: Name, Status ("2 of 2 pods" → Pods tab), Phase (icon, "—" when unset), Owner (DC link / "No owner"), Created, kebab = OCP `replication-controller.tsx` L164-275, `utils/owner-references.tsx` L21. OK.
  - RC details: heading status = phase; tabs Details/YAML/Pods/Events; "ReplicationController details" grid with Deployment revision before Created at/Owner (OCP `utils/details-page.tsx` L152 children slot), right column Phase, Current/Desired count; Containers, Volumes = `replication-controller.tsx` L69-124. OK.
  - Actions (RC and `legacy-rs`): Edit Pod count, Edit labels, Edit annotations, Edit <Kind>, Delete <Kind>; RO aria-disabled with "Your access to prod-eu-1 is read-only." = `replication-controllers-provider.ts` L35-46 (ModifyCount first). OK.
  - Info: RS Rollback stays before Edit Pod count (ADR-0037 §3); OCP `replicaset-provider.ts` L29-33 puts Rollback last. Accepted deviation, not a finding.
  - Follow-up (cross-cutting, not this task): OCP workload Pods tabs (RS/RC/SS/DS/Job) pass `showNodes`, so the 5th column is "Node" (`pod-list.tsx` L142), ours shows "Owner". File a shared Pods-tab task.
  - Follow-up (cross-cutting): OCP RC/RS/Deployment have an "Environment" tab (`replication-controller.tsx` L156 `envEditor`); none of our workloads have it. Track in `ocp-parity.md`.
  - Probe note: `ui-probe.mjs` prints only the header when no `--pair` is given; the :5199 server was this worktree's.
- 2026-11-23 frontend-architect, round 1: **APPROVE** (check-fe.sh green: 103 files / 1092 tests). Deviations accepted:
  (1) `enabled: false` → `{ isChecking: true }` fails closed in the existing result shape, no SSAR (tested);
  (2) the 2-line `useActionAccess` mapping repeated in `useReplicaSetActions.tsx:40-42` is OK because that file was outside paths;
  (3) Owner details row from the shared `MetadataSection` matches OCP `ResourceSummary`. RC exports are clean for T-0193.
- Nit (optional) `replicationControllerDetails.tsx:77` — "Desired count" uses `spec.replicas ?? 0` while the Status column
  uses `replicationControllerDesired` (`?? 1`) → use `replicationControllerDesired(obj)` for consistency.
- Follow-up (optional): give `useActionAccess` an `{ enabled }` option and drop the duplicated mapping in `useReplicaSetActions`.
- Nit (optional) `standaloneControllers.test.tsx` lives under `replicationcontrollers/` but also covers ReplicaSets; fine, or split it later.

## Handover notes
- `useResourceAccess(cluster, review, { enabled })`: the result type is `{ isChecking, disabledReason }` (no
  `allowed/loading`), so `enabled: false` fails closed as `{ isChecking: true }` and sends no SSAR (deviation from
  the contract's `{ allowed: false, loading: false }` wording — same intent).
- `useReplicaSetActions` calls `useResourceAccess` directly (+ `disabledActionProps`) because `useActionAccess` is not
  in this task's paths; a follow-up could add `{ enabled }` to `useActionAccess` and drop the duplicated 2-line mapping.
- Owner details row already comes from the generic `MetadataSection` (`OwnerReferences`); RS Owner column existed.
- For T-0193: `workloads/replicationcontrollers/replicationControllerDetails.tsx` exports `ReplicationControllerResource`,
  `deploymentPhaseOf`, `DEPLOYMENT_PHASE_ANNOTATION`, `DC_LATEST_VERSION_ANNOTATION`, count helpers and columns;
  `useReplicationControllerActions.tsx` is the hook to extend with Cancel rollout / Rollback (after Edit Pod count).
- RC heading status = deployment phase (OCP `getResourceStatus`); RC Phase cell shows "—" when absent (shared `Status`).
- 2026-11-23 orchestrator: applied architect nit (Desired count uses `replicationControllerDesired`). Follow-ups: `useActionAccess({enabled})`; workload Pods tab Node column + Environment tab (UX, all workloads).
