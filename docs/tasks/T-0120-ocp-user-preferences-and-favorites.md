---
id: T-0120
title: OCP parity — User preferences page (colour scheme, contrast) and favourites
status: todo
owner: frontend-engineer
checkpoint: 3.6
depends_on: [T-0119]
paths: [web/src/features/preferences, web/src/app, web/src/shared/theme, web/src/shared/ui/page]
review_rounds: 0
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
- [ ] Side-by-side `/user-preferences` vs OCP `/user-preferences/general` matches at 1280 in light and dark (our page
      shows only the fields we support).
- [ ] Changing Color scheme / Contrast mode applies instantly and survives reload.
- [ ] Star on list and details headings adds/removes a Favorites nav entry; heading layout matches OCP pods list.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
