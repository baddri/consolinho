---
id: T-0119
title: OCP parity — shell (glass theme, masthead toolbar, sidebar, cluster switcher, env banner)
status: done
owner: frontend-engineer
checkpoint: 3.6
depends_on: []
paths: [web/src/app/layout, web/src/shared/theme, web/src/shared/branding, web/src/features/cluster-context, web/index.html]
review_rounds: 2
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
   glass rules (`.pf-v6-c-page__sidebar`, `.pf-v6-c-page`, masthead); no custom CSS. Also set `pf-v6-theme-felt` always (human decision 2026-11-22: OpenShift look; OCP `public/index.html` adds it for non-OKD branding).
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
10. Nav — all sections start collapsed (orchestrator 2026-11-22, mirror OCP `NavSection.tsx` L26; active one marked current); section order Home, (Favorites from T-0120), cluster sections,
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
- [x] Side-by-side screenshot of `/c/dev-1/k8s/ns/shop/pods` vs OCP `/k8s/ns/openshift-console/pods` matches at 1280 in
      light and dark: floating sidebar card, background image, masthead height and toolbar, switcher height.
- [x] Also checked at 1920; `prefers-contrast: more` gives the high-contrast theme.
- [x] Help menu › About shows product name + version; no sidebar footer; no masthead theme button.
- [x] Ungranted cluster URL: sidebar has no cluster sections (T-0097 criterion).
- [x] `docs/architecture/ocp-parity.md` shell rows set to `match`.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-22 frontend-engineer: started; glass+felt theme classes, help menu/About, switcher one-line, banner.
- 2026-11-22 frontend-engineer: done. Compared with OCP at 1280/1920 light+dark: masthead 73px, toggle 256x37 at y=106,
  sidebar card/background identical; high contrast checked via `contrast: more`. Search focus ring = OCP's. Gate green.
- 2026-11-22 frontend-engineer: fix round 1 — toggle title clips (`pf-v6-u-text-truncate`, 8px gap before labels,
  alice/prod-eu-1 1280); Recent hidden when only the shown cluster; all nav sections start collapsed (tests use
  `expandSection`); ClusterGate reuses `useIsActiveClusterUnavailable`. Gate green (720 tests).

## Review

### Code (frontend-architect)
**APPROVE** (round 1). `scripts/check-fe.sh` green (lint, typecheck, 719/719, build; `dist/theme-init.js` emitted).
- CSP: `/theme-init.js` is a same-origin classic script → allowed by `script-src 'self'` (SecurityHeadersMiddleware L27); inline would not be. Correct choice; sync note in both files.
- `dev:mock` gap is real but pre-existing (`public/favicon.svg` already unserved); vite.config is outside `paths` → follow-up task, not in scope. Its comment `web/vite.config.ts:112-114` ("if a `public/` directory is ever added") is stale — fix in that follow-up.
- `AppMasthead.module.css`: justified by UX.md L20-22 (OCP uses custom SCSS for the masthead logo box; colocated module, OCP path in comment, PF vars only, no colours).
- `session.test.tsx`: necessary consequence of removing the footer (system/info no longer observed in the shell); test intent preserved. OK outside `paths`.
- Theme preference: stored value still applied by `ThemeProvider` + pre-paint; no UI to change it until T-0120 (its AC L44 covers it). T-0120 must land before CP3.6 closes.
- Nits (optional): `ClusterGate.tsx:22` could use `useIsActiveClusterUnavailable` to keep one definition of "not granted"; `AboutModal` now shows the full version string (old `formatVersion` shortening dropped) — fine if intended.
- Round 2: **APPROVE**. Gate green (720/720). Collapsed-by-default sections verified against OCP `NavSection.tsx` L26 (`useState(false)`); UX.md L41 and ocp-parity row agree. `ClusterGate` reuse is equivalent; `showRecent` logic correct and tested; `test/sidebar.ts:expandSection` fine. Nit (optional): `ClusterSwitcher.tsx` ToggleContent dropped the `Truncate` tooltip, so a clipped name has no hover tooltip (the menu still shows it).

### Visual (ux-designer)
**CHANGES_REQUESTED** (round 1). Compared against OCP `/k8s/ns/openshift-console/pods` (ocp branding) at 1280/1920, light/dark, plus `contrast: more`.
Shell geometry is identical to OCP in all four combinations: masthead 73px, sidebar card 0,89 322w, main card 322,89, toggle 33,106 256x37, banner 323,90 940x29. `<html>` gets glass+felt (+dark), or high-contrast under `contrast: more`, same as OCP `public/index.html`.
- 1, 2, 4, 9, 11 OK: glass sidebar card and background match; no theme button; no sidebar footer; not-available shows only Fleet administration (admin, prod-eu-1); bob gets a disabled "No clusters" toggle and an empty nav; prod/staging `Banner` red/orange with centred text, first in the card (`kube-admin-notifier.tsx` L20-30).
- 3 OK: Help menu `?` plain button with only "About", menu right-aligned under it like OCP's. About = PF `AboutModal` with logo, product name, description, `dl` version/environment, no watermark (`about-modal.tsx` L159-185). Light and dark both OK.
- 7 OK: no "→" button. The focused search shows the browser focus ring inside the input border, and OCP's project dropdown search (`NamespaceDropdown`) looks the same (`outline:auto 1px`, `:focus-visible`).
- 5 OK for this task: user menu is "Signed in as …" + Log out. "User preferences" comes in T-0120 (`masthead-toolbar.tsx` L618-627).
- **Fix: switcher toggle, alice on prod-eu-1 at 1280.** The name overflows its flex item and the ellipsis touches the `prod` label ("prod-e…prod", no gap). Measured: FlexItem 71-124, `.pf-v6-c-truncate` 71-137, label starts at 132. OCP `NavHeader.tsx` L100-113 keeps the title inside the toggle. Fix: make the `Title h2` shrink and clip inside its FlexItem (min-width 0 / overflow hidden on the Title, not only on the FlexItem) so the `spaceItemsSm` gap shows before the first label.
- Suggestion (non-blocking, 8): for alice, "Recent" lists only the active cluster, which repeats the checked row under "All clusters". Consider leaving the active cluster out of Recent, or hiding Recent when that is all it would show.
- Note (10, non-blocking, decision for the orchestrator): OCP `main` `NavSection.tsx` L26 `useState(false)` leaves every section collapsed, including the active one (the reference screenshot shows Workloads collapsed on Pods). We expand the active section. The task says "keep as is", so I recorded it as a deliberate difference in `ocp-parity.md`.
- Parity matrix: the "Shell: project bar" row was wrong and is now a gap. OCP's toggle is 16px text, flush at x=346, 42px high, and the bar has no top padding (`_dropdown.scss` L49-58, `NamespaceDropdown.scss` L30-40). Ours is 14px with padding (text at x=354) and sits 16px lower. This is out of scope here; route it to T-0121 or a follow-up.

**Round 2: APPROVE.** Re-checked only the fixes at 1280, light and dark, as alice on prod-eu-1, bob and admin.
- Switcher toggle: the Title is clipped at 71-124 and the `prod` label starts at 132, an 8px gap. The ellipsis no longer touches the label, which matches OCP `NavHeader.tsx` L100-113. Admin on dev-1: Title 71-111, label at 119.
- Recent: alice on prod-eu-1 (a fresh session) gets no Recent group. The menu is the search field, a divider, then the two clusters. bob still has the disabled "No clusters" toggle and an empty nav.
- Nav: every section starts collapsed on Pods (admin: Home, Workloads, Networking, Administration, Fleet administration), the same as the OCP reference screenshot and `NavSection.tsx` L26.

## Handover notes
- Theme: `ThemeProvider` sets dark + glass/high-contrast (live `prefers-contrast`) + felt; pre-paint in
  `web/public/theme-init.js` (a file, not inline as in OCP: CSP `script-src 'self'`, ADR-0029). Keep both in sync.
  Under `dev:mock` `publicDir` is `msw/`, so the pre-paint file isn't served there (ThemeProvider still applies classes;
  favicon has the same gap) — follow-up: serve `public/` in mock mode (vite.config.ts).
- Masthead: `HelpMenu` (About only) + `AboutModal` (version/environment, replaces `SystemInfoFooter`; `ThemeMenu` and
  `formatVersion` deleted). Logo 40px with `AppMasthead.module.css` mirroring OCP's logo-box override (first CSS module).
- User preferences item in `UserMenu` (features/auth) left for T-0120, as is the colour-scheme chooser.
- Sidebar: sections start collapsed (OCP); tests expand via `src/test/sidebar.ts` `expandSection`. No divider/footer; `useIsActiveClusterUnavailable` hides cluster sections on "not available" (T-0097);
  switcher wrapper `pf-v6-u-min-width` fixes a 1920 overflow with long names + labels.
- Outside `paths` (needed): `src/app/session.test.tsx` (401 now via `/api/clusters`, system/info no longer always
  observed), `e2e/layout.e2e.ts` L2 rewritten, `FRONTEND.md` L19, `ocp-parity.md` shell rows.
