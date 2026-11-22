---
id: T-0149
title: Kubernetes shell theme — navy masthead and nav header for Kubernetes clusters
status: done
owner: frontend-engineer
checkpoint: 3.7
depends_on: [T-0147]
paths: [web/src/app/layout, web/src/features/cluster-context]
review_rounds: 0
---

## Goal
THEME-1..5 (ADR-0033 §7): while the shown cluster is Kubernetes, the masthead and the sidebar nav header (switcher
area) use UX.md §2a's navy surface + blue accent; OpenShift clusters and fleet pages look exactly as today.

## Scope
- In: `useShownCluster()` hook; shell attribute on `Page`; one CSS module with the theme; class hooks on `Masthead`
  and the switcher wrapper; tests.
- Out: any change to content, page sections, tables, the rest of the sidebar, opened menus, the environment `Banner`.

## Contract / design notes
- `features/cluster-context/useShownCluster.ts` (export from `index.ts`):
  `export function useShownCluster(): AccessibleCluster | undefined` — `undefined` when `usePerspective() === 'fleet'`,
  when `useIsActiveClusterUnavailable()`, or while the list loads; else the cluster named
  `useActiveCluster() ?? usePreferredCluster()`. Refactor `ClusterSwitcher` (L178-179 `shown`) to use it so toggle
  and theme can't disagree.
- `app/layout/AppShell.tsx`: `<Page className={theme.shell} data-cluster-type={shown?.distribution === 'kubernetes' ? 'kubernetes' : undefined} …>`
  (attribute name per UX.md §2a L59). No effect, no `document` access (THEME-2).
- `app/layout/clusterTheme.module.css` (new, the only theme CSS): exports `shell`, `masthead`, `navHeader`.
  `.shell[data-cluster-type='kubernetes'] { --fc-k8s--bg: var(--pf-t--color--blue--70); … }` (all `--fc-k8s--*` from
  UX.md §2a table L62-71), then `.shell[data-cluster-type='kubernetes'] .masthead { … }` and `… .navHeader { … }`
  setting exactly the PF component variables listed in UX.md §2a L72-79 (masthead bg, plain buttons, menu toggles,
  focus ring on those only). Same values light + dark. Comment each block with the UX.md reference.
- `AppMasthead.tsx`: `className={theme.masthead}` on `Masthead` (keep `styles.logo` on the logo).
  `AppSidebar.tsx`: add `theme.navHeader` to the switcher wrapper `div` (L74, keeps `pf-v6-u-min-width`).
- THEME-5: value comes synchronously from the TanStack Query cache; switching cluster re-renders, no reload; while
  loading: no attribute (neutral). Banner untouched (THEME-4).

## Context pack
- Docs: ADR-0033 §7; `UX.md` §2a L55-85 (values, overridden variables, never-only-cue rules); spec THEME-1..5.
- Exemplars: `web/src/app/layout/AppMasthead.module.css` (CSS module setting PF component vars, `.logo`);
  `web/src/features/cluster-context/usePreferredCluster.ts:usePreferredCluster` L14-25 (hook over query + URL).
- Touch points: `app/layout/AppShell.tsx:AppShell` L19-35; `AppMasthead.tsx:AppMasthead` L66-96; `AppSidebar.tsx` L71-76;
  `ClusterSwitcher.tsx` L141-179; `useIsActiveClusterUnavailable.ts`; `shared/routing:usePerspective` (T-0144);
  tests `app/layout/AppShell.test.tsx` (add a `describe('cluster type theme')`).
- PF vars: `grep -n "\-\-pf-v6-c-masthead--\|\-\-pf-v6-c-menu-toggle--" web/node_modules/@patternfly/react-styles/css/components/{Masthead/masthead,MenuToggle/menu-toggle}.css`.
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/masthead/masthead.tsx` (structure; OCP
  doesn't recolour, `public/style/_overrides.scss` L174-185) — only colour tokens change.

## Acceptance criteria
- [x] `/c/lab-1/...` (Kubernetes): `data-cluster-type="kubernetes"` on the page; `/c/prod-eu-1/...`, `/fleet/...`,
      not-available page, loading: no attribute (THEME-1, FLEET-9).
- [x] Switching lab-1 ⇄ prod-eu-1 via the switcher toggles the attribute without a reload (THEME-5).
- [x] No inline styles or DOM access; theme CSS only in `clusterTheme.module.css` (THEME-2).
- [x] `K8s` tag visible on the toggle; prod/staging band unchanged and above content (THEME-4).
- [x] Build, lint and tests green (CLAUDE.md rule 4).
- [x] Probe pages (ux review, THEME-3 contrast numbers, light + dark): `node scripts/ui-probe.mjs /c/lab-1/k8s/ns/default/pods /k8s/ns/default/pods --props background-color,color,border-color,box-shadow,outline-color`
      on masthead, nav header, toggle, help/user buttons; plus `/c/prod-eu-1/...` unchanged vs today; open the user menu
      and switcher menu to confirm standard surfaces.

## Work log
- 2026-11-23 frontend-engineer: started; useShownCluster hook, shell attribute, clusterTheme.module.css.
- 2026-11-23 frontend-engineer: done. PF classes need `:global()` in the CSS module; glass theme sets masthead
  background/border directly, so those are set too. Dark logo on the navy masthead. :5199 served another worktree,
  so probed with a scratch Playwright script on :5288 (light + dark, menus open, prod-eu-1); server stopped. Gate green.
- 2026-11-23 frontend-engineer: fix round 1. Glass-only masthead overrides; explicit :focus-visible outline (removed
  the ineffective focus-token overrides); nav-header bottom margin cancels the edge (toggle y 106 / nav y 167 on both
  lab-1 and prod-eu-1); dark-logo test. Outside paths: UX.md §2a "PF internals" bullet (requested). Gate green.

## Review
- 2026-11-23 ux-designer, round 1: **CHANGES_REQUESTED** (mock :5311, 1280, light + dark, admin + alice; probe numbers)
  1. Focus ring on navy: the `--pf-t--global--focus-ring--color--default` override never paints. PF6 menu toggles and plain buttons use the UA `outline: auto` (measured `1px auto #101010` light / `#eeeeee` dark on the switcher and user toggles). Chrome's two-tone ring is visible, but Firefox/Safari draw a single accent-blue ring that falls below 3:1 on #003366. Fix: in `clusterTheme.module.css`, add `:focus-visible { outline: 2px solid var(--fc-k8s--focus); outline-offset: 2px }` (#92c5f9, 6.95:1) to the themed masthead and nav header toggles and plain buttons (UX.md §2a, now amended), and correct the handover line "focus ring #92c5f9".
  2. The nav header frame adds 3px to the layout. The -8px margin cancels the 8px padding, but not the extra 3px bottom padding, so the nav below moves down when you switch clusters ("Home" is at y=185 on prod-eu-1 and y=188 on lab-1; the toggle stays at y=106 as intended). Fix: `margin-block-end: calc(-1 * (var(--pf-t--global--spacer--sm) + 3px))`.
  3. OK: the masthead and nav header are rgb(0,51,102) in both themes, with a 3px rgb(67,148,229) accent. Against the light baseline the luminance ratio is 11.3:1. Against the dark baseline it is only 1.45:1, but the accent edge against #151515 is 5.9:1 and the K8s tag is always shown, so colour is never the only cue (UX.md §2a).
  4. OK: toggle and user text are #fff (12.6:1), icons and the hamburger #f2f2f2 (11.3:1). The K8s tag is #151515 on #e0e0e0 in light (pill vs navy 9.5:1) and #fff on #4d4d4d in dark (8.5:1). Nit, no action: in dark the pill edge against navy is 1.48:1, but the text stays readable.
  5. OK: the dark-theme logo on navy has a #f2f2f2 wordmark (11.3:1). The teal tile is part of the logo, so it is exempt.
  6. OK: prod-eu-1 (alice) has no attribute and keeps the glass masthead. Its band (rgb(251,197,197) light / rgb(249,168,168) dark) sits at y=90 above the content. The /fleet pages are neutral. With the switcher open on lab-1, the menu keeps the standard surfaces (#fff / #292929) and PF labels.
**Round 1 — frontend-architect, 2026-11-23: CHANGES_REQUESTED** (gate green: lint/typecheck/888 tests/build)
- `web/src/app/layout/clusterTheme.module.css:28-33` — the direct `background-color`/`border-block-end-color`/`box-shadow` apply in every theme, but `--pf-t--global--box-shadow--glass--default` is defined globally (= `box-shadow--md`, PF base.css), so with glass off (Preferences) the K8s masthead gains a drop shadow the neutral masthead lacks — move these three declarations into a rule scoped like PF's (`:global(.pf-v6-theme-glass) .shell[data-cluster-type='kubernetes'] .masthead`), keep only `inset 0 -3px 0 accent` in the unscoped rule.
- `docs/architecture/UX.md` §2a (overridden PF variables bullet) — the extras aren't recorded where the next PF upgrade will look: add one bullet listing the glass direct overrides (PF `masthead.css` `:where(.pf-v6-theme-glass) .pf-v6-c-masthead:not(.pf-m-docked)`), the menu-toggle hover/expanded `--BackgroundColor` restore rules (they depend on PF's `:is(:hover, :focus)`/`pf-m-expanded` hand-off), the `:not(.pf-v6-c-menu *)` scoping, the dark logo on navy, and the nav-header frame.
- Judged OK: `useShownCluster()` (single source, synchronous from the cache, unavailable/fleet/loading → `undefined`; switcher refactor is behaviour-preserving); `data-cluster-type` on `Page` computed on render (no effect/DOM, tested incl. switch); `:global()` is the correct CSS-modules way to target PF classes; dark logo on navy is the right call (light logo fails on a fixed dark surface).
- Nit (optional): `clusterTheme.module.css:41-42` — bottom padding is `sm + 3px` against a `-sm` margin, so the sections below shift down 3px on K8s; use `padding-block-end: sm` if the shift is unwanted.
- Nit (optional): `AppShell.test.tsx` cluster-type theme — assert the masthead logo is `LOGO_SRC.dark` on lab-1.
- 2026-11-23 ux-designer, round 2: **APPROVE** (mock :5311, Chromium + Firefox 159, light + dark, alice). This also closes the architect's round-1 findings.
  1. Fixed: on :focus-visible, the themed hamburger, switcher and masthead toggles show `2px solid rgb(146,197,249)` with a 2px offset in both browsers and both themes (6.95:1 on navy).
  2. Fixed: "Home" is at y=167 on both lab-1 and prod-eu-1 in both browsers; the nav no longer shifts.
  3. Fixed (architect): with glass off (high contrast), the K8s masthead is rgb(0,51,102) with the 3px rgb(67,148,229) inset edge and no drop shadow. The OCP masthead stays at PF default (#f2f2f2 light / #151515 dark) with no shadow.
  4. Fixed (architect): the UX.md §2a "PF internals" bullet now lists the :global/:not(.pf-v6-c-menu *) scoping, the glass direct overrides, the toggle background restore rules, the dark logo and the nav-header frame.

## Handover notes
- `useShownCluster()` (cluster-context) is the single source for the switcher toggle and the shell theme.
- `AppShell` sets `data-cluster-type="kubernetes"` + `theme.shell` on `Page`; `AppMasthead` (`theme.masthead`, dark
  logo on K8s) and the `AppSidebar` switcher wrapper (`theme.navHeader`) carry the hooks. All theme CSS is in
  `app/layout/clusterTheme.module.css`; PF selectors are wrapped in `:global()` and limited to `:not(.pf-v6-c-menu *)`
  so opened menus keep PF surfaces (probe: menu bg #fff, focus ring #0066cc).
- Glass theme only (`:global(.pf-v6-theme-glass)`): masthead `background-color`/`border-block-end`/shadow set directly;
  the 3px inset edge is unscoped. PF internals listed in UX.md §2a for PF upgrades.
- Nav header: sm padding cancelled by negative margins (bottom incl. 3px), so toggle and nav keep their OCP positions.
- Probe (light = dark): masthead/nav header rgb(0,51,102), accent rgb(67,148,229) inset 3px, toggles text #fff,
  icons #f2f2f2, `:focus-visible` outline 2px solid #92c5f9 (PF paints
  `outline: auto`, no token); prod-eu-1 is unchanged (glass rgba(255,255,255,.5), band rgb(251,197,197)).
