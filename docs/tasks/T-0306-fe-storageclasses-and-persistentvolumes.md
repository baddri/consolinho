---
id: T-0306
title: StorageClasses and PersistentVolumes — lists and details (SC-1, PV-1)
status: todo
owner: frontend-engineer
checkpoint: 5a
depends_on: [T-0300]
paths: [web/src/features/resources/registry/kinds/storageclasses.tsx, web/src/features/resources/registry/kinds/persistentvolumes.tsx, web/src/features/resources/storage/storageclasses, web/src/features/resources/storage/persistentvolumes]
review_rounds: 0
---

## Goal
The two cluster-scoped storage kinds get OCP's columns and details, so Marco sees the default StorageClass, whether
it allows expansion, and which claim holds which volume.

## Scope
- In: both descriptors' columns, status, details right columns, Parameters section.
- Out: StorageClass create form, "Set as default" (backlog); PV create; VolumeAttributesClass rows.

## Contract / design notes
- **StorageClass** (OCP `public/components/storage-class.tsx`): list Name (+ OCP's "– Default" marker when
  `isDefaultClass`: `storageclass.kubernetes.io/is-default-class` **or** the beta annotation = `"true"` — copy OCP's
  markup/classes from `StorageClassTableRow`), Provisioner, Reclaim policy (default `Delete`), Created. Details right
  column (OCP `StorageClassDetails`): Provisioner, Reclaim policy, Volume binding mode (default `Immediate`), Allow volume
  expansion (`true`/`false`, as OCP prints it), Default class. `ExtraSections`: "Parameters" key/value — compact
  `Table` or `DescriptionList`, whichever OCP uses. Pure helpers in `storage/storageclasses/storageClass.ts`:
  `isDefaultClass(sc)`, `allowsExpansion(sc)` — **export both**; T-0308 imports `allowsExpansion`.
- **PersistentVolume** (OCP `public/components/persistent-volume.tsx` L120–147 + `PVDetails`): list Name, Status
  (`status.phase` via descriptor `status`; Available / Bound / Released / Failed / Pending use the shared `Status`
  icons — add a word to `Status.tsx` only if missing, and say so in the Work log), Claim (`ResourceLink` to
  `claimRef.namespace/name` PVC, "No claim"-style placeholder copied from OCP), Capacity (`spec.capacity.storage`),
  Labels, Created. Details right column: Reclaim policy, Access modes, Volume mode, StorageClass (`ResourceLink`),
  Claim, Node affinity (plain text `key op values` lines), and the source type — pure
  `pvSource(pv): { type: string; detail: string }` (`csi: <driver>`, `nfs: <server>:<path>`, `hostPath: <path>`,
  `local: <path>`, else the first `spec` key that is a volume source) with unit tests.
- Cluster-scoped: no project bar, `/k8s/cluster/<plural>` (generic engine). Tests in each kind folder.

## Context pack
- Exemplars: `registry/kinds/namespaces.tsx` (cluster-scoped descriptor + `phaseStatus`); `registry/kinds/services.tsx`
  (`DetailsSection`/`ExtraSections`); `components/ResourceLink.tsx:ResourceLink`.
- Touch points: `registry/kinds/{storageclasses,persistentvolumes}.tsx` (minimal, T-0300); `shared/ui/Status.tsx` word table (read-only unless a word is missing).
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/storage-class.tsx` (L41–62 default
  helpers, L122–128 columns, `StorageClassDetails`), `public/components/persistent-volume.tsx` (L120–147, `PVDetails`).

## Acceptance criteria
- [ ] SC-1: `standard-csi` shows the Default marker; details show binding mode, Allow volume expansion `true`, Parameters.
- [ ] PV-1: list rows for the four fixtures with status icons and claim links; `pv-db-data` details show `csi: csi.example.com` and node affinity; `pv-uploads` shows `nfs: nfs.example.com:/exports/uploads`.
- [ ] `isDefaultClass`, `allowsExpansion`, `pvSource` unit tests.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
