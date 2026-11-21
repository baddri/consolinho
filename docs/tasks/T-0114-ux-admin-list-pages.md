---
id: T-0114
title: Fleet administration list pages — heading actions, columns that fit 1280, status icons
status: done
owner: frontend-engineer
checkpoint: CP3.5
depends_on: [T-0110]
paths: [web/src/features/admin/users/UsersListPage.tsx, web/src/features/admin/users/UsersListPage.test.tsx, web/src/features/admin/users/UserRow.tsx, web/src/features/admin/users/UserRoleLabels.tsx, web/src/features/admin/users/UserStatusLabel.tsx, web/src/features/admin/clusters/ClustersListPage.tsx, web/src/features/admin/clusters/ClustersListPage.test.tsx, web/src/features/admin/clusters/ClusterRow.tsx, web/src/features/admin/clusters/ClusterStatusLabel.tsx, web/src/features/admin/clusters/LastTestCell.tsx, web/src/features/admin/clusters/WorstExpiryStatus.tsx, web/src/features/admin/clusters/TlsModeLabel.tsx, web/src/features/admin/credentials/CredentialsListPage.tsx, web/src/features/admin/credentials/CredentialsListPage.test.tsx, web/src/features/admin/credentials/FleetCredentialRow.tsx, web/src/features/admin/credentials/CredentialExpiryLabel.tsx, web/src/features/admin/credentials/LastTestLabel.tsx, web/src/features/admin/credentials/CredentialExpiryAlert.tsx, web/src/features/admin/credentials/ServiceAccountCell.tsx, web/src/features/admin/audit, web/src/shared/table]
review_rounds: 1
---

## Goal
Users, Clusters, Credentials and Audit log lists look like OCP list pages and fit a 1280 screen.

## Scope
- In: list pages, row components, status labels used in rows, `FilterToolbar` spacing.
- Out: details pages and forms (T-0115), modals/wizard (T-0116), filter semantics (unchanged).

## Contract / design notes
Structure:
- Each list page renders `PageHeading` (T-0110) `title` + `subtitle` + `actions` (create button), then `PageBody`
  with toolbar + table. Tables `variant="compact"`; low-priority columns get `visibility={['hidden', 'visibleOnXl']}`
  on both `Th` and `Td` (PF table `visibility` prop).
- **Status = icon + text (decided).** Convert the status adapters in place, keeping their names and props so every
  consumer (rows, `GrantRow`, `SelectClustersStep`, details tabs/headers) follows: `UserStatusLabel`,
  `ClusterStatusLabel`, `CredentialExpiryLabel`, `LastTestLabel`/`LastTestCell` → `StatusIconText` with a local
  `Record<Enum, StatusKind>`; add `asLabel?: boolean` passthrough (T-0115 uses it in headers). Tooltips stay.
- Audit labels: new `audit/auditActionLabels.ts:auditActionLabel(action: string): string` — map of the backend ids
  (`user.*`, `cluster.*`, `credential.*`, `grant.*`, `auth.*`; source `grep -rhoE '"(user|cluster|credential|grant|auth)\.[a-z_.]+"' src/FleetConsole.Application`)
  to sentence-case labels ("Login denied", "Cluster registered"); unknown ids (proxy actions) fall back to the raw id.
  Raw id stays visible in the expanded row; the action filter keeps filtering by id.

Findings:
- Users — "Add user" in the toolbar — OCP create button in the heading — `PageHeading actions`. Same for Clusters
  ("Register cluster").
- Users — headers truncated "U…", "Display …", "Clust…", "L…" — OCP full header words — compact table, widths,
  hide Groups/Last login below `xl`; "Cluster grants" not "Clust…".
- Audit log — table wider than the card at 1280 (Summary column cut) — hide Cluster/Target below `xl`, Summary wraps;
  no horizontal page scroll. Action column shows raw event ids (`auth.login_denied`) — show the human label
  ("Login denied") with the id in the expandable row. Time column wraps "49 / minutes / ago" — nowrap.
- Credentials — table wider than the card ("Failed at Authentication" cut) — fit 1280 as above; expiry alert touches
  the toolbar — `--pf-t--global--spacer--md` gap.
- All admin lists — filled coloured status labels ("Active", "Valid", "Passed · Cluster-wide view", "Expired") — OCP
  status = icon + text — `StatusIconText`; keep `Label` for categories (environment, role, Read only, access mode, groups).
- Users — "via config" outline label under Admin — keep one label "Admin"; source goes to details (T-0115).
- Subtitles ("Everyone who has logged in to …") — OK as `PageHeading subtitle`; product name from `PRODUCT_NAME`.

## Context pack
- Docs: `docs/architecture/UX.md` §3, §5, §11; `FRONTEND.md` § "Admin list pages".
- Touch points: `web/src/features/admin/users/UsersListPage.tsx:UsersListPage`, `UserRow.tsx:UserRow`,
  `UserRoleLabels.tsx`, `UserStatusLabel.tsx`; `web/src/features/admin/clusters/ClustersListPage.tsx`, `ClusterRow.tsx`,
  `ClusterStatusLabel.tsx`, `LastTestCell.tsx`; `web/src/features/admin/credentials/CredentialsListPage.tsx`,
  `FleetCredentialRow.tsx`, `CredentialExpiryLabel.tsx`, `LastTestLabel.tsx`, `CredentialExpiryAlert.tsx`;
  `web/src/features/admin/audit/AuditLogPage.tsx` (`AuditResults` L93), `AuditEntryRow.tsx`;
  `web/src/shared/table/FilterToolbar.tsx:FilterToolbar`, `TableStateRows.tsx`.
- Tests: `UsersListPage.test.tsx`, `ClustersListPage.test.tsx` (queries "Register cluster" — now in the heading),
  `CredentialsListPage.test.tsx`, `AuditLogPage.test.tsx` (action cell text), `shared/table/tableKit.test.tsx`; add
  `audit/auditActionLabels.test.ts`. Queries by role/text keep working if the status text is unchanged — don't query by
  `Label` class. Convention: `renderApp('/admin/...')` + `preloadLazyRoutes(adminRoutes)` (FRONTEND.md § "Testing").
- Exemplar: column `visibility` — `BaseCellProps.visibility` + `modifier="nowrap"` on `Th`/`Td` (`@patternfly/react-table` `Table.d.ts` L14-19); status
  mapping — `credentials/CredentialExpiryLabel.tsx:EXPIRY_LABELS` (L6) is the pattern to keep, only the render changes.
- Conflicts: none of T-0115's/T-0116's files; T-0115 runs **after** this (it uses the converted status adapters and
  `UserRoleLabels.tsx`). Parallel-safe with T-0111, T-0112, T-0113, T-0116.
- OCP: `public/components/factory/ListPage/ListPageHeader.tsx`, `packages/console-dynamic-plugin-sdk/src/app/components/status/StatusIconAndText.tsx`.

## Acceptance criteria
- [x] At 1280 none of the four lists scrolls horizontally or truncates a header; at 1920 all columns show.
- [x] Primary create action is in the heading row, right-aligned (Users, Clusters).
- [x] Status columns are icon + text in both themes; categories stay labels.
- [x] Audit: human action labels, time on one line, expand row still shows details.
- [x] Credentials expiry alert has a visible gap to the toolbar.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-21 frontend-engineer: started; merged cp/3.5-look-and-feel.
- 2026-11-21 frontend-engineer: PageHeading/PageBody on 4 lists, create actions in heading, status adapters → StatusIconText
  (+`asLabel`), `auditActionLabel`, low-priority columns hidden below 2xl. Mock-UI screenshots users/clusters/credentials/
  grants/audit, light+dark, 1280+1920: no page/table overflow, no truncated header. check-fe green.

- 2026-11-22 frontend-engineer: review round 1 fixes 1–6 (skeleton visibility + test, UX §5 empty copy, docs 2xl,
  nowrap cluster name/credential cells, audit expanded Target/Cluster, icon+text warnings, audit header widths).
  Screenshots clusters/credentials/audit(+filtered-empty) light+dark 1280/1920: no overflow/truncated headers. check-fe green.
- 2026-11-22 frontend-engineer: post-approval nits: Clusters API URL hidden below 2xl, credential description
  `Truncate` (tooltip), audit 400 state "Clear all filters", `WorstExpiryStatus` rename, paths, >120-col rewraps.

## Review

### Visual review (ui-ux-designer, 2026-11-21) — CHANGES_REQUESTED
Mock UI, admin, light+dark, 1280+1920: Users, Clusters, Credentials, Audit log, user/cluster access tabs. No page/table overflow, no truncated header, create actions in heading, status icon+text, audit labels/expand OK. Loading state not reachable in mock (blank boot screen).
- Clusters 1280 — Name cell wraps the display name to 3 lines ("Development / 1") while API URL keeps width — OCP name column never squeezes — `modifier="nowrap"` on the name/display-name cell, let API URL take `modifier="truncate"` with a width.
- Audit log <1450 — Target and Cluster columns hidden but the expanded row shows only Action ID/Details/Correlation ID, so target and cluster link are unreachable — OCP hides only redundant info — add Target and Cluster to the expanded `DescriptionList`.
- Users/Clusters/Credentials/Audit/grants filtered to nothing — "No users match" / "No audit entries match these filters" + "Clear filters" — UX.md §5, OCP (and our `ResourceListPage`) "No results match the filter criteria" + "Clear all filters" — use the same copy everywhere.
- User Cluster access tab — two primaries: heading "Grant access to clusters" + toolbar "Add access"; cluster tab says "Grant access" — one create action in one place, one wording — follow-up for T-0115 if heading is out of scope here.
- Credentials 1280 — Cluster cell stacks env label over name for long names, inline for short ones — inconsistent row shape — nowrap the cell (label + link inline).
- Clusters Credentials column — count + bare status icon (purple info on staging-eu-1) with no text — UX.md §5 icon + text — add text or a tooltip/aria-label naming the state (nit).
- Clusters "TLS not verified", Credentials "Not a ServiceAccount token" — filled yellow labels for warnings — UX.md §5 warnings = yellow triangle + text — `StatusIconText` warning (nit).
- Audit filtered-empty — headers re-centre when the expand column has no rows (nit).
**Round 1 — frontend-architect: CHANGES_REQUESTED** (check-fe green in worktree: 720 tests; no churn outside task paths)
Accepted decisions: `LOW_PRIORITY_COLUMN` = `visibleOn2Xl` is correct (PF breakpoints are viewport media queries; `xl`
is already on at 1280 with the sidebar) and matches T-0112's `pods.tsx` usage. A `shared/table` constant is the right
shape for hand-written admin tables; `features/resources` keeps `ColumnDef.visibility` (data-driven) — no forced merge.
Status adapters, `asLabel?`, `auditActionLabels.ts` (Map, prototype-safe, fallback) are good. USR-6 source still on
`UserDetailHeader`, so dropping "via config" from the row is no regression.
Required:
- `web/src/shared/table/TableStateRows.tsx:24` — skeleton renders cells for hidden columns, misaligning the loading table
  at 1280 — add `columnVisibility?: Readonly<Partial<Record<number, ThProps['visibility']>>>` (by column index) applied
  to each skeleton `Td`; pass it from Users/Clusters/Credentials/Audit; one test in `tableKit.test.tsx`.
- `UsersListPage.tsx:131-140`, `ClustersListPage.tsx:131-144`, `CredentialsListPage.tsx:114-127`, `AuditLogPage.tsx:89,128`
  — copy deviates from UX.md §5 — filtered: title "No results match the filter criteria", button "Clear all filters";
  empty: "No users found" / "No clusters found" / "No credentials found" / "No audit entries found" (existing guidance
  bodies may stay); update the affected tests. (Grants/`SelectClustersStep` out of scope.)
- `docs/architecture/FRONTEND.md:190` and `docs/architecture/UX.md` §5 ("hide below `xl`") — docs contradict the
  implementation — change to `LOW_PRIORITY_COLUMN` (`['hidden','visibleOn2Xl']`, hidden below 1450px).
Nits (optional): `UserRow.tsx:21` and `FleetCredentialRow.tsx:25` doc lines exceed 120 cols, `ClusterRow.tsx:21-22` odd
wrap ("The" alone) — reflow; `LOW_PRIORITY_COLUMN` import sits out of alphabetical order in the three list pages.

**Round 2 — frontend-architect (cd27aaa): APPROVE** (check-fe green in worktree: 721 tests)
All three required items are done: `columnVisibility` maps match the header indices on all four lists and have a test;
the `TableNoMatchRow` helper keeps the no-match copy in one place; FRONTEND.md and UX.md now say `2xl`. Converting
`WorstExpiryIcon`/`TlsModeLabel`/`ServiceAccountCell` outside the original paths is accepted (status = icon + text).
Nits (optional): `AuditLogPage.tsx:86-88` the invalid-filters state still says "Clear filters" (change to "Clear all
filters"); add the 3 extra files to front-matter `paths`; `WorstExpiryIcon` now renders text, so its name is stale
(rename later); `ClustersListPage.tsx:126`, `UsersListPage.tsx:129`, `CredentialsListPage.test.tsx:145`,
`LastTestCell.tsx:17` go past 120 columns.

### Visual review round 2 (ui-ux-designer, 2026-11-22) — APPROVE
cd27aaa, Clusters/Credentials/Audit, light+dark, 1280: no overflow. Must-fix items resolved (name nowrap, audit Target/Cluster in expanded row, "No results match the filter criteria" + "Clear all filters"); nits resolved.
- Clusters 1280 — API URL middle-truncates to "https://api.… om:6443", which says nothing useful — follow-up nit: hide API URL below 2xl (`LOW_PRIORITY_COLUMN`) instead of truncating it.
- Credentials 1280 — narrower Name column wraps the legacy-token description to 6 lines — follow-up nit: let the description wrap wider or clamp it to 2 lines.

## Handover notes
- `shared/table` `LOW_PRIORITY_COLUMN` = `['hidden','visibleOn2Xl']` — PF `xl` is 1200px (already on at 1280), so "hide below
  xl" in the contract is implemented as below 2xl (1450). Hidden at 1280: Users Last login/Groups, Clusters TLS/Users,
  Credentials Fingerprint/Grants, Audit Target/Cluster. All Th `modifier="nowrap"`.
- Status adapters keep names/props, add `asLabel?`: `UserStatusLabel` (pending = hourglass, tooltip trigger is a
  focusable span), `ClusterStatusLabel`, `CredentialExpiryLabel`, `LastTestLabel` (status and time now on separate
  lines), `LastTestCell` ("Passed"/"Failed" text replaces the aria-labelled icon). Consumers (GrantRow, CredentialRow,
  details headers) follow automatically.
- `UserRoleLabels` is one "Admin" label; the "via config" source must appear on the user details page (T-0115);
  `adminViaConfigurationText` kept for `useUserActions`.
- `audit/auditActionLabels.ts`: Map of backend ids → labels, unknown (proxy.*) fall back to the id; expanded row shows
  "Action ID". `CredentialExpiryAlert` has `pf-v6-u-mb-md`.
- Round 1: `TableNoMatchRow` (UX §5 copy) + `TableSkeletonRows columnVisibility` in `shared/table`; each row file exports
  `*_COLUMN_VISIBILITY`. Audit expanded row repeats Target/Cluster; Th widths fix the empty-state header shift.
  `WorstExpiryIcon`, `TlsModeLabel`, `ServiceAccountCell` are icon + text now (files outside the original paths, per review).
  Clusters at 1280 truncate the API URL hard (full on hover/1920) so Name and Last test stay unwrapped.
- Repo is not prettier-clean — don't run `prettier --write` over folders.
