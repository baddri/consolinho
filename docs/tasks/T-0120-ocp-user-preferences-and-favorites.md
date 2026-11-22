---
id: T-0120
title: OCP parity — User preferences page (colour scheme, contrast) and favourites
status: done
owner: frontend-engineer
checkpoint: 3.6
depends_on: [T-0119]
paths: [web/src/features/preferences, web/src/app, web/src/shared/theme, web/src/shared/ui/page]
review_rounds: 2
---

## Goal
OCP keeps the theme in User preferences and lets users star pages into a Favorites nav section. Reproduce both so
the theme control and the heading star sit where an OpenShift user expects them.

## OCP reference
- Routes: `/user-preferences/general`; any list page heading for the star (`/k8s/ns/openshift-console/pods`).
- Source: `packages/console-app/src/components/user-preferences/UserPreferencePage.tsx` (+ `.scss`),
  `packages/console-app/console-extensions.json` (Color scheme / Contrast mode fields),
  `packages/console-app/src/components/favorite/FavoriteButton.tsx`, `FavoriteNavItems.tsx`, `FavoriteNavItem.tsx`,
  `packages/console-shared/src/components/heading/PageHeading.tsx` (star before actions in an `ActionList`).

## Differences to fix
1. No preferences page — OCP: heading "User preferences", help text "Set your individual preferences for the console
   experience. Any changes will be autosaved.", vertical `Tabs` (General …), form column ≈310px wide with `Select`s —
   add `/user-preferences` (not cluster-scoped) with tab General: "Color scheme" (System default / Light / Dark,
   helper "Console will appear as per the selected theme.") and "Contrast mode" (System default / Glass / High
   contrast, helper "Controls the contrast level of the console."). Autosave on change, no Save button.
2. No favourites — OCP `FavoriteButton`: plain star button in the heading actions (left of Create/Actions), tooltip
   "Add to favorites"/"Remove from favorites", small modal asking for a name (validation copy from the source);
   Favorites `NavExpandable` second in the nav listing starred pages — add, stored per user in localStorage
   (frontend-architect may choose otherwise; no backend change in this task). Favourite URLs include the cluster.
3. User menu "User preferences" item (T-0119) links here.

## Context pack
- Docs: `UX.md` §2, §3.
- Touch points: `web/src/shared/theme/*` (preference + contrast), `web/src/shared/ui/page/PageHeading.tsx` (action slot),
  `web/src/app/layout/AppSidebar.tsx`, `web/src/app/router.tsx`.
- PF: `Tabs isVertical`, `FormGroup`, `Select`/`SimpleSelect`, `Button variant="plain"` + `StarIcon`, `Modal small`.

## Acceptance criteria
- [x] Side-by-side `/user-preferences` vs OCP `/user-preferences/general` matches at 1280 in light and dark (our page
      shows only the fields we support).
- [x] Changing Color scheme / Contrast mode applies instantly and survives reload.
- [x] Star on list and details headings adds/removes a Favorites nav entry; heading layout matches OCP pods list.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-22 frontend-engineer: started; read OCP UserPreferencePage/FavoriteButton/FavoriteNavItems, shot reference.
- 2026-11-22 frontend-engineer: `features/preferences` (page, select field, favourites hook/star/modal/nav), contrast
  preference in `shared/theme` + `theme-init.js`, star slot in `PageHeading`, user menu item. Side-by-side shots at 1280
  vs OCP (prefs, pods, users). check-fe: 724 tests green, build ok. Parity rows closed.
- 2026-11-22 frontend-engineer, fix round 1: `PageHeading` title row is now top-aligned and the h1 gets `pf-v6-u-mb-sm`
  when there is a subtitle (OCP `PageHeader`). Measured: h1 top = star top, subtitle 39px below the h1 top like OCP
  (prefs, users list, pods list, deployment details). Added tests for corrupt theme/contrast/favourites storage and
  dropped the unused `USER_PREFERENCES_PATH` export. check-fe: 726 tests green, build ok.

## Review

### Code (frontend-architect)
**APPROVE** (round 1). `scripts/check-fe.sh` green (724/724, build ok).
- UserMenu literal path: right call. `preferences` imports `features/auth` (`useCurrentUser`), so the reverse import would be a cycle; one shared-routes module for a single string is not worth it yet. Nit: `USER_PREFERENCES_PATH` is exported from `preferences/index.ts` but unused outside, so drop the export or point the UserMenu comment at `preferences/paths.ts`.
- Contrast key: `ThemeProvider` (`parseContrastPreference`) and `theme-init.js` accept the same values (`glass`/`contrast`/`system`); unknown, corrupt or blocked storage falls back to the OS in both. Sync note is in both files. OK.
- Favorites: keyed per user (`fleetconsole.favorites.<username>`). Cluster scoping comes from the URL (`/c/<cluster>`) plus the cluster in the suggested name, and the list is shared across clusters like OCP's. Parse is safe (try/catch, drops malformed entries, `useStoredValue` guards storage). OK.
- `PageHeading` star slot: `shared/ui/page/headingFavorite.ts` is a renderer context injected by `AppShell`, so shared/ui has no feature import. Clean pattern.
- Nits (optional): no test covers corrupt `fleetconsole.favorites.*` / `fleetconsole.contrast` values (cheap to add). `FavoritesNavSection.tsx` nests the unfavourite `<button>` inside the `<a>` (copied from OCP) — interactive content inside a link is invalid HTML and reads confusingly to screen readers; consider a follow-up that makes it a sibling of the link. `parseFavorites` could also reject `url`s that don't start with `/`.
- Round 2: **APPROVE**. Gate green (726/726). `PageHeading` keeps the wrapping (outer and inner `flexWrap="wrap"`); the top alignment and `pf-v6-u-mb-sm` use PF props and utilities only, no custom CSS. New corrupt-value tests cover theme, contrast and favourites (malformed entries, bad JSON, cross-tab `storage` event). The unused export is gone. The nested-button nit is tracked as T-0128.

### Visual (ux-designer)
**CHANGES_REQUESTED** (round 1). Compared against OCP `/user-preferences/general` and `/k8s/ns/openshift-console/pods` at 1280/1920, light/dark. The reference was only browsed; I hovered the star and expanded the nav, nothing else.
- Preferences page OK, apart from the heading spacing below. Vertical secondary tabs at x=346 250w; form column x=620, 310w at 1280 and 630w at 1920 (OCP `pf-v6-u-w-75-on-lg pf-v6-u-w-50-on-xl`, `UserPreferencePage.tsx` L91); `Select` 37px; labels, helper copy and heading help text are word for word OCP's.
- Theme switching works: Color scheme Dark adds `pf-v6-theme-dark`, and Contrast mode High contrast swaps glass for `pf-v6-theme-high-contrast`. Both apply instantly and survive a reload, in light and dark.
- User menu OK: "User preferences" sits above "Log out" (`masthead-toolbar.tsx` L618-627) and opens `/user-preferences/general`.
- Star OK: plain 37px star, the last item in the heading `ActionList` (`PageHeading.tsx` L70-80). Tooltip "Add to favorites"/"Remove from favorites". It flips to the left near the top of the card exactly as OCP's does on `/user-preferences` (PF auto-flip, not a bug). The modal is small, "Add to favorites", Name*, Save/Cancel, and shows OCP's error copy (`FavoriteButton.tsx` L82-97, L151-188). The suggested name "Pods dev-1" (title + cluster) is a fleet addition, which is fine.
- Favorites nav OK: second section, expanded with a starred entry while on the favourite page, collapsed elsewhere, "No favorites added" when the list is empty (`FavoriteNavItems.tsx` L40, L84-88). The not-available page (admin, prod-eu-1) still lists only Fleet administration.
- **Fix: `PageHeading` vertical rhythm** (shared, so every page). OCP puts the h1 at the top of its row with `pf-v6-u-mb-sm`, so the subtitle starts 8px below the h1 (h1 y135 h31 → subtitle y174), and the h1 top lines up with the star top (pods: both at y313). Ours centres the h1 in the 37px row (h1 3px below the star) and puts a 16px `gapMd` after the row, so the subtitle is 19px below the h1 (h1 y109 → subtitle y159). Our preferences heading is therefore 14px taller (106 vs 92) and the tabs start 14px lower. Fix: top-align the title row (`alignItems flex-start`) and use an 8px gap between the title row and the subtitle (OCP `PageHeading.tsx` → PF `PageHeader`; measured in the reference).

**Round 2: APPROVE.** Re-checked only the heading, at 1280 light and dark, against OCP (both themes measured the same).
- Preferences and users (`/k8s/cluster/user.openshift.io~v1~User`): section 92px, h1 at the same y as the star, subtitle 39px below the h1 top. Ours 106→145, OCP 135→174.
- Pods list: section 69px, h1 and star top-aligned (ours 176/176, OCP 313/313).
- Pod details: h1 and star top-aligned, 27px from the breadcrumb, as in OCP. Remaining 4px difference between heading and tabs (26 vs 22px) belongs to T-0122, not this task.

## Handover notes
- `/user-preferences` → `/general` (lazy chunk, outside clusters). Fields: Color scheme (`fleetconsole.theme`), Contrast
  mode (`fleetconsole.contrast`: system/glass/contrast; OCP "Traditional" not offered). Both raw localStorage strings,
  read by `ThemeProvider` (now via `useStoredValue`, live across tabs) and `public/theme-init.js` — keep in sync.
- Star: `HeadingFavoriteContext` (shared/ui/page) is a render function the app shell provides (`AppShell.tsx`), so
  every `PageHeading` shows it inside an `ActionList` before actions (OCP); `hideFavorite` opts out. No provider in unit
  tests → no star. Star uses OCP `co-xl-icon-button` sizing (CSS module).
- Favourites: `localStorage['fleetconsole.favorites.<username>']` JSON `[{name,url}]`, url = pathname (incl. `/c/<cluster>`),
  max 10. Suggested name = title (else last segment) + cluster. zod validation with OCP copy.
- Favorites nav section sits after Home inside the cluster sections, so it is hidden with them (T-0097 not-available page).
  Expanded only when the current page is a favourite (OCP). Unfavourite star sits inside the link, as in OCP.
- Deviation: touched `features/auth/UserMenu.tsx` (+test) for the "User preferences" item (path literal to avoid an
  auth↔preferences import cycle).
