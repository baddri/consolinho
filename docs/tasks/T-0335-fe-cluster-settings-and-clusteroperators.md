---
id: T-0335
title: Cluster Settings (Details, ClusterOperators tabs) and ClusterOperator details — read-only
status: todo
owner: frontend-engineer
checkpoint: 5b
depends_on: [T-0331]
paths: [web/src/features/resources/cluster-settings, web/src/features/resources/registry/kinds/clusteroperators.tsx, web/src/features/resources/routes.tsx, web/src/mocks/k8s/clusterFixtures.ts]
review_rounds: 0
---

## Goal
Lane O step 1: CS-1..3 — OCP's Cluster Settings page at `/c/<cluster>/settings/cluster` and the ClusterOperator kind.

## Scope
- In: Cluster Settings page (heading "Cluster Settings", tabs Details · ClusterOperators), its routes, the
  ClusterOperator descriptor (list columns, details, Related objects tab), status icon component.
- Out: Configuration tab, Update / Select a version / channel edit buttons (Q9, parity gaps); MachineConfigPools.

## Contract / design notes
- **Routes** (`routes.tsx`, under `c/:cluster`): `settings/cluster` (Details) and `settings/cluster/clusteroperators`,
  lazy page in `cluster-settings/ClusterSettingsPage.tsx`; tabs are router links like the engine details tabs. Path
  builder `clusterSettingsPath` exists (T-0331). Cluster without `config.openshift.io` → the engine's not-served state.
- **Data**: `useClusterVersion(cluster)` = `k8sGet(ClusterVersionModel, 'version')` + watch (existing single-object
  hook if the engine has one; key `['k8s', cluster, 'get', ClusterVersionModel key, 'version']`).
  T-0336 imports `useClusterVersion` and the CO status label directly from `cluster-settings/` (same feature, no barrel).
- **Details tab** (CS-2, OCP `cluster-settings.tsx` `ClusterSettingsPage` details, `cluster-version.tsx`):
  DescriptionList: Current version (`clusterVersionFacts().currentVersion`), Update status (from
  `shared/health:clusterUpdate` + OCP copy: "Up to date", "Available updates", "Updating to `<v>`" with the
  Progressing condition message as progress text, "Failing" with the Failing message), Channel (`spec.channel`,
  "Not configured" when empty), Cluster ID (`spec.clusterID`), Available versions (sorted list of
  `status.availableUpdates[].version`, read-only). "Update history" `Table` compact: Version, State, Started,
  Completed (`status.history`, Timestamp component). Forbidden read → inline Alert in the tab, not a blank page.
- **ClusterOperators tab** (CS-3, OCP `ClusterOperatorTabPage` / `ClusterOperatorList`): the generic list body for
  `ClusterOperatorModel` embedded in the tab (`ResourceListPage`'s table part — reuse the same pattern
  ResourcePodsTab uses to embed a list; no heading). Columns Name, Status (`OperatorStatusIconAndLabel` equivalent:
  `shared/health:clusterOperatorStatus` + OCP icons), Version (`clusterOperatorVersion`), Message (Progressing
  message when progressing, else Degraded/Available message as OCP `getStatusAndMessage`). **Default sort Name
  (parity wins over the CS-3 fleet tweak; OCP `cluster-operator.tsx` sorts by name)**; Status sortable by
  `HEALTH`-like severity (Degraded, Unavailable, Cannot update, Progressing, Unknown, Available). Status filter.
- **ClusterOperator descriptor** (`readOnly`, no `nav`): details = Status, Version, Message + Conditions table;
  tabs Details · YAML · Related objects (`KindTabs['related-objects']`): `status.relatedObjects` rows Name, Resource,
  Group, Namespace — `ResourceLink` when the registry has a descriptor for the group/resource, text otherwise
  (OCP `related-objects.tsx`). Breadcrumb "Cluster Settings > ClusterOperator details" as OCP.
- Fixture tweaks (operator messages, history entries) go in `clusterFixtures.ts` (Lane O owns it).

## Context pack
- Docs: spec §5b.3 CS-1..3, §7 Q9; FRONTEND.md § Routing, § The resource registry.
- Exemplars: `features/resources/events/` (non-kind page under `c/:cluster` with lazy route); `details/ResourcePodsTab.tsx`
  (embedded list); `components/ConditionsTable.tsx`; `registry/kinds/persistentvolumes.tsx` (descriptor with sections).
- Touch points: `shared/health/{clusterHealth,facts}.ts` (T-0330); `paths.ts:clusterSettingsPath` (T-0331).
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/cluster-settings/cluster-settings.tsx`
  (CurrentVersion, CurrentChannel, UpdatesProgress, ClusterOperatorTabPage L1783, tabs L1811–1823),
  `cluster-version.tsx`, `cluster-status.tsx`, `cluster-operator.tsx` (OperatorStatusIconAndLabel,
  ClusterOperatorList, ClusterOperatorDetails), `related-objects.tsx`.

## Acceptance criteria
- [ ] CS-1: Administration > Cluster Settings opens Details; tab ClusterOperators at its own URL; hidden on `prod-k8s-1`.
- [ ] CS-2: version, update status per scenario (`staging-eu-1` Updating, `prod-eu-1` Available updates), channel, cluster ID, history table; no update buttons.
- [ ] CS-3: CO list columns/sort/filter; `dev-2` shows a Degraded operator; CO details with Conditions and Related objects; no Edit/Delete.
- [ ] Tests: update-status rendering per scenario, CO list sort by status, related-object link vs text.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
