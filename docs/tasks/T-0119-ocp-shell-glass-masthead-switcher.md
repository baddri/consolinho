---
id: T-0119
title: OCP parity — shell (glass theme, masthead toolbar, sidebar, cluster switcher, env banner)
status: todo
owner: frontend-engineer
checkpoint: 3.6
depends_on: []
paths: [web/src/app/layout, web/src/shared/theme, web/src/shared/branding, web/src/features/cluster-context, web/index.html]
review_rounds: 0
---

## Goal
Everything else sits inside the shell, so it goes first: make the masthead, sidebar, cluster switcher and page
background indistinguishable from the OCP console at the same width and theme. Absorbs T-0097 and T-0118 items 1–2.

## OCP reference
- Route to screenshot: `/k8s/ns/openshift-console/pods` (shell around it), `node scripts/ocp-ref/shot.mjs ...`.
- Source: `public/index.html` (theme-class script), `public/components/app.tsx` (`Page` props),
  `public/components/masthead/masthead.tsx`, `masthead-toolbar.tsx`, `public/components/about-modal.tsx`,
  `packages/console-app/src/components/nav/index.tsx`, `NavHeader.tsx`, `NavSection.tsx`,
  `public/components/kube-admin-notifier.tsx`, `public/style/_overrides.scss` (Page rules).

## Differences to fix (screen — problem — OCP — fix)
1. All pages — flat grey background, sidebar is not a card, main card opaque — OCP sets `pf-v6-theme-glass` on `<html>`
   (`index.html` L56-69; `high-contrast` when `prefers-contrast: more`) — add the contrast class next to
   `pf-v6-theme-dark` in our ThemeProvider (pre-paint script in `web/index.html` too, so no flash). PF 6.7 ships the
   glass rules (`.pf-v6-c-page__sidebar`, `.pf-v6-c-page`, masthead); no custom CSS. No `pf-v6-theme-felt` (OKD reference).
2. Masthead — theme icon button — OCP has none — remove `ThemeMenu` (moves to User preferences, T-0120; until then
   keep the stored preference working).
3. Masthead — no help menu — OCP "Help menu" (`?`, `RhUiQuestionCircleIcon`-style plain button, `aria-label="Help menu"`)
   with "Documentation" (only if we have a docs URL, else omit) and "About" — add; About opens a PF `AboutModal`
   with product name, version and environment (content of today's `SystemInfoFooter`), our logo, no Red Hat marks.
4. Sidebar — "Consolinho 0.0.0-test · Test" footer — OCP has no sidebar footer — remove (now in About).
5. Masthead user menu — items — OCP: "User preferences", "Log out" (`masthead-toolbar.tsx` L620-624) — add
   "User preferences" (route from T-0120; hide the item until T-0120 lands if done separately). Keep the Admin label.
6. Cluster switcher toggle — two lines (labels under the name), divider below — OCP `NavHeader`: one-line
   `MenuToggle isFullWidth` with icon and `Title h2 size="md"`, no divider — labels inline after the name (name
   truncates), drop the `Divider`; toggle height equals OCP's (≈37px at 1280).
7. Switcher menu — search field shows a double border and a "→" submit button [T-0118 #1] — PF `MenuSearch >
   MenuSearchInput > SearchInput` without `onSearch` button; Enter opens the first match via `onKeyDown`.
8. Switcher menu — "Recent" repeats the only cluster; bob: divider without nav [T-0118 #2] — hide both.
9. Nav on "Cluster … is not available" — cluster sections still listed [T-0097] — render only Fleet administration
   (admins); restore sections after switching to a granted cluster.
10. Nav — active section expanded, others collapsed; section order Home, (Favorites from T-0120), cluster sections,
    Fleet administration (OCP `PerspectiveNav.tsx`). Keep as is, verify after glass.
11. Environment band — custom left-aligned bar — OCP notifier banners are PF `Banner` with centred `<p>`
    (`kube-admin-notifier.tsx` L20-30) — use `Banner color="red"` (prod) / `"orange"` (staging), centred text,
    first child of the main card.

## Context pack
- Docs: `UX.md` §1 (theme classes), §2; `FRONTEND.md` § layout.
- Touch points: `web/src/app/layout/AppShell.tsx`, `AppMasthead.tsx`, `AppSidebar.tsx`, `ThemeMenu.tsx`,
  `SystemInfoFooter.tsx`; `web/src/shared/theme/ThemeProvider.tsx`; `web/src/features/cluster-context/ClusterSwitcher.tsx`,
  `EnvironmentBanner.tsx`, `ClusterGate.tsx`, `ClusterNotAvailablePage.tsx`.
- PF: `Page`, `Masthead*`, `Dropdown`, `AboutModal`, `MenuToggle`, `MenuSearch`, `Banner`.

## Acceptance criteria
- [ ] Side-by-side screenshot of `/c/dev-1/k8s/ns/shop/pods` vs OCP `/k8s/ns/openshift-console/pods` matches at 1280 in
      light and dark: floating sidebar card, background image, masthead height and toolbar, switcher height.
- [ ] Also checked at 1920; `prefers-contrast: more` gives the high-contrast theme.
- [ ] Help menu › About shows product name + version; no sidebar footer; no masthead theme button.
- [ ] Ungranted cluster URL: sidebar has no cluster sections (T-0097 criterion).
- [ ] `docs/architecture/ocp-parity.md` shell rows set to `match`.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
