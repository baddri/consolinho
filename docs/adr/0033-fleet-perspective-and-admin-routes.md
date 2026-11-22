# 0033 — Fleet perspective: `/fleet/admin/*` routes, URL-derived perspective, per-distribution shell theme
**Status:** Accepted (2026-11-23) · builds on ADR-0014 (admin gating), ADR-0023 (cluster nav from registry + discovery)
· spec `docs/specs/CP3.7-fleet-foundations.md` FLEET-1..9, THEME-1..5 · tasks T-0144, T-0145, T-0149

## Context
Today the admin area lives at `/admin/*` and its "Fleet administration" section is appended to the cluster sidebar.
CP3.7 turns the switcher into OCP's perspective switcher (`packages/console-app/src/components/nav/NavHeader.tsx`):
a "Fleet management" entry next to the clusters, with its own sidebar. CP5 adds a fleet overview (`/fleet/clusters`),
so admin pages need a namespace that leaves room for it (spec Q4). A Kubernetes cluster gets a distinct masthead
(THEME), which must not be inline styles or DOM manipulation (CLAUDE.md frontend rules).

OCP stores the active perspective in user settings and a hook (`useActivePerspective`); with one perspective per URL
prefix we don't need that state.

## Decision
1. **Routes.** Every admin page moves from `/admin/<rest>` to `/fleet/admin/<rest>` (same `<rest>`, same route
   objects: the admin feature's `adminRoute` keeps `path: 'admin'` and is mounted under a `fleet` route in
   `app/router.tsx`). `/fleet` (index) → `<Navigate to="admin/users" replace />`; `/fleet/<unknown>` → `NotFoundPage`.
   The backend `/api/admin/*` endpoints don't change.
2. **Legacy redirects.** A route `admin/*` (matches `/admin` too) renders `LegacyAdminRedirect`, which navigates with
   `replace` to `/fleet/admin/<splat>` keeping `search` and `hash`. It is client-side only (the SPA fallback already
   serves `index.html` for `/admin/...`), so login `returnUrl`s to old paths land on the new ones with no backend
   change. Unknown rests then hit the admin 404. Kept until at least CP6 (spec Q5); removal needs a release note.
3. **One place for paths.** `shared/routing` owns the perspective prefixes: `FLEET_PATH = '/fleet'`,
   `fleetAdminPath(rest)`, `perspectiveOf(pathname)` and `usePerspective()`. No feature writes a `'/fleet/admin'` or
   `'/admin'` literal; admin path helpers (`userDetailPath`, `clusterDetailPath`, …) build on `fleetAdminPath`.
4. **Perspective is derived from the URL**, never stored: `perspectiveOf(pathname)` is `'fleet'` for `/fleet` and
   `/fleet/...`, else `'cluster'` (also for `/`, `/preferences`, 404). Like `useActiveCluster()` it can't drift.
5. **Sidebar content per perspective** (`app/layout/AppSidebar.tsx`), same `PageSidebar > Nav` frame and the switcher
   as first child in both:
   - `cluster`: Home, Favorites, cluster sections (unchanged), **no** Fleet administration (FLEET-4);
   - `fleet`: only `buildFleetNav()` sections ("Fleet administration": Users, Clusters, Credentials, Audit log), for
     admins; non-admins see no sections there (they get the existing forbidden page, FLEET-8).
6. **Switcher.** "Fleet management" is a `MenuItem` (itemId `fleet:management` — `:` can't occur in a DNS-1123
   cluster name) in its own `MenuList` above the cluster groups, admins only (`useCurrentUser().data.role`). On a
   fleet page the toggle shows the fleet icon and "Fleet management" and that item is selected. Choosing a cluster uses
   the existing `clusterSwitchPath` (non-cluster path ⇒ cluster root).
7. **Shell theme from the shown cluster's distribution.** `cluster-context` exports `useShownCluster()` — the
   `AccessibleCluster` the switcher shows: `undefined` in the fleet perspective and on the "not available" page, else
   the active cluster, else `usePreferredCluster()`. `AppShell` sets `data-cluster-type="kubernetes"` on PF `Page`
   when its `distribution` is `kubernetes`; otherwise no attribute (OpenShift and fleet look exactly as today).
   `app/layout/clusterTheme.module.css` owns all theme CSS: attribute-scoped selectors over our own module classes on
   the `Masthead` and the sidebar nav-header wrapper, setting PF component variables
   (`--pf-v6-c-masthead--BackgroundColor`, …) to the values in `UX.md` §2 (ux-designer). No inline styles, no
   `document` access, menus opened from the themed areas keep standard surfaces (poppers render in `<body>`).
   The value is computed synchronously from the TanStack Query cache, so switching clusters re-renders without a
   reload; while the cluster list loads there is no attribute (neutral), never the wrong theme (THEME-5).

## Consequences
- ~280 `/admin/` literals (mostly tests) change mechanically in T-0144. Afterwards ESLint `no-restricted-syntax`
  (string literals and template heads matching `^/admin(/|$)`) keeps them out, except in the legacy-redirect module
  and its test (FLEET-7).
- Theme selectors depend on PF component variable names; they are PF's documented customisation surface, and the
  style probe (`scripts/ui-probe.mjs`) catches regressions on PF upgrades.
- A future perspective (CP5 fleet overview) is a new child route of `fleet` plus a `buildFleetNav()` section; no new
  global state.
- Rejected: a stored/contexted perspective (OCP style) — duplicates the URL and can drift; theme via `useEffect` on
  `<html>` — DOM manipulation and a flash before effects run.
