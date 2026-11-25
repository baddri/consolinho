---
id: T-0308
title: Expand PVC action and modal (PVC-3, SAFE5-1/2)
status: done
owner: frontend-engineer
checkpoint: 5a
depends_on: [T-0307]
paths: [web/src/features/resources/registry/kinds/persistentvolumeclaims.tsx, web/src/features/resources/storage/pvcs, web/src/mocks/k8s/networkingStorageFixtures.ts]
review_rounds: 1
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
- **Dedupe (from T-0307 review):** `mocks/k8s/networkingStorageFixtures.ts:quantityBytes` + `UNITS` (used by
  `settlePvcResize`) → `parseQuantity` from `@/shared/k8s` (treat `undefined` as "don't settle"); add that file to paths.

## Context pack
- Docs: ADR-0037 §3–4 (kind actions, modal shell), FRONTEND.md § Forms.
- Exemplars: `workloads/jobs/jobDetails.tsx:useJobActions` (L128); `workloads/scale/ConfigureCountModal.tsx` +
  `useEditCountAction.tsx` (modal + RHF/zod + access), `workloads/scale/useSetParallelism.ts`.
- Touch points: `actions/ResourceMutationModal.tsx:ResourceMutationModalProps`; `actions/useActionAccess.ts`;
  `actions/useResourceMutation.ts:useResourceMutation`; `shared/k8s/quantity.ts:parseQuantity` (T-0307).
- OCP reference: `/home/bad/works/openshift-console/frontend/packages/console-app/src/actions/hooks/usePVCActions.ts`
  (L44–62), `public/components/modals/expand-pvc-modal.tsx`, `public/components/utils/request-size-input.tsx`.

## Acceptance criteria
- [x] PVC-3: RW expand works end to end on the mock and the toast names claim + cluster; inline error on cluster failure.
- [x] Disabled-with-reason for RO, not Bound, and non-expandable StorageClass (details); never hidden (SAFE5-2).
- [x] SAFE5-1: modal shows cluster display name and environment label.
- [x] `validateExpandSize` unit tests (QG5A-1).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-25 frontend-engineer: started; OCP RequestSizeInput is NumberInput + unit Select (not TextInput + FormSelect), mirroring OCP.

- 2026-11-25 frontend-engineer: expandSize.ts, useExpandPVC.ts, ExpandPVCModal.tsx, useExpandPVCAction.tsx (usePVCActions on the
  descriptor); mock settlePvcResize now uses parseQuantity. 24 pvcs tests green; probe on PVC list: no diffs (probe can't
  open menus/modals). Full-gate lint/typecheck failures only in lane N's networking/routes files.
- 2026-11-25 frontend-engineer fix r1: unit item 20px left padding (expandPVC.module.css), description `pf-v6-u-mb-0`, min follows
  unit (`minExpandValue`), test asserts the Capacity row; storage tests 35/35 green.

## Review
- 2026-11-25 ux-designer round 1: **CHANGES_REQUESTED** (menu and modal measured with Playwright clicks, ours db-data vs OCP consolinho/data-postgres-0, 1280 light)
  - Expand modal — unit select sits 4px from the number input (toggle x=586); OCP puts it 24px away (x=606: 4px input-group gap + 20px `padding-left` of `.request-size-input__unit`) — `public/components/utils/_request-size-input.scss`, `request-size-input.tsx` — add 20px inline-start spacing on the unit `InputGroupItem` (custom rule with an OCP comment; no PF token is 20px).
  - Expand modal — 40px between the description and "Total size" (p `margin-bottom` 16 + Form row gap 24, because the p sits inside the shell's `Form`); OCP has 16px (p is a `ModalBody` sibling before `<Form>`) — `public/components/modals/expand-pvc-modal.tsx` L72–84 — give the description `pf-v6-u-mb-0` (24px, the Form gap; the residual 8px is the shell, see follow-up).
  - Handover notes — "PVC is not Bound" is not on OCP's Expand PVC (that action has only the `patch` accessReview; the copy belongs to Create snapshot / Clone PVC) — `packages/console-app/src/actions/hooks/usePVCActions.ts` L46–62 — record as an accepted deviation; keep the behaviour.
  - Matches OCP (no action): title, small variant (560px), header/body/footer padding, one Close, description text + bold name, "Total size *" label, NumberInput 198x37, "GiB" toggle 77x37 with "Number of GiB" aria-label, options MiB/GiB/TiB, Expand primary + Cancel link, menu item 221x37 first in the menu. Disabled tooltips verified: scratch "PVC is not Bound", uploads (details) SC reason. Focus on the number input instead of Close is the contract's choice (OK).
  - Follow-up (not this task): `ClusterContextText` p inside the shell `Form` also leaves 40px to the next field in every `ResourceMutationModal`; fix once in the shell (e.g. `mb-0`).
- 2026-11-25 frontend-architect, round 1: **APPROVE**. `check-fe.sh src/features/resources/storage src/shared/k8s` green (102 tests).
  - PATCH: JSON Patch `replace /spec/resources/requests` (`application/json-patch+json`) = contract + OCP `expand-pvc-modal.tsx` L48–54.
    T-0324's PVC row sends `merge-patch+json`; the proxy doesn't gate on content type (verb `patch` is what's authorized, and the
    Deployment json-patch row covers that header), so not blocking. Follow-up (BE, optional): switch that row to json-patch+json so it documents the real shape.
  - Disabled, never hidden: access → not Bound → SC (details only) chain in `useExpandPVCAction.tsx` L118–124; all three tested; SC error/missing → no reason. OK.
  - Validation: pure, positive + strictly greater via `parseQuantity`, 11 unit cases incl. cross-unit/decimal/empty; unit change re-triggers. OK.
  - Cache/live: `useResourceMutation` invalidates the get + toast "… on <cluster>"; mock settles capacity via `parseQuantity` (dedupe done). OK.
  - Deviation accepted: OCP `RequestSizeInput` is `NumberSpinner` + `ConsoleSelect` (request-size-input.tsx L61–75), so PF `NumberInput` + `Select` mirrors OCP better than the contract's TextInput + FormSelect.
  - List rows: SC get is `enabled: reviewByName && scName` (L114–116); test asserts zero `/storageclasses` requests. OK.
  - Nits (optional): `expandPVC.test.tsx:107` `findAllByText('20 GiB')` also matches the Requested value, so it doesn't prove the Capacity cell
    updated (scope to the Capacity term); `ExpandPVCModal.tsx:155` `min` stays in the prefill unit after a unit change (minus stops at e.g. 10 TiB).

## Handover notes
- Accepted deviations: "PVC is not Bound" on Expand (OCP uses that copy only on Create snapshot/Clone; Expand there has
  no phase gate); StorageClass `allowVolumeExpansion` reason is fleet-only (OCP has no check); "Size must be greater
  than the current size (<req>)." / "Size must be a positive number." are fleet copy.
- Size field mirrors OCP `RequestSizeInput` (PF `NumberInput` + `Select` MiB/GiB/TiB, "Number of <unit>" toggle label),
  not TextInput + FormSelect as the contract suggested; the description sits in the body as OCP's `Content` p.
- Prefill: `initialExpandSize` picks the largest of Mi/Gi/Ti (2 decimals); minus stops at the current value (OCP `minValue`).
- SC get only when `reviewByName` (details); list rows make no SC request (tested). Unit change re-triggers the size check.
- Toast: "Expansion of <name> to <size> requested on <cluster>". OCP navigates to the claim after save; we don't (same page).
- Full gate: tests 1394/1394 + build ok; lint/typecheck errors are only in lane N's in-flight networking/routes files.
- Probe could not open the menu/modal (it never clicks); modal parity verified by reading OCP source only.
