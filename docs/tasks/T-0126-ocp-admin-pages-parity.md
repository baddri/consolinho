---
id: T-0126
title: OCP parity — Fleet administration lists and details on the OCP list/details patterns
status: done
owner: frontend-engineer
checkpoint: 3.6
depends_on: [T-0121, T-0122]
paths: [web/src/features/admin]
review_rounds: 4
---

## Goal
Fleet administration is a fleet invention, so it must look like an OCP resource area: same list toolbar, badges,
status icons and details heading as T-0121/T-0122. Absorbs T-0118 items 6–9 and the `WorstExpiryIcon` rename of item 10.

## OCP reference
- Routes: `/k8s/cluster/user.openshift.io~v1~User` (list + empty state), `/k8s/cluster/user.openshift.io~v1~User/<name>`;
  list/details patterns from `/k8s/ns/openshift-console/pods`.
- Source: `public/components/user.tsx`, `packages/console-app/src/components/data-view/ConsoleDataView.tsx`,
  `public/components/utils/headings.tsx`, `public/components/utils/details-page.tsx`,
  `packages/console-dynamic-plugin-sdk/src/app/components/status/Status.tsx`.

## Differences to fix
1. Users, Clusters, Credentials, Audit lists — own toolbar (search + selects) — use the T-0121 DataView toolbar
   (category select Name/attributes, `/` hint, chips, Manage columns, compact pagination top/bottom).
2. Names — plain links — `ResourceLink` with kind badge using OCP's abbreviation rule and default colour
   (`#2b9af3`): User "U", Cluster "C", Credential "C" (OCP rule = capitals of the kind; frontend-architect may pick a
   distinct fleet abbreviation, recorded in UX.md).
3. Heading help text — large gap under the title — OCP `PageHeading` `helpText` sits directly under the title
   (Users: 154→188px in the OCP shot); mirror spacing.
4. Status — "Disabled"/"Deactivated" plain text, "Pending" hourglass [T-0118 #8] — OCP `Status.tsx`: ban icon for
   disabled-like states, in-progress icon for Pending, green check Active/Enabled/Valid/Passed, red exclamation
   Failed, yellow triangle Expires soon, ban icon Expired (OCP maps Expired to ban).
5. Details headings (user, cluster) — subtitle under the title, outlined status label, no badge — OCP: badge (lg) +
   name + status `Badge isRead`, star, Actions; display name moves into the DescriptionList.
6. Clusters list — API URL middle-truncated [T-0118 #6] — hide below 2xl (column management); Credentials list — clamp
   legacy-token description to 2 lines [T-0118 #6].
7. Cluster Credentials tab — "Add credential" placement [T-0118 #7] — right-aligned in the toolbar like "Grant access".
8. User details — two grant entry points [T-0118 #9] — toolbar "Grant access" opens the wizard (1..n clusters);
   drop the Actions item.
9. Rename `WorstExpiryIcon`/`WorstExpiryStatus` to what it renders [T-0118 #10].
10. Deactivate user modal copy [T-0125 visual review]: the body repeats the title's question and says "lose access to
    all 1 cluster" — drop the repeated question, pluralise correctly ("1 cluster" / "N clusters").

## Context pack
- Docs: `UX.md` §3, §5, §6.
- Touch points: `web/src/features/admin/users/*` (list, details), `admin/clusters/ClustersListPage.tsx`, `ClusterRow.tsx`,
  `ClusterDetailHeader.tsx`, `ClusterStatusLabel.tsx`, `WorstExpiryStatus.tsx`, `clusterFilters.ts`,
  `admin/credentials/*`, `admin/audit/*`, `admin/grants/*`; shared pieces from T-0121/T-0122.

## Acceptance criteria
- [x] Side-by-side `/admin/users` vs OCP `/k8s/cluster/user.openshift.io~v1~User` (heading/help text/toolbar) and
      `/admin/clusters/prod-eu-1` vs OCP pod details (heading/DescriptionList) match at 1280 in light and dark.
- [x] All four admin lists use the shared toolbar and status component; T-0118 items 6–9 visible in the mock UI.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-22 frontend-engineer: started; OCP users/pod/secrets shots vs our mock admin pages at 1280.
- 2026-11-22 frontend-engineer: items 1–10 done: lists on `ConsoleDataView` (+`useAdminListFilters`), `AdminResourceLink`
  badges, ban/in-progress status, OCP details headings, single grant entry, `ClusterTokenExpiryStatus`, modal copy.
  Tests moved to the DataView UI (`dataViewTestUtils.ts`); side-by-side 1280 light+dark OK; check-fe green.
- 2026-11-22 frontend-engineer: fix round 1: shared `ConsoleFilterToolbar` (DataView + Audit); dead user-create path
  removed (`ClusterTypeahead`, create dialog moved into `ClusterGrantsTab`); `ADMIN_KIND_ABBR` (Credential "CC"); tables
  fit at 1280/1920 (`ConsoleDataView` locks header mins at content width while loading; TLS/Users/Fingerprint additional);
  Audit badge links, `Timestamp`, narrow expand column; 0-grant Deactivate copy; `withGrant` option. check-fe green.
- 2026-11-22 frontend-engineer: fix round 2: `.measuring`/`hasRows` removed. Instead: `DataViewColumn.width` default
  (users Name 150/Groups 180, clusters API URL 300, credentials Last test 230), skeleton cells hide with their headers,
  kebab header reserves the kebab width. Users/Clusters/Credentials fit at 1280 and 1920; loading → loaded → no-match
  keep the same width. check-fe green.
- 2026-11-22 frontend-engineer: fix round 3 (exception granted by the coordinator: shared-list regressions). Kebab header
  `width: 1%` + token-derived min-width → 61px everywhere; resource Name starts at 210, Pods Status at 170, so Pods fits
  at 1280/1920 (HEAD overflowed too: 923px). Admin tables fit at both; test for `width` + skeleton visibility. check-fe green.

## Review

### Code (frontend-architect)
**CHANGES_REQUESTED** (round 1). check-fe: lint/typecheck/build ok, 802 tests passed. Users/Clusters/Credentials
use `ConsoleDataView` + `Status` the same way the resource lists do, and `useAdminListFilters` is URL-backed like
`useResourceFilters`, so that part is fine. Audit keeping keyset "Load more" + expandable rows is acceptable (server
paging doesn't fit DataView's client pagination; recorded in ocp-parity.md). The Read only `multi` Yes/No filter is fine
(OCP's checkbox filters are multi, and a URL `?readOnly=yes` still works). The `ClusterTokenExpiryStatus` rename is fine.
- `grants/GrantFormModal.tsx:26-28,68-70,113,136-140,190-196` — the create-from-user path can no longer be reached (item 8) — delete
  the `perspective: 'user'` variant of `GrantCreateTarget` (create takes `cluster: GrantCluster`), the user branch of
  `titleOf`, the `else if (… 'user')` branch, `useClusters`, the `ClusterTypeahead` block and import. Edit mode no longer
  needs `perspective` (target is fixed): drop that prop, make `valuesOf` use `target: grant.username`, `fieldMap`
  `{ username: 'target' }`, `grantFormSchema()` with no argument ("Select a user."). Delete `grants/ClusterTypeahead.tsx`.
- `grants/GrantsTab.tsx:23-24,47,75-77,108` — `UserGrantsTab` still passes a `perspective:'user'` create target that is never used
  — `GrantsTabContent` takes `perspective` + required `onCreate`; the `'create'` dialog state and `<GrantFormModal mode="create">`
  move into `ClusterGrantsTab`.
- `AdminResourceLink.tsx:6-9` — Cluster and Credential both show "C" — keep User "U" and Cluster "C" (OCP rule). Credential gets
  `abbr="CC"`: the rule applied to "ClusterCredential", which is what it is. Not "CR": that is OCP's ClusterRole badge,
  `public/models/index.ts:499`, which our resource pages show too. Put the abbr in an
  `ADMIN_KIND_ABBR` map passed to `KindBadge abbr`, update the TSDoc and add to `UX.md` §5 (line 88): "Fleet kinds: User
  `U`, Cluster `C`, Credential `CC` (rule applied to ClusterCredential; avoids OCP's `CR` = ClusterRole)".
- `audit/AuditFilters.tsx:101-121` — copies ConsoleDataView's toolbar wiring (`ConsoleDataView.tsx:250-270`: our own "Clear
  filters" workaround for PF's memoised default, `RhUiFilterIcon`, the `onChange` adapter) — extract a shared
  `ConsoleFilterToolbar` (in `shared/ui/data-view`; props filterNodes/filterValues/onFilterChange/onClearAllFilters,
  optional actions/pagination/children) and use it in both places.
- `clusters/ClusterStatusLabel.tsx:11-13` — the TSDoc still says "next to the row's subtle text", but disabled rows are no
  longer subtle — fix the comment.
- Nits (optional): `UserActionsDropdown.tsx:20` filters by `itemKey`, while a `useUserActions(user, { withGrant: false })`
  option would state the intent. `dataViewTestUtils.ts:withoutBadges` could use `within(el).getByRole('link')` text
  instead of `querySelectorAll`.

**Round 2: CHANGES_REQUESTED.** check-fe green (803). All round-1 items are fixed (`ConsoleFilterToolbar`, dead grant code and
`ClusterTypeahead` gone, `ADMIN_KIND_ABBR` + UX.md §5, the comment, both nits). One shared regression remains:
- `shared/ui/data-view/ConsoleDataView.tsx:225,246-248` + `.module.css:60-68` (`.measuring`) — It is CSS-only: PF
  `DataViewTh` does the measuring itself, locking `getBoundingClientRect().width` as `minWidth` once on mount. But it
  changes every list for the worse. While loading, the skeleton rows sit in a `min-content` table, so the table is narrow
  and jumps to full width when data arrives (OCP's skeleton is full width). It also applies to `DataViewState.empty`, so a
  filter that matches nothing shrinks the table to min-content while you type and widens it again after, even though the
  headers were already locked. OCP has no such workaround: `DataViewTable isResizable` already wraps the table in PF
  `InnerScrollContainer` (OCP `ConsoleDataView.tsx:524` too), so it scrolls horizontally with the sticky kebab. Required
  fix: delete `.measuring` and `hasRows`. Keep the optional TLS/Users/Fingerprint columns, which are the OCP-like fix.
  If a default column set still overflows at 1920, fix that column only: `modifier: 'truncate'` or `'wrap'` on its cells
  (as DataViewTh's own default), or `resizableProps.width`.

**Round 3: APPROVE.** check-fe green (803). `.measuring`/`hasRows` are gone. The skeleton cells take their headers'
`visibility` (`TableSkeletonRows columnVisibility`, an existing prop), so the loading table already has the loaded table's
shape and nothing jumps. `DataViewColumn.width` is passed to PF as `resizableProps.width`: the PF way, used on four
columns only. The kebab header's min-width is CSS-only, commented, and scoped to `styles.actionsHeader`. Wide Pods
tables scroll inside PF's `InnerScrollContainer`, as in OCP. No DOM access in our code. Two optional follow-up nits:
`ConsoleDataView.module.css` `2.3125rem` (the plain toggle's width) is a magic number, so derive it from PF tokens if one exists;
no unit test covers `width` → `resizableProps.width` or skeleton visibility.

**Round 4: APPROVE.** check-fe green (804). The kebab header uses PF's action-cell `width: 1%` and a `min-width` built from PF
tokens, so the magic number is gone. `DataViewColumn.width` is now set on the resource Name column (210) and Pods
Status (170), each with a comment saying why. This is the same PF `resizableProps.width` mechanism, and the user's
resized widths still override it. The new `ConsoleDataView.test.tsx` case covers both round-3 nits. No new issues.

### Visual (ux-designer)
**CHANGES_REQUESTED** (round 1). Mock UI vs reference console (`/k8s/cluster/user.openshift.io~v1~User`,
`/k8s/ns/openshift-console/secrets`, pod details), 1280 + 1920, light + dark. Toolbar, help text under the title,
status icons, details heading (lg badge + name + read `Badge`, star, Actions), DescriptionList and tab placement of
"Add credential"/"Grant access" match (`public/components/user.tsx`, `utils/headings.tsx`, `ConsoleDataView.tsx`, `Status.tsx`).
Accepted: Audit "Load more" + expandable rows (shared toolbar only); disabled clusters not greyed, ban "Disabled" (OCP never
greys rows, `Status.tsx`); Read only Yes/No checkbox filter + "Read only: Yes" chip; env label next to the status badge
(fleet extra); Deactivate modal copy (item 10).
- `/admin/credentials`, cluster Access/Credentials tabs — cluster "C" and credential "C" sit side by side in one row and read
  as the same kind — `public/module/k8s/get-resources.ts:kindToAbbr` (OCP gives colliding kinds an own `abbr`, e.g.
  `CloudCredential` "CO") — Credential badge "CC" as the architect proposes (recorded in UX.md §5 by ux-designer).
- `/admin/users`, `/admin/clusters`, `/admin/credentials` at 1920 — table is 43/71/94px wider than the page, so the last data
  column (Groups, Last test) is clipped behind the sticky kebab ("Failed 4 day", "fleetconsole-adm") — OCP Pods/Secrets fit
  at 1920 (measured: table 1534 = container) — no horizontal scroll at 1920: let the long cells wrap (Last test, Groups
  labels, API URL) or move another column (Users/TLS/Groups) behind a wider breakpoint; re-measure at 1920.
- `/admin/audit` Target and Cluster columns — kind as muted word ("user admin", "cluster prod-eu-1") instead of a badge, item 2
  covers all four lists — OCP events show the involved object as `ResourceLink` (`public/components/events.tsx:211-218`) —
  `AdminResourceLink` (U / C / CC badge) for user, cluster and credential targets; plain text for other target kinds.
- Follow-ups (not blocking): Audit row-expansion column is `width={10}` (153px at 1920; pre-existing) — PF expand toggle
  column should be narrow; Deactivate copy with 0 grants still says "Their grants are kept" — drop that sentence;
  Audit "Time" shows relative times only (UX.md §5 Timestamp rule) — separate task.

**Round 2: APPROVE.** Re-checked at 1280 and 1920, light and dark. All round-1 findings and follow-ups are fixed:
- Badges are U / C / CC. Cluster and credential now read as different kinds on Credentials and the Access tab (UX.md §5).
- Users, Clusters and Credentials tables fit (measured 894/894 and 1534/1534 px), like OCP Pods/Secrets at 1920. Groups
  and Last test are no longer clipped. The shared header change causes no regression on Pods (1280/1920) or
  Deployments (1280). Pods hides Created below 2xl, as before.
- Hiding TLS, Users and Fingerprint by default (they stay available in Manage columns) is right. OCP column management
  also leaves some columns off by default (pods Node/Labels, `ColumnManagementModal`). The modal shows them unchecked
  after the defaults.
- Audit: Target and Cluster show a badge and link (`events.tsx:211`), and sessions stay plain text. The expand column
  is 72px, and Time uses OCP `Timestamp` (clock icon + absolute date). Deactivate with 0 grants: "bob will be logged
  out within a minute."

**Round 3: CHANGES_REQUESTED.** Checked at 1280 and 1920, light theme. The three admin tables still fit (894/894 and
1534/1534 px). The column-width change has two side effects on the shared list:
- Pods list at 1280 has a regression. The skeleton is 894 px wide, but when the rows arrive the Name column grows from
  157 to 208 px and the table becomes 953 px wide inside an 894 px area. Owner is cut off behind the kebab column and
  wraps ("web-/7d4b9c8"). In round 2 this list fit at 894. Fix: give the shared Name column (or the Pods columns)
  starting widths that fit at 1280, so the skeleton and the rows produce the same widths, and re-measure Pods,
  Deployments and the other resource lists at 1280.
- The kebab column is wider than OCP's. The empty header reserves 78 px at 1280 and 114 px at 1920, while OCP Pods and
  Secrets keep it at 61 px at both widths (measured at `127.0.0.1:9000`; `ConsoleDataView.tsx` actions column). Fix: make
  the reserved width match the kebab button plus the cell padding (61 px), not a share of the spare space.

**Round 4: APPROVE.** Checked at 1280 and 1920, light theme. Both round-3 findings are fixed:
- Pods fits at both widths: 894/894 px at 1280 and 1534/1534 px at 1920, while loading and after the rows arrive. At
  1280 the columns shift a few pixels when the rows replace the skeleton, but the table width doesn't change. Owner
  wraps inside its column and is no longer cut off.
- Clusters fits at both widths (894 and 1534 px).
- The kebab column is 61 px everywhere, the same as OCP Pods and Secrets.
- Follow-up: ReplicaSets and Services at 1280 also overflowed before this task.

## Handover notes
- Lists: Users/Clusters/Credentials use `ConsoleDataView` with columns in `*Columns.tsx` (old `*Row.tsx` deleted);
  filters stay URL-backed via `admin/useAdminListFilters.ts` (whole value written in one `setSearchParams`).
- Audit keeps keyset "Load more" + expandable rows, so it only uses the DataView toolbar (`AuditFilters.tsx`): no
  Manage columns/pagination (deviation, recorded in ocp-parity.md). `TypeaheadFilter` is now a DataViewFilters child.
- Badges via `ADMIN_KIND_ABBR`: User "U", Cluster "C", Credential "CC" (UX.md §5).
- Shared changes: `ConsoleFilterToolbar` (toolbar of `ConsoleDataView` and Audit); `DataViewColumn.width` (default
  `resizableProps.width` for non-wrapping columns); skeleton `columnVisibility`; `.actionsHeader` (kebab 61px, `width: 1%`); starting widths for resource Name (210) and Pods Status (170).
- `users` readOnly filter is now `multi` (checkbox Yes/No); disabled cluster rows are no longer subtle (ban status).
- Item 8: user page "Grant access" (toolbar + empty state) opens the bulk wizard; Actions dropdown drops it (list kebab
  keeps it; `useUserActions(user, { withGrant: false })`). Single-grant create exists only on the cluster Access tab.
- Unchanged: `GrantStateLabels` and CA-certificate expiry labels still use PF Labels.
- Test helpers: `admin/dataViewTestUtils.ts` (`chooseFilter`, `checkFilterOption`, `withoutBadges`); `admin.test.tsx`
  now uses `@/test/sidebar` `openSidebar`.
