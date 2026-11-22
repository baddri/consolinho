---
id: T-0144
title: Move admin pages to /fleet/admin/* with legacy /admin redirects
status: done
owner: frontend-engineer
checkpoint: 3.7
depends_on: []
paths: [web/src/shared/routing, web/src/app/router.tsx, web/src/app/router.test.tsx, web/src/app/session.test.tsx, web/src/app/layout/navigation.ts, web/src/app/layout/AppShell.test.tsx, web/src/features/admin, web/src/features/cluster-context, web/src/features/auth/UserMenu.test.tsx, web/src/shared/ui/pageBlocks.test.tsx, web/src/shared/table/tableKit.test.tsx, web/src/shared/auth/returnUrl.test.ts, web/e2e, web/eslint.config.js, docs/architecture/FRONTEND.md]
review_rounds: 0
---

## Goal
FLEET-6/7/8 (ADR-0033 §1–3): every admin page lives under `/fleet/admin/<rest>`; `/admin` and `/admin/<rest>`
redirect there (replace, query + hash kept). Paths are built in one place so CP5's fleet routes slot in. No visual change.

## Scope
- In: `shared/routing` module; `fleet` route + legacy redirect; every `/admin/...` literal in SPA code, tests, e2e
  replaced; ESLint guard; FRONTEND.md "Routing" table + bullets updated (`/fleet/admin/...`, legacy redirect line).
- Out: sidebar/switcher changes (T-0145). `/api/admin/*` strings are untouched (they are API paths).

## Contract / design notes
- `web/src/shared/routing/index.ts` (new shared element; no feature knowledge):
  ```ts
  export type Perspective = 'cluster' | 'fleet';
  export const FLEET_PATH = '/fleet';
  /** `/fleet/admin/<rest>`; `rest` already encoded by the caller, no leading slash ('' ⇒ '/fleet/admin'). */
  export function fleetAdminPath(rest = ''): string;
  /** 'fleet' for `/fleet` and `/fleet/...`, else 'cluster'. Pure. */
  export function perspectiveOf(pathname: string): Perspective;
  /** perspectiveOf(useLocation().pathname). */
  export function usePerspective(): Perspective;
  ```
- `app/router.tsx`: replace `adminRoute` child with
  `{ path: 'fleet', children: [{ index: true, element: <Navigate to="admin/users" replace /> }, adminRoute, { path: '*', element: <NotFoundPage /> }] }`
  plus `legacyAdminRoute`. `adminRoute` keeps `path: 'admin'` (so `/fleet/admin` index → `users` still works).
- `features/admin/LegacyAdminRedirect.tsx` + `legacyAdminRoute = { path: 'admin/*', element: <LegacyAdminRedirect /> }`
  exported from `features/admin/index.ts`: `<Navigate replace to={{ pathname: fleetAdminPath(splat), search, hash }} />`
  using `useParams()['*']` and `useLocation()`. It must not be inside `RequireAdmin` (the target is).
- Production literals → helpers: `clusterDetailPath`, `userDetailPath`, `clusterAuditPath`, `userAuditPath`,
  `NEEDS_ATTENTION_PATH`, `CLUSTERS_PATH`/`REGISTER_PATH`, breadcrumbs, `NoClustersPage` links, `buildAdminNav`
  (`navigation.ts`, keep the name until T-0145) all use `fleetAdminPath(...)`. TSDoc mentions of `/admin/...` → `/fleet/admin/...`.
- Tests/e2e: mechanical rewrite (`'/admin` → `'/fleet/admin`, `%2Fadmin` → `%2Ffleet%2Fadmin`); review with
  `git diff --stat` + spot checks, don't hand-edit 280 sites.
- ESLint (`eslint.config.js`): `no-restricted-syntax` for `Literal[value=/^\/admin(\/|$)/]` and
  `TemplateElement[value.raw=/^\/admin(\/|$)/]`, message "Use fleetAdminPath() (ADR-0033)"; override off for
  `LegacyAdminRedirect*.tsx` and its test.

## Context pack
- Docs: ADR-0033 §1–4; `FRONTEND.md` § Routing (L59-97).
- Exemplars: `web/src/features/admin/routes.tsx:adminRoute` (L24-80, index `Navigate`); `web/src/app/router.tsx:routes` L16-50.
- Touch points: `web/src/app/layout/navigation.ts:buildAdminNav`; `features/admin/clusters/clusterTarget.ts:clusterDetailPath` L10;
  `features/admin/users/userColumns.tsx:userDetailPath` L12; `clusters/ClusterDetailsTab.tsx:clusterAuditPath` L21;
  `users/UserDetailsTab.tsx:userAuditPath` L13; `credentials/credentialFilters.ts:NEEDS_ATTENTION_PATH` L31;
  `cluster-context/NoClustersPage.tsx` L17, L53; `UserDetailPage.tsx` L29, L64; `ClusterFormPage.tsx` L17, L25;
  `ClustersListPage.tsx:REGISTER_PATH`; `ClusterDetailPage.tsx:CLUSTERS_PATH`; `form/ClusterForm.tsx:CLUSTERS_PATH`;
  `CredentialsListPage.tsx` L40; breadcrumbs in `ClusterDetailHeader.tsx` L11, `UserDetailHeader.tsx` L9.
  List all: `grep -rn "['\"\`]/admin\|%2Fadmin" web/src web/e2e | grep -v /api/admin`.
- Tests: `web/src/app/router.test.tsx` (route assertions), `app/session.test.tsx` L134-143 (returnUrl).
- OCP reference: none (URL-only); OCP uses top-level prefixes per area (`/k8s/cluster/...`, `/settings/cluster`).

## Acceptance criteria
- [x] `/fleet` → `/fleet/admin/users`; every admin page renders at `/fleet/admin/<rest>` (router tests).
- [x] `/admin`, `/admin/clusters/prod-eu-1/credentials?x=1#y` → `/fleet/admin/...` with same search + hash, history
      replaced; `/admin/nope` → admin 404; login `returnUrl=/admin/users` ends on `/fleet/admin/users` (FLEET-6).
- [x] Non-admin on `/fleet/admin/users` gets today's forbidden page (FLEET-8).
- [x] No `/admin` literal outside the redirect + its test; ESLint rule fails on a new one (FLEET-7).
- [x] `perspectiveOf` unit tests (`/fleet`, `/fleet/admin/x`, `/fleetx`, `/c/a`, `/`).
- [x] FRONTEND.md Routing updated. Build, lint and tests green (CLAUDE.md rule 4).
- [x] Probe pages: none (no visual change); ux-designer smoke-checks `/fleet/admin/users` and `/fleet/admin/clusters/prod-eu-1`.

## Work log
- 2026-11-23 frontend-engineer: `shared/routing` (perspective helpers + tests), `fleet` route + `legacyAdminRoute`,
  production literals → `fleetAdminPath`, tests rewritten by sed (52 files), ESLint guard, FRONTEND.md Routing.
  `scripts/check-fe.sh` green (826 tests). No probe run: URL-only change.
- 2026-11-23 fix round 1: index redirects (`/fleet`, `/fleet/admin`) dropped query/hash; new `shared/routing` `RedirectKeepingQuery` used for both; tests for `/admin?mockUser=admin`, `/admin?x=1#h`, `/admin/clusters?x=1`, `/fleet[/admin]?x=1#h`.

## Review
- ux (round 1): APPROVE. Probe + Playwright text check on mock UI, light @1280, no images opened.
  - `/fleet/admin/users` — h1 "Users" 24px/600, margin-bottom 8px; nav item current — unchanged — OK.
  - `/fleet/admin/clusters/prod-eu-1` — h1 "prod-eu-1" 24px/600; breadcrumb "Clusters > Cluster details" 14px, link → `/fleet/admin/clusters` — OK.
  - `/admin/users?x=1#y` → `/fleet/admin/users?x=1#y`; `/admin/clusters/prod-eu-1` → `/fleet/...`; `/admin`, `/fleet` → `/fleet/admin/users` — OK.
  - alice on `/fleet/admin/users` — "You don't have access to Fleet administration" — OK.
  - Non-blocking (FE/QA): bare `/admin?mockUser=admin` lands on `/fleet/admin/users` without the search (index redirect hop drops it); AC says "same search" — check with a test if it matters.
- 2026-11-23 frontend-architect, round 1: **APPROVE**. `scripts/check-fe.sh` green (75 files / 826 tests, build ok).
  Contract matches ADR-0033 §1–4: `shared/routing` API as specified, `fleet` route (index → `admin/users`, `*` 404),
  `legacyAdminRoute` outside `RequireAdmin` with search/hash + REPLACE tested, all production literals → `fleetAdminPath`;
  grep finds no `'/admin` literal outside the redirect (comments only). ESLint selectors also cover JSX `to="/admin…"`.
- Nit (optional): `fleetAdminPath` also carries queries (`'audit?user=…'`); fine and documented, but CP5 may want a
  `{ pathname, search }` overload if more query-bearing helpers appear.

## Handover notes
- New: `web/src/shared/routing/{index,perspective,perspective.test}.ts`, `features/admin/LegacyAdminRedirect{,.test}.tsx`
  (`legacyAdminRoute` exported from `features/admin/index.ts`); `app/router.tsx` mounts `fleet` > {index → admin/users,
  `adminRoute`, `*` 404} and `legacyAdminRoute` after it.
- ESLint `no-restricted-syntax`: `Literal` matching `^/admin(/|$)` and the *head* template element only
  (`TemplateLiteral > TemplateElement:first-child`) so `${FLEET_PATH}/admin` in `fleetAdminPath` is allowed; off for
  `LegacyAdminRedirect{,.test}.tsx`. Verified it flags `'/admin'`, `'/admin/x'`, `` `/admin/${x}` ``, not `/api/admin`.
- FLEET-8 is covered by the existing `admin.test.tsx` non-admin tests, now on `/fleet/admin/...`.
- e2e had no `/admin` literals. The comment re-wrap to 120 cols touched a few neighbouring pre-existing long comment
  lines in edited files (text unchanged).
- Index redirects use `RedirectKeepingQuery` (keeps search + hash); legacy `/admin` cases live in the exempt
  `LegacyAdminRedirect.test.tsx` because the lint rule bans `/admin` literals in `router.test.tsx`.
- `buildAdminNav` keeps its name (T-0145 renames/moves it). ux-designer smoke check still pending.
