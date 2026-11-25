---
id: T-0391
title: CP5.5 VERIFY — acceptance criteria traceability and full gates
status: done
owner: qa-engineer
checkpoint: 5.5
depends_on: [T-0370, T-0371, T-0372, T-0373, T-0374, T-0375, T-0376, T-0377, T-0378, T-0379, T-0381, T-0382, T-0383, T-0384, T-0385, T-0386, T-0387, T-0388, T-0389]
paths: [docs/tasks/T-0391-qa-cp55-verify.md, web/src/features/cluster-context/useNamespaceFallback.test.tsx]
review_rounds: 0
---

## Goal
SDLC step 4 for CP5.5: run all gates once, map every acceptance criterion of `docs/specs/CP5.5-kubernetes-clusters.md`
§4 to a test or recorded evidence, add tests where coverage is missing, file bugs for failures.

## Acceptance criteria
- [x] `scripts/check-be.sh`, `scripts/check-fe.sh` and default e2e run once at HEAD d81ab7e (+ the QA test below)
- [x] Every AC in §4 (5.5a.1–5.5a.4, 5.5b.1–5.5b.4, §4.3) has a verdict with evidence
- [x] Bug task per failure (none found)

## Gates (2026-11-26, HEAD d81ab7e)
- `scripts/check-be.sh`: build ok; tests 431 + 889 + 1049 = 2369 passed, 0 failed, 0 skipped.
- `scripts/check-fe.sh`: lint/typecheck/build ok; 157 files, 1677 tests passed. New QA test re-run in isolation
  (4/4 in its file), eslint + `tsc -b` clean.
- Default e2e (`aspire start --launch-profile http`, `npm run e2e`): 60 passed, 4 skipped (the E2E_KIND-gated kind specs), 0 failed, 4.7 min; stack stopped afterwards.
- Kind e2e / kind smoke not re-run (passed in T-0386 / T-0379; no gate result gave reason to doubt them).

## Traceability (AC → evidence → verdict)
| AC | Evidence | Verdict |
|---|---|---|
| NSA-1 | `ClustersEndpointsTests.Returns_The_Effective_Credentials_Inspect_Namespaces_In_Saved_Order` (order, `[]`); precedence: `AccessSnapshotTests.Reader_takes_the_inspect_namespaces_of_the_winning_grants_credential_only` (group loses to direct, no leak) | met |
| NSA-2 | `AccessCacheTests.Retested_credentials_inspect_namespaces_are_listed_on_the_next_request` (no inspect-namespace edit endpoint exists; a test run is the only write path) | met |
| NSA-3 | `ClustersEndpointsTests.Lists_Enabled_Granted_Clusters…`, `Admin_Without_Grants_Gets_Empty_List`, `Exposes_Only_Switcher_Fields`, `OpenApi_Publishes_FallbackNamespaces_As_A_Required_Documented_String_Array`; `web/src/shared/api/schema.gen.ts` has `fallbackNamespaces: string[]` | met |
| CT-1 | `CapabilityCheckSetTests` (OpenShift keeps all, Kubernetes omits only ClusterOperators, unreadable discovery keeps all); `ConnectionTesterTests` L175–231 (both distributions + mismatch); `ConnectionTestEndpointsTests.TestCredential_OnKubernetesCluster_…`; real kind in T-0379 | met |
| CT-2 | `ConnectionTestResultView.test.tsx` "detected Kubernetes: no OpenShift version step or fact…" + "declared Kubernetes but detected OpenShift… DIST-7 warning"; kind e2e CT-2 (T-0386) | met |
| CT-3 | `LastTestLabel.test.tsx` (passed/failed Kubernetes summary, nothing OpenShift-only) | met |
| KIND-1..4 | `scripts/kind-dev.sh`, README §"Local Kubernetes cluster (kind)"; T-0377 done | met (by T-0377 evidence) |
| KIND-5 | T-0379 Work log: list+watch, follow logs, exec WebSocket, scale 2→3→2 as team-a-editor | met (manual, recorded) |
| QG55A-1 | gates above; NSA/CT-1 covered by BE tests | met |
| QG55A-2 | `web/src/test/kindDiscovery` fixture used by `kindDiscovery.test.ts` | met |
| NSF-1 | `NamespaceSelector.test.tsx` (SSAR "no" + list 403 paths, helper text); `useNamespaceFallback.test.tsx`; **added** "falls back on OpenShift too when the token may not list projects" (DIST-5 any distribution) | met (accepted dev.: one parallel 403 on first open) |
| NSF-2 | `NamespaceSelector.test.tsx` "offers Go to namespace… never All namespaces", "chooses the typed name on Enter", empty-Enter, invalid name message | met |
| NSF-3 | `ClusterLanding.test.tsx` (first configured / last used / not all-namespaces); `NamespaceRedirect.test.tsx` "sends a namespaced plural to the first configured namespace" | met (accepted dev.: lands on Pods) |
| NSF-4 | `ClusterLanding.test.tsx` "shows the empty state with a Go-to entry…" (asserts no `alert`) | met |
| NSF-5 | `NamespaceSelector.test.tsx` "keeps the forbidden list state…(NSF-5)" | met |
| DSC-1 | `kindDiscovery.test.ts` "kind sidebar (DSC-1)" exact sections; kind e2e | met |
| DSC-2 | `kindDiscovery.test.ts` it.each over nav descriptors + STATIC_NAV_ITEMS with ungated allowlist | met (see Risks) |
| DSC-3 | `ResourceListPage.test.tsx` DSC-3 (routes, projects); `clusterSettings.test.tsx` "not-served state on a Kubernetes cluster" | met |
| DSC-4 | `ServiceRoutes.test.tsx` "absent on a Kubernetes cluster"; `SearchPage.test.tsx` DSC-4; `overview.test.tsx` OVW-2/DSC-4; `FleetOverviewPage.test.tsx` FLT-2/3/4 (prod-k8s-1 version, nodes, no Restricted/error) | met |
| DSC-5 | `web/e2e/kubernetes.e2e.ts` `expectNoOpenShiftWording` on every visited page (T-0386) | met |
| NSC-1 | `createNamespace.test.tsx` (creates with labels → details + toast; 409/403 inline; DNS-1123 + label validation; not offered on OpenShift) | met |
| NSC-2 | `createNamespace.test.tsx` read-only → disabled with reason; SSAR denial → disabled with RBAC reason; mutation guard/audit via proxy tests (`KubernetesProxyAuthorizationTests`) | met (accepted dev.: disabled, not hidden) |
| QG55B-1 | gates + tests above | met |
| QG55B-2 | `mocks/k8s.test.ts` "mock cluster dev-k8s-ns…(QG55B-2)"; `fixtures/clusters.ts` | met |
| QG55B-3 | `kubernetes.e2e.ts` `test.skip(E2E_KIND !== '1', reason)`; covers DSC-1/5, NSF-1/3, CT-2, logs, exec | met |
| QG55B-4 | T-0387 (ux review) done | met |
| §4.3 T-0370..T-0374 | each task done, accepted by own criteria | met |

## Risks / notes
- DSC-2 iterates descriptors with `nav` only; non-nav OpenShift descriptors (ClusterVersion, ClusterOperator, …) are
  gated by `isServed` at use sites (Search DSC-4, Overview) rather than by this table test. Acceptable; not a bug.
- Discovery error lasts until reload (T-0390, backlog) — accepted.

## Work log
- 2026-11-26 qa: gates run; traceability above; added 1 FE test (NSF-1 on OpenShift). No defects filed.

## Handover notes
No bug tasks. The only code change is the added test in `useNamespaceFallback.test.tsx`.
