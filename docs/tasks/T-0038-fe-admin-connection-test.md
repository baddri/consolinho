---
id: T-0038
title: Connection test UI — run a test, result view with capability summary, "Test new token" while rotating
status: todo
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0036]
paths: [web/src/features/admin/connection-test/, web/src/features/admin/credentials/RotateCredentialModal.tsx, web/src/features/admin/credentials/ClusterCredentialsTab.tsx, web/src/features/admin/clusters/ClusterDetailPage.tsx, web/src/features/admin/clusters/ClustersListPage.tsx]
review_rounds: 0
---

## Goal
Let an admin see, before granting, what a credential can do on a cluster (TEST-1..5) and test a replacement token
before saving it (CRED-5). Backend counterpart: T-0020 (+ T-0010); MSW until then. **Parallel group F8.**

## Scope
- In: `connection-test/` (`api.ts`, `TestConnectionModal`, `ConnectionTestResultView`, `CapabilityGrid`,
  `NamespaceRulesTable`, `TestStepList`), wiring: cluster Actions "Test connection", clusters list kebab "Test
  connection", credential kebab "Test", Rotate modal "Test new token" + "Save anyway".
- Out: scheduled tests (backlog).

## Contract / design notes
Endpoints: `POST /api/admin/clusters/{name}/credentials/{credentialId}/test` (`TestCredentialRequest {
inspectNamespace }` → `ConnectionTestResult`, stored as last test); `POST /api/admin/clusters/{name}/test-token`
(`TestTokenRequest { token, credentialId, inspectNamespace }` → result, nothing stored). Both are **commands**: CSRF
header, 403 `Auth.ReadOnly` for read-only admins. Mutations (not queries) — results are never cached by key; the
stored test invalidates `adminKeys.all`.
- `TestConnectionModal({ clusterName, clusterEnvironment, credentials, initialCredentialId? })` — `Modal
  variant="medium"`: credential `FormSelect` (pre-selected when exactly one or `initialCredentialId`), optional
  "Inspect namespace" (DNS label ≤ 63, `applyServerErrors` on `inspectNamespace`), "Run test" primary with spinner
  and the text "Testing… this can take up to 15 seconds." Disabled-cluster note: tests work on disabled clusters
  (TEST-1). Cluster with zero credentials → the action is aria-disabled with "Add a credential first".
- `ConnectionTestResultView({ result })` (TEST-2..4), rendering **only** what it receives (the check set may grow):
  - overall `Alert` success/danger with duration;
  - `TestStepList`: 5 steps in order, icon per status (`CheckCircleIcon` success, `ExclamationTriangleIcon` warning,
    `ExclamationCircleIcon` danger, `MinusCircleIcon` skipped) + step title + `message` verbatim;
  - facts `DescriptionList`: Kubernetes version, identity (`username` + "(from token)" when `source ===
    'tokenSubject'`), OpenShift version + "Update in progress" label;
  - headline `Label` (Cluster admin red / Cluster-wide edit orange / Cluster-wide view blue / Limited grey);
  - `CapabilityGrid`: two groups Read / Write (by `category`), each check `label` with allowed check / denied cross
    (accessible text "allowed"/"not allowed");
  - hints as inline `Alert`s (`info`/`warning`) — TEST-4;
  - `NamespaceRulesTable` in an `ExpandableSection` "Rules in namespace `x`": verbs, API groups, resources, names;
    `incomplete` → warning "The cluster reported an incomplete rule list."; `evaluationError` shown verbatim.
- Rotate modal (CRED-5): "Test new token" secondary → `test-token` with the typed token + `credentialId`; compact
  result inline (overall + failed step message + headline, expandable full view). If the latest test of the typed
  token failed, the primary button becomes "Save anyway" (`variant="danger"`), otherwise "Save"; changing the token
  clears the result. The token is sent only in the request body (CRED-2 rules of T-0036 apply).
- After a stored test: toast "Connection test passed/failed for fleet-view on prod-eu-1"; lists refresh (TEST-5).

## Acceptance criteria
- [ ] TEST-1: test runs from cluster Actions (credential picker), list kebab and credential kebab; works for a
      disabled cluster; zero-credential cluster disables the action with the reason.
- [ ] TEST-2/3: fixture results render all steps in order with the right icons and verbatim messages; the
      TLS-unknown-authority failure shows its message; capability grid groups read/write; an extra unknown check id
      in the response renders without code change.
- [ ] TEST-3 inspect: namespace rules table + incomplete warning; invalid namespace → inline field error.
- [ ] TEST-4: hints rendered with severity. TEST-5: after a test the credential's Last test cell updates.
- [ ] CRED-5: "Test new token" posts `test-token` with `credentialId`; failed result turns Save into "Save anyway";
      editing the token resets it.
- [ ] ADM-2: test actions aria-disabled for `ines`. TSDoc. Build, lint, tests green.

## Work log

## Review

## Handover notes
