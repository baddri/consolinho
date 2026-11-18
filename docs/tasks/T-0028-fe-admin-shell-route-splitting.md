---
id: T-0028
title: Admin shell — lazy admin routes (code splitting), RequireAdmin, useAdminAccess, admin nav by role, vendor chunks
status: todo
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0027]
paths: [web/src/features/admin/, web/src/app/router.tsx, web/src/app/layout/AppSidebar.tsx, web/src/app/layout/navigation.ts, web/src/app/**/*.test.tsx, web/vite.config.ts]
review_rounds: 0
---

## Goal
Lay out every CP1 admin route once — as lazy-loaded page modules — so the page tasks that follow only fill in their
own files (no shared-file conflicts), gate the area by role (ADM-3), provide the read-only gating hook (ADM-2,
ADR-0014 §6), and resolve the CP0 follow-up "route code-splitting (bundle 574 kB)". **Parallel group F4.**

## Scope
- In: `features/admin/routes.tsx`, `RequireAdmin`, `AdminNoAccessPage`, `useAdminAccess`, `queryKeys.ts`,
  placeholder page modules, sidebar admin section visibility, Vite vendor chunking.
- Out: page content (T-0030+).

## Contract / design notes
- `features/admin/index.ts` exports `adminRoute: RouteObject`, `ADMIN_SECTIONS`, `useAdminAccess`, `adminKeys`.
  `AdminPage.tsx` (`/admin/:section`) is deleted.
- `adminRoute` = `{ path: 'admin', element: <RequireAdmin/>, children: [...] }`; every page uses React Router
  `lazy: () => import('./users/UsersListPage').then(m => ({ Component: m.UsersListPage }))` (or the module exports
  `Component`; pick one style and document it in `routes.tsx`):

  | Path | Module (placeholder until its task) | Task |
  |---|---|---|
  | index → `Navigate to="users"` | — | |
  | `users` | `users/UsersListPage.tsx` | T-0030 |
  | `users/:username` (index = Details) and `users/:username/access` | `users/UserDetailPage.tsx` (tab from path) | T-0032 / T-0039 |
  | `clusters` | `clusters/ClustersListPage.tsx` | T-0033 |
  | `clusters/new`, `clusters/:name/edit` | `clusters/ClusterFormPage.tsx` | T-0034 |
  | `clusters/:name`, `…/credentials`, `…/access` | `clusters/ClusterDetailPage.tsx` | T-0035 / T-0036 / T-0039 |
  | `credentials` | `credentials/CredentialsListPage.tsx` | T-0037 |
  | `audit` | `audit/AuditLogPage.tsx` | T-0041 |
  | `*` | `NotFoundPage` | |

  Placeholders render `PlaceholderPage` with the route params. `HydrateFallback`/pending UI: a `Spinner` while a
  chunk loads.
- `RequireAdmin`: `useCurrentUser()`; role `admin` → `<Outlet/>`; otherwise `AdminNoAccessPage` — EmptyState
  "You don't have access to Administration" + body "Ask a FleetConsole administrator if you need access." + link
  home (ADM-3).
- `useAdminAccess(): { canMutate: boolean; readOnlyReason?: string }` — `readOnlyReason = "Your account is
  read-only"` when `me.isReadOnly` (ADM-2 wording).
- `adminKeys` factory (FRONTEND.md table): `all = ['api','admin']`, `users()`, `user(username)`,
  `userGrants(username)`, `clusters()`, `cluster(name)`, `clusterCredentials(name)`, `clusterGrants(name)`,
  `credentials()`, `audit(filters)`.
- Sidebar: `buildAdminNav()` is only added when `useCurrentUser().data?.role === 'admin'`.
- `vite.config.ts`: split vendor code into stable chunks (React+router, PatternFly, TanStack/forms) using Vite 8's
  Rolldown chunking option (verify the current option name in the Vite 8 docs — `build.rolldownOptions.output`
  `advancedChunks.groups` or equivalent; do not raise `chunkSizeWarningLimit`).

## Acceptance criteria
- [ ] ADM-3: as `alice`, the sidebar has no Admin section and `/admin/users` shows the no-access page (no admin API
      call made — MSW spy); as `admin` the section shows Users, Clusters, Credentials, Audit log.
- [ ] Every route in the table resolves (router test per path, placeholder content), unknown `/admin/x/y` → 404.
- [ ] `useAdminAccess` unit test: `ines` → `canMutate=false` with the reason; `admin` → true.
- [ ] `npm run build` emits separate chunks for admin pages and no chunk-size warning; record entry/vendor/page chunk
      sizes (before/after) in the work log.
- [ ] TSDoc. Build, lint and tests green (rule 4).

## Work log

## Review

## Handover notes
