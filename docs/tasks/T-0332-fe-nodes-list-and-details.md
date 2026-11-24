---
id: T-0332
title: Nodes list and details (status, roles, schedulable, conditions, addresses, capacity)
status: todo
owner: frontend-engineer
checkpoint: 5b
depends_on: [T-0331]
paths: [web/src/features/resources/compute/nodes, web/src/features/resources/registry/kinds/nodes.tsx, web/src/mocks/k8s/computeFixtures.ts]
review_rounds: 0
---

## Goal
Lane C step 1: NODE-1..3 — the OCP Nodes list and the Node details page, read-only. Actions and the Pods tab are T-0333.

## Scope
- In: list columns/filters/sort, details summary + sections, status cell, roles helper.
- Out: Mark (un)schedulable, Pods tab (T-0333); Memory/CPU/Filesystem/Pods columns and Overview/Configuration/Health
  tabs, Terminal/Logs (Prometheus or node proxy — parity gaps, spec §7 Q6).

## Contract / design notes
- **List** (NODE-2, OCP `NodesPage` minus metrics): Name, Status, Roles, Instance type
  (`node.kubernetes.io/instance-type`), Zone (`topology.kubernetes.io/zone`), Architecture (`kubernetes.io/arch` /
  `status.nodeInfo.architecture`), Created; low-priority columns per UX.md §5. Status cell = Ready / Not Ready /
  Unknown via `shared/health:nodeReadiness` (OCP `NodeStatus.tsx` icons) + second line "Scheduling disabled" when
  `isUnschedulable` (OCP `SchedulableStatus.tsx`). Roles = `node-role.kubernetes.io/<r>` labels, sorted, comma-joined
  (`getNodeRoles`). Filters: Status, Roles. Default sort Name. Memory/CPU/Filesystem/Pods omitted (Q6 gap).
- **Details** (NODE-3): left = common metadata + Taints, Provider ID (`spec.providerID`), Machine (link from the
  `machine.openshift.io/machine` annotation `<ns>/<name>`, OpenShift only); right = Status, Roles, Addresses
  (`NodeIPList` types), Operating system / OS image, Architecture, Kernel version, Kubelet version, Container
  runtime (`status.nodeInfo`), Boot time (derive exactly as OCP `NodeDetailsOverview.tsx` does). Sections: "Conditions" (`ConditionsTable` incl. Message) and
  "Capacity and allocatable" *(fleet)*: rows CPU, Memory (`formatBinaryBytes`), Ephemeral storage, Pods; columns
  Capacity, Allocatable.
- Tabs: Details · YAML · Events (`hasEventsTab`); Pods (between YAML and Events) joins in T-0333.
- Fixture tweaks for the scenarios belong in `computeFixtures.ts` (owned by Lane C from now on).

## Context pack
- Docs: spec §5b.1 NODE-1..3; FRONTEND.md § The resource registry.
- Exemplars: `registry/kinds/persistentvolumes.tsx` (cluster-scoped kind with summary + sections);
  `components/ConditionsTable.tsx`; `shared/k8s/quantity.ts:formatBinaryBytes`.
- Touch points: `shared/health/facts.ts:nodeReadiness`, `isUnschedulable` (T-0330); `registry/kinds/nodes.tsx` (T-0331 minimal).
- OCP reference: `/home/bad/works/openshift-console/frontend/packages/console-app/src/components/nodes/NodesPage.tsx`,
  `NodeDetailsOverview.tsx`, `NodeDetailsConditions.tsx`, `NodeIPList.tsx`, `NodeRoles.tsx`, `NodeStatus.tsx`,
  `status/SchedulableStatus.tsx`; `packages/console-shared/src/selectors/node.ts:getNodeRoles`.

## Acceptance criteria
- [ ] NODE-1/2: Compute > Nodes; list columns/filters as above; `dev-2` shows a Not Ready worker.
- [ ] NODE-3: details left/right columns, Machine link only when annotated (absent on `prod-k8s-1`), Conditions, Capacity and allocatable.
- [ ] Tests: status cell (Ready / Not Ready / Unknown / Scheduling disabled), roles helper, list filter, details render (MSW).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
