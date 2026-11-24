---
id: T-0331
title: CP5b foundation — registry extensions, Operators/Compute nav, minimal descriptors, MSW fixtures
status: todo
owner: frontend-engineer
checkpoint: 5b
depends_on: [T-0330]
paths: [web/src/features/resources/registry/registry.ts, web/src/features/resources/registry/types.ts, web/src/features/resources/registry/kinds/nodes.tsx, web/src/features/resources/registry/kinds/machines.tsx, web/src/features/resources/registry/kinds/machinesets.tsx, web/src/features/resources/registry/kinds/clusteroperators.tsx, web/src/features/resources/registry/kinds/clusterserviceversions.tsx, web/src/features/resources/registry/kinds/kinds.test.tsx, web/src/features/resources/nav, web/src/features/resources/details/useResourceTab.ts, web/src/features/resources/details/ResourceDetailsPage.tsx, web/src/features/resources/routes.tsx, web/src/features/resources/paths.ts, web/src/features/resources/index.ts, web/src/features/resources/actions/useResourceActions.tsx, web/src/features/resources/yaml/ResourceYamlTab.tsx, web/src/features/resources/list/ResourceListPage.tsx, web/src/mocks/k8s, docs/architecture/FRONTEND.md]
review_rounds: 0
---

## Goal
T-0300's role for CP5b: every engine change, nav entry, minimal descriptor and mock object the two CP5b lanes need,
done once so Lane C (compute) and Lane O (cluster/operators) own disjoint files afterwards.

## Scope
- In: four registry extensions, Operators + Compute sections, Home "Overview" and Administration "Cluster Settings"
  static items, five minimal descriptors, path builders, MSW fixtures/discovery, FRONTEND.md lines.
- Out: kind columns/details/actions (T-0332…T-0337); Overview and Cluster Settings pages and their routes (T-0335,
  T-0336 own `routes.tsx` additions for them — this task only adds the new **tab** routes).

## Contract / design notes
- **Registry extensions** (`registry/types.ts`, documented in FRONTEND.md § The resource registry; no ADR — same
  mechanism as ADR-0037 §2/§3):
  - `readOnly?: true` — MS-3/OLM-5/UX §5 "Read-only kinds": `useResourceActions` returns kind items only (no Edit
    labels/annotations/<Kind>, no Delete); `ResourceYamlTab` renders read-only with OCP's read-only notice (copy from
    OCP `public/components/edit-yaml.tsx` `readOnly` alert), regardless of access.
  - Tabs: `KindTab` += `'machines' | 'subscription' | 'related-objects'`; `RESOURCE_TABS` = `details, yaml,
    replicasets, replicationcontrollers, machines, subscription, related-objects, pods, jobs, logs, events, terminal`
    (OCP MachineSet Details·YAML·Machines·Events, CSV Details·YAML·Subscription·Events, ClusterOperator
    Details·YAML·Related objects). Static lazy route per tab in `routes.tsx` (segments = ids), gated by `hasTab`.
    The tab body comes from a descriptor component: `KindTabs?: Partial<Record<'machines' | 'subscription' |
    'related-objects', (props: { cluster: string; obj: T }) => ReactNode>>` (same shape as `PodsTab`); `hasTab` =
    listed in `extraTabs` **and** has a component.
  - `allNamespacesLabelSelector?: string` — sent as `labelSelector` on the all-namespaces list/watch only, ANDed with
    the user's label filter (OLM-1 `!olm.copiedFrom`). Wire in `ResourceListPage.tsx` where the list options are built.
- **Nav** (`nav/useClusterNav.ts`): `SECTIONS` = Home, **Operators**, Workloads, Networking, Storage, **Compute**,
  Administration (OCP `console-extensions.json` order). Items: Operators = Installed Operators 10; Compute = Nodes 10,
  Machines 20, MachineSets 30. `StaticNavItem` gets `requires?: K8sModel` (hidden unless discovery serves it); add
  Home "Overview" order 0 → `clusterOverviewPath(cluster)` and Administration "Cluster Settings" (order: before
  Namespaces, as OCP) → `clusterSettingsPath(cluster)`, `requires: ClusterVersionModel`. Machine API / OLM / config
  groups disappear on clusters not serving them (MS-4, OLM-1, CS-1) through the existing discovery filter.
- **Paths** (`paths.ts`, exported from `features/resources/index.ts` for the fleet page): `clusterOverviewPath(cluster)`
  → `/c/<cluster>/overview`; `clusterSettingsPath(cluster, tab?: 'clusteroperators')` → `/c/<cluster>/settings/cluster[/clusteroperators]`.
- **Minimal descriptors** `registry/kinds/{nodes,machines,machinesets,clusteroperators,clusterserviceversions}.tsx`
  (`nameColumn`, `namespaceColumn` where namespaced, `ageColumn`; `readOnly: true` on machines, machinesets,
  clusteroperators, CSVs; clusteroperators has **no `nav`** (reached from Cluster Settings); CSV
  `allNamespacesLabelSelector: '!olm.copiedFrom'`). Register in nav order. TSDoc "filled in by T-03xx".
  No descriptor for ClusterVersion, Infrastructure, Subscription, InstallPlan (read via hooks only).
- **Mocks** — two new files so the lanes own them afterwards: `mocks/k8s/computeFixtures.ts` (Nodes, node pods,
  Machines, MachineSets — Lane C) and `mocks/k8s/clusterFixtures.ts` (ClusterVersion, ClusterOperators,
  Infrastructure, OLM — Lane O), each called from `seedClusterObjects` (one call line each in `fixtures.ts`).
  Add `config.openshift.io`, `machine.openshift.io`, `operators.coreos.com` to `apiServer.ts:OPENSHIFT_GROUPS`
  (`prod-k8s-1` serves none). Per cluster: 3 control-plane + 3 worker Nodes (labels role, instance type, zone, arch;
  nodeInfo; capacity/allocatable; addresses; `machine.openshift.io/machine` annotation), a DaemonSet-owned pod, a
  ReplicaSet-owned pod and one bare pod per worker (`spec.nodeName`; NODE-4); ClusterVersion `version` (history,
  channel, clusterID, availableUpdates 2), ~8 ClusterOperators, Infrastructure `cluster` (platform, apiServerURL),
  2 MachineSets + Machines in `openshift-machine-api` (vCPU/memoryMb annotations), CSVs: one Succeeded in
  `openshift-operators` copied into two namespaces (`olm.copiedFrom` label), one Failed, one Installing; matching
  Subscriptions + an InstallPlan awaiting manual approval. Kubernetes `prod-k8s-1`: Nodes only.
  **Scenarios mirror the MSW fleet table (T-0341):** `dev-2` one worker NotReady + one operator Degraded;
  `staging-eu-1` ClusterVersion Progressing (Updating to the next version); `prod-us-1` ClusterOperators forbidden
  for the mock RO persona (`rbac.ts`); others healthy. Fake icon = tiny inline `data:image/svg+xml;base64,…`.
- Node patch needs no mock code (generic JSON Patch, ADR-0037 §8); check `fieldSelector=spec.nodeName=` and
  `status.phase=` work on pods (generic dotted paths in `selectors.ts`).

## Context pack
- Docs: FRONTEND.md § The resource registry, § Routing; ADR-0037 §1–§3; T-0300 (same shape).
- Exemplars: `registry/kinds/storageclasses.tsx` (minimal cluster-scoped descriptor), `mocks/k8s/networkingStorageFixtures.ts`.
- Touch points: `registry/types.ts:KindTab` (L62), `PodsTab` (L138), `ListActions` (L173); `details/useResourceTab.ts:RESOURCE_TABS`;
  `details/ResourceDetailsPage.tsx:hasTab` (L46); `nav/useClusterNav.ts:SECTIONS` (L23), `STATIC_ITEMS` (L40);
  `actions/useResourceActions.tsx` common items (L77); `yaml/ResourceYamlTab.tsx` `isReadOnly` (L91);
  `mocks/k8s/apiServer.ts:OPENSHIFT_GROUPS` (L66); `mocks/k8s/fixtures.ts:seedClusterObjects`.
- OCP reference: `/home/bad/works/openshift-console/frontend/packages/console-app/console-extensions.json` L940–1000
  (section order), L1083 (Installed Operators), L1518–1600 (Compute), L1722 (Cluster Settings).

## Acceptance criteria
- [ ] Sidebar on an OpenShift mock cluster: Home(Overview first) · Operators · Workloads · Networking · Storage · Compute · Administration(Cluster Settings); `prod-k8s-1` has no Operators, Machines, MachineSets, Cluster Settings.
- [ ] Read-only kind: fake descriptor test shows no common actions and a read-only YAML editor with the notice.
- [ ] New tab: fake descriptor with `extraTabs: ['machines']` + `KindTabs.machines` renders the tab at `/machines`; without the component no tab.
- [ ] `allNamespacesLabelSelector` sent only for all-namespaces (MSW request assertion); copied CSVs absent there.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
