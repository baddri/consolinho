---
id: T-0204
title: Shell — environment band and project bar stay fixed, content scrolls; flat project toggle
status: todo
owner: frontend-engineer
checkpoint: 4c
depends_on: []
paths: [web/src/app/layout/AppShell.tsx, web/src/app/layout/AppShell.module.css, web/src/features/cluster-context/EnvironmentBanner.tsx, web/src/features/cluster-context/NamespaceSelector.tsx, web/src/features/resources/components/ProjectBar.tsx, web/src/features/resources/components/ProjectBar.module.css, web/src/features/resources/list/ResourceListPage.tsx, web/src/features/resources/details/ResourceDetailsPage.tsx, web/src/features/resources/events/EventsPage.tsx, web/src/features/resources/search/SearchPage.tsx]
review_rounds: 0
---

## Goal
Human report 2026-11-24 #4. (a) Today the whole `pf-v6-c-page__main` scrolls (`overflow: auto`, probe), so the
production band and the "Project: …" bar scroll away. OCP keeps its banners and namespace bar fixed and scrolls only
the content below them. (b) Our project toggle (`MenuToggle variant="plainText"`) shows PF's grey pill on hover and
when pressed; OCP's toggle has no background change and no border.

## Scope
- In: shell layout (fixed top section + scrolling content section), ProjectBar placement in that fixed section,
  project toggle look. Pages: resource list, details (all tabs incl. Logs/Terminal), Events, Search, fleet pages.
- Out: the audit log blank scroll (T-0205), toggle menu contents, banner colours.

## Contract / design notes
OCP structure (`public/components/app-contents.tsx:762-778`):
```
<PageSection hasBodyWrapper={false} padding={{default:'noPadding'}} className="pf-v6-c-page__main-section--no-gap">
  <GlobalNotifications/> {namespaced route && <NamespaceBar/>}
</PageSection>
<PageSection isFilled hasBodyWrapper={false} padding={{default:'noPadding'}}
  className="pf-v6-c-page__main-section--no-gap pf-v6-u-flex-shrink-1" id="content-scrollable">{routes}</PageSection>
```
plus `#content-scrollable { overflow: auto }` (`public/style/_layout.scss:13-15`) and `.pf-v6-c-page__main-section--no-gap
{ gap: 0 }` (`public/style/_overrides.scss:200-202`, set the property, not the variable, so it doesn't cascade).
- Ours: `AppShell` renders the same two sections inside `Page` (stop passing `banner=`; put `<EnvironmentBanner/>` in
  the fixed section). Fixed section: `EnvironmentBanner`, then a project-bar slot. Content section: `<Outlet/>`.
- ProjectBar into the fixed section. Suggested mechanism (frontend architect may choose another): the shell provides
  a slot element via context (`useState` ref callback), and `ProjectBar` renders through `createPortal` into it, so
  pages keep `<ProjectBar …/>` where they are and need no layout knowledge. No `document.querySelector`.
- Result to verify with the probe: `main.pf-v6-c-page__main` has `scrollHeight === clientHeight`; the content section
  is the only scroller; after scrolling it by 500px the band and project bar `getBoundingClientRect().top` are unchanged.
- Full-height tabs must keep working: Logs (`PodLogsTab.module.css .log`, `contain: size; height: 100%`) and Terminal
  (`PodTerminalTab.module.css .connect`) fill to the viewport bottom with no page scroll, before and after Expand/Collapse.
- `isContentFilled` and the 16px glass card radius stay; skip-to-content still targets `fleetconsole-main`.
- Project toggle (OCP `packages/console-shared/src/components/namespace/NamespaceDropdown.scss:30-58`, used by
  `NamespaceMenuToggle.tsx:71-79` as a **default-variant** `MenuToggle` with class `co-namespace-dropdown__menu-toggle`):
  `background-color: inherit` (set the property, so PF's hover/expanded `--BackgroundColor` changes never paint);
  `::before, ::after { border-width: 0 }`; `color: inherit` when enabled, `--pf-t--global--text--color--disabled`
  when disabled; `padding: 2px 0`, `font-size: 15px`; from 768px `padding-block: 9px`, `font-size: 16px`; `width: 100%`
  of its wrapper, wrapper `max-width: 60%; margin-right: 20px` (`_dropdown.scss:46-48`). Our `ProjectBar.module.css`
  already has the padding/font values; switch the toggle to the default variant + these overrides (each rule with an
  OCP comment), or keep `plainText` and neutralise its hover/expanded background — the computed result must be no
  background and no border in rest, hover, focus and expanded states, light and dark.
- Bar: OCP `.co-namespace-bar` (`public/components/_dropdown.scss:17-36`): `border-bottom` divider default, `padding: 0`
  + page gutter, `white-space: nowrap` (ours: `ProjectBar.module.css .bar` + `<Divider/>`, keep).

## Context pack
- Docs: `UX.md` §2 bullets "Project selector" and "Fixed top, scrolling body" (updated for this task).
- Touch points: `web/src/app/layout/AppShell.tsx:AppShell` (L25-46, `Page banner=` L32); `features/cluster-context/
  EnvironmentBanner.tsx:EnvironmentBanner`; `features/resources/components/ProjectBar.tsx:ProjectBar` (L35-68);
  `features/cluster-context/NamespaceSelector.tsx` toggle (L191-198, `variant="plainText"`); ProjectBar call sites
  `list/ResourceListPage.tsx:92`, `details/ResourceDetailsPage.tsx:186`, `events/EventsPage.tsx:118`, `search/SearchPage.tsx:82`.
- OCP reference: `public/components/app-contents.tsx:762-778`, `public/components/namespace-bar.tsx:142-160`,
  `public/style/_layout.scss:13-15`, `public/style/_overrides.scss:200-202`, `public/components/_dropdown.scss:17-58`,
  `packages/console-shared/src/components/namespace/NamespaceDropdown.scss:30-58`.
- Probe: mock user `alice`, `/c/prod-eu-1/k8s/all-namespaces/pods` (band + bar), `/c/staging-eu-1/k8s/ns/shop/pods/db-0/logs`
  and `/terminal` (fill), a fleet page `/fleet/admin/audit?mockUser=admin` (no bar, still scrolls in content section).

## Acceptance criteria
- [ ] Band and project bar stay put while the content scrolls (probe: tops unchanged after scrolling 500px); page main
      itself never scrolls.
- [ ] Logs and Terminal tabs still fill to the viewport bottom with no outer scrollbar.
- [ ] Project toggle: no background/border on hover, focus, pressed/expanded (probe computed `background-color`
      equals the bar's), light and dark; keyboard focus still visible (browser outline, as OCP).
- [ ] Pages without a project bar (fleet, cluster-scoped kinds) render unchanged apart from the scroll container.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
