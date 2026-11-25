---
id: T-0381
title: MSW mock cluster dev-k8s-ns — Kubernetes, namespace list 403, fallbackNamespaces ["team-a"] (QG55B-2)
status: done
owner: frontend-engineer
checkpoint: 5.5
depends_on: [T-0378]
paths: [web/src/mocks/fixtures/clusters.ts, web/src/mocks/fixtures/credentials.ts, web/src/mocks/fixtures/grants.ts, web/src/mocks/fixtures/fleetStatus.ts, web/src/mocks/k8s/rbac.ts, web/src/mocks/k8s/fixtures.ts, web/src/mocks/k8s/apiServer.ts, web/src/mocks/k8s.test.ts, web/src/mocks/k8s/rbac.test.ts]
review_rounds: 1
---

## Goal
Give the SPA a mock cluster on which the namespace-selector fallback (NSF, T-0382/T-0383) is reachable without kind:
vanilla Kubernetes, a namespaced token that can't list namespaces, and `fallbackNamespaces: ["team-a"]` (spec QG55B-2).
Tests of T-0382/T-0383 and the ux review (T-0387) build on it.

## Scope
- In: cluster, credential, grants, fleet-status line, a namespace-scoped RBAC profile, seeded `team-a` objects.
- Out: any `features/` code; changing existing clusters' behaviour.

## Contract / design notes
- **Cluster** `dev-k8s-ns` (display "Development Kubernetes (namespaced)", environment `development`, distribution
  `kubernetes`, enabled), added to `VANILLA_CLUSTERS` so discovery lacks every OpenShift group.
- **Credential** `team-a-editor` on `dev-k8s-ns` with `inspectNamespaces: ['team-a']` — T-0378's `toAccessibleCluster`
  then yields `fallbackNamespaces: ["team-a"]` with no extra mock code. Grants: `alice` readWrite and `admin` readWrite
  (so the default dev login can review it).
- **RBAC profile `namespaced`** (new `RbacProfile` member, chosen when the credential name contains `team-a-`): all
  verbs on namespaced resources **only in the credential's `inspectNamespaces`**; nothing cluster-scoped (namespaces
  list/get → 403, nodes → 403); other namespaces → 403. This needs the namespace in the check: extend
  `credentialAllows(credential, verb, resource, namespace?)` and pass it from both call sites in `apiServer.ts`
  (resource request ~L551 and `accessReview` from `attributes.namespace`). Existing profiles ignore the new argument.
- **Seed** `team-a` on `dev-k8s-ns` only: the namespace object plus a small copy of the `shop` workloads (one
  Deployment + its pods, a Service, a ConfigMap is enough) so lists, logs and details are non-empty. Other clusters'
  fixtures stay byte-identical (SW-9 relies on equal shapes).
- **Fleet status**: a `kubernetes()` line for `dev-k8s-ns` (as `prod-k8s-1`), whose embedded cluster carries the
  fallback namespaces (T-0378 path).
- Adding a cluster changes counts in some tests (switcher, fleet overview, admin clusters list). Update those
  expectations; don't weaken assertions.

## Context pack
- Touch points: `web/src/mocks/k8s/fixtures.ts:VANILLA_CLUSTERS` (L27), `FIXTURE_NAMESPACES` (L35), seeding (~L533);
  `web/src/mocks/k8s/rbac.ts:profileOf`, `isAllowed`, `credentialAllows` (L13-50); `web/src/mocks/k8s/apiServer.ts:accessReview`
  (L455) and the 403 branch (~L545-555); `web/src/mocks/fixtures/clusters.ts` (`prod-k8s-1` entry L58 as template);
  `web/src/mocks/fixtures/credentials.ts` (`prodK8sEdit` ~L158), `web/src/mocks/fixtures/grants.ts:grant` (L77-78);
  `web/src/mocks/fixtures/fleetStatus.ts` (L93).
- Exemplar test: `web/src/mocks/k8s.test.ts` (L405-425 namespace create/get on a mock cluster).

## Acceptance criteria
- [x] QG55B-2: `GET /api/clusters` as alice includes `dev-k8s-ns` with `fallbackNamespaces: ["team-a"]`.
- [x] On `dev-k8s-ns`: `GET /api/v1/namespaces` → 403 Forbidden Status; `GET /api/v1/namespaces/team-a/pods` → 200 with
  pods; `…/namespaces/shop/pods` → 403; SSAR `list namespaces` → `allowed: false`, `create pods` in team-a → allowed.
- [x] Discovery of `dev-k8s-ns` has no `*.openshift.io` / `operators.coreos.com` group.
- [x] Unit tests for the `namespaced` profile in `rbac` (allowed/denied table); other profiles unchanged.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-26 frontend-engineer: `dev-k8s-ns` cluster/credential `team-a-editor`/grants (alice+admin RW)/fleet line;
  `namespaced` RBAC profile + namespace arg in `credentialAllows`; `team-a` seeded (shop copy, appended last so other
  clusters' uids are unchanged). Count fixes outside paths: admin/{clusters,credentials,grants,grants/bulk,users} tests,
  cluster-context/clusterContext.test.tsx, fleet/api/useFleetStatus.test.tsx, mocks/{clusters,grants,users}.test.ts.

## Review
- Round 1 (frontend-architect, 2026-11-26): **APPROVE**. All ACs are covered by `mocks/k8s.test.ts` and `mocks/k8s/rbac.test.ts`.
  Other clusters' seeds are unchanged because `team-a` is appended last. Count fixes keep their assertions intact.
  Optional, or follow-ups (neither blocks T-0382/T-0383):
  - `web/src/mocks/k8s/exec.ts:77`: `refusal(cluster)` uses `isAllowed`, so it has no namespace. A `namespaced`
    token can exec into `shop/*` pods on dev-k8s-ns over a hand-built WS URL. The UI can't reach this, because the pod
    page 403s on `get pods`. Fix: pass the namespace and use `credentialAllows(credential, 'create', 'pods/exec', namespace)`.
  - `web/src/mocks/fixtures/credentials.ts:176`: the stored `lastTest` headline is `limited`, but `testScenario: 'edit'`
    re-tests as `clusterWideEdit`. A follow-up can add a `namespaced` `ConnectionTestScenario` if admin re-test demos need it.
  - Fidelity note: on a real cluster, an `edit` RoleBinding in `team-a` allows `get namespaces/team-a`. The mock
    denies it because the task asked for that. If T-0382/T-0383 fetch the namespace object, expect a 403 here that kind won't give.

## Handover notes
- `dev-k8s-ns`: vanilla K8s, `team-a-editor` (inspectNamespaces `['team-a']`, headline `limited`) → alice/admin
  `fallbackNamespaces: ["team-a"]`. Profile `namespaced` (`team-a-*` credential names): all verbs on namespaced
  resources only in the credential's inspect namespaces; namespaces/projects/nodes and cluster scope → 403.
- `isAllowed(profile, …)` has no namespace, so `exec.ts` (outside paths) allows `pods/exec` for `namespaced` in any
  namespace; reaching another namespace's pod already 403s on `get pods`. Follow-up if exec must check the namespace.
- Connection test scenario stays `edit` (no namespace-scoped scenario exists); re-running the test shows clusterWideEdit.
- Tests: `mocks/k8s/rbac.test.ts` (profile tables), `mocks/k8s.test.ts` dev-k8s-ns block incl. the T-0378 deferred
  `/api/clusters` fallbackNamespaces test (dev-k8s-ns, staging-eu-1, prod-eu-1).
