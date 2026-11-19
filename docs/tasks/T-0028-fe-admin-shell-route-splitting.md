---
id: T-0028
title: Admin shell — lazy admin routes (code splitting), RequireAdmin, useAdminAccess, admin nav by role, vendor chunks
status: done
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
- [x] ADM-3: as `alice`, the sidebar has no Admin section and `/admin/users` shows the no-access page (no admin API
      call made — MSW spy); as `admin` the section shows Users, Clusters, Credentials, Audit log.
- [x] Every route in the table resolves (router test per path, placeholder content), unknown `/admin/x/y` → 404.
- [x] `useAdminAccess` unit test: `ines` → `canMutate=false` with the reason; `admin` → true.
- [x] `npm run build` emits separate chunks for admin pages and no chunk-size warning; record entry/vendor/page chunk
      sizes (before/after) in the work log.
- [x] TSDoc. Build, lint and tests green (rule 4).

## Work log
- 2026-11-19 frontend-engineer: started. Baseline `npm run build`: one JS chunk `index` 683.47 kB (gzip 202.44 kB) + chunk-size warning; CSS 1,041 kB.
- 2026-11-19 frontend-engineer: implemented `features/admin` shell (`routes.tsx` with lazy page modules,
  `RequireAdmin`, `AdminNoAccessPage`, `AdminPageSpinner` as `HydrateFallback`, `useAdminAccess`, `queryKeys.ts`,
  `adminTabs.ts`), placeholder pages, role-gated sidebar section, Vite vendor chunks via
  `build.rolldownOptions.output.codeSplitting.groups` (Rolldown 1.2.19 / Vite 8.3.8; `advancedChunks` and
  `manualChunks` are deprecated aliases). `AdminPage.tsx` deleted.
  Build after (no chunk-size warning, limit unchanged):

  | Chunk | Before | After (min / gzip) |
  |---|---|---|
  | entry `index` | 683.47 kB / 202.44 kB (everything) | 23.29 kB / 8.26 kB |
  | `vendor-react` (react, react-dom, react-router, scheduler, cookie) | — | 314.48 kB / 99.04 kB |
  | `vendor-patternfly` | — | 226.37 kB / 61.77 kB |
  | `vendor-data` (TanStack, react-hook-form, @hookform, zod, openapi-fetch) | — | 125.10 kB / 36.04 kB |
  | admin pages (7 chunks) + shared `adminTabs` | — | 0.16–0.30 kB each |
  | `rolldown-runtime` | — | 0.59 kB |
  | CSS (now named `vendor-patternfly-*.css`) | 1,041 kB | 1,041 kB (CSS is not subject to the JS warning) |

  Checks: lint, typecheck, test (25 files / 305 tests), build all green.

## Review
**2026-11-19 frontend-architect — round 1: APPROVE**

Checks run by the reviewer: lint (0 warnings), typecheck, test (25 files / 305 tests), build all green. No chunk-size
warning. `chunkSizeWarningLimit` is not set (default 500 kB). Largest JS chunk is `vendor-react` at 314.48 kB; the entry
is 23.29 kB; each admin page is its own chunk of 0.16–0.30 kB. The sizes in the work log match the build output.

Rulings on the deviations:
1. **`useAdminAccess` "Administrator role required" for non-admins: accepted.** It keeps the invariant "reason is set
   exactly when `canMutate` is false", so `disabledReason` is never `undefined` on a disabled control. It is unreachable
   behind `RequireAdmin` and tested.
2. **Tabs via route `handle` instead of `:tab?`: accepted.** It matches FRONTEND.md ("tabs are URL segments"), keeps
   the path→tab mapping in `routes.tsx`, and the router 404s unknown tabs (tested). Note for T-0032/T-0035: the tab
   routes are siblings that render the same component, so pages must not rely on a remount (or on state surviving)
   when the tab changes. Derive everything from `useAdminTab` and params.
3. **Non-admins download admin page chunks: accepted, no other guard required.** The chunks hold code only, no data.
   The same code is in the public bundle anyway, and authorization is enforced by the Api on `/api/admin/*`. A loader
   guard would break ADR-0014 §3. `admin.test.tsx` proves no `/api/admin` request is made for `alice`.
4. **Spinner only on first load: accepted** for CP1, since chunks are under 1 kB. When pages get heavier, add a
   shell-level navigation progress indicator (`useNavigation().state`) in one place, not per feature.
5. **Chunk-load failure → `RouteErrorPage`: accepted for now. Follow-up required** (orchestrator, CP3 with deploy
   work): a stale tab after a redeploy should show "A new version of FleetConsole is available — Reload" instead of
   a generic error, e.g. by detecting the dynamic-import failure in the route error element and/or handling
   `vite:preloadError`.
6. **`build.rolldownOptions.output.codeSplitting.groups`: accepted, verified.** Installed Vite 8.3.8 exposes
   `build.rolldownOptions`. In Rolldown 1.2.19, `define-config-*.d.mts` marks `manualChunks` and `advancedChunks` as
   `@deprecated` ("ignored if `codeSplitting` is also specified"). `codeSplitting.groups[{ name, test }]` is the
   documented replacement.
7. **Lazy export pattern (named export + `.then(m => ({ Component: m.X }))`): accepted.** It is consistent with the
   codebase's named exports, greppable, and documented in `routes.tsx` and the handover.

Spec checks:
- ADM-2: `ines` gets into every admin page (tested) and `useAdminAccess` returns "Your account is read-only", which
  matches the Api detail. The page tasks are responsible for actually disabling controls (ADR-0014 §6).
- ADM-3: the no-access page wording is exact ("You don't have access to Administration" as an h1, the body text, and
  a home link). Unknown admin paths also show no-access to non-admins, so the area's shape is not revealed. The
  sidebar Admin section is hidden for non-admins (tested).

Optional nits (not blocking):
- `routes.tsx`: the shared-module import lambdas are repeated (UserDetailPage ×2, ClusterFormPage ×2,
  ClusterDetailPage ×3). A `const loadClusterDetail = () => import(...).then(...)` per module would cut the
  repetition. The bundler handles the duplicates fine either way.
- `AdminPageSpinner` / `HydrateFallback` has no test. A cold-start test with a delayed `lazy` would pin the behaviour.
- `vendor-data` puts react-hook-form/zod in an eagerly loaded chunk even though only admin form pages will use them.
  That is fine for cache stability; revisit only if entry payload becomes a concern.
- **For the product owner (ACCEPT step):** ADM-3 calls the section "Administration", but the sidebar keeps "Admin"
  because the cluster nav already has an OCP-style "Administration" section (Namespaces). The no-access title says
  "Administration". Ask PO to settle the naming (e.g. rename the FleetConsole section to "FleetConsole admin" or
  similar, and align the no-access title).

## Handover notes
**Done:** all acceptance criteria. Public API (`features/admin/index.ts`): `adminRoute`, `ADMIN_SECTIONS`,
`AdminSectionId`, `useAdminAccess`, `AdminAccess`, `adminKeys`, `AuditQueryFilters`.

**For the page tasks (T-0030+):**
- Each page module exports a **named** component; `routes.tsx` loads it with
  `lazy: () => import('./area/XPage').then((m) => ({ Component: m.XPage }))`. Replace the placeholder body in your
  module only; don't touch `routes.tsx` unless you add a route. Never import a page module statically from elsewhere
  (it would pull the page back into the entry chunk).
- Detail tabs: routes set `handle: tab('access' | 'credentials')`; pages read the active tab with
  `useAdminTab(USER_DETAIL_TABS)` / `useAdminTab(CLUSTER_DETAIL_TABS)` (`adminTabs.ts`, index route = `details`).
  `ClusterFormPage` is create vs edit by presence of `:name`.
- `useAdminAccess().readOnlyReason` goes straight into `ActionButton disabledReason` / `disabledActionProps(...)`.
- `adminKeys.audit(filters)` takes the resolved request without `cursor` (`AuditQueryFilters`).

**Decisions / deviations (please review):**
- `useAdminAccess` returns a reason whenever `canMutate` is false: "Your account is read-only" (ADM-2) for read-only
  admins, and "Administrator role required" for non-admins / unknown session (unreachable behind `RequireAdmin`,
  but a disabled control must always say why).
- Tab-from-path uses route `handle` rather than optional segments (`:tab?`), so unknown tabs
  (`/admin/users/alice/unknown-tab`) 404 in the router instead of in each page.
- `HydrateFallback` is set on the `admin` route: on a cold start at an admin URL the shell renders and the page area
  shows a spinner while the chunk loads. On in-app navigation React Router keeps the current page until the next chunk
  is loaded (standard data-router behaviour; chunks are < 1 kB today). No extra pending UI added.
- Admin page chunks are still fetched for non-admins who open an `/admin/...` URL (React Router resolves `lazy`
  before rendering `RequireAdmin`). They render nothing and make no API calls (spy-tested). Moving the role check
  into a loader would avoid it but contradicts ADR-0014 §3 ("guards are layout routes"); not worth it.
- A failed chunk load (e.g. stale tab after a deploy) bubbles to the existing `RouteErrorPage` of the session route.
  A "new version available, reload" UX could be a follow-up.
- The sidebar section keeps its title "Admin" (the OCP-like "Administration" section with Namespaces already exists).

**Gotchas:**
- Vite 8 chunking option is `build.rolldownOptions.output.codeSplitting.groups`; `advancedChunks`/`manualChunks`
  are deprecated and ignored when `codeSplitting` is set.
- The PatternFly CSS bundle is 1,041 kB minified (87.9 kB gzip); Vite's size warning only covers JS chunks.
