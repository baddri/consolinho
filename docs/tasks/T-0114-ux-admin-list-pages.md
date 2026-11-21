---
id: T-0114
title: Fleet administration list pages — heading actions, columns that fit 1280, status icons
status: in_review
owner: frontend-engineer
checkpoint: CP3.5
depends_on: [T-0110]
paths: [web/src/features/admin/users/UsersListPage.tsx, web/src/features/admin/users/UsersListPage.test.tsx, web/src/features/admin/users/UserRow.tsx, web/src/features/admin/users/UserRoleLabels.tsx, web/src/features/admin/users/UserStatusLabel.tsx, web/src/features/admin/clusters/ClustersListPage.tsx, web/src/features/admin/clusters/ClustersListPage.test.tsx, web/src/features/admin/clusters/ClusterRow.tsx, web/src/features/admin/clusters/ClusterStatusLabel.tsx, web/src/features/admin/clusters/LastTestCell.tsx, web/src/features/admin/credentials/CredentialsListPage.tsx, web/src/features/admin/credentials/CredentialsListPage.test.tsx, web/src/features/admin/credentials/FleetCredentialRow.tsx, web/src/features/admin/credentials/CredentialExpiryLabel.tsx, web/src/features/admin/credentials/LastTestLabel.tsx, web/src/features/admin/credentials/CredentialExpiryAlert.tsx, web/src/features/admin/audit, web/src/shared/table]
review_rounds: 0
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

## Review

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
- Follow-up candidate: admin empty-state copy still "No users match"/"Clear filters" (UX §5 says "No results match the
  filter criteria"/"Clear all filters"); skeleton rows render cells for hidden columns while loading.
- Repo is not prettier-clean — don't run `prettier --write` over folders.
