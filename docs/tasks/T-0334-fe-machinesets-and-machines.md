---
id: T-0334
title: MachineSets and Machines lists and details (read-only)
status: todo
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
- [ ] MS-1/2: lists and details as above; MachineSet Machines tab lists only its machines.
- [ ] MS-3: no Edit/Delete actions; YAML read-only with notice.
- [ ] MS-4: `prod-k8s-1` has no Machines/MachineSets nav; direct URL shows the not-served state.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
