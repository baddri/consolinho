---
id: T-0145
title: Fleet perspective — "Fleet management" switcher entry and per-perspective sidebar
status: done
owner: frontend-engineer
checkpoint: 3.7
depends_on: [T-0144]
paths: [web/src/test/setup.ts, web/src/app/layout/AppSidebar.tsx, web/src/app/layout/navigation.ts, web/src/app/layout/AppShell.test.tsx, web/src/features/cluster-context, web/e2e/switcher.e2e.ts]
review_rounds: 2
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
- [x] Admin and read-only admin see "Fleet management" first in the menu, divider below, also while searching; a non-admin doesn't (FLEET-1).
- [x] Selecting it goes to `/fleet` → `/fleet/admin/users`; on `/fleet/...` the toggle shows the globe icon + "Fleet management",
      accessible name "Fleet management, switch cluster", no labels (FLEET-2).
- [x] Fleet pages: sidebar has only "Fleet administration" (Users, Clusters, Credentials, Audit log); no Home/Favorites/cluster sections (FLEET-3).
- [x] Cluster pages: no "Fleet administration" for anyone (FLEET-4).
- [x] Selecting a cluster on a fleet page goes to that cluster's root and the cluster sidebar returns (FLEET-5).
- [x] No environment band on fleet pages even with a production preferred cluster (FLEET-9); non-admin on `/fleet/admin/users` → forbidden page (FLEET-8).
- [x] Existing switcher tests pass (SW-7). Build, lint and tests green (CLAUDE.md rule 4).
- [x] Probe pages (ux review): `node scripts/ui-probe.mjs /fleet/admin/users /k8s/cluster/projects --pair '.pf-v6-c-nav .pf-v6-c-menu-toggle=[data-test-id="perspective-switcher-toggle"]'`; menu open on both sides.

## Work log
- 2026-11-23 frontend-engineer: started; perspective-aware switcher + sidebar per ADR-0033 §4–6.
- 2026-11-23 frontend-engineer: done. Switcher fleet entry/toggle, `buildFleetNav`, sidebar per perspective; unit tests
  (FLEET-1/2/3/4/5/8/9) + e2e H5 (not run, needs stack). Probe: OCP ref down; fleet toggle 256x37, 8px 16px = our cluster toggle.
- 2026-11-23 frontend-engineer: fix round 1 — admins skip error/empty toggles; arrow-key typeahead (`useTypeaheadFocus`);
  retry row; setup.ts re-stubs IntersectionObserver per test; e2e H4 admin toggle now enabled. check-fe green (847).
- 2026-11-23 frontend-engineer: fix round 3 — typeahead removed (moved to T-0153); retry keeps the menu open (skeleton
  only on first load with the menu closed), focus back in search, row "Loading clusters"; test for both perspectives.

## Review
- 2026-11-23 ux-designer, round 1: **CHANGES_REQUESTED** (OCP ref console down; compared with `console-app/src/components/nav/NavHeader.tsx` L45-133, `PerspectiveNav.tsx`, `NavSection.tsx` L26; menu opened with Playwright, mock :5199, light 1280).
  1. Switcher menu, keyboard — "Fleet management" can't be reached by keyboard: on open focus is in the search, ArrowDown stays there, Tab leaves the menu (lands on sidebar "Home"), and Enter-first-match is clusters-only by contract, so keyboard users have no path to the fleet perspective (UX.md §12; OCP's `Select`/`SelectList` toggle moves into the options with arrows) — fix: ArrowDown/ArrowUp from the search move focus into the menu items, fleet item first (PF Select typeahead pattern: `focusedItemIndex` + `MenuItem isFocused`, no DOM queries), Enter selects the focused item; add a unit test (open, ArrowDown, Enter ⇒ `/fleet/admin/users`). Same gap existed for cluster items; this task makes it blocking.
- Checked OK (no change): fleet toggle 256x37, padding 8px 16px, gap 8px = cluster toggle; icon + `Title h2 md`, no labels, aria-label "Fleet management, switch cluster" (= NavHeader toggle); menu order search / divider / Fleet list (37px item, globe 14px, pad 8px 16px, check mark when selected) / divider / clusters; entry stays while searching (`zzz` ⇒ fleet item + "No clusters match "zzz""); non-admin menu has no fleet entry; fleet sidebar = only "Fleet administration", collapsed like `NavSection.tsx` L26; cluster sidebar has no Fleet administration for admin or alice.
- Accepted deviation: OCP renders perspective option text as `Title h2 md`; our fleet entry uses plain 14px item text so it matches the cluster rows in the same menu (mixed perspective/cluster menu is a fleet invention).
- Pre-existing, not this task: with a search typed the menu grows to 299px (clear button) and overflows the sidebar edge (toggle 256px) — follow-up task candidate.
- Docs: UX.md §2 (sidebar per perspective, fleet entry/toggle) and `ocp-parity.md` "Shell: nav sections" row updated by ux-designer.
- 2026-11-23 frontend-architect, round 1: **CHANGES_REQUESTED** (check-fe green, 842 tests; e2e H5 not run).
  - `web/src/features/cluster-context/ClusterSwitcher.tsx:197-215` — in the cluster perspective the error ("Clusters
    unavailable — retry") and empty ("No clusters", disabled) early returns also apply to admins, so with
    Fleet administration gone from the cluster sidebar an admin on any non-fleet page whose cluster list failed (or
    with no grants, outside `/`) has no way into the fleet area (FLEET-1 regression vs. today's always-present admin
    section) — skip the error/empty early returns when `isAdmin` (keep the loading skeleton) so the menu opens with
    the Fleet entry and `clusterListStatus` explains the cluster list; toggle text for that case "Select a cluster";
    add one test (admin, `/api/clusters` → 500 on `/c/dev-1/overview`, Fleet management reachable).
  - Judged OK: fleet-perspective toggle not waiting for the list (its content doesn't depend on it; OCP's `NavHeader`
    neither) with the menu-body statuses; admin on the "not available" page seeing no sections (it is a cluster page,
    FLEET-4; the switcher offers Fleet management there since the list is loaded). `NoMatchStatus` gating is right.
  - Follow-up confirmed: `AppShell.test.tsx:179` `vi.unstubAllGlobals()` restores every `vi.stubGlobal`, including
    `src/test/setup.ts:23` IntersectionObserver (setup runs once per file). Fix (trivial, do it here; path added):
    re-stub in a `beforeEach` in `src/test/setup.ts`, then point the FLEET-9 case at `/fleet/admin/users`
    (`AppShell.test.tsx:248`) instead of `/fleet/no-such-page`.
  - Nit (optional): fleet-perspective "Clusters unavailable" is a disabled item with no retry
    (`ClusterSwitcher.tsx:247`); an enabled "Clusters unavailable — retry" item calling `refetch()` would match SW-4.
- 2026-11-23 frontend-architect, round 2: **CHANGES_REQUESTED** (check-fe green, 847 tests; e2e H5 not run).
  - Verified fixed: admin early returns skipped (`ClusterSwitcher.tsx:210-231`, tests `clusterContext.test.tsx:449,462`);
    IntersectionObserver re-stub in `setup.ts` `beforeEach` + FLEET-9 on `/fleet/admin/users` (`AppShell.test.tsx:248`);
    retry row (`RETRY_ITEM_ID`, test L469). No regressions in the round-1 scope.
  - `web/src/features/cluster-context/useTypeaheadFocus.ts` (new) + `ClusterSwitcher.tsx:140-166,245-256,314-320` —
    arrow-key visual focus with `aria-activedescendant` is new, unrequested scope: in no AC, no design, no OCP reference
    checked, and it hand-maintains a `rows` index list that must mirror render order. Remove it from T-0145 (restore
    the round-1 keyboard behaviour) and have the orchestrator file a follow-up task, which I'll design against
    PF `Menu`'s own keyboard handling and OCP's switcher. Re-review covers only this removal.
- 2026-11-23 ux-designer, round 2: **CHANGES_REQUESTED** (Playwright keyboard run on mock :5199; `/api/clusters` forced to 500 for the error case).
  1. Keyboard finding 1 — fixed: ArrowDown/ArrowUp from the search move through Fleet management then the clusters and wrap; typing clears the focused row; Enter on Fleet management goes to `/fleet/admin/users`, Enter on a filtered cluster goes to `/c/staging-eu-1/...`; Escape returns focus to the toggle. `aria-activedescendant` points at the `button[role=option]` row and PF `pf-m-focus` is drawn on it.
  2. Screen reader — the search `input` has `aria-activedescendant` but no `role="combobox"`, `aria-expanded` or `aria-controls`, so screen readers aren't told it controls the listbox and may not announce the active row — PF typeahead pattern (`TextInputGroupMain role="combobox" isExpanded aria-controls={listboxId}`, plus `aria-autocomplete="list"`) — fix: put those attributes on the search input (`inputProps`) and give the `Menu` listbox the matching id.
  3. Regression (new retry row) — admin with a failed cluster list: Enter or click on "Clusters unavailable — retry" makes the toggle a disabled "Loading clusters" skeleton, the menu unmounts and focus drops to `BODY`. About 1.5 s later the menu comes back open, with focus still lost (TanStack v5 resets a failed query to `pending` when it refetches) — fix: admins (and the fleet perspective) never get the skeleton toggle either, so the menu stays mounted and its All clusters row says "Loading clusters" during the refetch, as the Handover notes state.
  - No other regressions: admin error toggle "Select a cluster" is enabled and reaches Fleet management + retry; alice keeps the "Clusters unavailable — retry" toggle (unchanged SW-4); fleet and cluster sidebars unchanged.

## Handover notes
- `ClusterSwitcher`: `FLEET_ITEM_ID = 'fleet:management'` in its own `MenuList aria-label="Fleet"` (admins), above a
  divider, outside search. In the fleet perspective the toggle never waits for the cluster list; on cluster pages admins
  skip the error/empty toggles ("Select a cluster", menu opens). The All clusters list then says "Loading clusters" /
  "No clusters" or offers an enabled "Clusters unavailable — retry" row (`clusters:retry`, refetches, menu stays open).
- Keyboard: unchanged from before (Enter picks the first match); arrow-key navigation is T-0153.
- Retry: the cluster-perspective skeleton shows only while the menu is closed (TanStack v5 resets `error` on refetch).
- `NoMatchStatus` announces only when a search is typed (it would have said `No clusters match ""` with an empty list).
- `AppSidebar`: `FleetSections` (admins only) vs cluster sections; the "not available" page now shows no sections at all
  for admins (Fleet administration moved to the fleet perspective; T-0097 test updated).
- Tests that used `/fleet/admin/users` as a "non-cluster page" now use `/user-preferences/general`.
- e2e `H5` added to `web/e2e/switcher.e2e.ts`; not run here (needs the Aspire stack).
- Probe: OCP reference was not running; menu-open state can't be probed (`ui-probe.mjs` never clicks) — ux review to compare.
- `src/test/setup.ts` re-stubs IntersectionObserver in `beforeEach` (survives `vi.unstubAllGlobals()`); FLEET-9 uses `/fleet/admin/users`.
- Follow-up (not done here, per orchestrator): menu grows to 299px while searching and overflows the sidebar edge.
