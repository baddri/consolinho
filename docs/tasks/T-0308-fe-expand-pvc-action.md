---
id: T-0308
title: Expand PVC action and modal (PVC-3, SAFE5-1/2)
status: todo
owner: frontend-engineer
checkpoint: 5a
depends_on: [T-0307]
paths: [web/src/features/resources/registry/kinds/persistentvolumeclaims.tsx, web/src/features/resources/storage/pvcs]
review_rounds: 0
---

## Goal
Marco fixes a full volume in one step: "Expand PVC" in the PVC kebab/Actions opens OCP's "Expand
PersistentVolumeClaim" modal naming the cluster, patches the request, and the capacity updates live.

## Scope
- In: kind action hook, modal, mutation hook, size validation, tests.
- Out: snapshot/clone actions; changing StorageClass.

## Contract / design notes
- **`storage/pvcs/useExpandPVCAction.tsx`**: `usePVCActions(args: KindActionArgs<PVCResource>): KindActions`, set as
  `useKindActions` on the PVC descriptor. One item `{ itemKey: 'expand-pvc', title: 'Expand PVC' }` (OCP id/label).
  Disabled reasons, first match wins: `useActionAccess(cluster, { model: PersistentVolumeClaimModel, verb: 'patch',
  namespace, name }, reviewByName)` (RO user / RO grant / RBAC, SAFE5-2); claim not Bound → "PVC is not Bound" (OCP
  copy, `usePVCActions.ts` L61–62); StorageClass loaded and `!allowsExpansion(sc)` (from T-0306
  `storage/storageclasses/storageClass.ts`) → *(fleet)* "The StorageClass doesn't allow volume expansion." — spec
  PVC-3; OCP has no such check (record as accepted deviation). The StorageClass is read with
  `useK8sGet(cluster, StorageClassModel, undefined, scName, { enabled: !!scName })` **only when the item is shown on
  the details page** (`reviewByName`); list rows skip the SC check (no N gets per list — the modal re-checks and the
  cluster rejects anyway). SC fetch error / 403 / no class → no SC reason (the cluster is the authority).
- **`storage/pvcs/ExpandPVCModal.tsx`** on `ResourceMutationModal` (SAFE5-1: cluster display name + env label come
  from it): `title="Expand PersistentVolumeClaim"` (spec; OCP builds `Expand {{kind.label}}` = same text),
  `saveLabel="Expand"`, `kindLabel="PersistentVolumeClaim"`, description = OCP's "Increase the capacity of PVC
  **<name>.** Note that capacity must be at least the current PVC size. This expansion might take some time to
  complete." (`expand-pvc-modal.tsx` L74–80). Field "Total size" (required): number input + unit select Mi/Gi/Ti as
  OCP `RequestSizeInput` (PF `InputGroup` with `TextInput type="number"` + `FormSelect`; look at OCP
  `public/components/utils/request-size-input.tsx`), prefilled from `spec.resources.requests.storage` split into
  value + unit (OCP `humanizeBinaryBytesWithoutB`). `elementToFocus` = the number input.
- **Validation** (pure `storage/pvcs/expandSize.ts`, react-hook-form + zod like the other modals):
  `validateExpandSize(value, unit, currentRequest)` → error when not a positive number or
  `parseQuantity(value+unit) <= parseQuantity(currentRequest)`: *(fleet copy, OCP only has the description)*
  "Size must be greater than the current size (<currentRequest>)." Save disabled while invalid. Unit tests (QG5A-1):
  equal, smaller, larger, other unit, decimal, empty.
- **Mutation** `storage/pvcs/useExpandPVC.ts` on `useResourceMutation` (exemplar `workloads/scale/useSetParallelism.ts`):
  JSON Patch `replace /spec/resources/requests` with `{ storage: '<v><unit>' }` (OCP patches the whole `requests`
  object), success toast *(fleet, names claim + cluster as other CP4 toasts)*; errors inline in the modal.
- Tests in `storage/pvcs/expandPVC.test.tsx`: RW expands `db-data` 10Gi → 20Gi and capacity updates (mock resize from
  T-0300); RO sees the item disabled with the read-only reason; `scratch` disabled "PVC is not Bound"; `uploads`
  disabled with the SC reason on details; modal shows cluster name; ≤ current blocks Save.

## Context pack
- Docs: ADR-0037 §3–4 (kind actions, modal shell), FRONTEND.md § Forms.
- Exemplars: `workloads/jobs/jobDetails.tsx:useJobActions` (L128); `workloads/scale/ConfigureCountModal.tsx` +
  `useEditCountAction.tsx` (modal + RHF/zod + access), `workloads/scale/useSetParallelism.ts`.
- Touch points: `actions/ResourceMutationModal.tsx:ResourceMutationModalProps`; `actions/useActionAccess.ts`;
  `actions/useResourceMutation.ts:useResourceMutation`; `shared/k8s/quantity.ts:parseQuantity` (T-0307).
- OCP reference: `/home/bad/works/openshift-console/frontend/packages/console-app/src/actions/hooks/usePVCActions.ts`
  (L44–62), `public/components/modals/expand-pvc-modal.tsx`, `public/components/utils/request-size-input.tsx`.

## Acceptance criteria
- [ ] PVC-3: RW expand works end to end on the mock and the toast names claim + cluster; inline error on cluster failure.
- [ ] Disabled-with-reason for RO, not Bound, and non-expandable StorageClass (details); never hidden (SAFE5-2).
- [ ] SAFE5-1: modal shows cluster display name and environment label.
- [ ] `validateExpandSize` unit tests (QG5A-1).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
