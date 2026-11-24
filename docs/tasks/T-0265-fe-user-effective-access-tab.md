---
id: T-0265
title: User detail › Effective access tab — winning grant per cluster and why (EFF-1, EFF-2, EFF-4, EFF-5)
status: todo
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
- [ ] EFF-1: one row per cluster from the mock fixture with environment label, effective mode, Source copy and credential.
- [ ] EFF-2: expanding a row lists every candidate with the verbatim outcome copy, including the RO-flag narrowing line.
- [ ] EFF-4: groups and "as of" time shown; never-logged-in user shows "Never logged in".
- [ ] EFF-5: empty state copy and both links; error state with working Retry.
- [ ] EFF-3 (FE side): for one mock persona the tab's clusters equal `GET /api/clusters` for that persona (both from the mock `resolveAccess`, T-0260) — one test.
- [ ] Tab is a URL segment; deep link + reload works; keyboard toggles expansion (accessible name "Details for <cluster>").
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
