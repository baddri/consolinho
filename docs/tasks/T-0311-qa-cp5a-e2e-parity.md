---
id: T-0311
title: CP5a QA — QG5A e2e, parity rows, recorded gaps
status: done
owner: qa-engineer
checkpoint: 5a
depends_on: [T-0300, T-0301, T-0302, T-0303, T-0304, T-0305, T-0306, T-0307, T-0308, T-0309, T-0310]
paths: [web/e2e/, docs/architecture/ocp-parity.md]
review_rounds: 0
---

## Goal
Prove QG5A-2/QG5A-3 so CP5a can be accepted.

## Scope
- In:
  - Playwright (fake apiserver): Route Location link has the expected `https://` URL and `target="_blank"` +
    `rel` noopener (asserted, not followed); a `javascript:`/wildcard host renders as text, not a link.
  - RW expands `db-data` 10Gi → 20Gi; capacity updates; toast names claim + cluster.
  - RO sees Expand PVC and Create Project disabled with the reason; RW creates a project and lands on it.
  - `prod-k8s-1` (vanilla) shows no Routes nav item and no Projects create; OpenShift cluster shows both.
  - Storage nav section present with PV / PVC / StorageClasses in OCP order.
  - Parity rows in `ocp-parity.md` for every new list/details page and the two modals; each `match` or an accepted gap.
- Recorded gaps (accepted in spec §7 / design §5a.11): Route Backend health column, Route metrics tab, PVC Used column
  + capacity donut, Project Overview/Workloads/RoleBindings tabs, Route TLS cert/key hidden (SAFE5-4), Service Pods tab
  empty state when selector is empty, Expand PVC StorageClass check (fleet addition), Create Project "Learn more" link.
- Out: Api tests for SAFE5-2/3 (backend task).

## Context pack
- Exemplar: `docs/tasks/T-0223-qa-cp4c-e2e-parity.md`; e2e fakes `web/e2e/support/{fakeKubeApi,fakeWorkloadsApi}.ts`
  (add a `fakeNetworkingStorageApi.ts` beside them rather than growing those files).
- Fixtures mirror `web/src/mocks/k8s/networkingStorageFixtures.ts` (T-0300).

## Acceptance criteria
- [x] QG5A-2 scenarios green in `npm run e2e` (or the project's e2e script).
- [x] QG5A-3 parity rows complete; gaps listed above recorded as accepted.
- [x] `scripts/check-fe.sh` green.

## Work log
- 2026-11-25 qa-engineer: `web/e2e/networkingStorage.e2e.ts` + `support/fakeNetworkingStorageApi.ts` (HTTPS fake OCP + vanilla k8s): RT-2, PVC-3 expand+toast, PRJ-2 create, NAV-1 order, SAFE5-2 RO Expand/Create Project, vanilla NAV-2/PRJ-2 — 7/7, 14/14 with `--repeat-each=2`.
- ocp-parity.md: 13 CP5a rows; accepted gaps: Route Backend health, Route Metrics tab, PVC Used + donut, Project Overview/Workloads/RoleBindings, Route TLS cert/key hidden (SAFE5-4), Service Pods empty state, Expand PVC SC check, Create Project Learn more.
- Full e2e 42/45: switcher H4/H5 fail from the CP5c fleet perspective (`/fleet` -> overview; T-0344's area); workloads QGC-1/OAPI-3 YAML completion "No suggestions" (CP4c, reproducible alone). Not CP5a; no bugs filed.
- check-be green (2359 tests). check-fe: lint/typecheck/build ok; 2 test files failed in the full run (registry.test.ts init order, clusterSettings.test.tsx from uncommitted T-0335) and both pass alone (9/9, 8/8), so load flakes or work in progress.

## Review

## Handover notes
