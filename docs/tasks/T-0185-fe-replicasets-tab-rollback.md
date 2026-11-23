---
id: T-0185
title: Deployment ReplicaSets tab and ReplicaSet "Rollback"
status: todo
owner: frontend-engineer
checkpoint: 4a
depends_on: [T-0175, T-0176]
paths: [web/src/features/resources/workloads/replicasets, web/src/features/resources/registry/kinds/replicasets.tsx]
review_rounds: 0
---

## Goal
DEP-9/10: the Deployment details "ReplicaSets" tab (OCP `ReplicaSetsTab`) and the ReplicaSet kind action "Rollback"
that rolls the owning Deployment back to that revision.

## Contract / design notes
- `DeploymentReplicaSetsTab` (replaces the T-0175 stub): `useResourceDataView` for `replicasets` with
  `fixedSelector` = deployment `spec.selector` **and** client filter on `ownerReferences[].uid === deployment.uid`;
  columns Name, Status ("<ready> of <desired> pods"), Revision (`deployment.kubernetes.io/revision`), Created; default
  sort Revision desc (newest first). Rows keep the ReplicaSet kebab.
- `useReplicaSetActions` (descriptor `useKindActions` on replicasets): "Rollback" (OCP `useReplicaSetActions.ts` L33)
  only when owned by a Deployment and not the current revision; gating `patch deployments` on the owner.
- `RollbackModal` (OCP `rollback-modal.tsx`): text "Are you sure you want to rollback to revision <n>?" (OCP copy) +
  `ClusterContextText`; if the Deployment is paused, show OCP's paused message (L137) and disable Rollback.
  Patch on the Deployment: `[{ op: 'replace', path: '/spec/template', value: rsTemplate }, { op: 'replace', path:
  '/metadata/annotations', value: mergedAnnotations }]` where `rsTemplate` drops label `pod-template-hash` (L98) and
  annotations copy OCP L117-118. Success "Rolled back <deployment> to revision <n>".

## Context pack
- Exemplars: `details/ResourcePodsTab.tsx` (selector-filtered tab with `useResourceDataView`); T-0176 modal/mutation.
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/deployment.tsx` L158-173 `ReplicaSetsTab`;
  `public/components/modals/rollback-modal.tsx` L98, L117-118, L137;
  `packages/console-app/src/actions/hooks/useReplicaSetActions.ts` L33.

## Acceptance criteria
- [ ] DEP-9: tab lists only the Deployment's ReplicaSets, newest revision first, with Status/Revision/Created (test).
- [ ] DEP-10: Rollback on an older RS sends one PATCH replacing `/spec/template` without `pod-template-hash`; hidden on the current revision; disabled with message when paused.
- [ ] ACT-4: RO → Rollback aria-disabled with reason.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
