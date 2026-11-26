---
id: T-0426
title: E2E for discovery recovery (fake 503) and chunk-load recovery (forced chunk failure)
status: todo
owner: qa-engineer
checkpoint: 6b
depends_on: [T-0390, T-0420, T-0421]
paths: [web/e2e/resilience.e2e.ts, web/e2e/support]
review_rounds: 0
---

## Goal
Spec CP6 **E2E-2** items "DR-1/DR-2 with a fake discovery 503" and "CL-1 with a forced chunk failure" (size **S**).

## Contract / design notes
- `resilience.e2e.ts`, one fake workloads cluster (`registerFakeCluster`, T-0422).
- DR: `page.clock.install()` before `goto`; `page.route('**/api/clusters/*/k8s/apis', r => r.fulfill({ status: 503 }))`;
  assert the nav warning "Some resource types could not be loaded. Retrying…" and baseline sections; `page.unroute`,
  `page.clock.fastForward('00:31')`; warning gone, full nav (e.g. an `apps.openshift.io`/`route.openshift.io` item) without reload
  (assert no new `load` event).
- CL: production build (`serveProductionBuild` + `reloadFromBuild`, like `csp.e2e.ts` L19-30) so chunk names are real;
  after login, `page.route('**/assets/*.js', r => r.abort())` filtered to chunks not yet loaded, navigate in-app to a lazy
  page (e.g. Fleet admin Users as admin) → first failure auto-reloads once (`page.waitForEvent('load')`); keep the
  abort route → second failure shows "A new version of FleetConsole is available. Reload to continue." and Reload.
  Clear `sessionStorage` key `fleetconsole.chunkReloadAt` in `beforeEach`.

## Context pack
- `web/e2e/support/productionBuild.ts:serveProductionBuild` (L48), `reloadFromBuild` (L76); `web/e2e/csp.e2e.ts:L19-30`.
- DR contract: `docs/tasks/T-0390-fe-discovery-degraded-recovery.md` § Contract; CL contract: `T-0420` § Contract.

## Acceptance criteria
- [ ] DR-1/DR-2 and CL-1/CL-2 tests green in `scripts/check-e2e.sh resilience.e2e.ts`, three runs in a row.

## Work log

## Review

## Handover notes
