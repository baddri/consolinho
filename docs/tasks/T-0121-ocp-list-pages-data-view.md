---
id: T-0121
title: OCP parity — resource list pages (DataView toolbar, columns, pagination, kind badges, status icons)
status: done
owner: frontend-engineer
checkpoint: 3.6
depends_on: [T-0119]
paths: [web/src/features/resources/list, web/src/features/resources/components, web/src/features/resources/registry, web/src/shared/ui, web/package.json]
review_rounds: 3
---

## Goal
Make Pods, Deployments, ConfigMaps, Services and Projects lists look and behave like OCP's `ConsoleDataView` lists,
and introduce the shared kind badge and status mapping every other page reuses. Absorbs T-0095 and T-0118 items 3–4.

## OCP reference
- Routes: `/k8s/ns/openshift-console/pods`, `/k8s/ns/openshift-console/deployments`, `/k8s/cluster/projects`.
- Source: `packages/console-app/src/components/data-view/ConsoleDataView.tsx` (toolbar L405-545, `BodyEmpty` L59,
  `BodyLoading` L55), `DataViewTextFilter.tsx`, `DataViewLabelFilter.tsx`, `useConsoleDataViewColumns.ts` (sticky props
  L28-75), `useConsoleDataViewResizableColumns.ts`, `ConsoleDataViewColumnManagementModal.tsx`, `ConsoleDataView.scss`;
  `public/components/pod-list.tsx`, `namespace.tsx`; `public/components/_resource.scss` + `public/style/_vars.scss`
  (kind badges); `packages/console-dynamic-plugin-sdk/src/app/components/status/Status.tsx` (status → icon).

## Differences to fix
1. Toolbar — our separate "Filter by name", Status select, label-selector input + "→" button — OCP `DataViewToolbar` +
   `DataViewFilters`: category select (filter icon + "Name"/"Label"/attribute; hidden when only one filter), one text
   input "Filter by name" with the `/` keyboard hint, label filter with typeahead of existing labels, chips +
   "Clear all filters" — rebuild with `@patternfly/react-data-view` (OCP uses ~6.5; frontend-architect confirms the
   dependency and notes it in FRONTEND.md) or our own composition with the same DOM.
2. Toolbar actions — missing — plain icon buttons "Manage columns" (opens column management modal, choice persisted
   per kind) and "Reset column widths" (only when widths changed).
3. Table — fixed columns, headers truncated at 1440 [T-0095], generated names wrap badly [T-0118 #3] — OCP
   `DataViewTable variant="compact" isResizable`; Name column sticky, `nowrap`, right border; kebab column sticky with
   left border; Namespace `nowrap`; no fixed widths on Ready/Restarts.
4. Pagination — bottom full pagination with page input; shown with 3 rows [T-0118 #4] — OCP compact `Pagination` in the
   toolbar (top) and compact bottom (`PaginationVariant.bottom isCompact`) — mirror; per-page default 50.
5. Kind badges — pale PF label — OCP `co-m-resource-icon`: filled pill, white text, `border-radius: 20px`,
   `padding: 1px 4px`, `min-width: 18px`, `line-height: 16px`, `margin-right: 4px`; colours by kind (`_vars.scss`:
   Pod `#009596`, Deployment/ReplicaSet/StatefulSet/DaemonSet/Job `#004080`, Namespace/Project `#1e4f18`, ConfigMap
   `#40199a`, Secret `#c46100`, Service `#6ca100`, default `#2b9af3`); `--lg` variant for headings (font +3px,
   `line-height: 20px`, `min-width: 24px`, `padding: 0 7px`, `margin-right: 7px`). CSS module, each rule commented
   with the OCP scss path (OCP hard-codes these hex values; same in both themes).
6. Status cells — Running = green check, Pending = hourglass — map exactly like OCP `Status.tsx` (UX.md §5): Running
   → sync icon (uncoloured), Pending → in-progress icon, CrashLoopBackOff/Error → red exclamation, Active/Ready/
   Succeeded/Completed → green check, Terminating → ban icon, Unknown → unknown icon. Use the `rh-ui-*` icons from
   `@patternfly/react-icons` that OCP uses. One shared component for lists, details and admin.
7. Heading — no "Create <Kind>" — primary "Create Pod"/"Create Deployment"/… in the heading action slot when the user
   can create (opens the existing YAML create flow or is hidden if none exists; no new create feature here).
8. Empty — check — table body row with centred "No <plural> found" (`BodyEmpty`); loading = `SkeletonTableBody`
   5 rows.
9. Projects list — "—" placeholders — OCP copy "No display name", "No requester" (`namespace.tsx`).
10. Metrics columns (Memory, CPU) — OCP shows them — out of scope (no metrics source); note in parity matrix.
11. Project bar (from T-0119 visual review) — our toggle text smaller, indented, extra top padding — OCP 16px text, flush
    left, no top padding (`public/components/namespace-bar.tsx`, `public/components/_dropdown.scss` L49-58) — match it.

## Context pack
- Docs: `UX.md` §3, §5; `FRONTEND.md` § model descriptors.
- Touch points: `web/src/features/resources/list/ResourceListPage.tsx`, `ResourceListToolbar.tsx`, `ResourceTable.tsx`,
  `useResourceFilters.ts`; `components/KindBadge.tsx`, `ResourceLink.tsx`, `ResourceStatusLabel.tsx`;
  `web/src/shared/ui/StatusIconText.tsx`; kind descriptors in `features/resources/registry`.
- PF: `DataView*` (react-data-view), `Table` sticky/resizable props, `Pagination isCompact`, `Modal` (column management).

## Acceptance criteria
- [x] Side-by-side `/c/dev-1/k8s/ns/shop/pods` vs OCP `/k8s/ns/openshift-console/pods` matches at 1280 in light and
      dark (toolbar, badges, status icons, sticky columns, pagination); same for deployments and projects.
- [x] At 1280 and 1440 every header is fully readable or resizable (T-0095 criterion).
- [x] Column management choice survives reload.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-22 frontend-engineer: added `@patternfly/react-data-view` **6.7.0** (exact pin): newest stable, released
  2026-10-16 (>2 weeks), deps `@patternfly/react-core ^6.4.0` accept our 6.7.0, peers react 17-19; dedupes onto core.
  Built `shared/ui/data-view` (ConsoleDataView, text/label filters, column modal, persisted widths), `shared/ui/Status`,
  `shared/ui/kind-badge`; resource lists migrated; project bar CSS; parity rows updated. check-fe green.
- 2026-11-22 frontend-engineer (fix round 1): Manage columns = PF component-groups `ColumnManagementModal` (direct dep
  6.7.0, as locked; drag order + hidden choices stored, OCP copy); label filter = OCP AutocompleteInput look (text
  input + `/`, 5 purple outline suggestions); deployments: 20 normal labels, selector search icon, Created hidden by
  default; ConfigMaps "Size"; type derived from `DataViewTable` props; corrupt-storage tests. check-fe green (754).
- 2026-11-22 frontend-engineer (fix round 2): Deployments Created column removed; modal link "Restore default
  columns"; Namespace always listed in Manage columns (`DataViewColumn.isHidden` = listed, not rendered, outside All
  projects); `@patternfly/react-drag-drop` pinned 6.7.0 (locked). check-fe green (755).

## Review

### Code (frontend-architect)
**APPROVE** (round 1; check-fe re-run: lint/typecheck/build ok, 750/750).
- Dependency: `react-data-view@6.7.0` exact; core/table/icons dedupe onto our 6.7.0 (`npm ls`), lockfile consistent.
  New transitive deps: `react-component-groups`, `react-drag-drop`/`@dnd-kit`, `react-jss` (runtime `<style>`, covered by
  existing `style-src 'unsafe-inline'`). Non-Monaco JS 1450 → 1540 KB raw (+6%), CSS +1 KB: acceptable. FRONTEND.md
  §Stack + §UI conventions ("Lists = `ConsoleDataView`", shared `Status`) updated by me.
- ConsoleDataView: generic, no `@/features` imports in `shared/`, list query/keys unchanged (cluster-scoped `useK8sList`),
  row SSARs still per namespace (no N+1); usable by T-0126 as-is.
- Storage: per list id, parse guarded (bad JSON/types → defaults), `useStoredValue` try/catches get/set; unknown ids ignored.
- Out-of-path edits justified (ActionsColumn cell now from the data view; IntersectionObserver stub is test-only).
- Paging: client-side over the full watched list is right (watch + client sort need the full set; OCP does the same).
Nits (optional):
- `web/src/features/resources/actions/ResourceRowActions.tsx:14` — TSDoc line ~170 chars — rewrap to 120.
- `web/src/shared/ui/data-view/ConsoleDataView.tsx:19` — deep `dist/esm` type import is brittle on upgrades — re-check on PF bumps.
- `web/src/shared/ui/data-view/useDataViewColumns.ts:55` — keyed by plural only; add the API group when CRD lists arrive
  (same plural in two groups); no test for corrupt stored JSON / persisted widths.
- Round 2: **APPROVE** (check-fe re-run, 754/754). Direct `react-component-groups@6.7.0` pin matches the lock; PF
  `ColumnManagementModal` replaces our hand-rolled one (good); `{shown, hidden}` choice keeps entries for unlisted
  columns, parse guarded, tested incl. corrupt data; old array format falls back to defaults (fine, unreleased).
  `FilterTextInput` dedupes the `/` shortcut. Round-1 nits done. Optional: `DataViewLabelFilter.tsx:104` suggestion
  panel is hand-rolled (mirrors OCP `AutocompleteInput`; no arrow-key/listbox semantics); pin `@patternfly/react-drag-drop`
  (peer of `enableDragDrop`, auto-installed at 6.7.0) explicitly on the next dependency touch.
- Round 3: **APPROVE** (check-fe re-run, 755/755). `DataViewColumn.isHidden` is a clean generic flag (listed in the
  modal, filtered from `shown` only), so the user's Namespace choice survives scope switches; `ResourceListPage` sets it
  for `allNamespacesOnly`. Deployments drop Created with no dangling sort or test. `react-drag-drop@6.7.0` pinned,
  matching the lock. No open findings.

### Visual (ux-designer)
**CHANGES_REQUESTED** (round 1; mock vs reference console, pods/deployments/configmaps/services/projects, 1280 + 1920,
light + dark). Match: toolbar, category menu (Name/Label/Status), `/` hint, chips + "Clear filters", compact top/bottom
pagination, sticky Name/kebab, kind badge colours, status icons, `No Pods found` row, project bar (#11), Owner wrap at 1280
(OCP wraps too).
- Manage columns — hand-rolled checkbox list, extra sentence "Selected columns will appear…" — OCP PF
  `ColumnManagementModal` from `@patternfly/react-component-groups` ("N selected" bulk select, bordered rows, bold names,
  drag handles), description only the namespace sentence when no column limit (`data-view/ConsoleDataViewColumnManagementModal.tsx`
  L4, L208-215) — use that component (already installed 6.7.0 via react-data-view; make it a direct dep) and the copy.
- Label filter — PF typeahead Select (clear button + caret, wider than the Name input, plain menu items) — OCP
  `AutocompleteInput`: same-width text input "Filter by label" with `/` hint, suggestions as `Label variant="outline"
  color="purple"` in a floating panel (`data-view/DataViewLabelFilter.tsx` L48-58, `public/components/autocomplete.tsx`
  L28-40, `_autocomplete.scss`) — rebuild to that DOM.
- Deployments Labels — compact grey labels, max 3 — OCP `LabelList` (`public/components/utils/label-list.tsx`): normal-size
  filled PF `Label` per key=value in a `LabelGroup numLabels={20}` — drop `isCompact`, show up to 20 (OCP's blue look is
  `pf-m-clickable` → search; no search page yet, so stay non-clickable).
- Deployments Pod selector — no icon — OCP `Selector` (`utils/selector.tsx` L19-23): `RhUiSearchIcon` before the link,
  requirements joined with ", " — add the icon.
- Deployments columns — extra Created column — OCP workload table has Name, Namespace, Status, Labels, Pod selector only
  (`public/components/workload-table.tsx` L76-81) — hide Created by default (optional in Manage columns).
- ConfigMaps — header "Keys" — OCP "Size" (`public/components/configmap.tsx` L92) — rename.
Follow-ups (non-blocking, filed as T-0129): Created cells relative ("3 hours ago") vs OCP `Timestamp` clock icon +
absolute date (UX.md §5 corrected); pod Owner plain text (no ReplicaSet kind) vs OCP `OwnerReferences` link; deployment
Status "N of M pods" is an OCP link to the Pods tab (`workload-table.tsx` L97-102, we have no Pods tab yet). Services:
clone `main` shows only Name/Created, ours richer: accepted. Loading skeleton not screenshot (mock can't stall); code uses
5 skeleton rows under the headers, as OCP `BodyLoading`.

**CHANGES_REQUESTED** (round 2; 1280, light + dark). Fixed and matching: label filter (`AutocompleteInput` DOM, purple
outline suggestion, `/` hint, same width as OCP), Deployments labels (full size), Pod selector search icon, ConfigMaps "Size",
PF `ColumnManagementModal` (bulk select, bordered rows, drag handles, namespace-only description).
- (a) Deployments Created — hidden by default, still offered in Manage columns — OCP's Deployments modal lists only Name,
  Namespace, Status, Labels, Pod selector (reference shot; `workload-table.tsx` L76-81, `useConsoleDataViewColumns.ts`
  L238 `additional` only for defined columns) — remove the column from the deployment descriptor. (My round-1 "optional in
  Manage columns" was wrong.)
- Manage columns link "Reset to default" (PF default) — OCP "Restore default columns"
  (`ConsoleDataViewColumnManagementModal.tsx` L279 `resetToDefaultLabel`) — pass that label.
- Manage columns list omits Namespace outside All projects — OCP always lists Namespace (checked) under Name, which is what
  the "only shown when in All projects" sentence refers to (reference shot, deployments + pods) — include it.
- (b) Name drag handle enabled — OCP disables it only via `document.querySelector` (`ConsoleDataViewColumnManagementModal.tsx`
  L129-152), which CLAUDE.md forbids; our `useDataViewColumns.ts` L78-79 always renders Name first, so dragging it is a
  no-op — accepted deviation, not blocking (revisit if component-groups gains a per-column `isDraggable`).
- Note: OCP column titles in the modal are bold because it uses component-groups `~6.8.0-prerelease`; ours 6.7.0 regular —
  library version, no custom CSS; picks up on upgrade.

**APPROVE** (round 3; 1280 light + modal dark, vs reference `ocp-dmodal-light` / `ocp-modal-dark`). Deployments table
and Manage columns list exactly Name, Namespace, Status, Labels, Pod selector (`workload-table.tsx` L76-81); link reads
"Restore default columns" (`ConsoleDataViewColumnManagementModal.tsx` L279); Namespace listed under Name on pods and
deployments while not drawn in single-project tables, as OCP. Name drag handle: accepted deviation (round 2).

## Handover notes
- Shared list: `web/src/shared/ui/data-view/ConsoleDataView.tsx` (generic over T, columns `DataViewColumn<T>`,
  filter elements + values via props). Admin lists (T-0126) can adopt it as-is.
- Filter elements must keep stable props (memoise them): PF `DataViewFilters` resets the category when they change;
  label suggestions therefore flow through `LabelSuggestionsContext`.
- Column choice (`{shown (ordered), hidden}`) and widths are stored in localStorage under
  `fleetconsole.dataView.{columns,columnWidths}.<plural>`; Name stays first (its drag handle is not disabled, unlike OCP).
- #7: no create flow exists yet, so no "Create <Kind>" button (hidden, not disabled).
- #10: metrics columns out of scope (noted in ocp-parity.md).
- Outside the paths: `actions/ResourceRowActions.tsx` now returns the ActionsColumn without its `Td` (the data view
  supplies the cell); `test/setup.ts` stubs IntersectionObserver (DataViewTh needs it).
- `list/ResourceTable.tsx` kept: the events tab still uses it. `ResourceListToolbar.tsx` deleted.
- `ResourceStatus.color` removed; status icons come from `statusKindOf` (OCP word lists). Deployments show
  "N of M pods" as plain text like OCP.
- Left for others: `lg` kind badge in details headings (T-0122); admin "Disabled" → ban icon (T-0126);
  FRONTEND.md mention of the new dependency (frontend-architect).
