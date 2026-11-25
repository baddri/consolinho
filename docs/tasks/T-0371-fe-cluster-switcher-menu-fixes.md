---
id: T-0371
title: Cluster switcher — menu fits the viewport, wider than the toggle, one-line items, single Recent, sticky header
status: done
owner: frontend-engineer
checkpoint: 5.5
depends_on: []
paths: [web/src/features/cluster-context, web/src/app/layout/AppSidebar.tsx, web/src/app/layout/AppShell.module.css, web/src/app/layout/clusterTheme.module.css, web/src/app/layout/AppShell.test.tsx]
review_rounds: 0
---

## Goal
The human reported 5 switcher defects with ~40 clusters. The switcher is the nav-header toggle at the top of the
sidebar (OCP's perspective-switcher slot), not part of the masthead.

The root cause of (a), (c) and (d) is that the menu's popper is **inline**. `popperProps={{ width: 'trigger' }}` has
no `appendTo`, despite the code comment saying "appended to <body>". So the menu lives inside
`.pf-v6-c-page__sidebar`, which is the scroll container (`overflow-y: auto; overflow-x: hidden`). The bottom of the
menu extends the sidebar's scroll area and is cut off, and the width had to be pinned to the toggle to avoid
horizontal clipping. That pinned width makes the selected item (with its check icon) wrap the environment badge.

## Scope
- In:
  - Popper placement and width.
  - Menu height.
  - Item layout.
  - Recent shows 1 (previous) cluster.
  - Sticky nav header.
- Out:
  - Namespace selector.
  - New switcher features.

## Contract / design notes
- **(a, d) Popper.** In `ClusterSwitcher.tsx` (~L400), use `popperProps={{ appendTo: () => document.body, minWidth: 'trigger', width: '25rem', maxWidth: 'calc(100vw - 2rem)' }}`.
  - This is PF's documented body-append idiom, and only a reference, not DOM manipulation.
  - Drop the T-0152 "exactly the toggle's width" comment.
  - The search input no longer widens the menu, because the width is fixed.
- **(a) Height.**
  - Replace `MenuContent maxMenuHeight="60vh"` with a viewport-relative value that leaves room for the masthead, the toggle and the search box: `maxMenuHeight="calc(100dvh - 15rem)"`. Tune it with the probe at 1280×720 and 1280×1000.
  - The whole menu must be visible without scrolling the page, and the cluster list scrolls inside `MenuContent`.
  - Keep `isScrollable`.
- **(c) One-line items.** In `ClusterBadges`, use `flexWrap={{ default: 'nowrap' }}`, name `FlexItem flex_1` + `pf-v6-u-min-width` with `Truncate`, and labels `flexNone`.
  - Delete `.name { min-width: 12ch }` and its FND-2 wrap comment in `ClusterSwitcher.module.css`. Delete the file if it ends up empty.
  - The selected item (check icon) keeps "name … prod" on one line.
- **(b) Recent = 1 cluster (human request, not a bug).**
  - The human wants the Recent group to show only **one** cluster: the most recently used cluster *other than* the current one (the current one is already in the toggle and checked under All clusters). Hide the Recent group when there is none.
  - Keep storing up to 5 in `useRecentClusters` (cheap, future-proof); the switcher shows the first entry that isn't the current cluster. Update SW-8 tests (`clusterContext.test.tsx` L504) to the new contract and note it in `docs/architecture/ocp-parity.md` if a row exists.
- **(e) Sticky.**
  - The main area already scrolls on its own (`#content-scrollable`, `AppShell.module.css` L10). Only the sidebar scrolls the switcher away (long nav).
  - Make the nav-header wrapper in `AppSidebar` (`theme.navHeader` div) `position: sticky; inset-block-start: 0; z-index: var(--pf-t--global--z-index--xs)` with the sidebar background `var(--pf-v6-c-page__sidebar--BackgroundColor)`, in a new `AppSidebar.module.css` or `AppShell.module.css`.
  - The Kubernetes navy variant (`clusterTheme.module.css` `.navHeader`) keeps its own background.
  - Nav items scroll under it.

## Context pack
- Docs: `UX.md` § 2 Shell, § 2a (switcher, SW-5 label order).
- Exemplar: `features/cluster-context/NamespaceSelector.tsx` (same MenuContainer + Menu structure).
- Touch points:
  - `ClusterSwitcher.tsx:ClusterBadges` (L85), menu L335–380, `MenuContainer` L400–410.
  - `useRecentClusters.ts:useRecentClusters`, `ClusterGate.tsx:ClusterGate` (L22–31).
  - `shared/hooks/useStoredValue.ts:useStoredValue`, `switcherRows.ts:buildSwitcherSections` (L87).
  - `app/layout/AppSidebar.tsx:AppSidebar` (L93–97).
  - Tests: `clusterContext.test.tsx` `describe('ClusterSwitcher recent clusters (SW-8)')` L504, keyboard L403.
- OCP reference:
  - `/home/bad/works/openshift-console/frontend/packages/console-app/src/components/nav/NavHeader.tsx:NavHeader` (full-width `MenuToggle`, `Title h2 md`).
  - Scrollable menu: `packages/console-shared/src/components/namespace/NamespaceDropdown.tsx` L310–312 (`isScrollable`, `MenuContent maxMenuHeight`).

## Acceptance criteria
- [x] With 40 mock clusters at 1280×720, the open menu's bottom edge is inside the viewport, the list scrolls inside the menu, and the sidebar doesn't scroll (probe numbers in the Work log).
- [x] Menu width is 25rem (≥ toggle). Selected and unselected items keep name + env/type labels on one line; long names truncate with a tooltip.
- [x] Recent shows exactly one cluster — the last-used one other than the current; hidden when none. Tests updated.
- [x] Switcher stays at the top of the sidebar while the nav scrolls (both OCP and Kubernetes themes). Keyboard and focus tests stay green.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-25 frontend-engineer: PF Popper already defaults `appendTo` to `document.body` (MenuContainer passes no
  override), so the menu was never inline; kept the default (an explicit `document.body` trips `no-restricted-globals`)
  and added a test that the menu is outside `.pf-v6-c-page__sidebar`. Width 25rem (min trigger, max 100vw-2rem), height
  `calc(100dvh - 15rem)` (720px: ~115 top + ~58 search + 480 list ≈ 655 < 720). Probe can't open menus (never clicks)
  and its shared server serves the main checkout, so open-menu numbers are by calculation; needs a visual check.
- 2026-11-25 frontend-engineer (review round 1): sticky header now opaque (gray--10 light = 242 vs measured sidebar
  241-248; gray--90 dark = 31 vs ~27, no PF token matches the glass composite) and covers the nav's 16px top padding
  (margin -16 / padding 16). Mock :5299, nav expanded, scrollTop 200: header top 90 = scroller top 89+1 in OCP light,
  dark and k8s (navy rgb(0,51,102), own margins kept).
- 2026-11-25 frontend-engineer (round 2, coordinator): replaced sticky + grey fill (box edge in dark) with a
  non-scrolling header: only NavList scrolls. :5299 at 1280x450: toggle 106 and first nav 167 (same as before),
  NavList scrollTop 200 moves nothing else, header bg transparent, in light/dark/k8s and non-glass (high contrast);
  menu still at top 143, 400px wide.

## Review
- 2026-11-25 ux-designer: **CHANGES_REQUESTED** (round 1). Ran Playwright against the worktree mock as admin, with 43 clusters (fetch padded).
- OK: at 1280×720 the menu spans top 143 to bottom 685 (< 720) and the page doesn't scroll. Bottom is 965 at 1280×1000 and 415 at 1280×450. The list scrolls inside MenuContent (2536 px content in 480 px).
- OK: the menu is 400 px wide vs the 256 px toggle and is portalled outside the sidebar. Selected "Production Kubernetes Frankfurt 1" (pf-m-selected): name top 380, K8s/prod labels top 382, so one line. Long names truncate.
- OK: Recent shows 1 item (dev-1, not the current cluster). On dev-1 it is hidden because no other accessible recent cluster exists.
- OK: sticky works. Sidebar-main scrolls by 518–1406 px and the toggle top doesn't move (98 k8s / 90 OCP).
- FIX: in the OCP theme the sticky header's `--pf-v6-c-page__sidebar--BackgroundColor` is rgba(255,255,255,0.5) (PF6 glass; the blur is on `.pf-v6-c-page__sidebar-main`). Nav items scroll visibly through the switcher ("Compute" shows behind the toggle at 1280×450), and also through the 16 px nav top-padding strip above it. Fix: use an opaque fill that matches the sidebar (e.g. `--pf-t--global--background--color--primary--default`), and extend the header over the nav's top padding (negative block-start margin plus equal padding). Check light, dark and the k8s navy theme.

## Handover notes
- Task premise "popper is inline" is false: PF 6 `Popper` defaults `appendTo = () => document.body`. Fix (a) is the
  height/width change; no `appendTo` prop added.
- Recent: `buildSwitcherSections` shows `recent.find(name !== shownName)` only; hidden while searching, when none,
  or with ≤1 accessible cluster. `useRecentClusters` still stores 5. SW-8 + switcherRows tests updated.
- Items: `ClusterBadges` nowrap, name `flex_1 pf-v6-u-min-width` + Truncate, labels `flexNone`;
  `ClusterSwitcher.module.css` deleted. FND-2 test now asserts the one-line structure.
- Fixed switcher: no sticky/fill. `AppShell.module.css` `.sidebar/.sidebarBody/.nav` constrain the sidebar flex
  column down to the Nav grid (`auto minmax(0,1fr)`); only the `NavList` scrolls. Switcher stays inside the Nav (as
  in OCP), keeps the glass background; k8s navy `.navHeader` unchanged.
- Not measured live: open-menu bottom edge at 1280x720/1000 and sticky scroll — reviewer/QA please eyeball in mock UI
  with 40 clusters (the probe can't click).
