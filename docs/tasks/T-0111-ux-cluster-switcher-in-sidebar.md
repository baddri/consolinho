---
id: T-0111
title: Move the cluster switcher to the top of the sidebar (OCP perspective switcher) and clean up the masthead
status: todo
owner: frontend-engineer
checkpoint: CP3.5
depends_on: [T-0110]
paths: [web/src/app/layout, web/src/features/cluster-context/ClusterSwitcher.tsx, web/src/features/cluster-context/clusterContext.test.tsx, web/src/shared/theme, web/e2e/switcher.e2e.ts]
review_rounds: 0
---

## Goal
Human ask (2): the cluster switcher lives where OCP has its perspective switcher — a full-width toggle at the top of
the sidebar above the nav — and the masthead looks like OCP's (logo left, plain icon buttons + user menu right).

## Scope
- In: `ClusterSwitcher` rendered as the first child of the sidebar `Nav`; masthead without the switcher; theme
  `ToggleGroup` replaced by a plain icon menu; unit tests and `web/e2e/switcher.e2e.ts` updated.
- Out: switcher behaviour (search, recent, path-keeping switch, SW-*), namespace selector (stays in the content area).

## Contract / design notes
- Toggle: `MenuToggle isFullWidth` (OCP `NavHeader.tsx`), icon (e.g. `ClusterIcon` from `@patternfly/react-icons`
  or the environment colour dot), content = cluster name (`Title h2 size="md"` like OCP) + compact environment label
  + "Read only" label; the accessible name stays `toggleLabel()` ("Cluster prod-eu-1 (prod, read only), switch cluster").
- Menu: opens below the toggle, at least the toggle's width (`popperProps={{ minWidth: 'trigger' }}` or equivalent);
  long names truncate with a tooltip, not overflow. Keep search, "Recent"/"All clusters", selected check.
- Placement: `AppSidebar` → `<Nav>`: switcher block (padding matching nav item inset, divider below), then sections.
  Visible also while the user has no cluster (disabled "No clusters" toggle) and on admin pages.
- On non-cluster pages (`/admin/*`) the toggle shows `usePreferredCluster()` (the cluster the nav links target) instead
  of "Select a cluster"; choosing a cluster navigates to `/c/<name>` (current `clusterSwitchPath` behaviour).
  **Decided** (orchestrator, human asked "as close to OCP as possible"): show the preferred cluster. In
  `ClusterSwitcher` (L92+): `const shown = activeCluster ?? usePreferredCluster()` — call both hooks unconditionally;
  "Select a cluster" remains only when the user has clusters but none is resolvable (should not happen). The selected
  check in the menu follows `shown`.
- Sidebar collapsed (hamburger, or < 1200 px): the switcher goes with the sidebar; prod/staging keep the environment
  banner, so the context cue stays visible.
- Masthead: `MastheadMain` (toggle + logo) and a right-aligned toolbar: theme menu (plain `MenuToggle variant="plain"`
  with sun/moon/desktop icon, items Light / Dark / System; `aria-label="Theme"`) and `UserMenu`. **Decided** (icon
  menu, not a toggle group). Replace `ThemeToggle.tsx` by `ThemeMenu.tsx` (`Dropdown` + `MenuToggle variant="plain"`,
  `SunIcon`/`MoonIcon`/`DesktopIcon`, selected item `isSelected`).
- Theme API (`shared/theme`): `type ThemePreference = 'light' | 'dark' | 'system'`; `ThemeContextValue = { preference:
  ThemePreference; theme: Theme /* resolved */; setPreference(p: ThemePreference): void }`. Stored value
  `fleetconsole.theme` ∈ light|dark|system; missing/invalid → `system`; old `light`/`dark` values keep working.
  `system` subscribes to `matchMedia('(prefers-color-scheme: dark)')` `change` inside `ThemeProvider` only
  (it is the one module allowed to touch the document, FRONTEND.md § "UI conventions"). Update every `useTheme()`
  consumer: `app/layout/ThemeToggle.tsx` (replaced) and `shared/branding.ts:useLogoSrc` (keeps using the resolved `theme`).
- Keyboard: Tab order = skip link → hamburger → logo → theme → user menu → switcher → nav. Enter/Space opens; focus
  goes to search; Escape closes and returns focus to the toggle; arrow keys move through items (PF `Menu`).

## Context pack
- Docs: `docs/architecture/UX.md` §2; `FRONTEND.md` § "Routing — the URL is the context" (switch keeps path, SW-9).
- Touch points: `web/src/app/layout/AppMasthead.tsx:AppMasthead`, `web/src/app/layout/AppSidebar.tsx:AppSidebar`,
  `web/src/app/layout/ThemeToggle.tsx`, `web/src/shared/theme/ThemeProvider.tsx` (STORAGE_KEY, OS default),
  `web/src/features/cluster-context/ClusterSwitcher.tsx:ClusterSwitcher` (toggle at L206-218, states L111-126),
  `web/src/features/cluster-context/index.ts` (`usePreferredCluster`).
- Tests to update: `web/src/app/layout/AppShell.test.tsx` L22-34 (expects the switcher in the masthead and "Light
  theme"/"Dark theme" toggle buttons), L95-104 (`aria-pressed` → menu item selected; add a System case with a mocked
  `matchMedia`), L129 (`/switch cluster|Select a cluster/`); `web/src/features/cluster-context/clusterContext.test.tsx`
  `openSwitcher(user, 'Select a cluster')` L124/233/242/267 — on admin/landing paths the toggle now names the
  preferred cluster; `web/e2e/switcher.e2e.ts` (H3 toggle name, H4 `No clusters` button now in the sidebar — scope
  queries to `getByRole('navigation', { name: 'Global' })`).
- Spec text superseded (note only, don't edit specs): CP1 `docs/specs/CP1-identity-and-admin.md` SW-2 (L282) and UI
  table L321 ("masthead switcher"); CP0 `CP0-foundations.md` L13. FRONTEND.md is already updated.
- Conflicts: `AppShell.tsx` with T-0110 (runs after it). Parallel-safe with T-0112…T-0116 (T-0112 owns
  `cluster-context/NamespaceSelector.tsx`; this task must not touch it or `cluster-context/index.ts` exports beyond
  what it needs).
- OCP: `packages/console-app/src/components/nav/NavHeader.tsx` (full-width MenuToggle + Select under it),
  `packages/console-app/src/components/nav/index.tsx` (NavHeader is the first child of `Nav`),
  `public/components/masthead/masthead-toolbar.tsx` (plain icon buttons, user dropdown).

## Acceptance criteria
- [ ] Masthead shows only hamburger, logo, theme icon menu and user menu (1280 and 1920, both themes).
- [ ] Sidebar top shows a full-width cluster toggle with name, environment label and (alice on prod-eu-1) "Read only";
      its left edge aligns with the nav items; a divider separates it from "Home".
- [ ] Open menu: search focused, Recent + All clusters groups, not clipped by the sidebar, at least as wide as the toggle.
- [ ] Keyboard-only: open, type, Enter switches cluster and keeps path; Escape returns focus to the toggle.
- [ ] `/admin/users` shows the preferred cluster in the toggle (the cluster the nav links target) — never an empty toggle.
- [ ] bob (no grants): disabled "No clusters" toggle in the sidebar; nothing in the masthead.
- [ ] Theme menu switches Light/Dark/System; choice survives reload; System follows an OS change without reload.
- [ ] `switcher.e2e.ts`, `AppShell.test.tsx`, `clusterContext.test.tsx` updated and green.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
