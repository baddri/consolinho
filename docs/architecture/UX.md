# UX rules — look and feel like the OpenShift console

Owner: ux-designer. Target: an OpenShift user cannot tell FleetConsole from the OCP web console (`openshift/console`
`main`, PatternFly 6) except for the fleet features (cluster switcher, Fleet administration). Where OCP has a pattern,
copy it; invent only for fleet features, in OCP's style. Code structure is in `FRONTEND.md`; this file is visual only.
OCP paths below are relative to `openshift/console/frontend/`.

## 1. General
- PatternFly 6 components and `--pf-t--global--*` tokens only. Custom CSS is the last resort: a colocated CSS module,
  each rule with a comment naming the OCP behaviour it reproduces. Never hard-code colours, sizes or fonts.
- Both themes (light, dark) and widths 1280 and 1920 must look right. No horizontal page scroll at 1280.
- Every page renders loading (Skeleton), error (ErrorState + Retry) and empty (EmptyState) explicitly.

## 2. Shell
- Masthead (`public/components/masthead/masthead.tsx`, `masthead-toolbar.tsx`): hamburger `PageToggleButton`,
  logo linking home, then a right-aligned toolbar of **plain icon buttons** and the user dropdown. No form controls,
  toggle groups or context selectors in the masthead.
- Theme: a plain icon menu in the masthead toolbar (Light / Dark / System). Invented: OCP keeps it in User preferences.
- Sidebar (`packages/console-app/src/components/nav/index.tsx`): `PageSidebar > PageSidebarBody > Nav`. The first child
  of the `Nav` is the header switcher, then the `NavExpandable` sections.
- **Cluster switcher = OCP's perspective switcher** (`packages/console-app/src/components/nav/NavHeader.tsx`): a
  full-width `MenuToggle` (`isFullWidth`, an icon, the name as `Title h2 size="md"`) at the top of the sidebar, menu
  opening under it. Fleet additions: search box, Recent / All clusters groups, environment and Read only labels.
  On pages outside a cluster (admin) it shows the cluster the cluster nav links point to.
- Project selector = OCP namespace bar (`public/components/namespace-bar.tsx`): first row of the main area, above the
  page heading, on namespaced list **and** details pages; `Project: <name>` toggle, then a divider.
- The main area is filled to the bottom of the viewport (`Page isContentFilled`); the white inset card never ends
  mid-screen.
- Environment band (fleet): prod/staging banner above the content, full width of the main area.

## 3. Page heading (every page)
OCP `packages/console-shared/src/components/heading/PageHeading.tsx` (wraps component-groups `PageHeader`):
- Order: breadcrumb (details pages only) → row with [icon/badge] title + status/labels on the left and
  **actions on the right** (primary button or `Actions` dropdown) → optional subtitle (help text) → optional alert.
- Title is the only `h1`. Row gap `--pf-t--global--spacer--md`.
- List pages: title = plural kind ("Pods", "Users"); **no kind badge**; the create button ("Create Pod", "Add user")
  sits in the heading's action slot, not in the toolbar (`public/components/factory/ListPage/ListPageHeader.tsx`).
- Details pages: breadcrumb `<Plural kind> › <Kind> details` (OCP `breadcrumbsForDetailsPage`), title = kind badge +
  object name, status as an outlined compact `Label` with the status icon, `Actions` dropdown on the right.
- Admin details pages use the same pattern: `Users › User details`, `Clusters › Cluster details`.

## 4. Tabs
- `public/components/utils/horizontal-nav.tsx`: `Tabs component="nav" usePageInsets` directly under the heading, tab
  titles left-aligned with the heading text. Tabs are URL segments. No `PageSection` padding around the tab bar.
- Tab content in a padded `PageSection` (OCP `PaneBody`).

## 5. List pages
- Toolbar: name filter (`SearchInput`), attribute filters (checkbox `Select`), chips, "Clear all filters". Primary
  create action lives in the heading (§3). Pagination only when the list is paged.
- Table: composable PF `Table` `variant="compact"` (OCP lists are compact), sortable `Th`, kebab `ActionsColumn`.
  Column headers are **never truncated** at 1280; low-priority columns hide below `2xl` (1450px) with `visibility`
  (`LOW_PRIORITY_COLUMN`; OCP column `props.className`/`visibility` pattern) instead of squeezing or overflowing.
- Names: `ResourceLink` = kind badge + link (OCP `ResourceLink`). Times: relative, absolute in a tooltip.
- Status cells: **icon + text**, not a filled label (`packages/console-dynamic-plugin-sdk/src/app/components/status/
  StatusIconAndText.tsx`): green check (Running, Active, Valid, Passed), red exclamation (Failed, CrashLoopBackOff,
  Expired), yellow triangle (warnings, Expires soon), grey/neutral icon or plain text (Pending, Unknown, Disabled).
- `Label`s are for categories only: environment, role, access mode, Read only, groups, Kubernetes labels.
- Empty list: `EmptyState` (`variant="sm"`) "No <plural> found" (OCP `EmptyBox`); filtered to nothing: "No results
  match the filter criteria" + "Clear all filters".

## 6. Details pages
- `public/components/deployment.tsx:DeploymentDetails`, `public/components/utils/details-page.tsx:ResourceSummary`,
  `public/components/utils/details-item.tsx`, `public/components/utils/headings.tsx:SectionHeading`.
- First section: `SectionHeading` "<Kind> details" (h2), then `Grid hasGutter` with two `GridItem sm={6}` columns, each
  a **vertical** `DescriptionList` (term above value). Left: common metadata (Name, Namespace, Labels, Annotations,
  Created, Owner); right: kind-specific fields. Further sections (Containers, Conditions, Credentials…) follow, each
  with its own `SectionHeading`.
- Never a horizontal `DescriptionList` with a narrow term column (terms wrap into 3 lines).
- Labels in details: `LabelGroup` of `key=value` labels (OCP `LabelList`); annotations as "N annotations" link/toggle.

## 7. YAML tab
- PF `CodeEditor` full height of the content area, toolbar copy/download; `Save` / `Reload` / `Cancel` below the
  editor (OCP `public/components/edit-yaml.tsx`). "Show managed fields" switch stays above the editor.

## 8. Forms
- Full-page forms (register/edit cluster): `Form isWidthLimited` (PF `--pf-v6-c-form--m-limit-width--MaxWidth` 55rem); OCP forms are never full width.
- `FormSection` per group with `titleElement="h2"`; helper text under fields; required marker by PF.
- Buttons in an `ActionGroup` at the end: primary (Create / Save) then `link` Cancel. Server errors as an inline
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
- 404 / not available: page heading with the title ("404: Page not found"), then the empty state (OCP
  `public/components/error.tsx`).
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
