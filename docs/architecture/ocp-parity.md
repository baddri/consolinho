# OCP parity matrix

Owner: ux-designer (UX.md §0). One row per screen or element. OCP source paths are relative to
`/home/bad/works/openshift-console/frontend/`. A screen is done only at `match`. Audit: 2026-11-22, CP3.6, 1280 light +
dark, reference console `http://127.0.0.1:9000` (clone `main`; audited with OKD branding, target since 2026-11-22 = `ocp` branding = glass + felt), our UI `dev:mock`.

| Our route / element | OCP route | OCP source | Status | Task |
|---|---|---|---|---|
| Shell: theme classes on `<html>` | any | `public/index.html` (inline theme script) | match: glass (high-contrast under `prefers-contrast: more`) + felt, pre-paint via `public/theme-init.js` (CSP forbids inline) | T-0119 |
| Shell: masthead brand + toggle | any | `public/components/masthead/masthead.tsx` | match (own 40px logo; 73px masthead like OCP) | T-0119 |
| Shell: masthead toolbar | any | `public/components/masthead/masthead-toolbar.tsx` | match: Help menu (About only, no docs URL) + user menu; no theme button. User preferences item comes with T-0120 | T-0119, T-0120 |
| Shell: sidebar container | any | `packages/console-app/src/components/nav/index.tsx` | match: floating glass card, no footer (version in Help › About) | T-0119 |
| Shell: cluster switcher (= perspective switcher) | any | `packages/console-app/src/components/nav/NavHeader.tsx` | match: one-line 37px toggle, labels inline, no divider; search box as OCP's menu search (focus ring is PF/browser default, same in OCP). Long names clip before the first label (8px gap). Recent is hidden when it would only list the active cluster. | T-0119 (T-0118 #1-2) |
| Shell: nav sections | any | `packages/console-app/src/components/nav/NavSection.tsx`, `PerspectiveNav.tsx` | match for T-0097 (not-available page lists only Fleet administration); gap: no Favorites section; match: every section starts collapsed like OCP `main` (`NavSection.tsx` L26), the active one marked current | T-0119 (T-0097), T-0120 |
| Shell: environment band (fleet) | `kube-admin-notifier` banner | `public/components/kube-admin-notifier.tsx` | match: `Banner color` red/orange, centred `p`, first in the main card | T-0119 |
| Shell: project bar | `/k8s/ns/openshift-console/pods` | `public/components/namespace-bar.tsx`, `public/components/_dropdown.scss` L49-58 | gap: OCP toggle text 16px flush at the card padding (x=346), 42px, no top padding; ours 14px with toggle padding, 16px lower | T-0121 |
| `/user-preferences` (new) | `/user-preferences/general` | `packages/console-app/src/components/user-preferences/UserPreferencePage.tsx` | gap: missing (Color scheme, Contrast mode) | T-0120 |
| Favourite star + Favorites nav | any list/details heading | `packages/console-app/src/components/favorite/FavoriteButton.tsx`, `FavoriteNavItems.tsx` | gap: missing | T-0120 |
| List heading (title + Create button) | `/k8s/ns/openshift-console/pods` | `public/components/factory/ListPage/ListPageHeader.tsx`, `console-shared/src/components/heading/PageHeading.tsx` | gap: no "Create <Kind>" button, no star | T-0121, T-0120 |
| List toolbar + filters | same | `packages/console-app/src/components/data-view/ConsoleDataView.tsx`, `DataViewTextFilter.tsx`, `DataViewLabelFilter.tsx` | gap: separate search/label inputs + "→" button; OCP filter category select, `/` hint, label filter | T-0121 |
| List column management | same | `data-view/ConsoleDataViewColumnManagementModal.tsx`, `useConsoleDataViewResizableColumns.ts` | gap: missing "Manage columns", resizable columns, "Reset column widths" | T-0121 (T-0095) |
| List pagination | same | `ConsoleDataView.tsx` (`PaginationVariant.top/bottom`, `isCompact`) | gap: full bottom pagination with page input; OCP compact top + bottom | T-0121 (T-0118 #4) |
| List table + kebab | same | `data-view/useConsoleDataViewColumns.ts` | gap: no sticky Name (right border) / kebab (left border) columns | T-0121 (T-0118 #3) |
| Kind badges | everywhere | `public/components/_resource.scss`, `public/style/_vars.scss` | gap: pale PF label; OCP filled pill with per-kind colour | T-0121 |
| Status icon + text | lists, details | `console-dynamic-plugin-sdk/src/app/components/status/Status.tsx` | gap: Running green check (OCP sync icon), Pending hourglass (OCP in-progress icon), Disabled plain text (OCP ban icon) | T-0121 |
| Empty / filtered-empty list | list with 0 rows | `ConsoleDataView.tsx:BodyEmpty` | gap: check against `BodyEmpty` row "No <plural> found" | T-0121 |
| `/c/:c/k8s/ns/:ns/pods` | `/k8s/ns/openshift-console/pods` | `public/components/pod-list.tsx` | gap: toolbar/table/badges as above | T-0121 |
| `/c/:c/k8s/ns/:ns/deployments` | `/k8s/ns/openshift-console/deployments` | `public/components/deployment.tsx` (list) | gap: as pods | T-0121 |
| `/c/:c/k8s/cluster/projects` | `/k8s/cluster/projects` | `public/components/namespace.tsx` | gap: as pods; "No display name"/"No requester" copy | T-0121 |
| Details heading | `/k8s/ns/openshift-console/pods/<pod>` | `public/components/utils/headings.tsx`, `console-dynamic-plugin-sdk/.../utils/resource-status.tsx` | gap: small badge; status as outlined Label (OCP `Badge isRead`); no star | T-0122 |
| Details breadcrumbs | same | `public/components/utils/breadcrumbs.ts` (`breadcrumbsForDetailsPage`) | match | — |
| Details tabs | same | `public/components/utils/horizontal-nav.tsx` | match | — |
| Details DescriptionList | same | `public/components/utils/details-page.tsx:ResourceSummary`, `pod.tsx`, `deployment.tsx` | gap: field set/order differs ("Created" vs "Created at"; pod/deployment right column); labels box; NS badge shows PR | T-0122 (T-0118 #5) |
| Deployment details | `/k8s/ns/openshift-console/deployments/console` | `public/components/deployment.tsx:DeploymentDetails` | gap: no pod ring, status in heading (OCP: Status row), no Containers/Conditions sections | T-0122 |
| YAML tab | `/k8s/ns/openshift-console/pods/<pod>/yaml` | `public/components/edit-yaml.tsx`, `console-shared/src/components/editor/CodeEditorToolbar.tsx` | gap: "Show managed fields" switch (OCP auto-folds), toolbar items, no Cancel/Download buttons | T-0123 |
| Events tab | `/k8s/ns/openshift-console/pods/<pod>/events` | `public/components/events.tsx` | gap: table; OCP event stream cards | T-0124 |
| `/c/:c/k8s/ns/:ns/events` | `/k8s/all-namespaces/events` | `public/components/events.tsx` | gap: table + label filter; OCP stream with Resources/type/text filters | T-0124 |
| Full-page form (`/admin/clusters/new`, `/edit`) | `/k8s/ns/openshift-console/deployments/~new/form` | `public/style/_forms.scss` (`.co-m-pane__form`), `console-shared/src/components/form-utils/FormFooter.tsx` | gap: fields 880px wide (OCP 650px), breadcrumb on create page, non-sticky buttons | T-0125 |
| Delete modal | kebab › Delete | `public/components/modals/delete-modal.tsx` | match (fleet cluster cue in title is the documented fleet addition) | — |
| Wizard modal (grant access) | n/a (fleet) | PF "Wizard in modal" | match (T-0116) | — |
| 404 | `/nope-404` | `public/components/error.tsx:ErrorPage404` | gap: separate h1 + search icon + "Go to home" button; OCP `ErrorState` NotFoundIcon, "404: Page Not Found", link "Return to homepage" | T-0125 |
| Cluster not available (fleet) | (404 layout) | `public/components/error.tsx` | gap: as 404 + cluster nav still shown | T-0125, T-0119 (T-0097) |
| Error state (load failed) | — | `public/components/error.tsx:ErrorState`, `console-shared/src/components/status/StatusBox.tsx` | gap: verify against `ErrorState` copy | T-0125 |
| Loading state | list/details | `ConsoleDataView.tsx:BodyLoading` (`SkeletonTableBody`), `StatusBox` `LoadingBox` | gap: verify skeleton table body | T-0121 |
| `/admin/users` | `/k8s/cluster/user.openshift.io~v1~User` | `public/components/user.tsx`, `ConsoleDataView.tsx` | gap: no kind badge, own toolbar, help text gap too large | T-0126 |
| `/admin/users/:u` (+ access tab) | `/k8s/cluster/user.openshift.io~v1~User/<name>` | `public/components/user.tsx`, `utils/headings.tsx` | gap: subtitle under title, no badge, two grant entry points | T-0126 (T-0118 #9) |
| `/admin/clusters` | (list pattern) | `ConsoleDataView.tsx` | gap: own toolbar, API URL truncation, Disabled without icon | T-0126 (T-0118 #6, #8) |
| `/admin/clusters/:n` (+ credentials, access) | (details pattern) | `utils/headings.tsx`, `details-page.tsx` | gap: subtitle, outlined status label, Add credential placement | T-0126 (T-0118 #7) |
| `/admin/credentials` | (list pattern) | `ConsoleDataView.tsx` | gap: as other admin lists; legacy description clamp | T-0126 (T-0118 #6) |
| `/admin/audit` | `/k8s/ns/openshift-console/events` (stream-like list) | `ConsoleDataView.tsx` | gap: own toolbar | T-0126 |
| `/login` | OAuth server login page (not in console repo) | n/a | match (PF `LoginPage`; OCP login lives in the OAuth server) | — |
| Landing `/` | `/` → last perspective page | `public/components/app-contents.tsx` | match (redirect to last cluster) | — |
