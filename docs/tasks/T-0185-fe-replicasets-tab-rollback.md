---
id: T-0185
title: Deployment ReplicaSets tab and ReplicaSet "Rollback"
status: done
owner: frontend-engineer
checkpoint: 4a
depends_on: [T-0175, T-0176]
paths: [web/src/features/resources/workloads/replicasets, web/src/features/resources/registry/kinds/replicasets.tsx]
review_rounds: 1
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
- [x] DEP-9: tab lists only the Deployment's ReplicaSets, newest revision first, with Status/Revision/Created (test).
- [x] DEP-10: Rollback on an older RS sends one PATCH replacing `/spec/template` without `pod-template-hash`; hidden on the current revision; disabled with message when paused.
- [x] ACT-4: RO → Rollback aria-disabled with reason.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23 frontend-engineer: tab (`useResourceDataView` + new `rowFilter` option, derived RS descriptor with
  Name/Status/Revision/Created, default Revision desc), `useReplicaSetActions` + `RollbackModal` +
  `useRollbackDeployment` (OCP patch), revision helpers. 5 tests in `replicaSets.test.tsx`. Gate green (991 tests;
  BulkGrantWizard 5 s timeout under load, passes alone).

## Review
- 2026-11-23 ux-designer, round 1 UX: **APPROVE** (mock :5243, 1280 light, admin dev-1 + alice prod-eu-1; :9000 down, judged on OCP source).
- Tab order Details/YAML/ReplicaSets/Pods/Events matches OCP `public/components/deployment.tsx` L197-207 (Metrics/Environment out of scope) — OK.
- Columns Name/Status/Revision/Created, default Revision desc, numeric (10 > 4 > 3 > 2) — OK; Status "<n> of <m> pods" link = OCP `workload-table.tsx` L96-102 — OK.
- Info, no change: OCP's tab reuses `ReplicaSetsPage` (adds Labels/Owner, no Revision; `replica-set.tsx` L147-153); Revision is the spec's DEP-9 choice.
- Empty: "No ReplicaSets found" without toolbar = OCP `ConsoleDataView` `StatusBox`/`EmptyBox` — OK.
- Rollback modal: PF small (560px), one X, primary "Rollback" + link "Cancel", copy "Are you sure you want to rollback to **<RS>**?" = OCP `modals/rollback-modal.tsx` L188-199, L215-237 — OK.
- Paused: danger inline "Unable to Rollback" + OCP paused copy, Rollback disabled = OCP L137-142, L204-209, L223 — OK.
- Success: modal closes, toast "Rolled back web to revision 3 on Development 1" (OCP has no toast; project mutation convention) — OK.
- Kebab: Rollback only on RS with 0 pods = OCP `replicaset-provider.ts` L33-35; first instead of last per ADR-0037 §3 — accepted deviation.
- alice/prod-eu-1: Rollback aria-disabled, tooltip "Your access to prod-eu-1 is read-only.", click opens nothing — OK.
Round 1 — frontend-architect, 2026-11-23: **APPROVE**. Gate: lint/typecheck/build ok; 4 admin-list timeouts under load, pass alone (41/41 with this task's tests).
- Owner filter: server-side `labelSelector` from `spec.selector.matchLabels` (no namespace-wide fetch) + client `ownerReferences[].uid` guard — correct, stricter than OCP (selector only).
- `rowFilter`: sound, minimal, documented (stable ref; feeds both `data` and `filteredData`, so empty state is right).
- Rollback PATCH matches OCP `submitDeploymentRollback` exactly (template clone minus `pod-template-hash`, same `ANNOTATIONS_TO_SKIP`, two `replace` ops), null-safe where OCP isn't.
- Access `patch deployments` by owner name; paused → OCP message, Rollback disabled; load error handled too. Tests cover DEP-9/10/ACT-4.
- Deviations accepted: RS name in modal copy (OCP), hidden while `status.replicas > 0` (OCP provider rule; spec "disabled" yields to OCP), Status "current of desired" (OCP reuses RS page columns). Pods column omission accepted — OCP's tab has none; PO to amend DEP-9 wording.
- Nit (optional): `useReplicaSetActions.tsx:19` runs an SSAR with `name: ''` for RSs without a Deployment owner; harmless (cached), could skip via an `enabled` flag if `useResourceAccess` grows one.
- Nit (optional): `fixedSelector` ignores `matchExpressions` (same as Pods tab); the uid filter keeps results correct.

## Handover notes
- Shared edit (minimal): `list/ResourceDataView.tsx` gains `rowFilter?` (filters `data` before `filteredData`, so the
  empty state stays "No ReplicaSets"); caller must keep it stable (`useCallback`).
- `kinds/replicasets.tsx`: exports `replicaSetStatusColumn`, adds `useKindActions`; revision helpers moved to
  `workloads/replicasets/revision.ts`.
- Deviations, all to match OCP source over the task text: (1) modal copy is OCP's real one, "Are you sure you want to
  rollback to **<ReplicaSet name>**?" (OCP names the RS, not "revision <n>"); revision appears in the success toast.
  (2) "current revision" = OCP's provider rule: Rollback listed only when owned by a Deployment and
  `status.replicas` is 0 (no Deployment fetch per row). (3) Status column reuses the RS page's "<status.replicas> of
  <spec.replicas> pods" (OCP tab reuses `ReplicaSetsPage` columns), not readyReplicas. (4) No Pods column (spec DEP-9
  lists one; task contract doesn't).
- Paused/load error: danger inline "Unable to Rollback" alert replaces the question, Rollback `isDisabled` (OCP L137).
- Rollback item comes before the common items (ADR-0037 §3); OCP puts it last.
