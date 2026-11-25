---
id: T-0340
title: Fleet perspective for everyone — /fleet/overview route, Fleet nav section, switcher entry
status: done
owner: frontend-engineer
checkpoint: 5c
depends_on: []
paths: [web/src/features/fleet, web/src/app/router.tsx, web/src/app/router.test.tsx, web/src/app/layout/navigation.ts, web/src/app/layout/AppSidebar.tsx, web/src/app/layout/AppShell.test.tsx, web/src/features/cluster-context/switcherRows.ts, web/src/features/cluster-context/switcherRows.test.ts, web/src/features/cluster-context/ClusterSwitcher.tsx, web/src/features/cluster-context/clusterContext.test.tsx, web/src/shared/routing]
review_rounds: 1
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
- [x] Non-admin: switcher shows "Fleet management"; selecting it lands on `/fleet/overview` with sidebar section Fleet > Overview only.
- [x] Admin: Fleet > Overview first, then Fleet administration sections.
- [x] `/fleet` and `/fleet?x=1#h` redirect to `/fleet/overview` keeping query/hash; router test updated.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-25 frontend-engineer: `features/fleet` (lazy `fleetRoute`, placeholder "Fleet overview"), `fleetOverviewPath()`,
  `/fleet` → `overview`, `buildFleetNav(isAdmin)` with "Fleet" > "Overview" first, switcher Fleet group for everyone
  (`isAdmin` dropped from `SwitcherSectionsInput`); router/AppShell/switcher tests updated.
- 2026-11-25 full gate: tests 1478/1478 and build ok; lint+typecheck fail only in concurrent WIP
  `networking/networkpolicies/*` (not this task); targeted gate on fleet/app/cluster-context/routing fully green.
- 2026-11-25 fix round 1: F1 "Select a cluster" in `Title h2 md`; F2 `MenuSearch` only with ≥1 cluster (tests: bob, failed load, retry); TSDoc wrapped.

## Review
- 2026-11-25 ux-designer, round 1: **CHANGES_REQUESTED** (mock 1280 light; alice, bob, admin; OCP ref `/dashboards`).
  - OK: `/fleet` → `/fleet/overview` (query kept); alice sees "Fleet" only, admin "Fleet" then "Fleet administration"; sections start collapsed, as in OCP `console-app/src/components/nav/NavSection.tsx` (`useState(false)`); the toggle is always openable, as in OCP `nav/NavHeader.tsx`, where the toggle is an enabled `MenuToggle` whenever there is more than one perspective. Every user now has at least two choices (Fleet plus clusters), so removing the disabled toggles is correct.
  - F1 switcher toggle, no shown cluster — "Select a cluster" is plain text at 14px/400 Red Hat Text, but OCP `NavHeader.tsx` L110 always wraps the toggle label in `<Title headingLevel="h2" size="md">` (probe: 16px/600 Red Hat Display, as on our "Fleet management") — fix: render "Select a cluster" in the same `Title h2 md` in `ClusterSwitcher.tsx` (~L429).
  - F2 switcher menu, bob (no grants) and failed load — the menu shows a "Search clusters" field above "Fleet management" when there is nothing to search (OCP's perspective menu has no search; a field that matches nothing is noise) — fix: render `MenuSearch` only when `clusters` holds at least one cluster; keep "No clusters" / the retry row in the body.
- 2026-11-25 frontend-architect, round 1: **APPROVE**.
  - Switcher deviation accepted: with Fleet open to everyone (FLT-1), a disabled "No clusters"/"Clusters unavailable"
    toggle would lock zero-grant or error-state users out of the fleet perspective; the openable "Select a cluster"
    toggle with in-menu status/retry rows is the correct generalisation of the former admin path. Spec SW-2/SW-4
    (`docs/specs/CP1-identity-and-admin.md`) annotated as superseded by FLT-1/T-0340.
  - `isAdmin` removal: no admin-only leak; `switcherRows`/`ClusterSwitcher` no longer read the role, admin gating stays in
    `buildFleetNav(isAdmin)` (sidebar) and `RequireAdmin` (routes); FLEET-8 test covers non-admin on `/fleet/admin/*`.
  - Targeted gate: typecheck ok; lint error `resources/details/ResourceDetailsPage.tsx:77` and test failure
    `AppShell.test.tsx:88` (Operators/Compute sections) both come from T-0331/T-0305 WIP, not this diff — T-0331 must
    update that `AppShell.test.tsx` expectation.
  - Nit (optional): `fleet/routes.tsx:FleetPageSpinner` duplicates admin's fallback; a shared `PageSpinner` in
    `shared/ui` would be a follow-up. Nit: `ClusterSwitcher.tsx` TSDoc line ~189 is over the usual wrap width.

## Handover notes
- Switcher: the contract said `needsClusters = !isFleet`, but that would keep the disabled "No clusters" / "Clusters
  unavailable — retry" toggles for non-admins and contradict "non-admins with zero clusters still get the menu". I
  removed both toggles instead (the admin behaviour for everyone): "Select a cluster" opens the menu with "Fleet
  management" + the "No clusters" body or the retry row. SW-4's disabled toggle is gone; tests updated (alice/bob).
- `features/fleet/routes.tsx` has its own small `HydrateFallback` spinner (admin's one is private to that feature).
- UX.md §2 still describes the fleet entry as admin-only: T-0343 (ux-designer) should update it.
- No UI probe run: no OCP counterpart; the nav reuses the existing `SidebarSection` (NavExpandable) look.
