---
id: T-0371
title: Cluster switcher — menu fits the viewport, wider than the toggle, one-line items, single Recent, sticky header
status: todo
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
- [ ] With 40 mock clusters at 1280×720, the open menu's bottom edge is inside the viewport, the list scrolls inside the menu, and the sidebar doesn't scroll (probe numbers in the Work log).
- [ ] Menu width is 25rem (≥ toggle). Selected and unselected items keep name + env/type labels on one line; long names truncate with a tooltip.
- [ ] Recent shows exactly one cluster — the last-used one other than the current; hidden when none. Tests updated.
- [ ] Switcher stays at the top of the sidebar while the nav scrolls (both OCP and Kubernetes themes). Keyboard and focus tests stay green.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
