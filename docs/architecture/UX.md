# UX rules — look and feel like the OpenShift console

Owner: ux-designer. Target: an OpenShift user cannot tell FleetConsole from the OCP web console (`openshift/console`
`main`, PatternFly 6) except for the fleet features (cluster switcher, Fleet administration). Where OCP has a pattern,
copy it; invent only for fleet features, in OCP's style. Code structure is in `FRONTEND.md`; this file is visual only.
OCP paths below are relative to `openshift/console/frontend/`. The local clone is `/home/bad/works/openshift-console`.

## 0. How we mirror OCP (human directive, 2026-11-22)
- **Source first:** every screen has an OCP counterpart in the clone. Find it with `grep -rn` (component name, i18n
  string, route) before you design, build or review, and write the path into the task. Memory is only a hint.
- **Rendered truth:** compare against the real console side by side, at the same route, width and theme. It runs
  locally from the clone (`docs/dev/OCP-REFERENCE.md`: `scripts/ocp-ref/run-console.sh`, screenshots with
  `scripts/ocp-ref/shot.mjs`). Keep images in the scratchpad and never commit them. If it isn't running, fall back to source.
  Measure first with the style probe `scripts/ui-probe.mjs` (text diff of computed styles, same doc); screenshots second.
- **Own code:** reimplement with our components. Mirror OCP's PF component choice and variants, DOM nesting, spacing,
  CSS values and copy. Don't copy files or large blocks. No Red Hat/OpenShift logos or trademarks: our brand is "Consolinho".
- **Parity matrix:** `docs/architecture/ocp-parity.md` lists each FleetConsole screen with its OCP route, its OCP source
  path and a status (`match` / `gap: …`). The ux-designer keeps it current. A screen counts as done only at `match`.

## 1. General
- PatternFly 6 components and `--pf-t--global--*` tokens first. Where OCP itself uses custom SCSS (masthead, nav, resource
  badges, `co-*` classes), reproduce OCP's values in a colocated CSS module, and give each rule a comment with the
  OCP `*.scss` path it mirrors. Never hard-code colours that OCP takes from tokens.
- Both themes (light, dark) and widths 1280 and 1920 must look right. No horizontal page scroll at 1280.
- Every page renders loading (Skeleton), error (ErrorState + Retry) and empty (EmptyState) explicitly.
- Theme classes on `<html>` like OCP (`public/index.html` inline script): `pf-v6-theme-dark` per colour scheme, and
  per contrast mode `pf-v6-theme-glass` (default) or `pf-v6-theme-high-contrast` (`prefers-contrast: more`). Glass is
  what makes the floating sidebar card, the background image and the translucent main card. OCP adds
  `pf-v6-theme-felt` always (human, 2026-11-22: mirror the commercial OpenShift look; OCP adds felt for every non-OKD branding).

## 2. Shell
- Masthead (`public/components/masthead/masthead.tsx`, `masthead-toolbar.tsx`): hamburger `PageToggleButton`,
  logo linking home, then a right-aligned toolbar of **plain icon buttons** and the user dropdown. No form controls,
  toggle groups or context selectors in the masthead.
- Masthead toolbar like OCP (`masthead-toolbar.tsx`): help menu (`?`, "Help menu": Documentation, About) and the user
  menu (User preferences, Log out). The product version lives in the About modal (`public/components/about-modal.tsx`),
  not in a sidebar footer. No theme button: colour scheme and contrast are in User preferences
  (`packages/console-app/src/components/user-preferences/UserPreferencePage.tsx`, "Color scheme", "Contrast mode").
- Sidebar (`packages/console-app/src/components/nav/index.tsx`): `PageSidebar > PageSidebarBody > Nav`. The first child
  of the `Nav` is the header switcher, then the `NavExpandable` sections.
  Content follows the perspective like OCP `PerspectiveNav.tsx`: cluster pages show, like OCP "Core platform", Home,
  Favorites (starred pages, `packages/console-app/src/components/favorite/`), then the cluster sections; fleet pages
  (`/fleet/...`) show only the fleet sections (Fleet administration), never mixed (ADR-0033 §5). Every section starts collapsed, also the one holding the
  active page (marked current), like OCP `NavSection.tsx` (`useState(false)`).
- **Cluster switcher = OCP's perspective switcher** (`packages/console-app/src/components/nav/NavHeader.tsx`): a
  full-width `MenuToggle` (`isFullWidth`, an icon, the name as `Title h2 size="md"`) at the top of the sidebar, menu
  opening under it. One line, same height as OCP's toggle (labels inline after the name), no divider under it. Fleet additions: search box, Recent / All clusters groups, environment and Read only labels.
  Perspective entry (fleet invention, like OCP's perspective menu items): admins get "Fleet management" (`GlobeIcon`)
  as the first menu entry, in its own list under the search divider with a divider below, never filtered by the
  search. On fleet pages the toggle shows the globe + "Fleet management" (`Title h2 md`, no labels) and that entry is
  selected. On other non-cluster pages (Preferences) it shows the cluster the cluster nav links point to.
- Project selector = OCP namespace bar (`public/components/namespace-bar.tsx`): first row of the main area, above the
  page heading, on namespaced list **and** details pages; `Project: <name>` toggle, then a divider. The toggle has no
  hover/pressed background and no border (OCP `NamespaceDropdown.scss` `.co-namespace-dropdown__menu-toggle`).
- Fixed top, scrolling body (OCP `app-contents.tsx`: banners + namespace bar in one no-gap section, the rest in
  `#content-scrollable`, `overflow: auto`): the environment band and the project bar never scroll; only the content
  below them does (T-0204).
- The main area is filled to the bottom of the viewport (`Page isContentFilled`); the white inset card never ends
  mid-screen.
- Environment band (fleet): PF `Banner` (prod `red`, staging `orange`) with centred text, first thing in the main card,
  exactly like OCP's notifier banners (`public/components/kube-admin-notifier.tsx`: `Banner color="blue"`, centred `p`).

### 2a. Cluster type and Kubernetes theme (fleet invention, CP3.7 THEME/SW-3/SW-5/FLEET-1)
- Baseline: OCP doesn't recolour the PF6 masthead (`public/style/_overrides.scss` only sizes the logo), so it is
  PF's `--pf-v6-c-masthead--BackgroundColor` = `--pf-t--global--background--color--secondary--default`
  (#f2f2f2 light, #151515 dark). OpenShift clusters and fleet pages keep exactly that.
- Kubernetes clusters: a shell attribute (e.g. `data-cluster-type="kubernetes"`) scopes these custom properties.
  Same values in light and dark (a fixed dark surface, like PF's dark masthead pattern):

  | Property | Value (PF token) | Contrast vs navy |
  |---|---|---|
  | `--fc-k8s--bg` | `--pf-t--color--blue--70` #003366 | (vs #f2f2f2 11.3:1; vs #151515 1.45:1, distinct by hue) |
  | `--fc-k8s--accent` | `--pf-t--color--blue--40` #4394e5, 3px bottom edge (`box-shadow: inset 0 -3px 0`) | 3.97:1 |
  | `--fc-k8s--text` | `--pf-t--color--white` | 12.6:1 |
  | `--fc-k8s--icon` | `--pf-t--color--gray--10` | 11.3:1 |
  | `--fc-k8s--text-subtle` | `--pf-t--color--gray--30` | 7.5:1 |
  | `--fc-k8s--border` (toggle border) | `--pf-t--color--gray--40` | 5.0:1 |
  | `--fc-k8s--hover-bg` | `--pf-t--global--dark--background--color--600` (rgba 199,199,199,.15 = #1e4975) | text 9.3:1 |
  | `--fc-k8s--focus` | `--pf-t--color--blue--30` #92c5f9 | 6.95:1 |
- Overridden PF variables (component level only, never global `--pf-t--global--text/icon--*`, so nested Labels and
  menus keep their own surfaces): masthead `--pf-v6-c-masthead--BackgroundColor`; plain buttons
  `--pf-v6-c-button--m-plain--Color`/`--hover--Color`/`--hover--BackgroundColor`; masthead user toggle and the nav
  header switcher `--pf-v6-c-menu-toggle--Color`, `--BackgroundColor` (transparent), `--BorderColor`,
  `--hover--BackgroundColor`, `--expanded--BackgroundColor`, `__icon--Color`, `__toggle-icon--Color`; focus ring on
  those toggles/buttons only: PF6 `MenuToggle`/plain `Button` paint the browser's `outline: auto` (no PF token), so
  set `:focus-visible { outline: 2px solid var(--fc-k8s--focus); outline-offset: 2px }` there (T-0149 review). The nav header gets `--fc-k8s--bg` + the
  accent edge; the rest of the sidebar, content and every opened `Menu`/dropdown are untouched (verify with the probe:
  menu item focus ring must stay PF's default).
- PF internals the theme relies on (recheck on every PF upgrade; all in `app/layout/clusterTheme.module.css`):
  PF classes are matched via `:global()` and limited to `:not(.pf-v6-c-menu *)` so opened menus keep PF surfaces;
  under `.pf-v6-theme-glass` the masthead `background-color`, `border-block-end` and drop shadow are set directly
  (PF's glass rule bypasses `--pf-v6-c-masthead--BackgroundColor`); the menu toggle's resolved `--BackgroundColor` is
  pinned transparent, so `:hover/:focus` and expanded rules restore it from the hover/expanded variables; the navy
  masthead uses the dark-theme logo (`LOGO_SRC.dark`); the nav header frame is sm padding cancelled by negative margins
  (bottom includes the 3px edge) so the toggle and nav keep their OpenShift positions.
- Never the only cue: the `K8s` tag on the toggle is always shown. The production/staging `Banner` is never themed and
  the theme uses no red/orange; the band stays the dominant cue. It is not flush under the masthead: with the glass/felt page it is the first row
  of the main card (y=90 vs masthead bottom 73), separated by the page background, so band vs the 3px accent edge is
  not an adjacency. Measured band vs navy (T-0172): light `#fbc5c5` 8.34:1, dark `#f9a8a8` 6.72:1; band text 12.08:1 /
  8.79:1.
- Icons (`aria-hidden`, distinct shapes): OpenShift `OpenshiftIcon` from `@patternfly/react-icons`, Kubernetes
  `CubesIcon` (generic until CP5.5: PF ships no Kubernetes logo icon), Fleet management `GlobeIcon` (round).
  **Logo exception (human directive, 2026-11-24, T-0203):** `OpenshiftIcon` is allowed **only** as the cluster type
  icon in the cluster switcher (menu items and toggle). It is the icon PF itself ships, never a copied asset. Everywhere
  else the "no Red Hat/OpenShift logos" rule stands (masthead, login, favicon, admin pages). No `DharmachakraIcon`.
- Type tag: `<Label isCompact>` default grey, filled (own surface, readable on navy and in menus). Only Kubernetes
  clusters get a tag (`K8s`); OpenShift is the default and shows none, the icon marks it (T-0203). Order (SW-5): menu
  item `[K8s] [environment] [Read only]`; toggle `[K8s] [environment]`. The Fleet admin clusters table keeps its
  Type column (`OCP` / `K8s`).

## 3. Page heading (every page)
OCP `packages/console-shared/src/components/heading/PageHeading.tsx` (wraps component-groups `PageHeader`):
- Order: breadcrumb (details pages only) → row with [icon/badge] title + status/labels on the left and
  **actions on the right** (primary button or `Actions` dropdown) → optional subtitle (help text) → optional alert.
- Title is the only `h1`. Row gap `--pf-t--global--spacer--md`.
- List pages: title = plural kind ("Pods", "Users"); **no kind badge**; the create button ("Create Pod", "Add user")
  sits in the heading's action slot, not in the toolbar (`public/components/factory/ListPage/ListPageHeader.tsx`).
- Details pages: breadcrumb `<Plural kind> › <Kind> details` (OCP `breadcrumbsForDetailsPage`), title = large kind
  badge (`co-m-resource-icon--lg`) + object name, status as PF `Badge isRead` wrapping icon + text (OCP
  `console-dynamic-plugin-sdk/.../utils/resource-status.tsx`, `padding-left: spacer--sm`), then on the right the
  favourite star (`FavoriteButton`) and the `Actions` dropdown (`public/components/utils/headings.tsx`). No subtitle.
- Create pages ("Create Deployment", "Register cluster") have no breadcrumb.
- Admin details pages use the same pattern: `Users › User details`, `Clusters › Cluster details`.

## 4. Tabs
- `public/components/utils/horizontal-nav.tsx`: `Tabs component="nav" usePageInsets` directly under the heading, tab
  titles left-aligned with the heading text. Tabs are URL segments. No `PageSection` padding around the tab bar.
- Tab content in a padded `PageSection` (OCP `PaneBody`).

## 5. List pages
- OCP lists are `ConsoleDataView` (`packages/console-app/src/components/data-view/ConsoleDataView.tsx`, PF
  `@patternfly/react-data-view`): `DataViewToolbar` with `DataViewFilters` (category select "Name"/"Label"/attribute,
  hidden when only one filter; text filter "Filter by name" with the `/` hint), then plain icon buttons "Manage
  columns" (modal) and "Reset column widths", compact `Pagination` top in the toolbar and compact bottom under the table.
  Primary create action and favourite star live in the heading (§3).
- Table: `DataViewTable variant="compact" isResizable`, sortable headers, Name column sticky with right border and
  `nowrap`, kebab column sticky with left border (`useConsoleDataViewColumns.ts`).
  Column headers are **never truncated** at 1280; low-priority columns hide below `2xl` (1450px) with `visibility`
  (`LOW_PRIORITY_COLUMN`; OCP column `props.className`/`visibility` pattern) instead of squeezing or overflowing.
- Names: `ResourceLink` = kind badge + link (OCP `ResourceLink`). Times: OCP `Timestamp` (`console-shared/src/components/datetime/Timestamp.tsx`, `utils/datetime.ts:timestampFor`):
  `RhUiClockIcon` + absolute date ("Nov 17, 2026, 9:54 PM"), relative ("5 minutes ago") only within 10.5 minutes.
- Kind badge = OCP `co-m-resource-icon` (`public/components/_resource.scss`): filled pill, white text, radius 20px,
  `padding: 1px 4px`, `min-width: 18px`, `line-height: 16px`; colour per kind from `public/style/_vars.scss` (Pod
  `#009596`, workloads `#004080`, Namespace/Project `#1e4f18`, ConfigMap `#40199a`, Secret `#c46100`, Service
  `#6ca100`, default `#2b9af3`). Fleet kinds use the default colour and OCP's abbreviation rule (capitals of the kind):
  User `U`, Cluster `C`, Credential `CC` (rule applied to ClusterCredential; OCP gives colliding kinds an own `abbr`,
  `public/models/index.ts`; not `CR` = OCP's ClusterRole).
- Status cells: **icon + text**, not a filled label, mapped exactly as OCP `.../status/Status.tsx`: sync icon, no colour
  (Running, Updating, In Progress); green check (Active, Ready, Succeeded, Completed, Enabled, Up to date, Valid,
  Passed); red exclamation (Failed, Error, CrashLoopBackOff, ImagePullBackOff); in-progress icon (Pending); ban icon
  (Terminating, Expired, Not Ready, Cancelled; use it for Disabled/Deactivated); yellow triangle (Warning, Expires soon);
  unknown icon (Unknown).
- `Label`s are for categories only: environment, role, access mode, Read only, groups, Kubernetes labels.
- Empty list: a table row with centred "No <plural> found" (`ConsoleDataView` `BodyEmpty`, `Bullseye`); filtered to
  nothing: the same row, toolbar "Clear all filters".

## 6. Details pages
- `public/components/deployment.tsx:DeploymentDetails`, `public/components/utils/details-page.tsx:ResourceSummary`,
  `public/components/utils/details-item.tsx`, `public/components/utils/headings.tsx:SectionHeading`.
- First section: `SectionHeading` "<Kind> details" (h2), then `Grid hasGutter` with two `GridItem sm={6}` columns, each
  a **vertical** `DescriptionList` (term above value). Left: common metadata (Name, Namespace, Labels, Annotations,
  Created, Owner); right: kind-specific fields. Further sections (Containers, Conditions, Credentials…) follow, each
  with its own `SectionHeading`.
- Never a horizontal `DescriptionList` with a narrow term column (terms wrap into 3 lines).
- Labels in details: `LabelGroup numLabels={20} defaultIsOpen` of filled `key=value` `Label`s linking to search (OCP
  `public/components/utils/label-list.tsx`), inside a bordered box (`co-editable-label-group`, `_label.scss`); "No
  labels" in subtle text. Annotations as "N annotations" link/toggle. Metadata term is "Created at" (`details-page.tsx`).

## 6a. Events
- Events page and Events tab are OCP's event stream (`public/components/events.tsx`), not a table: pause/play
  toggle + "Streaming events..." + "Showing N events", then one card per event (involved object `ResourceLink`, its
  namespace badge, "Generated from <source>", time and "N times in the last <duration>", message) on a timeline;
  "No events" when empty. Events page toolbar: "Resources" select, "All types" select, "Filter Events by name or message".

## 7. YAML tab
- PF `CodeEditor` full height of the content area (OCP `public/components/edit-yaml.tsx`,
  `packages/console-shared/src/components/editor/CodeEditorToolbar.tsx`): toolbar copy, settings, fullscreen, right
  "Shortcuts". Below: `ActionGroup` Save (primary), Reload (secondary), Cancel (secondary), Download (secondary, right).
- `metadata.managedFields` is shown but auto-folded (`yaml-editor-utils.ts:registerAutoFold`); no switch.

## 8. Forms
- Full-page forms (register/edit cluster): field column max-width **650px** at >768px (OCP `public/style/_forms.scss`
  `.co-m-pane__form`); OCP forms are never full width. Buttons in a sticky footer (`console-shared/.../form-utils/
  FormFooter.tsx`: `PageSection stickyBase="bottom"`, shadow `--pf-t--global--box-shadow--sm--top`).
- `FormSection` per group with `titleElement="h2"`; helper text under fields; required marker by PF.
- Buttons in the sticky footer `ActionGroup`: primary (Create / Save) then `secondary` Cancel (OCP `FormFooter.tsx`;
  modals keep `link` Cancel). Server errors as an inline
  danger `Alert` above the buttons.

## 9. Modals and wizards
- `Modal` + `ModalHeader` + `ModalBody` + `ModalFooter`. Exactly **one** close control (the header X).
- Sizes: confirm/delete `small`; short forms `small`/`medium`; wizards `large` (or `medium`).
- Delete confirm (OCP `public/components/modals/delete-modal.tsx`): title "Delete <kind>?" with a warning icon
  (`titleIconVariant="warning"`), body "Are you sure you want to delete **name** in namespace **ns**?", footer danger
  "Delete" + link "Cancel". Type-to-confirm only for fleet-destructive actions (delete cluster).
- Context labels (environment) go **inline after the title text** or in the body sentence, never in the header `help` slot.
- Wizard in modal (PF "Wizard in modal"): the `Modal` has **no `onClose`** (no second X); `WizardHeader` owns close;
  Escape still closes via `onEscapePress`. The wizard fills the modal box edge to edge — no modal surface visible
  around it. Footer: PF default — Back (secondary), Next (primary), Cancel (link); last step "Grant access" style verb, not "Finish".

## 10. Empty, error, not-found
- `EmptyState` with a PF icon, `titleText` h-level matching the page, body ≤ 2 sentences, one primary action.
- 404 (OCP `public/components/error.tsx:ErrorPage404`): component-groups `ErrorState`, `NotFoundIcon`, `headingLevel h1`,
  title "404: Page Not Found", body "We couldn't find that page.", link button "Return to homepage". No separate heading.
  "Cluster not available" (fleet) uses the same layout.
- Errors: `ErrorState` (danger icon, ProblemDetails `detail`, Retry). Inline `Alert`s keep `--pf-t--global--spacer--md`
  from the toolbar/table below them.

## 11. Copy
- Sentence case everywhere ("Grant access", "Cluster details"); OCP wording ("Create", "Save", "Cancel", "Delete
  <kind>?", "Actions", "Filter by name", "No <plural> found").
- User language only. Never: checkpoint ids (CP2), "proxy", "configuration (user list)", spec ids, enum values.
  Admin source: "Admin through group <name>", "Admin set in the deployment settings".
- Product name from `shared/branding` (`PRODUCT_NAME`), never hard-coded.
- Empty value (cell, details value, priority of a user grant): `-` (hyphen), one shared constant, as OCP
  `console-shared/src/constants/ui.ts` `DASH`. Never `—`, "None" or blank (settled T-0267; sweep T-0270).

## 12. Accessibility
- One `h1` per page; heading levels follow the hierarchy (heading h1 → section h2 → card/modal h3 is not needed).
- Focus: skip-to-content first; switcher toggle → search on open → Escape returns focus to the toggle.
- Every icon-only button has an `aria-label`; status icons have text next to them. Contrast checked in both themes.
- Pod Terminal (T-0180, OCP `pod-connect.tsx`): xterm in Red Hat Mono 16px, black background and white text, fills the tab
  to the bottom. A focused terminal keeps Tab for the shell (TERM-10). To leave it, use Expand/Collapse or click outside and then press Tab.
