---
id: T-0384
title: Discovery-driven sidebar on Kubernetes — table test over every descriptor/static item vs the kind fixture, DSC-1/3/4 checks (DSC-1..4)
status: todo
owner: frontend-engineer
checkpoint: 5.5
depends_on: [T-0378]
paths: [web/src/features/resources/nav, web/src/features/resources/networking/services/ServiceRoutes.test.tsx, web/src/features/resources/search, web/src/features/resources/overview, web/src/features/resources/list, web/src/features/resources/cluster-settings, web/src/features/fleet/overview]
review_rounds: 0
---

## Goal
Pin down that a vanilla Kubernetes cluster gets an OCP-shaped sidebar with only what it serves (spec DSC-1), that a
future OpenShift-only kind or static item can't slip in ungated (DSC-2), and that unserved URLs and cross-links behave
(DSC-3/4). Most gating exists since CP3.7; this task is mainly tests, fixing only what they expose.

## Scope
- In: extract a pure nav builder; DSC-2 table test against the recorded kind discovery; DSC-1/3/4 RTL tests; fixes for
  any failing case inside the listed paths.
- Out: new kinds (spec Q2); kind e2e (T-0386); changes to list loading (T-0370) or the switcher (T-0371).

## Contract / design notes
- **Refactor** `nav/useClusterNav.ts`: move the body into an exported pure function
  `buildClusterNav(cluster: string, isServed: (model: K8sModel) => boolean): NavSection[]`; `useClusterNav` calls it
  with discovery's `isServed`. Export `STATIC_NAV_ITEMS` (renamed `STATIC_ITEMS`, read-only) for the test. No behaviour change.
- **DSC-2 test** `nav/kindDiscovery.test.ts`: import `web/src/mocks/k8s/fixtures/kind/{api,apis}.json` (T-0377,
  QG55A-2); `isServed(model)` = core (`group === ''`) or the group with `model.version` among the group's `versions`.
  `it.each` over `resourceDescriptors()` with `nav` and over `STATIC_NAV_ITEMS`:
  - item hidden ⇔ its group (descriptor `model.group`, static item `requires?.group`) isn't in the fixture;
  - every descriptor of `''`, `apps`, `batch`, `networking.k8s.io`, `storage.k8s.io` is shown;
  - static items without `requires` must be in an explicit distribution-neutral allowlist (`Overview`, `Search`) —
    a new ungated static item fails the test with a message saying to add `requires`.
- **DSC-1 test** (`buildClusterNav` + kind `isServed`): exact sections/items: Home [Overview, Search, Events],
  Workloads (OCP order without DeploymentConfigs), Networking [Services, Ingresses, NetworkPolicies], Storage
  [PersistentVolumes, PersistentVolumeClaims, StorageClasses], Compute [Nodes], Administration [Namespaces]; no
  Operators section.
- **DSC-3** RTL on a vanilla mock cluster (`prod-k8s-1`): `k8s/ns/shop/routes`, `settings/cluster`,
  `k8s/cluster/projects` show the existing "not served" state (heading/empty state, no crash/blank). Fix only if broken.
- **DSC-4** RTL: Service details on `prod-k8s-1` has no Routes section (`ServiceRoutes` already returns null — pin
  it); Search kind picker lists no Route/Project/DeploymentConfig/ClusterOperator/CSV/Machine(Set); cluster Overview
  shows the Kubernetes version and no ClusterVersion/ClusterOperators/OLM rows; Fleet overview row of `prod-k8s-1` shows
  its `gitVersion` and node-based health without "Restricted" or error cells (mock line `kubernetes()`).

## Context pack
- Docs: `FRONTEND.md` § The resource registry; ADR-0023 §5 (nav from registry), ADR-0032 (discovery wins).
- Touch points: `web/src/features/resources/nav/useClusterNav.ts:useClusterNav`, `STATIC_ITEMS` (L46-70), `SECTIONS`;
  `registry/registry.ts:resourceDescriptors`; `web/src/shared/k8s/discovery.ts:useK8sDiscovery` (L33, see how
  `isServed` matches group/version to mirror it); `networking/services/ServiceRoutes.tsx` (L35);
  `search/SearchPage.tsx` (L49-57); `overview/ClusterOverviewPage.tsx` (L24-53); `list/ResourceListPage.tsx` (not-served
  state); `cluster-settings/ClusterSettingsPage.tsx`; `web/src/features/fleet/overview/cells/RestrictedText.tsx`,
  `ClusterStatusCell.tsx`; mock line `web/src/mocks/fixtures/fleetStatus.ts` (L93).
- Test exemplars: `nav/useClusterNav.test.tsx` (`sectionItems` helper, vanilla cases L133-155),
  `nav/distributionDiscovery.test.tsx`. JSON import: Vite/TS `resolveJsonModule` — check `web/tsconfig*.json` first.
- OCP reference: `/home/bad/works/openshift-console/frontend/packages/console-app/console-extensions.json` (nav order,
  `flags.required`).

## Acceptance criteria
- [ ] DSC-2: table test over every nav descriptor and static item passes; deliberately adding an ungated static item
  or an OpenShift-group descriptor makes it fail (verify locally, note in Work log).
- [ ] DSC-1: exact kind sidebar asserted.
- [ ] DSC-3: three unserved URLs render the not-served state on a vanilla cluster.
- [ ] DSC-4: Service Routes absent, Search kinds served-only, Overview Kubernetes-only rows, Fleet row as specified.
- [ ] `useClusterNav` behaviour unchanged (existing nav tests green).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
