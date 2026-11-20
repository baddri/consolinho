---
id: T-0038
title: Connection test UI — run a test, result view with capability summary, "Test new token" while rotating
status: done
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0036]
paths: [web/src/features/admin/connection-test/, web/src/features/admin/credentials/RotateCredentialModal.tsx, web/src/features/admin/credentials/ClusterCredentialsTab.tsx, web/src/features/admin/clusters/ClusterDetailPage.tsx, web/src/features/admin/clusters/ClustersListPage.tsx]
review_rounds: 2
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
- [x] TEST-1: test runs from cluster Actions (credential picker), list kebab and credential kebab; works for a
      disabled cluster; zero-credential cluster disables the action with the reason.
- [x] TEST-2/3: fixture results render all steps in order with the right icons and verbatim messages; the
      TLS-unknown-authority failure shows its message; capability grid groups read/write; an extra unknown check id
      in the response renders without code change.
- [x] TEST-3 inspect: namespace rules table + incomplete warning; invalid namespace → inline field error.
- [x] TEST-4: hints rendered with severity. TEST-5: after a test the credential's Last test cell updates.
- [x] CRED-5: "Test new token" posts `test-token` with `credentialId`; failed result turns Save into "Save anyway";
      editing the token resets it.
- [x] ADM-2: test actions aria-disabled for `ines`. TSDoc. Build, lint, tests green.

## Work log
- 2026-11-20 frontend-engineer: started; connection-test/ module, wiring into cluster/credential actions and rotate modal.
- 2026-11-20 frontend-engineer: done. connection-test/ (api, modal, result view, grid, rules, steps, token test hook);
  wired into cluster actions, credential kebab and rotate modal; T-0037 nit folded in. check-fe green (503 tests).
- 2026-11-20 frontend-engineer: review round 1 fixed — `TestProgress` inside always-mounted live regions + "Test
  cancelled."; `isAbortError` exported from shared/api; error state on `data === undefined`; hint keys; cancel tests
  assert `request.signal.aborted` (both dialogs). check-fe green (505 tests).

## Review
Round 1 (frontend-architect, 2026-11-20): **CHANGES_REQUESTED**. Targeted vitest (8 files / 85), typecheck, eslint green.
Security verified: token only in `test-token` body via `useTokenSubmit` (`gcTime: 0` + `reset()`), never in keys/URLs/
toasts; dropped on edit/close; `signal` reaches `apiClient`, mutations `retry: false`; abort swallowed, no echo.
Required:
- `web/src/features/admin/connection-test/TestConnectionModal.tsx:175-176` — `aria-live="polite"` sits on the
  conditionally mounted progress `Flex`, so screen readers usually don't announce "Testing…" (a live region must exist
  before its content changes) — keep an always-rendered `aria-live` wrapper around the progress (as `RotateCredentialModal.tsx:163` does).
Nits (optional):
- `TestConnectionModal.tsx:194` / `RotateCredentialModal.tsx:172` — nothing announces a cancel; a short "Test cancelled." in the live region would close the loop.
- `connection-test/api.ts:73` — `isTestCancelled` duplicates `isAbortError` in `shared/api/errors.ts:87`; export and reuse that.
- `TestConnection.test.tsx:195` — cancel test asserts no retry but not the abort itself; assert `request.signal.aborted` in the handler. Rotate "Cancel test" has no test.
- `TestConnectionModal.tsx:76-87` — a failed background refetch of credentials (after `adminKeys.all` invalidation) flips the body to the error state and drops the shown result; branch on `data === undefined` instead of `isError`.
- `ConnectionTestResultView.tsx:73` — hint key by `message` may collide; use `${severity}:${message}` or index.
- Follow-up task (accepted deviation): pass `isEnabled` through `CredentialCluster` so the disabled-cluster note also shows from the credentials tab. Other deviations (credentials loaded in the modal, "Rotate"→"Save anyway", 409 as plain alert, T-0037 nit) accepted.

Round 2 (frontend-architect, 2026-11-20): **APPROVE**. Targeted vitest (9 files / 78), typecheck, eslint green.
Required fix done: `TestProgress` renders inside always-mounted `aria-live="polite"` wrappers (`TestConnectionModal.tsx:174`,
`RotateCredentialModal.tsx:160`). All nits addressed: "Test cancelled." announced; error state gated on `data === undefined`;
shared `isAbortError` reused; hint keys severity+message; tests assert `signal.aborted`, live region, rotate cancel (token kept, not cached, no retry).
Open follow-up only: `isEnabled` on `CredentialCluster` for the disabled-cluster note from the credentials tab.

## Handover notes
- `TestProgress` is not a live region itself; callers wrap it in an always-mounted `aria-live="polite"` element.
- `connection-test/`: `useTestCredential` (plain mutation, invalidates `adminKeys.all` on settle) and `useTestToken`
  (built on the now-exported `useTokenSubmit`: `gcTime: 0` + `reset()`); `useTestCancellation` owns the AbortController
  ("Cancel test", re-run and unmount abort; nothing retries). `useTokenTest` keeps only the result, never the token.
- Deviation: `TestConnectionModal({ cluster, initialCredentialId?, onClose })` loads credentials itself via the shared
  `useClusterCredentials` query instead of taking a `credentials` prop (cluster actions don't have them loaded).
- Rotate primary stays "Rotate" (T-0036 wording) and becomes danger "Save anyway" (spec CRED-5) after a failed test;
  token edits (`form.subscribe`, `type === 'change'`) clear the result and abort a running test.
- Disabled-cluster note shows only from cluster actions (`CredentialCluster` has no `isEnabled`; the credentials tab
  passes that type). A 409 from a stored test is shown as a plain problem alert (no "Reload"); lists refetch anyway.
- `credentials/api.ts`: `invalidateAfterError` (exported) now also invalidates `adminKeys.credentials()` on 404/409.
- Existing order assertions in `clusters/ClusterActions.test.tsx` / `ClusterDetailPage.test.tsx` now include
  "Test connection". No mock changes were needed.
