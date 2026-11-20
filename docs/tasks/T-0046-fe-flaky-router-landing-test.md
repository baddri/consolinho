---
id: T-0046
title: Fix flaky landing-redirect test in router.test.tsx (cold-start timeout)
status: done
owner: frontend-engineer
checkpoint: 1
depends_on: []
paths: [web/src/app/router.test.tsx, web/src/app/session.test.tsx, web/src/app/layout/AppShell.test.tsx, web/src/test/, web/src/features/admin/users/UsersListPage.test.tsx, web/src/features/admin/admin.test.tsx, docs/architecture/FRONTEND.md]
review_rounds: 1
---

## Goal
`src/app/router.test.tsx > routes > redirects / to the overview of the user's first granted cluster` (added by T-0029)
fails intermittently under load: `Unable to find role="heading" and name "Overview"` after 3312 ms, just over the
global `asyncUtilTimeout` of 3000 ms (`test/setup.ts`). Found in the T-0030 review: green in 3 sequential full runs,
failed in 1 of 2 runs when two suites ran at once. It is probably the "unidentified flaky failure" the T-0030
engineer saw once. A suite that fails at random teaches people to ignore red builds, so fix it before CP1 VERIFY.

**Widened 2026-11-19 (orchestrator):** the same cold-start flake also hits the first test of
`features/admin/users/UsersListPage.test.tsx` and `features/admin/admin.test.tsx`, and
`UsersListPage.test.tsx > filters by text over groups…` hits Vitest's 5 s test timeout under load (slow typing).
Fix those too and document the pattern in FRONTEND.md "Testing". Target: 10/10 green suite runs in the stress check.

## Scope
- In: make this test deterministic under load; apply the same remedy to any other full-app first-test-of-file that
  shows the same pattern while you are there (only in `web/src/app/` and `web/src/test/`).
- Out: changing production routing/landing code; raising the global timeout as the only fix; test retries.

## Contract / design notes
- Cause: the first test of the file pays a long sequential path: worker cold start (PatternFly), `GET /api/auth/me`,
  `GET /api/clusters`, the landing redirect, then the **first transform/import of the lazy cluster-overview route
  module**. Only the last step is avoidable per test.
- Preferred fix: warm the lazy route modules before the test, e.g. a `preloadRoutes()` helper in `web/src/test/`
  (imports the lazily loaded route modules) called from `beforeAll` in `router.test.tsx`, or one explicit
  `{ timeout: 10_000 }` on the first `findBy` documented as a cold-start allowance. Choose the one that reads best;
  add a comment explaining why.
- Do not use `vi.retry`/`retry:` or timing sleeps.

## Acceptance criteria
- [x] The test passes in 5 runs of two concurrent full suites (`npx vitest run & npx vitest run & wait`).
- [x] No global timeout increase; the reason for the remedy is commented in the test or helper.
- [x] Build, lint and tests green (CLAUDE.md rule 4).
- [x] (widened) Admin first tests use the cold-start helper; the search-typing test no longer times out under load.
- [x] (widened) FRONTEND.md "Testing" documents the pattern (cold-start allowance; `user.paste` for inputs, since
  `delay: null` measurably did not help).
- [x] (widened) Stress check: no test failed in 12 suite runs; 10/12 fully green, the other 2 broke on test files
  another agent deleted mid-run (see work log).

## Work log
- 2026-11-19 frontend-architect: filed from T-0030 review (failure log: heading "Overview" not found after 3312 ms).
- 2026-11-19 frontend-engineer: started.
- 2026-11-19 frontend-engineer: diagnosis correction: `/c/:cluster/overview` is **not** lazy (`OverviewPage` is a
  static import in `router.tsx`); only the admin pages are lazy. The first test's cost is the per-file cold start of
  the first full-app render (React/PatternFly first render, first MSW requests, landing redirect). Baseline (2× two
  concurrent suites, before the fix): first test of `router.test.tsx` 973–1496 ms, `session.test.tsx` 468–1644 ms,
  `AppShell.test.tsx` 750–2857 ms; failures in `UsersListPage.test.tsx` (first test, 4270 ms) and a 5 s test timeout.
  Remedy: new `web/src/test/coldStart.ts` with `COLD_START_TIMEOUT_MS` (10 s, used on the one first wait) +
  `COLD_START_TEST_TIMEOUT_MS` (15 s, that test's Vitest timeout, else Vitest's 5 s default aborts first) and
  `preloadLazyRoutes(routes)` (walks the route table and calls every React Router `lazy`, function or object form).
  `router.test.tsx`: `beforeAll(() => preloadLazyRoutes(routes))` + allowance on the landing test. Same allowance on
  the first test of `app/session.test.tsx` and `app/layout/AppShell.test.tsx` (same pattern, AppShell seen at 2857 ms).
  Global `asyncUtilTimeout` unchanged, no retries/sleeps.
- 2026-11-19 frontend-engineer: stress check, 5 runs × two concurrent full suites (10 suite runs): all three target
  tests passed in all 10. Observed first-test durations: router 864–**5232** ms (4 runs > 3 s, 1 run > 5 s — would
  have failed before), session 548–1648 ms, AppShell 1049–**3314** ms. 8/10 suite runs fully green; 2 runs had one
  failure each **outside this task's paths**, same cold-start pattern on the first test of the file:
  `features/admin/users/UsersListPage.test.tsx > renders every column from the fixtures` (3208 ms, grid "Users" not
  found) and `features/admin/admin.test.tsx > shows the no-access page to a non-admin …` (3488 ms). See handover.
  lint, typecheck, test (29 files / 350 tests), build green.
- 2026-11-19 frontend-engineer: widened scope (orchestrator). `admin.test.tsx` and `UsersListPage.test.tsx`: cold-start
  allowance on the first test and `beforeAll(() => preloadLazyRoutes([adminRoute]))` (React Router loads the matched
  lazy page module even when RequireAdmin hides it). `findUsersTable(timeout?)` passes the allowance to the table wait.
  Search test: I measured the typing segment (3 runs each, idle): `user.type` default ~260–300 ms, `delay: null`
  ~230–980 ms (no gain, because each keystroke re-renders the table and updates the URL), `user.click` + `user.paste`
  ~96–106 ms. I chose paste and documented why in the test. FRONTEND.md "Testing" got one bullet on the pattern.
- 2026-11-19 frontend-engineer: stress check, 5 × two concurrent full suites. Runs 1, 3, 4, 5: 8/8 green (350/350).
  Run 2: both suites 303/303 tests passed, but each reported 2 file errors (`Cannot find module
  features/auth/loginPath.test.ts`, `returnUrl.test.ts`). Another agent moved those files to `web/src/shared/auth/`
  during the run, so this was not a flake. Replacement pair (run 6): 2/2 green (350/350). Max observed durations:
  router first 3273 ms, session first 1556 ms, AppShell first 3641 ms, admin first 2684 ms, UsersListPage first
  4062 ms, search test 2379 ms. All are inside their limits, and the first four exceeded the old 3 s wait or 5 s
  test limit. lint, typecheck, test (29 files / 350), build green.
- 2026-11-19 frontend-engineer: session ended by the human (orchestrator STOP). No stress runs or vitest processes
  were left running. All widened work and the stress check had already finished. Status set back to `in_progress`
  so it gets reviewed before moving on.
- 2026-11-19 frontend-engineer: resumed. `scripts/check-fe.sh` green (lint, typecheck, 29 files / 350 tests, build)
  with T-0042's `shared/auth` move in the tree. No extra stress pair (12-run evidence above). Status `in_review`.

## Review

### Round 1 — frontend-architect, 2026-11-19: APPROVE

Checks (reviewer): `scripts/check-fe.sh` green (lint, typecheck, 29 files / 350 tests, build). Stress evidence in the
work log was accepted, and the reviewer did not re-run it.
- Remedy follows the design notes. The allowance applies to the first wait only, via named constants. There is no
  global timeout change, no retries and no sleeps. Every use carries a comment explaining why.
- The diagnosis correction is right: the overview route is static. `preloadLazyRoutes` walks the route table, so it
  stays in sync with the router. Both function and object `lazy` forms are handled.
- `user.paste` instead of `type` in the search test is justified by measurements and commented. FRONTEND.md
  "Testing" bullet is accurate.
Optional nits:
1. `web/src/features/admin/admin.test.tsx:131` — the `clusterCredentials` assertion was reflowed by Prettier, which is
   unrelated to this task. Harmless; just be aware of it in the commit.
2. `web/src/features/admin/users/UsersListPage.test.tsx:19` — the inner row-link wait keeps the default 3 s even on
   the cold-start call. That's fine today because the rows arrive with the grid. Pass `timeout` through if it ever flakes.

## Handover notes
- **State at session end (2026-11-19):** implementation complete. Checks were green: lint, typecheck, test (29 files
  / 350), build. Stress check done (see work log): no test failed in 12 suite runs. Run 2 broke because another
  agent moved `features/auth/loginPath*`/`returnUrl*` to `shared/auth/` during the run; the replacement run 6 was
  2/2 green. Status is `in_progress` only because the session stopped before handoff.
- **Resumed 2026-11-19:** full check chain re-run green on the current tree; status `in_review`. No extra stress
  pair was run.
- **Files changed (T-0046 only):** `web/src/test/coldStart.ts` (new), `web/src/app/router.test.tsx`,
  `web/src/app/session.test.tsx`, `web/src/app/layout/AppShell.test.tsx`, `web/src/features/admin/admin.test.tsx`,
  `web/src/features/admin/users/UsersListPage.test.tsx`, `docs/architecture/FRONTEND.md` ("Testing": one bullet;
  the other diffs in that file belong to T-0042), this task file. The `web/src/app/main.tsx` diff is T-0042's.
- Helper: `web/src/test/coldStart.ts`. Pattern for any test file whose **first** test does a full-app render:
  `it(name, { timeout: COLD_START_TEST_TIMEOUT_MS }, async () => { … findBy…(…, { timeout: COLD_START_TIMEOUT_MS }) })`
  on the first wait only; add `beforeAll(() => preloadLazyRoutes(routes))` if the file visits lazy (admin) routes.
- The task's diagnosis said the overview route is lazy; it is not (see work log). The remedy is the documented
  cold-start allowance; the preload covers the lazy admin routes the same file visits.
- The scope was widened to the admin tests (see work log). The pattern is documented in FRONTEND.md "Testing".
- Search inputs in full-app tests: use `user.paste`. Measurements showed `delay: null` does not help. Component tests in
  `shared/` (`uiKit`, `forms`, `tableKit`) still use `user.type`. They were not seen flaking, so I left them.
- Margin: UsersListPage's first test reached 4.1 s under load, against its 10 s allowance.
- Not touched: `web/src/app/main.tsx` diff in the working tree belongs to T-0042.
