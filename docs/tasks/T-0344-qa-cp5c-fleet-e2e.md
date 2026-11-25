---
id: T-0344
title: CP5c QA — Playwright fleet overview (non-admin, unreachable cluster, row switch), AC verification
status: todo
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
- [ ] QG5C-2 flows green, stable over 3 runs.
- [ ] Every §5c.1 AC ticked or a bug task filed.
- [ ] `scripts/check-fe.sh` green.

## Work log

## Review

## Handover notes
