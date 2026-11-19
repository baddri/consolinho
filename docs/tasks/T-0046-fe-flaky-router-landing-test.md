---
id: T-0046
title: Fix flaky landing-redirect test in router.test.tsx (cold-start timeout)
status: todo
owner: frontend-engineer
checkpoint: 1
depends_on: []
paths: [web/src/app/router.test.tsx, web/src/test/]
review_rounds: 0
---

## Goal
`src/app/router.test.tsx > routes > redirects / to the overview of the user's first granted cluster` (added by T-0029)
fails intermittently under load: `Unable to find role="heading" and name "Overview"` after 3312 ms, just over the
global `asyncUtilTimeout` of 3000 ms (`test/setup.ts`). Found in the T-0030 review: green in 3 sequential full runs,
failed in 1 of 2 runs when two suites ran at once. It is probably the "unidentified flaky failure" the T-0030
engineer saw once. A suite that fails at random teaches people to ignore red builds, so fix it before CP1 VERIFY.

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
- [ ] The test passes in 5 runs of two concurrent full suites (`npx vitest run & npx vitest run & wait`).
- [ ] No global timeout increase; the reason for the remedy is commented in the test or helper.
- [ ] Build, lint and tests green (CLAUDE.md rule 4).

## Work log
- 2026-11-19 frontend-architect: filed from T-0030 review (failure log: heading "Overview" not found after 3312 ms).

## Review

## Handover notes
