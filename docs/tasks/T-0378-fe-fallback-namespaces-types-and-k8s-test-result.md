---
id: T-0378
title: Regenerate API types for fallbackNamespaces (mocks too); hide OpenShift-only facts in Kubernetes connection-test results
status: done
owner: frontend-engineer
checkpoint: 5.5
depends_on: [T-0375, T-0376]
paths: [web/src/shared/api/schema.gen.ts, web/src/shared/api/types.ts, web/src/mocks/handlers, web/src/mocks/fixtures/connectionTests.ts, web/src/mocks/fixtures/fleetStatus.ts, web/src/features/admin/connection-test, web/src/features/admin/credentials/LastTestLabel.tsx]
review_rounds: 0
---

## Goal
Pick up the CP5.5a API change (spec §4.4: `AccessibleCluster.fallbackNamespaces`, NSA-3) in the SPA types and MSW
mocks, so CP5.5b's namespace-selector fallback (NSF) can build on it; and make the connection-test result view honest on
Kubernetes (CT-2, CT-3): no OpenShift-only rows when the test **detected** Kubernetes.

## Scope
- In: `npm run gen:api`; MSW `AccessibleCluster` representation; mock connection-test results without
  `list-clusteroperators` for Kubernetes (mirrors T-0376); CT-2 hiding; CT-3 test.
- Out: using `fallbackNamespaces` in the namespace selector (CP5.5b NSF); any backend change.

## Contract / design notes
- **API (identical to T-0375):** `AccessibleCluster` (`GET /api/clusters`, also embedded as `cluster` in fleet status
  lines) gains required `fallbackNamespaces: string[]` — inspect namespaces of the credential behind the caller's
  effective grant, saved order, `[]` if none. The Api's OpenAPI document is the source; regenerate, don't hand-edit.
- **Connection test (T-0376):** schema unchanged; on a detected Kubernetes cluster `capabilities.checks` simply lacks
  `list-clusteroperators` (render the list as received — no FE filtering of checks).
- **MSW:** `toAccessibleCluster` must fill `fallbackNamespaces` the way the server does: the `inspectNamespaces` of the
  credential behind the resolved (winning) grant (`resolveAccess` already knows the grant), `[]` when none. Fleet status
  mock lines that embed the cluster get it the same way. Mock connection-test fixture: when the context is detected
  Kubernetes, drop `list-clusteroperators` from `checksFor` output.
- **CT-2:** in `ConnectionTestResultView` (used by both the stored-credential dialog and `TokenTestResult`), when
  `result.detectedDistribution === 'kubernetes'`: omit the "OpenShift version" `DescriptionListGroup` and pass
  `TestStepList` the steps without `step === 'openShiftVersion'`. "Kubernetes version" stays. `detectedDistribution`
  `null` (discovery unreadable) or `'openShift'` (incl. declared-Kubernetes mismatch, which also carries the DIST-7
  warning step) ⇒ unchanged rendering. No "N/A" placeholder (spec §5 UX). Update the component TSDoc.
- **CT-3:** `LastTestLabel`/credential details show headline or "Failed at <step>" only; the backend never fails the
  `openShiftVersion` step on a detected Kubernetes cluster (it skips or warns), so no code change is expected — add a
  test pinning that a Kubernetes summary renders without "OpenShift". If the credential details show any other
  OpenShift-only item, hide it under the same rule and note it in the work log.

## Context pack
- Docs: `FRONTEND.md` § API types/generation (grep `gen:api`); README "Regenerating API types for the SPA" (L183):
  needs the Api running (`aspire start --launch-profile http && aspire wait web`), then `cd web && npm run gen:api`.
- Touch points:
  - `web/src/shared/api/schema.gen.ts` (generated), `web/src/shared/api/types.ts` (`AccessibleCluster` alias)
  - `web/src/mocks/handlers/representations.ts:toAccessibleCluster` (L257); credential representation already copies
    `inspectNamespaces` (L139); caller `web/src/mocks/handlers/clusters.ts:accessibleClustersOf` (L21-29, `resolveAccess`)
  - `web/src/mocks/fixtures/fleetStatus.ts` (lines embedding the cluster), `web/src/mocks/fixtures/connectionTests.ts:checksFor` (L31; `detected` L90, result L195-202)
  - `web/src/features/admin/connection-test/ConnectionTestResultView.tsx:ConnectionTestResultView` (L61-70 steps) and `TestFacts` (L137-168)
  - `web/src/features/admin/connection-test/TestStepList.tsx:TestStepList` (L32)
  - `web/src/features/admin/credentials/LastTestLabel.tsx` (step labels L11, text L38-40)
- Test exemplar: `web/src/features/admin/connection-test/ConnectionTestResultView.test.tsx` — add: detected Kubernetes
  (no OpenShift version row/step), detected OpenShift (unchanged), declared Kubernetes + detected OpenShift (rows shown
  + warning). Fixture builders live in `web/src/mocks/fixtures/connectionTests.ts`.
- Typecheck will flag every hand-built `AccessibleCluster` in tests (e.g. `FleetOverviewPage.test.tsx`,
  `useFleetStatus.test.tsx`, `GrantsTab.test.tsx`); add `fallbackNamespaces: []` there.

## Acceptance criteria
- [x] `schema.gen.ts` regenerated from the running Api; `AccessibleCluster.fallbackNamespaces: string[]` required.
- [x] MSW `/api/clusters` and fleet status return `fallbackNamespaces` from the winning grant's credential.
- [x] CT-2: detected Kubernetes hides the OpenShift version fact and step row in both dialogs; mismatch still shows them.
- [x] CT-3: test pins that a Kubernetes stored summary shows no OpenShift-only item.
- [x] Build, lint and tests green (`scripts/check-fe.sh`)

## Work log
- 2026-11-25 frontend-engineer: gen:api against the Api alone (Development, throwaway podman Postgres, port 5899; both
  stopped) — adds required `AccessibleCluster.fallbackNamespaces` + CT-1 doc on `CapabilitySummary.checks`. MSW:
  `toAccessibleCluster` takes the winning credential's inspect namespaces (fleet status reuses `accessibleClustersOf`);
  `checksFor` drops `list-clusteroperators` without OpenShift APIs. CT-2 in `ConnectionTestResultView`. CT-3: the
  summary has no distribution/OpenShift field, so no other OpenShift-only item exists; pinned by `LastTestLabel.test.tsx`.

## Review

## Handover notes
- `ConnectionTestResultView` hides the "OpenShift version" step + fact only when `detectedDistribution === 'kubernetes'`
  (`isDetectedKubernetes`); `null`/`openShift` (incl. declared-Kubernetes mismatch) render unchanged. No N/A placeholder.
- `toAccessibleCluster(cluster, accessMode, fallbackNamespaces)` — new required arg; callers pass the winner's
  credential `inspectNamespaces` (`clusters.ts:accessibleClustersOf`). CP5.5b NSF can consume `fallbackNamespaces`.
- Hand-built `AccessibleCluster`s in 4 tests outside `paths` got `fallbackNamespaces: []` (typecheck-only).
- No visual change on OpenShift; probe not run (pure row omission, no new styles).
