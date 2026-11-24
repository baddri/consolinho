---
id: T-0306
title: StorageClasses and PersistentVolumes — lists and details (SC-1, PV-1)
status: done
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
- [x] SC-1: `standard-csi` shows the Default marker; details show binding mode, Allow volume expansion `true`, Parameters.
- [x] PV-1: list rows for the four fixtures with status icons and claim links; `pv-db-data` details show `csi: csi.example.com` and node affinity; `pv-uploads` shows `nfs: nfs.example.com:/exports/uploads`.
- [x] `isDefaultClass`, `allowsExpansion`, `pvSource` unit tests.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-25 frontend-engineer: started; OCP `storage-class.tsx` / `persistent-volume.tsx` read.
- 2026-11-25 frontend-engineer: SC + PV descriptors, details, helpers, tests done. No `Status.tsx` word added: OCP's
  `Status` has no Available/Released branch either (text only), Bound/Pending/Failed/Terminating already mapped.
  UI probe ran ours-only (OCP ref console not on :9000): Default marker 12px, ml 3px, subtle, nowrap = OCP SCSS.

## Review
- 2026-11-25 ux-designer, round 1: **APPROVE**. Probed against the reference console on :9000 (gp3-csi, a Bound PV), light, 1280.
  - SC list: the "– Default" marker matches OCP `storage-class.tsx` `StorageClassTableRow` + `_resource.scss` `.co-resource-item__help-text`. The probe found 0 mismatches on font-size, margin-left, colour or nowrap. The only extra column is Created, which the spec asked for.
  - SC details: grid, DL gaps and left-column Provisioner match OCP `StorageClassDetails`. Right column has the same order as OCP plus Allow volume expansion (spec). The right column is 272 vs 198 px tall only because of that extra row. Parameters uses the shared `DetailsSubsection` with a compact Key/Value table. Accepted.
  - PV list: Status uses the shared `Status` (Bound shows the green check, the same as OCP `Status.tsx` L98). Claim link and the "No claim" subtle text match OCP `persistent-volume.tsx` L73–83. Column order matches L44–51.
  - PV details: Reclaim policy sits in the summary column and the right column follows `PVDetails` L184–226 in order and labels ("PersistentVolumeClaim", "Filesystem", "None"). The spec adds Node affinity and Source; OCP's "NFS-export" (CSI `volumeAttributes.share`) is covered by Source.
  - Non-blocking, shared code outside this task: OCP's `.co-resource-item` is `display:flex`, so its name `<a>` is 21px tall (block). Ours renders the `<a>` inline at 18px, which makes PF's dashed link underline more visible under SC/PVC links in DLs. Raise it as a `ResourceLink` follow-up if wanted.
- 2026-11-25 frontend-architect, round 1: **APPROVE**. ACs met; OCP placement deviations (SC Provisioner / PV Reclaim
  policy in the metadata column) are justified. `check-fe.sh src/features/resources/storage`: lint/typecheck ok, 11 tests pass.
- `quantityBytes` duplicates T-0307's planned `shared/k8s/quantity.ts:parseQuantity`: move **later**, in T-0307 (it owns
  that file and is `todo`); T-0307 now carries the swap + deletion. Not a blocker here.
- Nit (optional): `PersistentVolumeDetails.tsx` Node affinity `key={line}` collides if two ORed terms repeat a requirement — use the index.
- Nit (optional): `PersistentVolumeSummaryExtra` renders an empty value when `persistentVolumeReclaimPolicy` is unset; DASH would match other rows.

## Handover notes
- Code: `storage/storageclasses/{storageClass.ts,StorageClassDetails.tsx}` (exports `isDefaultClass`, `allowsExpansion`
  for T-0308), `storage/persistentvolumes/{persistentVolume.ts,PersistentVolumeDetails.tsx}` (`pvSource`, `pvSourceText`,
  `nodeAffinityLines`, `pvPhase`, `quantityBytes`, `PvClaimLink`); descriptors in `registry/kinds/`.
- Placement follows OCP where spec and OCP differ: SC Provisioner and PV Reclaim policy sit in the metadata column
  (`summary.Extra`, OCP `ResourceSummary` children); PV right column in OCP `PVDetails` order with label
  "PersistentVolumeClaim", then spec additions Node affinity and Source. SC "Allow volume expansion" + Parameters
  (compact Key/Value table) and list Created are spec additions OCP lacks.
- `quantityBytes` (Capacity sort) is local to PV; if T-0307/T-0308 need quantity parsing, move it to `shared/k8s`.
- Not done: `resizing` PVC fixture still points at unseeded PV `pvc-resizing-0f9e` (fixtures outside my paths) -> T-0307.

