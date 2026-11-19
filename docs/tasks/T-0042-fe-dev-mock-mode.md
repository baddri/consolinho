---
id: T-0042
title: "npm run dev:mock" — SPA against the MSW browser worker, without the backend
status: done
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0023, T-0028]
paths: [web/package.json, web/vite.config.ts, web/msw/, web/src/mocks/browser.ts, web/src/app/main.tsx, web/eslint.config.js, README.md (frontend section only)]
review_rounds: 2
---

## Goal
Let engineers, the product owner (screenshots, UX review) and QA click through the CP1 UI before the backend endpoints
land, using the same mock backend as the tests (ADR-0016 §4). **Parallel group F5** (independent of page tasks;
touches `vite.config.ts` after T-0028).

## Scope
- In: script, Vite mock mode, browser worker bootstrap, persona selection, README note.
- Out: any mock data changes beyond what T-0023 delivered (fix bugs there only if needed).

## Contract / design notes
- `package.json`: `"dev:mock": "vite --mode mock"`.
- Worker script: `npx msw init web/msw --no-save` (commit `web/msw/mockServiceWorker.js`; do **not** add the `msw.
  workerDirectory` auto-update to package.json unless it targets `msw/`). `vite.config.ts` → `defineConfig(({ mode
  }) => ({ publicDir: mode === 'mock' ? 'msw' : 'public', … }))`; in mock mode do not configure the `/api` proxy.
- `src/mocks/browser.ts`: `setupWorker(...handlers)`; `startMockBackend()` sets the persona from
  `import.meta.env.VITE_MOCK_USER` (default `admin`; `alice`, `bob`, `ines`, `none`) and starts the worker with
  `onUnhandledRequest: 'bypass'` (Vite assets).
- `main.tsx`: `if (import.meta.env.MODE === 'mock') await (await import('@/mocks/browser')).startMockBackend();`
  before rendering. The dynamic import must disappear from production builds (verify `dist/` contains no `msw`
  code: `grep -r setupWorker dist` empty). ESLint: allow `app/main.tsx` → `mocks` only.
- Limitation documented in README: `/api/auth/login` is a full-page navigation the worker does not intercept → mock
  mode starts signed in; change persona with `VITE_MOCK_USER=alice npm run dev:mock`; "Log out" lands on `/login`
  and the login button does not work in mock mode.
- Mock data is in memory: a page reload resets it.

## Acceptance criteria
- [x] `npm run dev:mock` serves the app; as `admin` the admin pages work end-to-end against mocks (manual check of
      users list, cluster detail, a mutation; record in work log); `VITE_MOCK_USER=bob` shows the no-clusters page.
- [x] `npm run build` output contains neither `mockServiceWorker.js` nor MSW code.
- [x] README frontend section documents the mode and its limitation. Build, lint, tests green.

## Work log
- 2026-11-19 frontend-engineer: started (status in_progress).
- 2026-11-19 frontend-engineer: implemented. `dev:mock` script; `web/msw/mockServiceWorker.js` (msw 3.0.7, `npx msw
  init msw --no-save`); `vite.config.ts` as a mode function (`publicDir: 'msw'` and no `/api` proxy in mock mode);
  `src/mocks/browser.ts` (`startMockBackend`); `main.tsx` bootstrap; ESLint: only `app/main.tsx` may import `mocks`
  (file category `mock-bootstrap`, verified that `app/App.tsx` importing `@/mocks` now fails), `msw/` ignored.
  Deviations from the design notes, both to make "click through the whole UI" work:
  - MSW 3 renamed `onUnhandledRequest` → `onUnhandledFrame` (used `'bypass'`).
  - MSW 3 **does** intercept navigations of controlled pages, so `/api/auth/login` was answered by the shared
    `/api` guard (401 after logout). `browser.ts` prepends a worker-only `GET */api/auth/login` handler that 302s to
    the sanitized `returnUrl`; `vite.config.ts` has the same redirect as dev middleware (mock mode only) for the
    first load before the worker controls the page. Result: Log out → Log in works (reload = signed in again as the
    persona). The mock handlers used by Vitest are unchanged.
  - Persona switching without restart: `?mockUser=<name>` (stored in `sessionStorage` for the tab), then
    `VITE_MOCK_USER`, then `admin`; `none` = signed out.
- 2026-11-19 manual check (headless Chromium via CDP against `vite --mode mock`): as admin `/admin/users` lists all
  7 fixture users; `/admin/clusters/prod-eu-1` renders (detail page is still the placeholder from T-0028); mutation
  through the worker: `POST /api/admin/users/bob/deactivate` with version → 200, bob `deactivated`, audit entry
  "admin deactivated bob."; without CSRF header → 403; missing body → 400. `?mockUser=bob` and
  `VITE_MOCK_USER=bob` show the no-clusters page, bob on `/admin/users` gets the no-access page; alice lands on
  prod-eu-1 (Read only label), ines on prod-us-1, `none` on `/login`. Logout → 204, `/api/auth/me` → 401; then
  navigating to `/api/auth/login?returnUrl=%2Fadmin%2Fusers` lands on `/admin/users` signed in. curl: `/` and
  `/mockServiceWorker.js` (200, text/javascript) served. Servers and browser stopped afterwards.
- 2026-11-19 checks: lint, typecheck, 350 tests, build green. `dist/` has no `mockServiceWorker.js`, and
  `grep -rlE 'setupWorker|mockServiceWorker|startMockBackend|\[mocks\]|fleetconsole\.mockUser|pending-paul' dist`
  finds nothing (the `MODE === 'mock'` branch and its dynamic import are removed at build time).

- 2026-11-19 frontend-engineer: round-1 fixes (session ended by human before final sign-off).
  - Required 1 done: `features/auth/{returnUrl,loginPath}.ts` + tests moved (`mv`) to `web/src/shared/auth/`, new
    `shared/auth/index.ts`. `features/auth/index.ts` no longer re-exports them; `features/auth/LoginPage.tsx` and
    `app/session.ts` import from `@/shared/auth`. `mocks/browser.ts` and `vite.config.ts` (relative import
    `./src/shared/auth/returnUrl`) use `sanitizeReturnUrl`; both duplicated checks deleted. FRONTEND.md tree updated
    (`shared/auth/`, `buildLoginUrl` removed from the auth feature line).
  - Nit 1: `assertNotMockBuild` in `vite.config.ts` throws on `command === 'build' && mode === 'mock'` (verified:
    `npx vite build --mode mock` fails with "dev-server only"). Nit 2: comment on `publicDir`. Nit 3: `console.warn`
    in `browser.ts` for a persona not in `userFixtures` (lists the known ones).
  - Checks after the changes: lint 0, typecheck 0, 29 files / 350 tests pass, build green; `dist/` has no
    `mockServiceWorker.js` and the mock grep (`setupWorker|mockServiceWorker|startMockBackend|\[mocks\]|mockUser|
    pending-paul|onUnhandledFrame|fleetconsole-mock-login`) is empty. dev:mock smoke: `/mockServiceWorker.js` 200;
    login middleware redirects `/admin/users` → `/admin/users`, `//evil.example`, `/login`, `/%0d%0aX` → `/`.
    Server stopped. Not re-checked in a real browser after the move (worker-side login handler, persona warning).
- 2026-11-19 frontend-engineer: resumed. `scripts/check-fe.sh` green (lint, typecheck, 29 files / 350 tests,
  build); `dist/` has no `mockServiceWorker.js` or MSW code; no stale `features/auth/{returnUrl,loginPath}` imports.
  Browser recheck skipped (optional). Status `in_review`.

## Review

### Round 1 — frontend-architect, 2026-11-19: CHANGES_REQUESTED

Checks (run by reviewer): lint 0, typecheck 0, 350/350 tests, build green. `dist/` has no `mockServiceWorker.js`;
`grep -rlE 'setupWorker|mockServiceWorker|startMockBackend|\[mocks\]|mockUser|pending-paul|msw|onUnhandledFrame|fleetconsole-mock-login' dist`
is empty. Boundary verified: `src/app/App.tsx` importing `@/mocks/browser` fails with `boundaries/dependencies`;
`src/app/main.tsx` passes.

Required:
1. `web/vite.config.ts:46-51` and `web/src/mocks/browser.ts:52-54` — the return-URL rule is now in three places in
   the frontend: the real `sanitizeReturnUrl` in `features/auth/returnUrl.ts` and two copies in the mock code. The
   copies have already drifted: no control-character check, no check of the percent-decoded value, no `/login` loop
   guard. In practice this is not exploitable. The redirect only exists in dev mock mode, `searchParams.get` already
   decodes once, and Node's `setHeader` rejects CR/LF. The problem is maintainability: a "keep the copies in sync"
   handover note is how security rules drift. The reason given for not sharing it ("mocks can't import
   features/auth") goes away once the rule moves. It is a contract rule (§4.1, ADR-0014 §4), not feature logic, and
   `app/session.ts` already uses it outside the feature. Fix:
   - Move `features/auth/returnUrl.ts` (`sanitizeReturnUrl`, `buildLoginUrl`) and `features/auth/loginPath.ts`
     (`isLoginPath`), with their tests, to `web/src/shared/auth/`. Use relative imports only and no DOM APIs.
   - Update the consumers. `features/auth` imports from `@/shared/auth`. Its `index.ts` may keep re-exporting
     `buildLoginUrl`/`sanitizeReturnUrl` so other importers don't change, or `app/session.ts` can import from shared
     directly; either is fine.
   - `mocks/browser.ts` uses `sanitizeReturnUrl` from `@/shared/auth` (`mocks → shared` is allowed). `vite.config.ts`
     imports it by relative path (`./src/shared/auth/returnUrl`). The Vite config bundler resolves this, and
     `tsconfig.node.json` will type-check the imported file too.
   - Delete the duplicated rule and the "keep the two return-URL checks in sync" handover note. Update the
     FRONTEND.md tree (`shared/auth/`) in the same change.

Rulings on the design choices (all accepted):
- **`?mockUser=` + `sessionStorage`**: accepted. It is useful for PO/QA (one restart-free URL per persona), the
  per-tab scope suits side-by-side persona comparison, and the code does not reach production (verified in `dist/`).
  The README documents that the stored choice overrides `VITE_MOCK_USER`.
- **`web/msw/` as mock-mode `publicDir`**: accepted. The worker stays out of `dist/` by construction, not by
  post-build cleanup. Note: in mock mode `public/` is *not* served. That is harmless today because there is no
  `web/public/`, but whoever adds `public/` must handle it (see nit 2).
- **`onUnhandledFrame: 'bypass'`**: accepted. It is the MSW 3 replacement for `onUnhandledRequest`, and typecheck
  confirms the option. Vite modules and assets must pass through. Unknown `/api/*` routes still fail loudly
  through the mocks' own catch-all, which is what matters.
- **Lint: only `app/main.tsx` may import `mocks`**: accepted. It is tighter than before and verified. The file
  category is a clean way to express it.
- The worker-only login handler and the `apply: 'serve'` middleware for the first load (MSW 3 intercepts navigations)
  are a reasonable deviation, documented in README and the work log.

Optional nits:
1. `web/vite.config.ts:60` — defence in depth: fail fast when `command === 'build' && mode === 'mock'` (e.g.
   `throw new Error('mock mode is dev-server only')`). Today, `vite build --mode mock` would ship the worker and the
   mocks bundle. Nobody runs that, and the Containerfile uses `npm run build`, but one line makes "dev-server only"
   a guarantee.
2. `web/vite.config.ts:63` — if a `public/` directory is ever added, mock mode needs both directories, for example a
   tiny plugin or copying the worker. Worth a comment.
3. `web/src/mocks/browser.ts:36` — an unknown `?mockUser=` value silently behaves as signed out. A `console.warn`
   listing the valid personas would save a confused minute.

### Round 2 — frontend-architect, 2026-11-19: APPROVE

Checks (reviewer): `scripts/check-fe.sh` green (lint, typecheck, 29 files / 350 tests, build); `dist/` has no
`mockServiceWorker.js`, and grep for `setupWorker|mockServiceWorker|startMockBackend|mockUser|onUnhandledFrame` is empty.
- Required 1: fixed. `shared/auth/{returnUrl,loginPath}{,.test}.ts` are byte-identical to the old `features/auth`
  files (relative imports only, no DOM). Both mock copies are gone (`browser.ts:62`, `vite.config.ts:50` call
  `sanitizeReturnUrl`). No stale imports, no "keep in sync" note left. FRONTEND.md tree updated.
- Nits 1–3: done (`assertNotMockBuild`, `publicDir` comment, unknown-persona `console.warn`).
- Skipped browser recheck: low risk. The worker handler changed only in which (stricter) sanitizer it calls. An
  unknown persona → `currentMockUser()` finds no fixture → `/api/auth/me` 401, which matches the warning text.
Optional nits:
1. `web/src/mocks/browser.ts:79` — the hard-coded persona list (missing `dave`, `pending-paul`) can drift. Derive it
   from `userFixtures` like the warning does.
2. Front matter `paths` omits `web/src/shared/auth/`, `web/src/features/auth/`, `web/src/app/session.ts` and FRONTEND.md.
   Add them for the commit scope.

Doc follow-ups done by reviewer: FRONTEND.md "Testing" documents `?mockUser=`/`VITE_MOCK_USER`, the `msw/` publicDir
and build-time removal. The boundary sentence now says only `main.tsx` may import `mocks`. `web/.prettierignore` lists `msw`.

## Handover notes
- Run: `cd web && npm run dev:mock`; persona via `?mockUser=` (per tab) or `VITE_MOCK_USER`. README section
  "Try the UI without a backend" documents personas and limitations (in-memory data, simulated login).
- Mock-mode code lives in `src/mocks/browser.ts` (worker-only login redirect + persona resolution) and the
  `mockLoginRedirect` plugin in `vite.config.ts`. Both use the single return-URL rule in `web/src/shared/auth/`.
- After an `msw` upgrade, regenerate `web/msw/mockServiceWorker.js` (`cd web && npx msw init msw --no-save`); MSW
  warns in the browser console when the worker and library versions differ.
- Round-1 state (session ended mid-task, status in_progress): all review items (required 1, nits 1–3) are
  implemented and lint/typecheck/tests/build were green with a mock-free `dist/` (see work log). Files changed in
  round 1: moved `web/src/features/auth/{returnUrl,loginPath}{,.test}.ts` → `web/src/shared/auth/`, new
  `web/src/shared/auth/index.ts`, edited `web/src/features/auth/index.ts`, `web/src/features/auth/LoginPage.tsx`,
  `web/src/app/session.ts`, `web/src/mocks/browser.ts`, `web/vite.config.ts`, `docs/architecture/FRONTEND.md`.
  Resumed and finished: full checks green with T-0046 in the tree; status `in_review` (review_rounds 1). Not
  re-verified in a real browser after the move: Log out → Log in via the worker handler, and the warning for
  `?mockUser=nobody` (reviewer may spot-check).
- The new `mock-bootstrap` ESLint file category covers `src/app/main.tsx` only; other `app/` files can no longer
  import `@/mocks` (none did).
