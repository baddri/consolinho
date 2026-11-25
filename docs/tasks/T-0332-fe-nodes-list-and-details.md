---
id: T-0332
title: Nodes list and details (status, roles, schedulable, conditions, addresses, capacity)
status: done
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
- [x] NODE-1/2: Compute > Nodes; list columns/filters as above; `dev-2` shows a Not Ready worker.
- [x] NODE-3: details left/right columns, Machine link only when annotated (absent on `prod-k8s-1`), Conditions, Capacity and allocatable.
- [x] Tests: status cell (Ready / Not Ready / Unknown / Scheduling disabled), roles helper, list filter, details render (MSW).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-25 frontend-engineer: started; read OCP nodes components, registry descriptor, compute fixtures.
- 2026-11-25 frontend-engineer: `compute/nodes/` (helpers, NodeStatus, NodeDetails) + full `nodes.tsx` descriptor;
  dev-2 worker-3 now Ready=False (KubeletNotReady, `not-ready` taint) so it reads "Not Ready"; 15 tests; probe run
  (list rows match OCP height; column widths differ only by the omitted metric columns). In review.
- 2026-11-25 fix round 1: registry `DetailsOverview` hook; OCP-ordered node overview, node-local compact conditions,
  compact capacity; Unknown → Not Ready; cordoned dev-1 worker-2 mock; T-0348 cancelled; spec NODE-3 updated. In review.

## Review
- 2026-11-25 ux-designer round 1: **CHANGES_REQUESTED** (probe: ours mock prod-eu-1 as alice vs ref `core~v1~Node`; OCP = `packages/console-app/src/components/nodes/`).
  1. Details: layout. OCP `NodeDetailsOverview.tsx` doesn't use ResourceSummary. Left: Node name, Status, External ID, Uptime, Node addresses, Labels, Taints, Annotations, Machine, Provider ID, Unschedulable (only when `spec.unschedulable` is set), Created. Right: Operating system, OS image, Architecture, Kernel version, Boot ID, Container runtime, Kubelet version, Kube-proxy version. Ours has an Owner row and a Roles row that OCP lacks, "Name" and "Created at" labels, Annotations before Taints, and Status/addresses in the right column. Fix: a descriptor option that replaces the summary grid (frontend-architect to agree), then reproduce that order. Also correct the spec NODE-3 wording.
  2. Details: copy. "Boot time" should be **"Uptime"**, as OCP (`getNodeUptime`, the Ready `lastTransitionTime`). The value is not a boot time, so the current label is wrong.
  3. Details: missing rows. Boot ID (`status.nodeInfo.bootID`, between Kernel version and Container runtime), Kube-proxy version (after Kubelet version), External ID (`spec.externalID`) and Unschedulable (OCP text-capitalize `true`/`false`). Ref shows all four.
  4. Details: count copy. The page shows "1 annotation" next to "0 Taints". OCP node uses `{{n}} Annotations` / `{{n}} Taints` (ref: "31 Annotations"). Fixed by item 1.
  5. Conditions: heading should be **"Node conditions"** (`NodeDetailsConditions.tsx`). The table should be `variant="compact"`: probe td padding ours 16px vs OCP 8px 16px, row 54 vs 38px, th 16px vs 12px 16px 8px. Columns should be Type, Status, Reason, Updated (`lastHeartbeatTime`), Changed (`lastTransitionTime`), with no Message. Fix: a local `NodeConditionsTable` in `compute/nodes` (in paths). Don't change the shared ConditionsTable, because OCP's generic Conditions is not compact.
  6. Capacity and allocatable *(fleet)*: use `variant="compact"` too, so it matches the Node conditions table directly above it.
  7. Status words. OCP `status/node.ts:nodeStatus` only knows Ready / Not Ready, and its filter offers Ready / Not Ready / Discovered. Our "Unknown" is a spec choice: record it as a deviation in `docs/architecture/ocp-parity.md`, or map Unknown to "Not Ready".
  8. Mock: the browser mock has no Not Ready or cordoned node that admin or alice can see (no grant on dev-2), so neither the AC "dev-2 shows a Not Ready worker" nor "Scheduling disabled" can be checked visually. Add a cordoned worker on a granted cluster in `computeFixtures.ts`.
  - OK: list columns and filters as contracted (OCP's default Groups/Machine set/Pods/Memory/CPU are a Q6 gap); Roles sorted and comma-joined (`NodeRoles.tsx`); Status cell second line matches `SecondaryStatus` (xs, subtle); row height 59px = OCP; Node addresses text and spacing match `NodeIPList` + `co-detail-property-list` (probe: 0 diffs); "Node details" heading; Provider ID and Machine link copy.
- 2026-11-25 frontend-architect, round 1: **APPROVE**. `check-fe.sh` (compute, registry, mocks): lint, typecheck,
  167 tests green. Parity checked against OCP `NodesPage`, `NodeDetailsOverview`, `NodeStatus`, `getNodeUptime`, `cloudProviderNames`.
  - Ruling (a): keeping the shared `ConditionsTable` is accepted. Follow-up T-0348 adds OCP's heartbeat Updated and Changed columns.
  - Ruling (b): the copied grant helper is accepted. Follow-up T-0349 moves `grantAdminOn` into `web/src/test/`.
  - Nit (optional): `NodeDetails.tsx` "Boot time" uses the task's label. OCP's label is "Uptime" with the same value. Align if the spec allows.
  - Nit (optional): OCP also shows External ID, Unschedulable, Boot ID and Kube-proxy version rows. They are omitted per the task contract and could go into a later parity pass.
- 2026-11-25 ux-designer round 2: **APPROVE** (probe: mock dev-1 worker-2 as admin vs ref node `ip-10-0-3-203…/details`; source `NodeDetailsOverview.tsx`, `NodeDetailsConditions.tsx`).
  1. Fixed: the overview uses OCP's left/right rows and order. There are no Owner or Roles rows, and the labels are "Node name" and "Created".
  2. Fixed: the row is labelled "Uptime".
  3. Fixed: External ID, Boot ID, Kube-proxy version and Unschedulable (shown only when set; "True" on worker-2) are present.
  4. Fixed: the counts read "1 Taint" and "1 Annotation".
  5. Fixed: "Node conditions" is compact, with Type/Status/Reason/Updated/Changed; probe td/th 38px = OCP 38px.
  6. Fixed: Capacity and allocatable is compact (38px rows).
  7. Fixed (orchestrator decision): Unknown maps to "Not Ready"; the filter offers Ready / Not Ready.
  8. Fixed (orchestrator decision): dev-1 worker-2 shows "Scheduling disabled" under Ready in the list and on the details page (`SecondaryStatus` markup). The status row is 71px vs OCP 50px only because of that extra line.
- 2026-11-25 frontend-architect, round 2 (fix-round code only): **APPROVE**. Scoped `check-fe.sh` (compute, details, registry): 95/95 green on rerun. The first run had one load-related failure in `ResourceDetailsTab.test` "Max surge"; it passes alone.
  - `registry/types.ts:DetailsOverview` and its `ResourceDetailsTab.tsx` branch: accepted as a registry hook (documented; DetailsTop/ExtraSections still render). The T-0332 round-1 rulings (a) and (b) are superseded or kept as follows: T-0348 is cancelled, T-0349 stands.
  - `NodeDetailsOverview.tsx`: row order, copy and the Unschedulable `has` check match OCP `NodeDetailsOverview.tsx:66-238`. `NodeConditionsTable.tsx` is compact with Type/Status/Reason/Updated/Changed, as `NodeDetailsConditions`. The cordoned fixture (`dev-1/worker-2`, `spec.unschedulable` + `unschedulable` taint) is consistent.
  - Nit (optional): `NodeDetailsOverview.tsx:NodeOverviewLeft` repeats `MetadataSection`'s Labels item (ResourceLabels + searchPath link). If a second `DetailsOverview` appears, extract a shared `MetadataLabelsItem`.
  - Nit (optional): `registry/types.ts:DetailsOverview` silently ignores `DetailsSection`/`detailsTitle` when both are set. Say so in the TSDoc.

## Handover notes
- Files: `compute/nodes/{node.ts,NodeStatus.tsx,NodeDetailsOverview.tsx,NodeConditionsTable.tsx,NodeDetails.tsx,nodes.test.tsx}`,
  `registry/kinds/nodes.tsx`, `mocks/k8s/computeFixtures.ts`; registry engine: `registry/types.ts` (+`DetailsOverview`),
  `details/ResourceDetailsTab.tsx` (renders it in place of the metadata/`DetailsSection` grid).
- Details = OCP `NodeDetailsOverview` order and copy (Node name … Created; no Roles/Owner; "N Taints"/"N Annotations";
  Unschedulable only when `spec.unschedulable` set). Labels/Annotations reuse `useMetadataEdit`; Taints plain (T-0333).
- "Node conditions": node-local compact table (Type, Status, Reason, Updated = heartbeat, Changed); T-0348 cancelled.
  Capacity and allocatable is compact too.
- Status as OCP `nodeStatus`: only Ready / Not Ready (Unknown and missing → Not Ready); filter offers both.
- Mocks: dev-1 worker-2 cordoned (`spec.unschedulable` + `unschedulable` taint). The MSW fleet table
  (`mocks/fixtures/fleetStatus.ts`, fleet engineer's file) still says `unschedulable: 0` for dev-1 — align it there.
- No admin grant on dev-2 added: grant fixtures feed admin grant lists/switcher tests; tests use a local `grantAdminOn`.
- Spec NODE-3 line updated to the OCP layout.
