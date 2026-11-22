---
id: T-0149
title: Kubernetes shell theme — navy masthead and nav header for Kubernetes clusters
status: todo
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
- [ ] `/c/lab-1/...` (Kubernetes): `data-cluster-type="kubernetes"` on the page; `/c/prod-eu-1/...`, `/fleet/...`,
      not-available page, loading: no attribute (THEME-1, FLEET-9).
- [ ] Switching lab-1 ⇄ prod-eu-1 via the switcher toggles the attribute without a reload (THEME-5).
- [ ] No inline styles or DOM access; theme CSS only in `clusterTheme.module.css` (THEME-2).
- [ ] `K8s` tag visible on the toggle; prod/staging band unchanged and above content (THEME-4).
- [ ] Build, lint and tests green (CLAUDE.md rule 4).
- [ ] Probe pages (ux review, THEME-3 contrast numbers, light + dark): `node scripts/ui-probe.mjs /c/lab-1/k8s/ns/default/pods /k8s/ns/default/pods --props background-color,color,border-color,box-shadow,outline-color`
      on masthead, nav header, toggle, help/user buttons; plus `/c/prod-eu-1/...` unchanged vs today; open the user menu
      and switcher menu to confirm standard surfaces.

## Work log

## Review

## Handover notes
