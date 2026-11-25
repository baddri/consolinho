---
id: T-0389
title: "label: bug — Cluster landing stays on the skeleton and refetches discovery in a tight loop when /api + /apis fail (breaks QG-4/HOST-3 e2e)"
status: done
owner: frontend-engineer
checkpoint: 5.5
depends_on: [T-0383]
paths: [web/src/features/resources/ClusterLanding.tsx, web/src/features/resources/ClusterLanding.test.tsx, web/e2e/support/fakeKubeApi.ts, web/src/shared/k8s/discovery.ts, web/src/features/cluster-context/useNamespaceFallback.ts]
review_rounds: 0
---

## Goal
Found by QA in T-0386 (default `npm run e2e`, no kind). With discovery failing, `/c/<cluster>` never redirects and the
SPA hammers the proxy. Make the landing resolve when discovery errors (baseline per ADR-0022 §8), and stop the loop.

## Repro
1. `aspire start --launch-profile http && aspire wait web`; `cd web && npx playwright test e2e/browse.e2e.ts`.
2. The fake Kubernetes API (`e2e/support/fakeKubeApi.ts`) answers `GET /api` and `/apis` with 404.
- Expected: alice on `/c/e2e-smoke-*` lands on a list (`/c/<cluster>/...`), as before CP5.5b. Discovery errors fall back
  to the baseline (`useK8sDiscovery` doc) and a 4xx is final (`retryTransientFailures`), so a few requests at most.
- Actual: URL stays `/c/<cluster>` (skeleton); trace shows **296** `GET …/k8s/api` + 296 `…/k8s/apis` (all 404) in
  ~4.4 s (~67 req/s) and one SSAR (201). Fails QG-4 x2 (`browse.e2e.ts:18,29`) and HOST-3 (`csp.e2e.ts:30`): 3 of 64.

## Suspected location
- `ClusterLanding` (T-0383) waits on `discovery.isPending || isFallback === undefined`. Something remounts the
  discovery observer while the query is in error state, so `retryOnMount` refetches it on every mount. Candidates are
  the skeleton/`useNamespaceFallback` `enabled` toggling or an observer in the shell (selector, sidebar).
- Also check whether the fake API should serve discovery (test fixture gap). The loop is a product defect either way:
  a real cluster's transient discovery 4xx/5xx would do the same.

## Acceptance criteria
- [x] With discovery failing, `/c/<cluster>` redirects (baseline: Namespaces list or fallback pods) and discovery is
      requested a bounded number of times; a unit/MSW test covers the error path.
- [x] Default `npm run e2e` green (browse, csp).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-26 frontend-engineer: root cause found (refetch-on-mount of the errored, dataless discovery query resets it
  to pending), fixed with `retryOnMount: false`; MSW test bounds discovery to 1 fetch. Fake API SSAR now allows reads.

## Review
- 2026-11-26 frontend-architect, round 1: **APPROVE**
  - Root cause and fix are correct. With no data, a refetch of an errored query resets `status` to `pending`, which
    remounts the skeleton and starts the loop. `retryOnMount: false` breaks that loop. The new test asserts exactly
    2 discovery requests, which is a sound regression guard.
  - Skeleton: `isPending` is true only while there is no data and no error. A refetch with data keeps the page.
    `isLoading` would make no difference here (it is `isPending && isFetching`). OK.
  - A final error until reload is acceptable for this bug fix, because the core-kinds baseline keeps the nav working
    and 5xx/network errors already get one retry (`retryTransientFailures`). It is weaker than OCP, though:
    OCP polls discovery every 30 s (`console-dynamic-plugin-sdk/.../api-discovery.ts:startAPIDiscovery`) and keeps
    the last good result.
  - Follow-up (recommended, new task, not a blocker): recover from transient discovery errors without the loop.
    Option: the queryFn catches the error and returns the baseline with a `degraded` flag (so the query never sits in
    `error`/`pending`), plus `refetchInterval: 30_000` while degraded, matching OCP's poll. Plain `refetchInterval`
    on today's errored query would flip `isPending` back on each poll and flash the skeleton. Add a test that a 503
    followed by 200 recovers the served kinds.
  - Nit (optional): `web/e2e/support/fakeKubeApi.ts:31-32` exceed 120 columns (146 and 125); re-wrap them.

## Handover notes
- Root cause: TanStack v5 refetches an errored query with no data whenever a new observer mounts (`retryOnMount`),
  and that refetch flips `status` back to `pending`. The landing then shows its skeleton, observers in the shell
  remount, and each one triggers another fetch. `useK8sDiscovery` now sets `retryOnMount: false`, so a discovery
  error is final for the session and the baseline answers, as its doc already said.
- Second cause of the e2e failures: the fake API denied every SSAR, so alice (no configured namespaces) hit NSF-4's
  "No namespaces available" page after the loop was fixed. Its SSARs now allow get/list/watch and deny writes (it
  already served the namespace/project lists). `ClusterLanding.tsx` and `useNamespaceFallback.ts` are unchanged.
- Verified: `scripts/check-fe.sh` green (1676 tests); browse + csp e2e green; full default e2e 60 passed.
