---
id: T-0042
title: "npm run dev:mock" — SPA against the MSW browser worker, without the backend
status: todo
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0023, T-0028]
paths: [web/package.json, web/vite.config.ts, web/msw/, web/src/mocks/browser.ts, web/src/app/main.tsx, web/eslint.config.js, README.md (frontend section only)]
review_rounds: 0
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
- [ ] `npm run dev:mock` serves the app; as `admin` the admin pages work end-to-end against mocks (manual check of
      users list, cluster detail, a mutation; record in work log); `VITE_MOCK_USER=bob` shows the no-clusters page.
- [ ] `npm run build` output contains neither `mockServiceWorker.js` nor MSW code.
- [ ] README frontend section documents the mode and its limitation. Build, lint, tests green.

## Work log

## Review

## Handover notes
