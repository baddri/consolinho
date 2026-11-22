---
id: T-0145
title: Fleet perspective — "Fleet management" switcher entry and per-perspective sidebar
status: todo
owner: frontend-engineer
checkpoint: 3.7
depends_on: [T-0144]
paths: [web/src/app/layout/AppSidebar.tsx, web/src/app/layout/navigation.ts, web/src/app/layout/AppShell.test.tsx, web/src/features/cluster-context, web/e2e/switcher.e2e.ts]
review_rounds: 0
---

## Goal
FLEET-1..5, 8, 9 (ADR-0033 §4–6): the switcher becomes a perspective switcher like OCP's `NavHeader` — admins get a
"Fleet management" entry that leads to `/fleet`; fleet pages show only the Fleet sidebar; the cluster sidebar loses
"Fleet administration".

## Scope
- In: switcher fleet entry + fleet toggle state; `AppSidebar` content by `usePerspective()`; `buildAdminNav` → `buildFleetNav`.
- Out: cluster type icon/tag and display-name changes (T-0147); theme (T-0149).

## Contract / design notes
- `ClusterSwitcher` (cluster-context):
  - `const perspective = usePerspective()` (`@/shared/routing`); `isAdmin = useCurrentUser().data?.role === 'admin'`
    (read-only admins included, spec Q8).
  - Menu order (spec §5): `MenuSearch`; `Divider`; `MenuContent` → if `isAdmin`: `<MenuList aria-label="Fleet">` with
    `<MenuItem itemId={FLEET_ITEM_ID} icon={<GlobeIcon />}>Fleet management</MenuItem>` + `<Divider />`; then Recent /
    All clusters unchanged. The fleet item stays visible while searching; `matches`/Enter-first-match stay clusters-only.
  - `FLEET_ITEM_ID = 'fleet:management'` (module const). `onSelect`: fleet id ⇒ `navigate(FLEET_PATH)` (skip when already
    in the fleet perspective); otherwise `choose(name)` as today (`clusterSwitchPath` already maps non-cluster paths
    to the cluster root, FLEET-5).
  - Fleet perspective toggle: `icon={<GlobeIcon />}`, content `<Title headingLevel="h2" size="md">Fleet management</Title>`,
    `aria-label="Fleet management, switch cluster"`, `selected={FLEET_ITEM_ID}`; no labels. Applies to every `/fleet`
    page, also for non-admins (they see no fleet item in the menu; the page is the forbidden page).
  - Icon per UX.md §2a (`GlobeIcon`); keep `ClusterIcon` for clusters until T-0147.
- `AppSidebar`: `perspective === 'fleet'` ⇒ `NavList` with `buildFleetNav()` sections only when `isAdmin` (no Home,
  Favorites, cluster sections); `'cluster'` ⇒ today's cluster sections, never the admin section. Same
  `PageSidebar > PageSidebarBody > Nav` frame and switcher wrapper in both. Update its TSDoc.
- `navigation.ts`: `buildFleetNav(): NavSection[]` (array, so CP5 can add sections) — one section `{ id: 'fleet-admin',
  title: 'Fleet administration', items: ADMIN_SECTIONS → fleetAdminPath(id) }`; starts collapsed (spec Q6, `SidebarSection` unchanged).
- Environment band: `EnvironmentBanner` already keys on `useActiveCluster()` only, so fleet pages are neutral
  (FLEET-9) — add a test, no code change expected.

## Context pack
- Docs: ADR-0033 §4–6; `UX.md` §2 (L39-47) and §2a icons (L82-83); spec §5 "Switcher menu"/"Toggle"/"Fleet sidebar".
- Exemplars: `web/src/features/cluster-context/ClusterSwitcher.tsx:ClusterSwitcher` L135-285 (menu L208-259, toggle L271-282);
  `web/src/app/layout/AppSidebar.tsx:AppSidebar` L62-87, `SidebarSection` L17-29.
- Touch points: `app/layout/navigation.ts:buildAdminNav`; `features/auth` `useCurrentUser` (public index);
  `shared/routing` (T-0144) `usePerspective`, `FLEET_PATH`; tests `app/layout/AppShell.test.tsx` L73-117
  ("admin section" test changes meaning), `features/cluster-context/clusterContext.test.tsx`; `web/e2e/switcher.e2e.ts` L39.
- OCP reference: `/home/bad/works/openshift-console/frontend/packages/console-app/src/components/nav/NavHeader.tsx:NavHeader`
  (L45-133: toggle with perspective icon + `Title h2 md`, menu of perspectives), `.../nav/PerspectiveNav.tsx` (sidebar
  content per active perspective), `.../nav/index.tsx:Navigation`.

## Acceptance criteria
- [ ] Admin and read-only admin see "Fleet management" first in the menu, divider below, also while searching; a non-admin doesn't (FLEET-1).
- [ ] Selecting it goes to `/fleet` → `/fleet/admin/users`; on `/fleet/...` the toggle shows the globe icon + "Fleet management",
      accessible name "Fleet management, switch cluster", no labels (FLEET-2).
- [ ] Fleet pages: sidebar has only "Fleet administration" (Users, Clusters, Credentials, Audit log); no Home/Favorites/cluster sections (FLEET-3).
- [ ] Cluster pages: no "Fleet administration" for anyone (FLEET-4).
- [ ] Selecting a cluster on a fleet page goes to that cluster's root and the cluster sidebar returns (FLEET-5).
- [ ] No environment band on fleet pages even with a production preferred cluster (FLEET-9); non-admin on `/fleet/admin/users` → forbidden page (FLEET-8).
- [ ] Existing switcher tests pass (SW-7). Build, lint and tests green (CLAUDE.md rule 4).
- [ ] Probe pages (ux review): `node scripts/ui-probe.mjs /fleet/admin/users /k8s/cluster/projects --pair '.pf-v6-c-nav .pf-v6-c-menu-toggle=[data-test-id="perspective-switcher-toggle"]'`; menu open on both sides.

## Work log

## Review

## Handover notes
