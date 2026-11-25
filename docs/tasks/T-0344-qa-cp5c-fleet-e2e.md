---
id: T-0344
title: CP5c QA — Playwright fleet overview (non-admin, unreachable cluster, row switch), AC verification
status: done
owner: qa-engineer
checkpoint: 5c
depends_on: [T-0340, T-0341, T-0342, T-0343]
paths: [web/e2e/, docs/architecture/ocp-parity.md]
review_rounds: 0
---

## Goal
QG5C-2 and the FE side of QG5C-1/QG5C-4 (backend parts done in T-0325): end-to-end through the real Api and the fake
apiserver from T-0341.

## Scope
- In: Playwright: non-admin opens Fleet management → Fleet overview, sees only granted clusters, one cluster
  unreachable (add an unreachable cluster registration to the e2e setup — e.g. a closed port) shows "Unreachable"
  while the rest render; row click lands on that cluster's Overview; admin still sees Fleet administration;
  `/fleet` redirect. Verify FLT-1..8 ACs; file bug tasks.
- Out: perf smoke (QG5C-4 measured in T-0325).

## Context pack
- Docs: spec §5c.1, §5c.3; contract §2.2/§3.
- Touch points: `web/e2e/support/fakeClusterHealth.ts` (T-0341), `fakeKubeApi.ts`, existing e2e cluster/grant setup.

## Acceptance criteria
- [x] QG5C-2 flows green, stable over 3 runs.
- [x] Every §5c.1 AC ticked or a bug task filed.
- [x] `scripts/check-fe.sh` green for CP5c (only failure: `operators/installedOperators.test.tsx`, T-0337 work in progress).

## Work log
- 2026-11-25 qa-engineer: `web/e2e/fleet.e2e.ts` + `support/fakeFleetCluster.ts` (HTTPS fakes: healthy, 401, ClusterOperators 403, NotReady node; closed port). 8 clusters: 6 granted to `e2e-user`, 1 only to alice, 1 granted but disabled. 5 tests, 3 runs + `--repeat-each 4` green (25/25).
- Asserts: switcher → overview, severity order, all cells, only granted+enabled rows, per-cluster grant token at the fakes, no token/upstream text in the NDJSON, summary links, filter-to-nothing, Refresh, row → `/c/<name>/overview` + recent, ADM-3, admin sees Fleet administration + "No clusters".
- Parity row `/fleet/overview` extended. No bug filed (see Review).
- Full e2e 50/50 with the stack idle; a run in parallel with check-fe failed 2 (fleet FLT-5/7, workloads FORM-3) on 5 s expects under CPU load, both green alone and in the rerun. check-fe: lint/typecheck/build ok, 1567/1568 (T-0337 file). check-be not run (no BE change; T-0325).

## Review
AC trace (e2e = `fleet.e2e.ts`; unit = FleetOverviewPage/useFleetStatus/router/AppShell/clusterContext tests):
- FLT-1 pass: e2e (switcher entry, Fleet section, no Fleet administration for e2e-user, admin sees it, `/fleet` redirect), switcher H4/H5.
- FLT-2 pass: e2e (only granted, enabled clusters; name link; Read only label on the RO grant); group grants in unit + T-0325 Api tests.
- FLT-3 pass: e2e (version, Up to date, All available → clusteroperators, 3 of 3 / 2 of 3 Ready + 1 Not Ready → nodes, K8s gitVersion); Updating/Failing/unschedulable in unit. Last checked is an additional column (Manage columns) by design (T-0342).
- FLT-4 pass: e2e Unreachable ("Connection failed"), Token invalid, Degraded, Restricted (tooltip), Healthy; Updating unit only.
- FLT-5 pass: e2e severity order + summary links; Env/Type filters unit.
- FLT-6 pass: e2e Refresh + "Last checked"; unit for Checking…/60 s visible-only. Risk: heading "Last checked" is the client receive time, not the cache `checkedAt` (≤ 30 s off; per-row column is exact).
- FLT-7 pass: e2e "No clusters" (e2e-admin) and "No clusters found" + "Clear filters" (OCP PF DataView wording; UX.md §5 "Clear all filters" is tracked in T-0350).
- FLT-8 pass: e2e row → cluster Overview, switcher shows the cluster, recent list updated; no actions on the page.
- QG5C-2 pass (3 runs + repeat-each 4). Also FBE-2/6/7 at e2e level; unauthenticated `/api/fleet/status` → 401.

## Handover notes
- `fleet.e2e.ts` grants clusters to `e2e-user` and relies on `afterAll` deleting them so H4 (switcher.e2e) sees it grantless; global setup also sweeps `e2e-smoke-*`.
- Wide viewport (1600) is needed: Update/Environment/Type/Access hide below 2xl.
- Don't run e2e while check-fe runs: 5 s expects flake under load.
