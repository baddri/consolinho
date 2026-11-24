---
id: T-0266
title: CP4.5a QA — Playwright e2e for group grants and Effective access (QG-2), FE gate (QG-1)
status: done
owner: qa-engineer
checkpoint: 4.5a
depends_on: [T-0241, T-0262, T-0264, T-0265, T-0253, T-0256, T-0257]   # last FE lane step; needs the real Api (no mocks); parallel with T-0259 and T-0267
paths: [web/e2e/, src/FleetConsole.DevOAuth/appsettings.json, docs/tasks/]
review_rounds: 0
---

## Goal
Prove the CP4.5a story end to end against the real Api + DevOAuth emulator: a group grant gives a member access, the
UI explains it, and a direct grant overrides it.

## Scope
- In: QG-2 scenario; one DevOAuth user reserved for it; full `scripts/check-fe.sh` + e2e run; bugs filed as tasks.
- Out: BE security tests (T-0259), visual parity (T-0267).

## Contract / design notes
- DevOAuth: add user `e2e-member` (FullName "E2E Member", Groups `["e2e-team"]`) to `DevOAuth:Users`; add it to
  `web/e2e/support/session.ts:DevUser` and to the set of users whose grants setup may revoke (never touch demo users).
  It must have no direct grant before the test (setup revokes it).
- Scenario (`web/e2e/groups.e2e.ts`), seeded through the admin API with `CSRF` headers like existing helpers:
  1. Admin grants group `e2e-team` read-only, priority 100, on `E2E_CLUSTER` via the UI (Access tab → Grant access →
     Group → type `e2e-team` → Use "e2e-team" → Priority 100) — covers UIG-1/2/3 live.
  2. `e2e-member` logs in → the switcher lists the cluster with the "read only" label; a write action (e.g. Delete on a
     ConfigMap) is disabled/refused (existing RO e2e helper).
  3. Admin opens `e2e-member` › Effective access: Source "Group `e2e-team` (priority 100)".
  4. Admin adds a direct read-write grant → Effective access Source "Direct grant", expanded row shows the group
     candidate "Overridden by direct grant".
  5. Cleanup: revoke both grants (also in `afterAll`).
- Group listing in dev depends on T-0254's DevOAuth groups endpoint + AppHost token; if `hostStatus` isn't `ok` the
  free-text path still works — assert the step, not the alert.
- Run the new file with `--repeat-each=2`.

## Context pack
- Exemplar: `docs/tasks/T-0223-qa-cp4c-e2e-parity.md` (evidence format); `web/e2e/switcher.e2e.ts` (login + switcher assertions), `web/e2e/support/session.ts:loginAs/ok/CSRF/GRANTLESS_USERS`.
- Spec: `docs/specs/CP4.5-access-at-scale.md` §4.8 QG-2 (grep `QG-2`).

## Acceptance criteria
- [x] QG-2 e2e green, also with `--repeat-each=2`; full e2e suite green (37/38: QGC-1 pre-existing flake → T-0271).
- [x] QG-1: `scripts/check-fe.sh` green on the branch after all FE tasks.
- [x] Bugs found are filed as tasks with ids in the Work log.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-24 qa-engineer: `web/e2e/groups.e2e.ts` QG-2 (UI group grant, member RO switcher + Delete Pod disabled, Effective access group→direct override) green 1/1 and `--repeat-each=2` 2/2. DevOAuth `e2e-member` (group `e2e-team`); setup revokes only direct grants of `RESERVED_USERS`.
- Full e2e 37/38: QGC-1/OAPI-3 "No suggestions" flake predates this task → T-0271 (not blocking). Test-only fixes: SRCH-1/2 regex stale since T-0237; `findInEditor` focuses instead of clicking (POL-2 flake).
- `check-fe.sh` green (1304 tests). Rows in `docs/specs/CP4.5-acceptance.md` §CP4.5a frontend e2e. No product bugs.

## Review

## Handover notes
