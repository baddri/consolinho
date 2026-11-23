---
id: T-0192
title: Standalone ReplicaSets and ReplicationControllers — Edit Pod count, owner link
status: todo
owner: frontend-engineer
checkpoint: 4b
depends_on: [T-0189, T-0190]
paths: [web/src/features/resources/registry/kinds/replicasets.tsx, web/src/features/resources/registry/kinds/replicationcontrollers.tsx, web/src/features/resources/workloads/replicasets/useReplicaSetActions.tsx, web/src/features/resources/workloads/replicationcontrollers, web/src/features/resources/actions/useResourceAccess.ts]
review_rounds: 0
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
- [ ] WL-5: `legacy-rs` and `legacy-rc` have "Edit Pod count" → scale PATCH (tests); Deployment-owned RSs and DC-owned RCs show the owner link in list and details.
- [ ] RC list shows OCP columns incl. Phase; Pods tab lists the RC's pods (test).
- [ ] RSs without a Deployment owner issue no SSAR for `deployments` (test counts SSAR requests).
- [ ] ACT-4: RO → Edit Pod count aria-disabled with reason.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
