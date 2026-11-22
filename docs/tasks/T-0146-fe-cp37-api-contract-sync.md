---
id: T-0146
title: Sync CP3.7 API contract — generated types, MSW mocks, cluster-type pieces, discovery-mismatch tests
status: todo
owner: frontend-engineer
checkpoint: 3.7
depends_on: [T-0139, T-0140, T-0141, T-0142]
paths: [web/src/shared/api, web/src/shared/ui, web/src/mocks, web/src/features/admin/connection-test, web/src/features/resources, web/src/features/cluster-context]
review_rounds: 0
---

## Goal
Bring the SPA onto the CP3.7 API contract in one step so later FE tasks only add UI: regenerate types, update MSW
fixtures/handlers, add the shared cluster-type pieces, adapt the connection-test code minimally to the namespace
list, and prove DIST-5 (discovery wins over the declared distribution) and DIST-6 (no hard-coded product copy).

## Scope
- In: `npm run gen:api` (Api running, Development) or hand-sync from the BE task's OpenAPI if the Api isn't available
  (note which in the work log); `shared/api/types.ts` aliases; MSW; `shared/ui` cluster-type pieces; type-only
  adaptation of connection-test; DIST-5 tests; DIST-6 grep + fixes.
- Out: switcher UI (T-0147), admin form/list/details (T-0148), chip input (T-0150), per-namespace result UI (T-0151).

## Contract / design notes
- Fixed contract (orchestrator): `distribution: 'openShift' | 'kubernetes'` on cluster create/update requests, admin
  cluster DTOs (list, detail) and `AccessibleCluster`; credential DTO `inspectNamespaces: string[]`; test requests
  (`TestCredentialRequest`, `TestTokenRequest`) `inspectNamespaces: string[]` (replaces `inspectNamespace`); result
  `namespaceRules: NamespaceRulesDto[]` (namespace + rules, or an error) and `detectedDistribution: 'openShift' | 'kubernetes' | null`.
  Use generated names; add aliases `ClusterDistribution`, `NamespaceRulesResult` (the array item) in `shared/api/types.ts`.
- `shared/ui/cluster-type/` (exported from `shared/ui/index.ts`):
  ```ts
  /** Tag + word per distribution (SW-3, SW-6, DIST-3): openShift ⇒ { tag: 'OCP', word: 'OpenShift' }, kubernetes ⇒ { tag: 'K8s', word: 'Kubernetes' }. */
  export function clusterTypeText(distribution: ClusterDistribution): { tag: string; word: string };
  /** `<Label isCompact>` default grey filled, text = tag (UX.md §2a). */
  export function ClusterTypeLabel(props: { distribution: ClusterDistribution }): JSX.Element;
  /** ClusterIcon (openShift) | CubesIcon (kubernetes), always aria-hidden (UX.md §2a). */
  export function ClusterTypeIcon(props: { distribution: ClusterDistribution }): JSX.Element;
  ```
  Exemplar: `EnvironmentLabel`/`environmentLabel` in `shared/ui`.
- MSW (`web/src/mocks`): `MockCluster.distribution`; fixtures: all `openShift` except `lab-1` (vanilla, already in
  `mocks/k8s/fixtures.ts:VANILLA_CLUSTERS`) ⇒ `kubernetes`, and `dev-2` ⇒ `kubernetes` while still serving OpenShift
  APIs (DIST-5 mismatch demo). Handlers: create requires `distribution` (400 field error otherwise), update accepts it;
  list/detail/accessible return it. Credentials: `inspectNamespaces` on the fixture/representation (default `[]`);
  test handlers bind `inspectNamespaces` (array, 0–10, each `dnsLabel(63)`, trimmed + deduped; field error
  `inspectNamespaces` naming the entry, e.g. "Not a valid namespace name: Team_A." / "Up to 10 namespaces."), save the
  list on stored-credential test (NST-5), return one `namespaceRules` entry per namespace in order — `forbidden-ns`
  (or any name starting `forbidden`) yields an error entry, so UI tests can cover partial failure; `detectedDistribution`
  from the cluster's served groups. Add-credential handler accepts `inspectNamespaces` if the BE contract has it.
  Update `mocks/*.test.ts` accordingly.
- Connection-test bridge (keeps types green; real UI in T-0150/T-0151): `api.ts` variables → `inspectNamespaces: string[]`;
  `TestConnectionModal` sends `value ? [value] : []`; `useTokenTest` sends `[]`; `ConnectionTestResultView` maps the
  array to today's `ExpandableSection`s (rules entries only; an error entry shows its message as a plain inline warning).
- DIST-5: no product logic changes expected (`useClusterNav` and the landing already use discovery). Add tests:
  `dev-2` (declared Kubernetes, serves `project.openshift.io`) ⇒ Projects nav item + landing on projects; a cluster
  declared OpenShift without the group (`server.use` override or `lab-1` with `distribution: 'openShift'` in the test)
  ⇒ Namespaces.
- DIST-6: `grep -rn "OpenShift" web/src/features/{resources,cluster-context,home,workloads,networking,storage,compute}`
  — replace user-visible hard-coded copy (comments are fine); list findings in the work log.

## Context pack
- Docs: `FRONTEND.md` § Folder structure (`mocks/` L38, `shared/api` L21-23); ADR-0016 (MSW typed by schema); ADR-0032 (distribution vs discovery).
- Exemplars: `web/src/shared/ui` `EnvironmentLabel`/`environmentLabel` (label + text helper pair);
  `web/src/mocks/handlers/credentials.ts:bindInspectNamespace` L30-36 (body binding + field error), L279-321 (test handlers);
  `web/src/mocks/fixtures/connectionTests.ts:connectionTestFor` L175-200.
- Touch points: `mocks/fixtures/clusters.ts:clusterFixtures` L16-110; `mocks/handlers/adminClusters.ts`, `mocks/handlers/clusters.ts`
  (accessible), `mocks/handlers/representations.ts`; `features/admin/connection-test/api.ts` L10, L25-29, L44;
  `TestConnectionModal.tsx` L123-132; `useTokenTest.ts` L39; `ConnectionTestResultView.tsx` L60, L85-92;
  `features/resources/nav/useClusterNav.ts:useClusterNav` L44; `mocks/k8s.test.ts` L170-189 (vanilla-cluster tests).
- OCP reference: none (data layer).

## Acceptance criteria
- [ ] Generated schema includes `distribution`, `inspectNamespaces`, `namespaceRules[]`, `detectedDistribution`; typecheck green.
- [ ] MSW: create without distribution → 400 field error; 11 namespaces / invalid name → 400 field error naming the entry;
      stored test saves the list; per-namespace results in order incl. one error entry (mocks tests).
- [ ] `ClusterTypeLabel`/`ClusterTypeIcon`/`clusterTypeText` unit-tested (shape icon differs, `aria-hidden`).
- [ ] DIST-5 tests for both mismatches pass; DIST-6 sweep done (findings in work log).
- [ ] Existing connection-test tests pass with the bridge. Build, lint and tests green (CLAUDE.md rule 4).
- [ ] Probe pages: none (no visual change beyond the bridge).

## Work log

## Review

## Handover notes

## Orchestrator reconciliation (2026-11-23)
Backend contract is final in `T-0139` §Contract A/B/C plus `T-0140`/`T-0141`/`T-0142`. Differences from the design brief:
request `distribution` is nullable (`distribution?: ClusterDistribution | null`, missing → field error), responses non-null;
`ConnectionTestStep` gains `distribution` (between `identity` and `openShiftVersion`, 6 steps — needs a label);
`namespaceRules` is always an array of `{namespace, incomplete, evaluationError, rules|null, error|null, failureKind|null}`
(exactly one of rules/error); `AddCredentialRequest` **does** carry optional `inspectNamespaces` (field keys
`inspectNamespaces`, `inspectNamespaces[i]`).
