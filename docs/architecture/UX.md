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
  Order like OCP "Core platform": Home, Favorites (starred pages, `packages/console-app/src/components/favorite/`),
  then the cluster sections, then Fleet administration. Every section starts collapsed, also the one holding the
  active page (marked current), like OCP `NavSection.tsx` (`useState(false)`).
- **Cluster switcher = OCP's perspective switcher** (`packages/console-app/src/components/nav/NavHeader.tsx`): a
  full-width `MenuToggle` (`isFullWidth`, an icon, the name as `Title h2 size="md"`) at the top of the sidebar, menu
  opening under it. One line, same height as OCP's toggle (labels inline after the name), no divider under it. Fleet additions: search box, Recent / All clusters groups, environment and Read only labels.
  On pages outside a cluster (admin) it shows the cluster the cluster nav links point to.
- Project selector = OCP namespace bar (`public/components/namespace-bar.tsx`): first row of the main area, above the
  page heading, on namespaced list **and** details pages; `Project: <name>` toggle, then a divider.
- The main area is filled to the bottom of the viewport (`Page isContentFilled`); the white inset card never ends
  mid-screen.
- Environment band (fleet): PF `Banner` (prod `red`, staging `orange`) with centred text, first thing in the main card,
  exactly like OCP's notifier banners (`public/components/kube-admin-notifier.tsx`: `Banner color="blue"`, centred `p`).

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
  `#6ca100`, default `#2b9af3`). Fleet kinds use the default colour and OCP's abbreviation rule (capitals of the kind).
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

## 12. Accessibility
- One `h1` per page; heading levels follow the hierarchy (heading h1 → section h2 → card/modal h3 is not needed).
- Focus: skip-to-content first; switcher toggle → search on open → Escape returns focus to the toggle.
- Every icon-only button has an `aria-label`; status icons have text next to them. Contrast checked in both themes.
