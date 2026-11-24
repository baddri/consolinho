---
id: T-0307
title: PersistentVolumeClaims — list, status filter, details with Conditions and Pods (PVC-1, PVC-2)
status: done
owner: frontend-engineer
checkpoint: 5a
depends_on: [T-0306]
paths: [web/src/features/resources/registry/kinds/persistentvolumeclaims.tsx, web/src/features/resources/storage/pvcs, web/src/shared/k8s/quantity.ts, web/src/shared/k8s/quantity.test.ts, web/src/shared/k8s/index.ts, web/src/features/resources/storage/persistentvolumes/persistentVolume.ts, web/src/features/resources/registry/kinds/persistentvolumes.tsx]
review_rounds: 1
---

## Goal
PVCs show OCP's columns and details — bound volume, capacity, storage class, resize conditions, and which pods mount
the claim — the information Marco needs before expanding a full volume (T-0308).

## Scope
- In: list columns + Status filter, details right column, Conditions section, "Pods" item, the shared quantity parser.
- Out: Expand PVC (T-0308); "Used" column/value and the capacity donut (Prometheus, Q6 → parity gap); snapshot/clone.

## Contract / design notes
- **`shared/k8s/quantity.ts`** (pure; CP5b node capacity reuses it): `parseQuantity(q: string): number | undefined`
  — Kubernetes quantity → base units (binary `Ki Mi Gi Ti Pi Ei`, decimal `k M G T P E`, `m`, exponent `e`/`E`, plain
  numbers); `undefined` for anything else. Unit tests incl. `1.5Gi`, `500M`, `100m`, `1e3`, garbage.
- **List** (OCP `persistent-volume-claim.tsx` L207–231, minus Used): Name, Namespace, Status (`Terminating` when
  `deletionTimestamp`, else `status.phase` — OCP L120–124; descriptor `status`), PersistentVolume (`ResourceLink` to
  `spec.volumeName` PV, else OCP's "No PersistentVolume" subtle text, L157), Capacity (`status.capacity.storage`, else
  `spec.resources.requests.storage`; sort by `parseQuantity`), StorageClass (`ResourceLink`), Created. Filter
  `status`: Pending / Bound / Lost (OCP L524–546, `title` "Status").
- **Details** (OCP L367–500, minus metrics/VAC rows): right column Label selector (if `spec.selector`), Status, Requested
  capacity, Capacity (when bound), Access modes, Volume mode, StorageClasses → **use OCP's exact labels** (note OCP
  says "StorageClasses" / "PersistentVolumes" there), PersistentVolume; plus a "Pods" `DetailsItem` (PVC-2): pods in
  the namespace whose `spec.volumes[].persistentVolumeClaim.claimName` = the claim, one namespaced
  `useK8sList(cluster, PodModel, { namespace })` filtered by pure `podsMountingClaim(pods, claim)`, each a
  `ResourceLink`, none → `DASH`. `ExtraSections`: "Conditions" via the shared conditions table the workloads use
  (grep `Conditions` in `workloads/`), shown for `FileSystemResizePending`.
- Tests in `storage/pvcs/pvcs.test.tsx`: list columns, Status filter, `scratch` "No PersistentVolume", `db-data` Pods
  item lists `db-*`, `resizing` Conditions row.

- **Dedupe (from T-0306 review):** `storage/persistentvolumes/persistentVolume.ts:quantityBytes` is a local quantity
  parser for the PV Capacity sort. Switch `registry/kinds/persistentvolumes.tsx` to `parseQuantity` and delete
  `quantityBytes` + its test case (note `quantityBytes` returns `null` for "sort last"; map `undefined` accordingly).

## Context pack
- Exemplars: `registry/kinds/jobs.tsx` (status + filters wiring); `workloads/pods/PodStatus.tsx` L28 (`useActiveCluster`
  inside a details item); `RowFilter` in `registry/types.ts`.
- Touch points: `registry/kinds/persistentvolumeclaims.tsx` (minimal, T-0300); `shared/k8s/index.ts` (export
  `parseQuantity`).
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/persistent-volume-claim.tsx`
  (L110–160 cells, L207–231 columns, L367–510 details, L520–546 filter).

## Acceptance criteria
- [x] PVC-1: columns as OCP minus Used; Status filter Pending/Bound/Lost works via `?status=`.
- [x] PVC-2: details rows per OCP labels; Conditions section for `resizing`; Pods item for `db-data`.
- [x] `parseQuantity` and `podsMountingClaim` unit tests.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-25 frontend-engineer: `shared/k8s/quantity.ts` (`parseQuantity`, `formatBinaryBytes` = OCP `humanizeBinaryBytes`);
  PVC descriptor (columns, Status filter, details, Label selector, Pods item, Conditions); PV sort on `parseQuantity`,
  `quantityBytes` deleted; seeded PV `pvc-resizing-0f9e`. Probe vs OCP `data-postgres-0`: details column matches
  (minus Used); list cells match. Full gate green.

## Review
- 2026-11-25 ux-designer, round 1: **APPROVE**. Probe vs :9000 `consolinho/data-postgres-0` + PVC list, light, 1280.
  - List: header, cells, Status filter toggle, row height (80px) match OCP (`persistent-volume-claim.tsx` L136–231); 0 mismatches
    beyond the shared status-icon `svg display inline/block` (visually identical, pre-existing `shared/ui/Status`).
  - Status icons: Bound green check (shot = OCP), Pending in-progress, Lost error, as OCP `Status.tsx` L42/L91/L98.
  - "No PersistentVolume" (`pf-v6-u-text-color-subtle`, L157) and "No selector" (`utils/selector.tsx` L38) match; probe 0 mismatches.
  - Sizes: `formatBinaryBytes` = OCP `humanizeBinaryBytes`/`round` (`utils/units.ts` L169, L258); `10 GiB`, `1 GiB` correct.
  - Details labels/order (Status, Requested capacity, Capacity, Access modes, Volume mode, StorageClasses, PersistentVolumes) = OCP L389–484; headings 0 mismatches.
  - Follow-up (not blocking, outside paths, shared): `components/ConditionsTable.tsx` L18 renders "No conditions found" as bare
    text; OCP `conditions.tsx` L93 uses `ConsoleEmptyState` (EmptyState `sm`, `pf-v6-u-pt-xl-on-md`, centred). Probe: ours 14px,
    left, 96px box vs OCP 16px, centred, subtle rgb(77,77,77), margin-top 16px. Now visible on every PVC; fix once for all users.
  - Note (OCP-identical, no action): Conditions "Reason" header truncates when every reason is `-`; OCP's `Th` does the same.
- 2026-11-25 frontend-architect, round 1: **APPROVE** (scoped gate green: lint, typecheck, 84 tests).
  - Deviations accepted: `formatBinaryBytes` is OCP `humanizeBinaryBytes` (list Capacity, details), shared for CP5b;
    Capacity→request fallback is the task contract (OCP shows `-`); Label selector and Conditions always shown match
    OCP L345–350/L502–503 (the task's "if spec.selector" was wrong, OCP wins).
  - `parseQuantity` correct: all contract suffixes, `e`/`E` exponent (and `1e3Gi` rejected, as k8s), sign, `.5`, overflow
    → `undefined`, garbage/`10GB`/`10 Gi` → `undefined`.
  - Nit (optional, CP5b): add k8s `n`/`u` suffixes before node/metrics reuse; `index.ts` export order.
  - Mock `quantityBytes` (fixtures L362–378) → `parseQuantity`: moved to T-0308 (it owns `settlePvcResize`'s behaviour).

## Handover notes
- Sizes render as OCP does (`10 GiB` via `formatBinaryBytes`), in list Capacity and details Requested capacity/Capacity.
- Kept spec/task deviations from OCP: Created column and Capacity falling back to the request (OCP shows `-`).
- "Label selector" always shown (OCP), "No selector" when empty; links to the PV list `?label=`.
- Conditions section always shown (OCP); "No conditions found" when empty.
- Follow-up: `mocks/k8s/networkingStorageFixtures.ts` still has its own `quantityBytes` for `settlePvcResize`;
  could use `parseQuantity` (out of this task's paths).
- Seeding the PV shifts later fixture uids by one (no test depended on them).
