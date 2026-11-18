---
id: T-0003
title: Frontend skeleton — Vite, React, TS, PatternFly 6 shell, tooling
status: done
owner: frontend-engineer
checkpoint: 0
depends_on: []
paths: [web/]
review_rounds: 0
---

## Goal
Create `web/` following `docs/architecture/FRONTEND.md` with tooling that enforces the rules from day one.

## Scope
- Vite + React + TypeScript (strict, `noUncheckedIndexedAccess`), PatternFly 6 (`@patternfly/react-core`,
  `react-icons`, `react-table`, `patternfly` css), React Router (data router), TanStack Query (+ devtools in dev).
  Use the React major PatternFly 6 officially supports (check peer deps); pin exact versions.
- Folder structure from FRONTEND.md (`app/`, `shared/`, `features/`, `test/`), path alias `@/` → `src/`.
- App shell (`app/layout`): PatternFly `Page` with `Masthead` (brand "FleetConsole", placeholder **ClusterSwitcher**
  `Select`/`MenuToggle` showing hard-coded clusters with env label colour, user dropdown placeholder, theme toggle light/dark),
  `PageSidebar` nav with OCP-like groups: Home (Overview, Search, Events), Workloads (Pods, Deployments, StatefulSets,
  DaemonSets, Jobs, CronJobs, ConfigMaps, Secrets), Networking (Services, Routes, Ingresses, NetworkPolicies),
  Storage (PVCs, PVs, StorageClasses), Compute (Nodes), Administration (Namespaces/Projects); separate "Admin" section
  for `/admin/users|clusters|credentials|audit`.
- Routes: `/` → redirect to `/c/:firstCluster/overview`; `/c/:cluster/overview`, `/c/:cluster/ns/:namespace/:resource`,
  `/c/:cluster/ns/:namespace/:resource/:name`, `/c/:cluster/cluster/:resource[/:name]`, `/admin/*`, `/login`, 404 — all
  placeholder pages rendering the route params. `useActiveCluster()` hook reads `:cluster` from the URL.
- `shared/api`: `openapi-fetch` client with base `/api`, adds `X-Console-Request: 1` on non-GET; `npm run gen:api`
  runs `openapi-typescript` against `${API_URL:-http://localhost:5000}/openapi/v1.json` → `src/shared/api/schema.gen.ts`
  (commit a minimal placeholder schema so build works before backend exists). A `useSystemInfo()` query hook calling
  `GET /api/system/info` (`{ version: string, environment: string }`) shown in the masthead "About" or footer.
- Tooling: ESLint flat config (typescript-eslint strict, react-hooks, jsx-a11y, `@typescript-eslint/no-explicit-any`
  error, feature boundary rule via `eslint-plugin-boundaries` or `import/no-restricted-paths`), Prettier,
  Vitest + jsdom + RTL + `@testing-library/user-event` + MSW (node) with `src/test/setup.ts`, render helper with providers.
- Scripts: `dev`, `build`, `preview`, `lint`, `typecheck`, `test`, `gen:api`, `format`.
- Vite dev server proxies `/api` to `process.env.services__api__https__0 || services__api__http__0 || http://localhost:5000`
  (Aspire injects these env vars) — document in vite.config.ts.
- Tests: shell renders nav + switcher; route params page; `useSystemInfo` with MSW.

## Acceptance criteria
- [x] Spec CP0 criterion 8 satisfied
- [x] `npm run lint && npm run typecheck && npm test -- --run && npm run build` pass
- [x] No `any`, no DOM selectors; TSDoc on components/hooks

## Work log
- 2026-11-18 frontend-engineer: started (in_progress). Checked peer deps: PatternFly 6.7.0 supports React 17–19 → React 19.3.1.
  Version constraints resolved: TypeScript 5.9.3 (typescript-eslint 8.73 needs <6.1, openapi-typescript needs ^5,
  msw needs >=5.9); ESLint 9.39.5 (jsx-a11y 6.10.2 does not declare ESLint 10); react-router 8.5.1 (Node >=22.22).
  All versions pinned exactly.
- 2026-11-18 frontend-engineer: scaffolded `web/` (Vite 8, strict TS + `noUncheckedIndexedAccess`, `@/` alias), app shell,
  routes, `shared/api` (openapi-fetch + CSRF middleware + `useSystemInfo`), placeholder `schema.gen.ts`, ESLint flat
  config with `eslint-plugin-boundaries`, Prettier, Vitest + RTL + MSW. 34 tests. Lint/typecheck/test/build green →
  in_review.

## Review
**2026-11-18 frontend-architect — round 1: APPROVE**

Checks run by reviewer: `npm run lint && npm run typecheck && npm test -- --run && npm run build` all pass (5 files, 34 tests;
build warns about the 573 kB JS chunk). Rule probes using deliberate violations: a feature importing another feature's internal file, `shared` importing
a feature, `any`, and `document.querySelector` all fail lint. `npm audit --omit=dev`: 0 vulnerabilities.

Checklist: feature boundaries OK (lint-enforced); data goes through `shared/api` only; no k8s queries yet. `systemInfoQueryKey` is
intentionally not cluster-scoped, and that is documented. The footer has loading, error and success states. No `any`, no DOM selectors. PF6 used
idiomatically (`Page`/`Masthead`/`MastheadMain`+`MastheadToggle`, `Select`+`MenuToggle`, `NavExpandable` with router
`NavLink` children, `SkipToContent`). a11y labels are present on all icon-only controls. MSW tests fail on unhandled requests. TSDoc is present.

Deviations:
1. baseUrl = page origin: **accepted**. T-0004 maps endpoints under `app.MapGroup("/api")`, so the ASP.NET OpenAPI
   document emits full `/api/...` paths. A `/api` base would produce `/api/api/...`. T-0004 must not add an OpenAPI
   `servers` entry with `/api`. FRONTEND.md updated.
2. `/c/:cluster/search` and `/admin/:section` with a 404 for unknown sections: **accepted**. FRONTEND.md routing updated.
3. Theme toggle in the masthead: **accepted** (the task asked for this; FRONTEND.md was stale and is now updated).
4. `<html>` class toggle: **accepted**. It is isolated in `shared/theme/ThemeProvider.tsx` inside one effect, with TSDoc
   explaining why. Now documented in FRONTEND.md UI conventions.
5. React 19.3.1 / TS 5.9.3 / ESLint 9.39.5: **accepted**. These are within PF 6.7 peer ranges and the toolchain constraints, and are pinned exactly.
6. 573 kB bundle with no splitting: **accepted** for a skeleton. Follow-up: route-level `lazy` once real pages land.
7. 17 high audit findings: **accepted**. They are dev-only (prod audit is clean). Revisit when upstream fixes `picomatch`.

Optional nits (not blocking):
- `web/eslint.config.js:58` — the `no-restricted-properties` DOM rule only matches the bare `document` object, so
  `globalThis.document.querySelector(...)` or `window.document...` would slip through. Consider a `no-restricted-syntax`
  selector on the property names.
- `web/src/test/render.tsx:33` — `renderWithProviders` is unused. Keep it only if the next FE task needs it.
- `web/src/shared/api/client.test.ts` — the CSRF middleware is unit-tested but not tested through `apiClient` on a
  non-GET call. Add that test when the first mutating endpoint appears in the schema.

## Handover notes
**Done**
- Layout: `web/src/app/` (`main.tsx`, `App.tsx`, `router.tsx` = route table exported as `routes`, `providers.tsx`,
  `queryClient.ts`, `RouteErrorPage.tsx`, `layout/` = `AppShell`, `AppMasthead`, `AppSidebar`, `navigation.ts`,
  `ThemeToggle`, `UserMenu`, `SystemInfoFooter`). Features: `cluster-context` (ClusterSwitcher, `useActiveCluster`,
  `clusterSwitchPath`, hard-coded `PLACEHOLDER_CLUSTERS` with env label colours prod=red/staging=orange/dev=green),
  `home`, `resources`, `admin`, `auth` (placeholder pages, each with a public `index.ts`). Shared: `shared/api`,
  `shared/ui` (`PlaceholderPage`, `NotFoundPage`), `shared/theme` (`ThemeProvider`, `useTheme`).
- Cluster switch keeps the current page type (`/c/a/ns/x/pods` → `/c/b/ns/x/pods`); non-cluster pages → overview.
- System info (`GET /api/system/info`) is shown in the sidebar footer, with loading/error states.
- ESLint enforces `no-explicit-any`, no `document.querySelector`/`getElementById`/… (except `main.tsx`), and feature
  boundaries via `boundaries/dependencies`: shared ↛ features/app; features and app import other features only
  through `index.ts`; `*.test.*` files may import `src/test`. All verified with deliberate violations.
- Tests (`src/**/*.test.ts(x)`, 34): shell (masthead, nav sections, active item, cluster switch, version footer +
  error, theme toggle), routes (redirects, params for ns/cluster-scoped list/details, admin, login, 404s),
  `useSystemInfo` with MSW (success + 500), CSRF header logic, `clusterSwitchPath`. MSW fails on unhandled requests.

**Deviations / decisions for review**
- **`apiClient` base URL is the page origin, not `/api`.** ASP.NET's OpenAPI document lists full routes
  (`/api/system/info`), so generated `paths` already start with `/api`; a `/api` base would produce `/api/api/...`.
  If T-0004 emits paths without the prefix (e.g. via a server URL), switch the base back to `/api`.
- Placeholder `schema.gen.ts` was produced by running openapi-typescript 7.13.0 on a minimal OpenAPI doc
  (`GET /api/system/info` → `SystemInfo {version, environment}`, operationId `GetSystemInfo`). T-0004 must
  regenerate it with `npm run gen:api` (`API_URL` overrides `http://localhost:5000`; failure leaves the file intact).
- Added a `/c/:cluster/search` placeholder route (the nav needs a Search target; it isn't in the task's route list).
- The theme toggle is in the masthead (as the task says), not the user menu (as FRONTEND.md says). The dark theme
  sets `pf-v6-theme-dark` on `<html>` from `ThemeProvider`, the single documented DOM-access exception (PF tokens
  live on `:root` and menus are portalled). The choice is remembered in `localStorage`; the default follows the OS.
- `/admin/:section` (not `/admin/*`): unknown sections render the 404 page.
- Administration nav links to `cluster/namespaces` labelled "Namespaces" (OpenShift "Projects" can come later with the registry).
- Vite proxy targets `services__api__https__0` → `services__api__http__0` → `http://localhost:5000` (with `ws`,
  `secure: false`) and honours `PORT` for Aspire. Documented in `vite.config.ts`.

**Gotchas**
- jsdom has no layout, so PF `Page` thinks it is mobile and the sidebar starts closed (`aria-hidden`). Tests open it
  through the "Global navigation" hamburger (see `openSidebar` in `AppShell.test.tsx`).
- MSW 3 renamed `onUnhandledRequest` to `onUnhandledFrame`.
- jsdom 31 exposes a non-function `matchMedia`; `ThemeProvider` guards with `typeof … === 'function'`.
- `apiClient` resolves `fetch` at call time so MSW (which patches `globalThis.fetch` on `listen()`) intercepts it.

**Not done / follow-ups**
- Build warns that the main JS chunk is >500 kB (573 kB, 171 kB gzip). Add route-level `lazy` code-splitting once real pages exist.
- `npm audit`: 0 issues in production deps; 17 high in dev-only tooling (transitive `picomatch` ReDoS). Revisit
  when upstream releases a fix.
- There's no MSW browser worker for `npm run dev` without a backend yet; add one if needed.
- The ProblemDetails error mapping in `shared/api` is not done yet (comes with the first mutating admin API).
