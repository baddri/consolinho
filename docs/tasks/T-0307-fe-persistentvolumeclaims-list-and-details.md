---
id: T-0307
title: PersistentVolumeClaims — list, status filter, details with Conditions and Pods (PVC-1, PVC-2)
status: todo
owner: frontend-engineer
checkpoint: 5a
depends_on: [T-0306]
paths: [web/src/features/resources/registry/kinds/persistentvolumeclaims.tsx, web/src/features/resources/storage/pvcs, web/src/shared/k8s/quantity.ts, web/src/shared/k8s/quantity.test.ts, web/src/shared/k8s/index.ts]
review_rounds: 0
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

## Context pack
- Exemplars: `registry/kinds/jobs.tsx` (status + filters wiring); `workloads/pods/PodStatus.tsx` L28 (`useActiveCluster`
  inside a details item); `RowFilter` in `registry/types.ts`.
- Touch points: `registry/kinds/persistentvolumeclaims.tsx` (minimal, T-0300); `shared/k8s/index.ts` (export
  `parseQuantity`).
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/persistent-volume-claim.tsx`
  (L110–160 cells, L207–231 columns, L367–510 details, L520–546 filter).

## Acceptance criteria
- [ ] PVC-1: columns as OCP minus Used; Status filter Pending/Bound/Lost works via `?status=`.
- [ ] PVC-2: details rows per OCP labels; Conditions section for `resizing`; Pods item for `db-data`.
- [ ] `parseQuantity` and `podsMountingClaim` unit tests.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
