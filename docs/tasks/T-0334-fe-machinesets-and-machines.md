---
id: T-0334
title: MachineSets and Machines lists and details (read-only)
status: done
owner: frontend-engineer
checkpoint: 5b
depends_on: [T-0333]
paths: [web/src/features/resources/compute/machinesets, web/src/features/resources/compute/machines, web/src/features/resources/registry/kinds/machinesets.tsx, web/src/features/resources/registry/kinds/machines.tsx, web/src/mocks/k8s/computeFixtures.ts]
review_rounds: 0
---

## Goal
Lane C step 3: MS-1..4 — the OCP MachineSet and Machine pages, read-only (Q7: no scaling).

## Scope
- In: both lists, both details, MachineSet "Machines" tab (`KindTabs.machines`), Machine→Node link.
- Out: Edit machine count, autoscaler, Machine delete (descriptors are `readOnly`, T-0331) — parity gaps.

## Contract / design notes
- **MachineSets list** (OCP `MachineSetPage`): Name, Namespace, Machines ("`<R>` of `<D>` machines", linking to Machines filtered by
  the set's selector), Instance type (`spec.template.spec.providerSpec.value.instanceType` — read defensively, it is
  provider-specific), CPU / Memory (`machine.openshift.io/vCPU` / `memoryMb` annotations, OCP `CPUCell`/`MemoryCell`),
  Created. Default namespace `openshift-machine-api` is just the active-namespace behaviour; no special casing.
- **MachineSet details**: summary + Desired / Current / Ready / Available counts (OCP `MachineCounts`), Selector,
  Instance type, Region, Zone. Tabs Details · YAML · Machines · Events.
  Machines tab = Machines list filtered by `spec.selector.matchLabels` (reuse the Machine columns component).
- **Machines list** (OCP `MachinePage`): Name, Namespace, Node (`status.nodeRef.name` → Node `ResourceLink`),
  Phase (`status.phase`, `Status` icon mapping: Running ok, Provisioning/Provisioned progress, Failed/Deleting error),
  Provider state (`status.providerStatus.instanceState`), Region / Zone (labels `machine.openshift.io/region`, `/zone`),
  Created. Details: summary + Phase, Provider state, Node, Machine role/type labels, Addresses (`status.addresses`,
  same IP list rendering as T-0332 — import from `compute/nodes` only through a shared component inside `compute/`
  if needed), Conditions.
- Cluster without Machine API: nav hidden (T-0331); direct URL → engine "not served" state (MS-4).

## Context pack
- Docs: spec §5b.2 MS-1..4.
- Exemplars: `registry/kinds/replicasets.tsx` + `workloads/` owner tabs (filtered child list).
- Touch points: `registry/kinds/{machinesets,machines}.tsx` (T-0331 minimal), `KindTabs.machines` (T-0331).
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/machine-set.tsx` (MachineSetPage,
  MachineSetDetails, MachineCounts, CPUCell, MemoryCell), `public/components/machine.tsx` (MachinePage, MachineDetails).

## Acceptance criteria
- [x] MS-1/2: lists and details as above; MachineSet Machines tab lists only its machines.
- [x] MS-3: no Edit/Delete actions; YAML read-only with notice.
- [x] MS-4: `prod-k8s-1` has no Machines/MachineSets nav; direct URL shows the not-served state.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-25 frontend-engineer: MachineSet/Machine descriptors (read-only), `compute/machines` + `compute/machinesets`
  (helpers, details rows, MachineCounts, Machines tab via `fixedSelector`), fixture `instanceState`, 2 test files.
  UI probe: OCP ref renders headings only (no tables/grids load), headings match; layout follows OCP source.
- 2026-11-25 fix round 1: Memory always 2 decimals ("32.00 GiB", OCP), MachinesCell uses `machineCountText`;
  scoped gate `compute` green (35 tests).

## Review
- 2026-11-25 ux-designer, round 1: **CHANGES_REQUESTED** (one finding). Compared to the reference console (live MachineSet/Machines in `openshift-machine-api`) and `machine-set.tsx` / `machine.tsx`.
  Matches: list columns (MachineSets: Name, Machines "R of D machines" linking to the Machines tab, Instance type, CPU, Memory; Machines: Name, Node, Phase, Provider state, Region, Availability zone), Name-only filter, tabs (MS: Details·YAML·Machines·Events; M: Details·YAML·Events), "MachineSet details" + 4 count Cards (probe: card 140x98, dt/dd offsets equal OCP), DL rows and order on both details pages, "Conditions" section, "Provisioned as node" success icon, not-served state on prod-k8s-1. Kebab / Labels Edit absent = Q7 read-only scope.
1. MachineSets list: Memory shows "32 GiB" — OCP `machine-set.tsx` L90 `formatBytesAsGiB` → `utils/units.ts` L453 `Intl.NumberFormat` min/max 2 fraction digits = "32.00 GiB" — format with exactly 2 fraction digits (and fix test `memoryText(7.5)` → "7.50 GiB").
- Note, no change: OCP's MachineSet details breadcrumb reads "MachineSet" (OCP bug: `models/index.ts` `labelPluralKey: 'public~MachineSet'`); ours "MachineSets" stays.
- Round 1 (frontend-architect, 2026-11-25): **APPROVE**. Tests in `compute/` pass (11/11) and lint/typecheck are ok. The
  `router.test` failure comes from T-0336. CPU/Memory from the `vCPU`/`memoryMb` annotations is accepted. OCP derives them
  from Machines+Nodes instead (it has no annotation lookup; the contract's attribution was wrong), but those annotations
  are set by the Machine API on AWS/Azure/GCP, the result is the same, and DASH covers the rest. The descriptors, the
  selector-scoped Machines tab, read-only actions and the fixture match the contract.
  - `shared/k8s/index.ts:12` — the `k8sGetPath` export is T-0336's (used only by `overview/useOverviewData.ts`), not this task; commit it with T-0336.
  - Optional: `compute/machinesets/MachineSetDetails.tsx:61` — rebuilds the plural that `machineCountText` already provides; reuse it.
  - Optional: the follow-ups in the Handover (add `instanceState` to the shared `Machine` type; one shared addresses component under `compute/`) are worth filing as tasks.
- 2026-11-25 ux-designer, round 2: **APPROVE**. Finding 1 fixed: the MachineSets list Memory column (alice/prod-eu-1, `openshift-machine-api`) reads "32.00 GiB | 32.00 GiB" (probe), matching OCP `utils/units.ts` L453.

## Handover notes
- Columns mirror OCP: Machines = Name, Namespace, Node, Phase, Provider state, Region, Availability zone;
  MachineSets = Name, Namespace, Machines ("R of D machines" -> Machines tab), Instance type, CPU, Memory. No Created (as OCP).
- Decision (recommended option): CPU/Memory read the `machine.openshift.io/vCPU` / `memoryMb` annotations instead of
  OCP's watch of all Machines+Nodes (no N+1); dash when absent.
- Phase Running shows "Provisioned as node" (OCP); `Provisioning`/`Provisioned` have no Status icon mapping (text only).
- MachineCounts: Desired count is plain text (read-only, spec Q7), Current/Ready/Available with OCP tooltip copy.
- Follow-ups: `instanceState` is not on the shared `Machine` type (read defensively in `machine.ts`) - add it in
  shared/k8s; Machine addresses rendering duplicates the Node one - share it under `compute/`.
- Gate 2026-11-25: lint/typecheck/build ok, 1550/1551 tests; the one failure `app/router.test.tsx` "keeps overview as an
  unlisted placeholder" comes from T-0336's in-flight overview route change, not this task.
