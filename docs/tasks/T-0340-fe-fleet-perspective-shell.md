---
id: T-0340
title: Fleet perspective for everyone — /fleet/overview route, Fleet nav section, switcher entry
status: todo
owner: frontend-engineer
checkpoint: 5c
depends_on: []
paths: [web/src/features/fleet, web/src/app/router.tsx, web/src/app/router.test.tsx, web/src/app/layout/navigation.ts, web/src/app/layout/AppSidebar.tsx, web/src/app/layout/AppShell.test.tsx, web/src/features/cluster-context/switcherRows.ts, web/src/features/cluster-context/switcherRows.test.ts, web/src/features/cluster-context/ClusterSwitcher.tsx, web/src/features/cluster-context/clusterContext.test.tsx, web/src/shared/routing]
review_rounds: 0
---

## Goal
FLT-1/FLT-2 shell: every signed-in user can enter the Fleet perspective, sees a "Fleet" > "Overview" sidebar section
and lands on `/fleet/overview` (placeholder body until T-0342). Admins keep "Fleet administration".

## Scope
- In: new feature `features/fleet/` (`index.ts` exporting `fleetRoute`, lazy `FleetOverviewPage` placeholder with
  heading "Fleet overview"), router + redirect, nav, sidebar, switcher gating, tests.
- Out: data and table (T-0341, T-0342).

## Contract / design notes
- **Paths** (`shared/routing/perspective.ts`): add `fleetOverviewPath()` → `/fleet/overview`; `FLEET_PATH` stays
  `/fleet` (the switcher navigates there; the redirect does the rest).
- **Router** (`app/router.tsx` `fleet` children): index → `<RedirectKeepingQuery to="overview" />` (was
  `admin/users`, Q10); `{ path: 'overview', lazy: … }` from `@/features/fleet` (own chunk, ADR-0033 §1 pattern);
  `admin` unchanged (`RequireAdmin`). `router.test.tsx`: `/fleet` → `/fleet/overview` (query/hash kept), `/fleet/admin`
  still → users; a non-admin reaches `/fleet/overview`.
- **Nav** (`navigation.ts`): `buildFleetNav(isAdmin)` returns section `fleet` ("Fleet", item "Overview" →
  `fleetOverviewPath()`, first) plus `fleet-admin` only when `isAdmin`. `AppSidebar.tsx:FleetSections` drops the
  admin-only early return and passes `isAdmin`; update the TSDoc lines (L54, L75) and `AppShell.test.tsx`.
- **Switcher** (`switcherRows.ts` L101, `ClusterSwitcher.tsx` L230–231): the Fleet group is shown for **every**
  user; `needsClusters` = `!isFleet` (non-admins with zero clusters still get the menu with "Fleet management" +
  the "All clusters" empty body). Update TSDoc ("Fleet (admins)" → "Fleet") and both tests.
- Non-admin on `/fleet/admin/*` keeps the existing ADM-3 behaviour (no change).
- **UX.md §2** mentions the admin-only fleet entry: leave the doc to T-0343 (ux-designer) — note it in Handover.

## Context pack
- Docs: spec §5c.1 FLT-1/FLT-2, §7 Q3/Q10; FRONTEND.md § Routing (fleet perspective); ADR-0033 §1–§2.
- Exemplars: `app/router.tsx` `adminRoute` lazy module (L42–50); `features/admin/index.ts` (route export shape).
- Touch points: `app/layout/navigation.ts:buildFleetNav`, `app/layout/AppSidebar.tsx:FleetSections` (L57),
  `features/cluster-context/switcherRows.ts:buildSwitcherSections` (L85–105), `ClusterSwitcher.tsx` L217–231, L295.
- OCP reference: none (fleet invention); nav look = OCP `NavSection`/`NavItem` as already used by `AppSidebar.tsx`.

## Acceptance criteria
- [ ] Non-admin: switcher shows "Fleet management"; selecting it lands on `/fleet/overview` with sidebar section Fleet > Overview only.
- [ ] Admin: Fleet > Overview first, then Fleet administration sections.
- [ ] `/fleet` and `/fleet?x=1#h` redirect to `/fleet/overview` keeping query/hash; router test updated.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
