---
id: T-0070
title: K8s models/types and the MSW mock Kubernetes proxy (stateful, streamed watches)
status: todo
owner: frontend-engineer
checkpoint: 2
depends_on: []
paths: [web/src/shared/k8s/models.ts, web/src/shared/k8s/types.ts, web/src/shared/k8s/index.ts, web/src/mocks/, web/src/test/setup.ts, web/package.json, web/package-lock.json]
review_rounds: 0
---

## Goal
Give every CP2 frontend task a realistic Kubernetes API to develop and test against without the backend (ADR-0016
extended to the proxy, FRONTEND.md "Testing"): the `K8sModel` descriptors and resource types, and an MSW mock of
`/api/clusters/{cluster}/k8s/**` that behaves like the CP2 proxy + an API server — lists with paging and selectors,
streamed watches, 410, PUT conflicts, DELETE, discovery, SSAR, and the proxy's guard errors. `npm run dev:mock` shows
live changes.

## Scope
- In: `shared/k8s/models.ts`, `shared/k8s/types.ts` (+ `index.ts` exporting them); add deps `kubernetes-types` and `yaml`
  (exact versions); `mocks/k8s/` store + fixtures + handlers + test helpers + browser simulator; register handlers;
  reset the store in `resetMockDb()`.
- Out: the real client/hooks (T-0071), any UI.

## Contract / design notes
Backend contract: `docs/specs/CP2-api-contract.md` §1–4 (route, headers, watches, errors + check order). Mock it exactly.
- **Models** (`K8sModel { group: string /* '' = core */; version; kind; plural; namespaced; label; labelPlural; abbr }`):
  `ProjectModel` (project.openshift.io/v1, cluster-scoped, abbr `PR`), `NamespaceModel` (v1, `NS`), `PodModel` (`P`),
  `DeploymentModel` (apps/v1, `D`), `ServiceModel` (`S`), `ConfigMapModel` (`CM`), `EventModel` (v1 `events`, `E`),
  `SelfSubjectAccessReviewModel` (authorization.k8s.io/v1). Helpers `apiVersionOf(model)`, `modelKey(model)` =
  `"<group>/<version>/<plural>"` (ADR-0022 §7).
- **Types**: re-export `Pod`, `Deployment`, `Service`, `ConfigMap`, `Namespace`, `Event` (core/v1), `ObjectMeta`,
  `OwnerReference`, `Status` from `kubernetes-types`; hand-written `Project` (metadata + `status.phase`; display name /
  description / requester are annotations `openshift.io/display-name|description|requester`); `K8sResource`
  (`apiVersion`, `kind`, `metadata: ObjectMeta`), `K8sList<T>`, `WatchEvent<T> = { type: 'ADDED'|'MODIFIED'|'DELETED'|'BOOKMARK'|'ERROR'; object: T | Status }`.
- **Mock pipeline** (one `http.untyped.all('*/api/clusters/:cluster/k8s/*')`, after `accessGuard`, before
  `unhandledApiRoute` — CSRF and 401 already come from `accessGuard`): no grant / cluster disabled / unknown → 404
  `Proxy.NotAvailable` ("Cluster `<name>` is not available."); path outside allowlist → 400 `Proxy.PathNotAllowed`;
  mutation (non-GET, except POST to `selfsubjectaccessreviews|selfsubjectrulesreviews`) by `isReadOnly` user → 403
  `Proxy.UserReadOnly`, by readOnly grant → 403 `Proxy.ReadOnlyGrant` (no mock audit here — T-0079 adds proxy
  audit entries once the generated enum has `proxy`; keep one `onProxyMutation` hook point for it); credential with
  `expiresAt` in the past → 502 `Proxy.CredentialRejected`; then the "API server".
- **RBAC profile by the grant's credential name** (SSAR + enforcement): `*view*`/`legacy*` → get/list/watch only;
  `*edit*` → all verbs on namespaced kinds, read-only on namespaces/projects; `*admin*` → everything. Denials are
  Kubernetes `Status` 403 (`reason: Forbidden`, message like the apiserver's
  `pods "web-1" is forbidden: User "system:serviceaccount:fleet:fleet-view" cannot delete resource "pods" …`).
- **API server**: discovery `GET /api` (APIVersions) and `GET /apis` (APIGroupList: `apps/v1`,
  `authorization.k8s.io/v1`, plus `project.openshift.io/v1` on every cluster except `lab-1` = vanilla Kubernetes);
  list (`limit`/`continue`, `labelSelector` with `=`, `!=`, `in`, exists; `fieldSelector` `metadata.name=`,
  `involvedObject.uid=`), get, PUT (409 `Conflict` Status if `metadata.resourceVersion` ≠ stored; 422 `Invalid` if
  `metadata.name` mismatches or a `data` value isn't a string; bumps a global per-cluster `resourceVersion`), DELETE
  (Status 200 / 404 `NotFound`; deleting a project/namespace deletes its objects), SSAR POST → `status.allowed` from
  the profile. Unknown namespace on a namespaced list → empty list (real apiserver behaviour, needed for SW-9).
- **Watch** (`watch=1|true`): respond `200 application/json` with a `ReadableStream` that first replays events newer
  than `resourceVersion`, then pushes live store changes as NDJSON lines; ends cleanly when `request.signal` aborts or
  after `timeoutSeconds` (default 300); `resourceVersion` older than the store's compaction mark → stream one `ERROR`
  event `{code: 410, reason: 'Expired'}` and close. BOOKMARKs optional.
- **Fixtures**: generated per cluster by a seeded function (same shape on every cluster so SW-9 comparisons work, with
  small differences): projects/namespaces `shop`, `payments`, `default`, `kube-system`, `openshift-monitoring`
  (projects only where served); in `shop`: Deployment `web` (3 of 3) + 3 pods, one pod `CrashLoopBackOff` with
  restarts and a last-termination exit code, Service `web` (ClusterIP, selector `app=web`), ConfigMaps `web-config`
  (2 keys) and one with `binaryData`, Warning + Normal Events referencing the pods by uid. Deterministic uids/times.
- **Test helpers** (exported from `mocks/index.ts` as `mockK8s`): `upsert(cluster, obj)`, `remove(cluster, model, ns, name)`,
  `compact(cluster)` (forces 410 for older rvs), `get(cluster, model, ns, name)`, `seedPods(cluster, ns, count)` (for
  the 2,000-pod DATA-4 test). Store reset from `resetMockDb()`; open watch streams are closed on reset.
- **Dev simulator** (`mocks/k8s/simulator.ts`, started only from `startMockBackend()`): every 15 s toggles one `shop`
  pod between Running and CrashLoopBackOff (restarts++) and adds an Event, so `dev:mock` shows live updates.

## Context pack
- Docs: ADR-0016 §3 (mock backend rules), ADR-0022 §2–5/§7, `CP2-api-contract.md` §1–4.
- Exemplars: `web/src/mocks/handlers/http.ts:accessGuard` (untyped all-route guard + `problem()`),
  `web/src/mocks/handlers/clusters.ts:clusterSwitcherHandlers` (grant lookup via `currentMockUser`/`findCluster`),
  `web/src/mocks/problem.ts:problem` (ProblemDetails builder), `web/src/mocks/db.ts:L38-L48` (seed/reset pattern).
- Touch points: `web/src/mocks/handlers/index.ts:handlers` (insert before `unhandledApiRoute`),
  `web/src/mocks/index.ts` (exports), `web/src/mocks/db.ts:resetMockDb`, `web/src/mocks/browser.ts:startMockBackend`
  (start simulator), `web/src/mocks/fixtures/grants.ts:L48-L55` (personas: alice RO prod-eu-1 / RW staging-eu-1, admin RW
  dev-1, carol RW prod-eu-1 / RO dev-2, ines RO prod-us-1), `web/src/mocks/fixtures/credentials.ts:L7-L13` (credential
  names → profiles; prod-us-1 `fleet-view` is expired → `CredentialRejected` for ines), `web/src/test/setup.ts:L14-L18`.
- MSW streaming: `new HttpResponse(stream, { headers })` with a `ReadableStream<Uint8Array>`; grep `msw` `.d.ts` for
  `HttpResponse` if unsure.

## Acceptance criteria
- [ ] Models/types compile under `strict`; `modelKey`/`apiVersionOf` unit-tested (core vs named group).
- [ ] Mock tests (`mocks/k8s.test.ts`, plain `fetch`): paging with `continue`, label/field selectors, PUT 200/409/422,
      DELETE, SSAR per profile, 404/403/502 guard codes per persona in contract check order, CSRF on PUT.
- [ ] Watch test: a mutation via `mockK8s.upsert` arrives on an open stream as one NDJSON line; aborting closes it;
      `compact` → `ERROR` 410 event.
- [ ] `lab-1` discovery has no `project.openshift.io`.
- [ ] `npm run dev:mock` → requests to `/api/clusters/dev-1/k8s/api/v1/namespaces/shop/pods` answered by the worker.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
