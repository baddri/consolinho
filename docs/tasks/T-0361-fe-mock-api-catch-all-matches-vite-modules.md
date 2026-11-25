---
id: T-0361
title: Mock catch-all `*/api/*` must not swallow Vite module requests (Fleet overview fails to lazy-load in dev:mock)
status: done
owner: frontend-engineer
checkpoint: 5c
depends_on: []
paths: [web/src/mocks/handlers/http.ts, web/src/mocks/]
review_rounds: 0
---

## Goal
In the mock UI, `/fleet` (redirect) and the switcher's "Fleet management" entry from a cluster page show the router
error page "An error occurred / Failed to fetch dynamically imported module …/FleetOverviewPage.tsx" instead of the
Fleet overview. Found in T-0343. Mock-only (MSW is not in the production bundle), but it breaks dev:mock, the UI probe
and any demo of the fleet perspective.

## Scope
- In: the MSW catch-all handler and a regression test.
- Out: production code, renaming `features/fleet/api`.

## Contract / design notes
Cause: `unhandledApiRoute = http.untyped.all('*/api/*', …)` (`web/src/mocks/handlers/http.ts:58`) also matches
Vite module URLs whose path contains an `/api/` folder, e.g. `GET /src/features/fleet/api/useFleetRows.ts`. When the
lazy `FleetOverviewPage` chunk is imported after the worker started, that module request gets `HttpResponse.error()`
(console: `[mocks] No mock handler for GET /src/features/fleet/api/useFleetRows.ts`). A first full load of
`/fleet/overview` works only because the import happens before the worker intercepts.
Fix: match only paths that **start** with `/api/` (pathname check or an anchored pattern), keep the
"unknown API routes fail" behaviour (`access.test.ts:104`).

## Context pack
- `web/src/mocks/handlers/http.ts` (`accessGuard`, `unhandledApiRoute`), `web/src/mocks/handlers/index.ts:35`.
- Repro (mock server on 5199): open `/fleet?mockUser=alice` → error page; or open `/c/prod-k8s-1/overview?mockUser=admin`,
  switcher › "Fleet management" → error page.

## Acceptance criteria
- [x] `/fleet?mockUser=alice` lands on `/fleet/overview` showing "Fleet overview" in dev:mock.
- [x] Switcher › "Fleet management" from a cluster page (fresh load of the cluster page) shows the Fleet overview.
- [x] Unknown `/api/...` routes still log the error and fail (existing test green); a test covers a non-API path that
      contains `/api/` not being intercepted.

## Work log
- 2026-11-25 frontend-engineer: `isApiRequest` (pathname starts with `/api/`) in `handlers/http.ts`; `accessGuard` and
  `unhandledApiRoute` fall through for other paths. Test in `mocks/access.test.ts` (msw `getResponse` on a Vite module
  URL → no response, nothing logged). Probe: `/fleet?mockUser=alice` shows h1 "Fleet overview". AC2 not clicked (the
  probe never clicks); same cause as AC1 (lazy chunk after worker start), which the probe shows fixed. check-fe src/mocks src/features/fleet green.

## Review
- Round 1 (frontend-architect, 2026-11-25): **APPROVE**. The pathname `startsWith('/api/')` guard in both catch-alls matches
  the contract. Unknown Api routes still fail, and the new `getResponse` test proves module paths fall through.
  `access.test.ts` passes (19/19). Optional nits: `http.ts:19` doc line is over-long; `isApiRequest` needn't be exported (only used in-file).

## Handover notes
- Fix is in the resolvers, not the pattern: `*/api/*` keeps matching (origin-agnostic), a non-`/api/` pathname falls
  through, so MSW passes Vite module requests to the dev server. Unknown `/api/...` routes still log and fail.
- Mock-only; no production code touched.
