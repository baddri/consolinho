---
id: T-0265
title: User detail › Effective access tab — winning grant per cluster and why (EFF-1, EFF-2, EFF-4, EFF-5)
status: done
owner: frontend-engineer
checkpoint: 4.5a
depends_on: [T-0260]    # lane C; parallel with lanes A and B; runs on mocks, BE T-0257
paths: [web/src/features/admin/effective-access/, web/src/features/admin/users/UserDetailPage.tsx, web/src/features/admin/users/UserDetailPage.test.tsx, web/src/features/admin/adminTabs.ts, web/src/features/admin/routes.tsx]
review_rounds: 0
---

## Goal
Answer "why can (or can't) Sam open prod-eu-1, and with which mode?" in one place. A read-only explanation tab on
the user page: one row per reachable cluster with the one-line source, expandable to every candidate grant and why it lost.

## Scope
- In: `effective-access` tab (URL segment), table with expandable rows, groups + "as of" summary, empty/error states.
- Out: editing from this tab (it links to Cluster access / Groups instead — Q2).

## Contract / design notes
- Tabs: `USER_DETAIL_TABS = ['details', 'access', 'effective-access']`, title "Effective access"; route
  `users/:username/effective-access` with `handle: tab('effective-access')` (additive edit — T-0263/T-0264 also edit
  `routes.tsx`/`adminTabs.ts`).
- `EffectiveAccessTab({ username })` in `effective-access/`: `useEffectiveAccess` (T-0260).
  - Summary above the table (`DetailsGrid`, one column): **Groups** — `LabelList` of `groups` (each label links to
    `groupDetailPath`), `-` when empty; **Groups as of** — `RelativeTime groupsAsOf` or "Never logged in" (EFF-4);
    when `userIsReadOnly`: inline info text "Read-only flag: every cluster is narrowed to read only."
  - PF composable `Table variant="compact"` with expandable rows (`Td expand={{ rowIndex, isExpanded, onToggle }}`,
    `Tr isExpanded`, `ExpandableRowContent`) — spec §5. Columns: Cluster (`AdminResourceLink kind="Cluster"` +
    `EnvironmentLabel isCompact`), Access mode (`AccessModeLabel`), **Source** ("Direct grant" / "Group `X` (priority N)"),
    Credential.
  - Expanded content: nested compact table of `candidates` (winner first, API order): Subject (`SubjectKindLabel` + name
    link), Priority (`-` for users), Access mode, Credential, **Outcome**. Copy (contract §5, verbatim): winner → "Applies"
    (+ "Narrowed to read-only by the user's read-only flag" when `narrowedByReadOnlyFlag`), `overriddenByDirectGrant` →
    "Overridden by direct grant", `lowerPriority` → "Lower priority than `X`", `tieReadOnlyWins` → "Tie: read-only wins",
    `tieBrokenById` → "Tie: older grant wins". One pure `effectiveAccessText.ts:outcomeText(candidate, row)` + `sourceText(source)` with unit tests.
  - EFF-5 empty (`clusters: []`): `EmptyState` "`<user>` has no access to any cluster." with link buttons
    "Cluster access" (→ `/fleet/admin/users/<u>/access`) and "Groups" (→ `/fleet/admin/groups`).
  - Error: `ErrorState` "Could not load effective access" with Retry (spec §5); loading: `TableSkeletonRows`.
- No toolbar/filter (rows ≤ fleet size, ~40); sort by cluster name as returned.
- No polling: the query refetches on tab mount (default `staleTime`), so after a grant change the next visit is fresh
  (admin mutations already invalidate the `['api','admin']` prefix).

## Context pack
- Docs: `UX.md` § 4 Tabs, § 10 Empty/error; `FRONTEND.md` § UI conventions (Status vs Label, `LOW_PRIORITY_COLUMN`).
- Exemplars: `users/UserDetailPage.tsx` L94-125 (`UserTabPanel`/`UserTabs` — add the third tab), `grants/GrantsTable.tsx` (table + skeleton + empty), `users/UserDetailsTab.tsx` L75-82 (`LabelList` of groups).
- Touch points: `adminTabs.ts:USER_DETAIL_TABS/USER_DETAIL_TAB_TITLES`, `routes.tsx:adminRoute`, `effective-access/api.ts:useEffectiveAccess` (T-0260), `grants/AccessModeLabel.tsx`, `grants/SubjectKindLabel.tsx` + `groups/groupPaths.ts:groupDetailPath` (T-0260).
- PF API: `@patternfly/react-table` `Td` prop `expand` and `ExpandableRowContent` — grep `node_modules/@patternfly/react-table/dist/esm/components/Table/Td.d.ts` for `expand`.
- OCP reference: no direct counterpart (fleet invention, CLAUDE.md "UI north star"); follow OCP's details-tab anatomy and the compact composable table style of `/home/bad/works/openshift-console/frontend/public/components/group.tsx:UsersTable`.

## Acceptance criteria
- [x] EFF-1: one row per cluster from the mock fixture with environment label, effective mode, Source copy and credential.
- [x] EFF-2: expanding a row lists every candidate with the verbatim outcome copy, including the RO-flag narrowing line.
- [x] EFF-4: groups and "as of" time shown; never-logged-in user shows "Never logged in".
- [x] EFF-5: empty state copy and both links; error state with working Retry.
- [x] EFF-3 (FE side): for one mock persona the tab's clusters equal `GET /api/clusters` for that persona (both from the mock `resolveAccess`, T-0260) — one test.
- [x] Tab is a URL segment; deep link + reload works; keyboard toggles expansion (accessible name "Details for <cluster>").
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-24 frontend-engineer: `effective-access/` tab (summary + expandable clusters table + candidates table, `effectiveAccessText.ts`),
  third user tab + route, fixture `platform` → staging-eu-1 (carol, group-only). Tests: text unit + 8 tab tests incl. EFF-3.
  Style probe not run: the OCP reference console (:9000) was down, there is no OCP counterpart, and the coordinator said not to start servers.

## Review
- 2026-11-24 frontend-architect, round 1: **APPROVE**. `scripts/check-fe.sh` green (120 files / 1271 tests, lint, typecheck, build).
  - (a) `CollapseColumn` in a `pf-v6-c-table__toggle` Td: accepted. Verified that `Td expand` labels by `aria-labelledby="simple-node<i> expand-toggle<i>"`, so it can't produce "Details for <cluster>". PF-exported component, same markup; a class-string constant has precedent (`shared/forms/RadioGroupField.tsx:8`).
  - (b) Plain `div role="tabpanel"`: accepted. `PageGroup` only forwards `aria-label` with `hasOverflowScroll` (verified in PF source). The ResourceDetailsPage follow-up is valid; file it.
  - (c) "—" is used consistently across the page (Groups, Priority, `sourceText`/`outcomeText` fallbacks) and matches UserDetailsTab. The admin-wide decision stays with T-0267.
  - (d) The fixture and `mocks/groups.test.ts` edits are outside `paths`. Accepted: they close the T-0260 review follow-up, and the expectation changes (`platform` clusterCount 1, plus a forbidden-list row) follow directly from the fixture.
  - PREC: outcome mapping matches contract §5 copy verbatim and `mocks/handlers/access.ts:resolveAccess`. It covers direct→`overriddenByDirectGrant`/beatenBy null, group losers → lowerPriority/tieReadOnlyWins/tieBrokenById with beatenBy = winning group, and the narrowed line only on the winner.
  - Nit (optional): `EffectiveAccessTab.tsx` subsection title "Effective access details" is invented copy (OCP's pattern is "<Kind> details"). It is fine to keep; the UX pass can revisit it.
  - Nit (optional): the task asked for `EmptyState`. `TableEmptyRow` (which wraps it inside the table) is the house idiom and is preferred.
- 2026-11-24 ux-designer, round 1: **APPROVE**. Mock UI at 1280, light (no new colours), users alice (4 rows, all expanded), ines (RO alert), bob (empty). Probe: h2 16px/600 and `dl` gap 24px 48px, the same as the user Details tab; compact table toggle cell 4px/16px padding = PF `Td expand`.
  - Heading "Effective access details": accepted. It follows the OCP "<X> details" first-section pattern (`public/components/group.tsx:205` "Group details" then "Users" at :213; `RBAC/role.tsx:106/137`). "User details" would duplicate the Details tab. The second section "Clusters" follows `group.tsx` "Users".
  - `TableEmptyRow` instead of `EmptyState`: accepted. UX.md §5 (OCP `ConsoleDataView` `BodyEmpty`) keeps the headers and puts a centred empty row inside the table. The EFF-5 copy and both link buttons render.
  - "—" placeholder: consistent with the Details tab. Not blocking; the admin-wide decision is T-0267.
  - Expandable rows: OCP has no expandable resource table (grep `ExpandableRowContent` in `frontend/` finds nothing). PF's composable expandable pattern, with a nested compact table and per-row `Tbody`, is the right fleet invention in OCP style.
  - Nit (optional): the `aria-label` "Group membership" on the summary column differs from the visible heading. You can align them, or leave it as is.

## Handover notes
- Expand toggle is `CollapseColumn` in a `pf-v6-c-table__toggle` Td rather than `Td expand`: `Td expand` always labels the button
  `simple-node<i>` + "Details", so it can't be named "Details for <cluster>" (AC). Same PF markup otherwise.
- The tab panel is a plain `div role="tabpanel"`: PF `PageGroup` drops `aria-label` unless `hasOverflowScroll`. Follow-up:
  `ResourceDetailsPage` Details tab has the same unnamed-tabpanel bug.
- Group labels link to `groupDetailPath` (route arrives with T-0263). Missing values use "—" like UserDetailsTab (spec wrote `-`).
- Empty-state "Cluster access" link reads `:username` from the route (stable module-level link component).
- Fixture: `grantIds.platformStaging` (platform, staging-eu-1, RO, priority 10); `mocks/groups.test.ts` expectations updated.
- UI probe still to run once an OCP reference is up (`/fleet/admin/users/carol/effective-access`).

## Follow-ups from T-0260 review
- Add a fixture in which a user gets a cluster only through a group (e.g. `platform` → a cluster for carol), so Effective access shows a group-sourced row.
