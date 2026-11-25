---
id: T-0389
title: "label: bug — Cluster landing stays on the skeleton and refetches discovery in a tight loop when /api + /apis fail (breaks QG-4/HOST-3 e2e)"
status: todo
owner: frontend-engineer
checkpoint: 5.5
depends_on: [T-0383]
paths: [web/src/features/resources/ClusterLanding.tsx, web/src/shared/k8s/discovery.ts, web/src/features/cluster-context/useNamespaceFallback.ts]
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
- [ ] With discovery failing, `/c/<cluster>` redirects (baseline: Namespaces list or fallback pods) and discovery is
      requested a bounded number of times; a unit/MSW test covers the error path.
- [ ] Default `npm run e2e` green (browse, csp).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
