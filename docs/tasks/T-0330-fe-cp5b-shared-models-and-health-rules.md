---
id: T-0330
title: CP5b shared layer — models, types, one-page list read, cluster health rules (FLT-4/OVW-3)
status: todo
owner: frontend-engineer
checkpoint: 5b
depends_on: []
paths: [web/src/shared/k8s/models.ts, web/src/shared/k8s/types.ts, web/src/shared/k8s/index.ts, web/src/shared/k8s/client.ts, web/src/shared/k8s/client.test.ts, web/src/shared/k8s/models.test.ts, web/src/shared/api/types.ts, web/src/shared/health]
review_rounds: 0
---

## Goal
Everything below the UI that CP5b **and** CP5c share, landed first so both lanes and the fleet page build on it:
nine models, their types, a bounded one-page list read for inventory counts (OVW-4), and the **one** implementation
of the cluster health rules (contract §2.1) used by the Overview Status card (OVW-3) and the Fleet overview (FLT-4).

## Scope
- In: models + `K8S_MODELS`, types, `k8sListPage`, generated-type aliases for the fleet stream, `shared/health/`.
- Out: descriptors, nav, mocks (T-0331); any UI.

## Contract / design notes
- **Models** (`shared/k8s/models.ts`, shape of `ReplicaSetModel`; labels/abbr from OCP `public/models/index.ts`):
  Node (`v1`, `nodes`, N, cluster-scoped), Machine (`machine.openshift.io/v1beta1`, `machines`, M), MachineSet (same
  group, `machinesets`, MS), ClusterVersion (`config.openshift.io/v1`, `clusterversions`, CV, cluster), ClusterOperator
  (`config.openshift.io/v1`, `clusteroperators`, CO, cluster), Infrastructure (`config.openshift.io/v1`,
  `infrastructures`, cluster), ClusterServiceVersion (`operators.coreos.com/v1alpha1`, `clusterserviceversions`, CSV),
  Subscription (`operators.coreos.com/v1alpha1`, `subscriptions`, SUB), InstallPlan (`operators.coreos.com/v1alpha1`,
  `installplans`, IP). Add all to `K8S_MODELS`.
- **Types** (`shared/k8s/types.ts`): re-export `Node` from `kubernetes-types/core/v1`; hand-write minimal
  `ClusterVersion`, `ClusterOperator`, `Infrastructure`, `Machine`, `MachineSet`, `ClusterServiceVersion`,
  `Subscription`, `InstallPlan` (only fields CP5b reads; TSDoc pointing at OCP `public/module/k8s/types.ts`
  `ClusterVersionKind` etc. and `packages/operator-lifecycle-manager/src/types.ts`).
- **`k8sListPage<T>(cluster, model, { namespace?, labelSelector?, fieldSelector?, limit }, signal)`** in `client.ts`:
  one request, returns `{ items, continue?, remainingItemCount? }`. **OVW-4 decision:** inventory counts never page
  through all objects. Count = `items.length + remainingItemCount` when the server sends it; otherwise, if `continue`
  is set (the API server omits `remainingItemCount` for selector-filtered lists), the count is the lower bound
  rendered "`<n>`+". Export `INVENTORY_LIMIT = 500` and `pageCount(page): { count: number; exact: boolean }`. Tests.
- **API aliases** (`shared/api/types.ts`): `FleetClusterStatus`, `FleetClusterFailure`, `FleetProbeOutcome`,
  `FleetClusterVersion`, `FleetClusterOperators`, `FleetNodes`, `FleetKubernetesVersion` from the generated schema.
- **`shared/health/`** (new shared module, no feature knowledge; ESLint `shared/*` element already covers it):
  - `clusterHealth.ts` — contract §2.1 verbatim, typed by the generated sections:
    `type ClusterHealthStatus = 'unreachable' | 'tokenInvalid' | 'degraded' | 'updating' | 'restricted' | 'healthy'`;
    `HEALTH_SEVERITY` (FLT-5 order); `type ClusterHealthFacts = Pick<FleetClusterStatus, 'failure' |
    'kubernetesVersion' | 'clusterVersion' | 'clusterOperators' | 'nodes'>`;
    `clusterHealth(facts): { status: ClusterHealthStatus; restricted: RestrictedProbe[] }` (`RestrictedProbe =
    'ClusterVersion' | 'ClusterOperators' | 'Nodes' | 'version'`, every forbidden section, also when a worse status
    wins); `clusterUpdate(cv): { kind: 'failing' } | { kind: 'updating'; version } | { kind: 'available'; count } |
    { kind: 'upToDate' } | undefined` (§2.1 Update cell); `clusterVersionText(facts)` (§2.1 Version cell).
  - `facts.ts` — raw objects → the same facts, so OVW-3 feeds the same function: `clusterVersionFacts(cv)`
    (currentVersion = newest `status.history` entry with state `Completed`, else `status.desired.version`; condition
    booleans null when absent; availableUpdates length), `clusterOperatorFacts(list)`, `nodeFacts(list)`, each with
    `outcome` from the read (`forbidden` on 403, `notFound` on 404). Per-object helpers used by the kind pages:
    `nodeReadiness(node): 'Ready' | 'NotReady' | 'Unknown'` (Ready condition True / False / else), `isUnschedulable`,
    `clusterOperatorStatus(co): 'Available' | 'Progressing' | 'Degraded' | 'Cannot update' | 'Unavailable' | 'Unknown'`
    (OCP `getStatusAndMessage` order; `Cannot update` = `Upgradeable False` — check OCP's enum) +
    `clusterOperatorVersion(co)`.
  - Tests: **table-driven** over FleetClusterStatus sections (one row per §2.1 rule incl. "worst wins" ties and
    Restricted alongside Degraded) and over raw ClusterVersion/ClusterOperator/Node fixtures (QG5B-1). Keep fixtures
    inline in the test (the MSW ones land in T-0331).
- Pure functions only: no hooks, no React, no PatternFly in `shared/health` (icons/text mapping is per page).

## Context pack
- Docs: `docs/specs/CP5-api-contract.md` §2, §2.1 (the rule table is the spec); FRONTEND.md § Data fetching rules.
- Exemplars: `shared/k8s/models.ts:ReplicaSetModel`, `NamespaceModel` (cluster-scoped); `shared/k8s/types.ts:Route`
  (hand-written type); `shared/k8s/client.ts:k8sListAll` (L85, URL building + `limit`/`continue`).
- Touch points: `shared/api/types.ts` (alias style L25–90); `shared/api/schema.gen.ts` `FleetClusterStatus` (L1349).
- OCP reference: `/home/bad/works/openshift-console/frontend/public/module/k8s/cluster-operator.ts:getStatusAndMessage`,
  `public/module/k8s/cluster-settings.ts:getClusterUpdateStatus` (L195), `getLastCompletedUpdate` (L126),
  `packages/console-app/src/status/node.ts:nodeStatus`, `packages/console-shared/src/selectors/node.ts`.

## Acceptance criteria
- [ ] Models registered; `models.test.ts` covers the new cluster-scoped / namespaced flags.
- [ ] `k8sListPage` + `pageCount` tested (exact with `remainingItemCount`, "+" with only `continue`, exact without either).
- [ ] `clusterHealth` table test: every §2.1 row, worst-wins order, Restricted lists all forbidden sections.
- [ ] `facts.ts` tests: currentVersion from history, Unknown node, operator status order matches OCP.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
