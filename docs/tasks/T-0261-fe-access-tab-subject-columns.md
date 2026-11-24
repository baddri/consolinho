---
id: T-0261
title: Grants tables show subject kind, subject name and priority; subject-kind filter; group-aware revoke (UIG-4, UIG-6)
status: done
owner: frontend-engineer
checkpoint: 4.5a
depends_on: [T-0260]    # lane A (grants), runs on mocks; BE counterpart T-0252
paths: [web/src/features/admin/grants/GrantsTable.tsx, web/src/features/admin/grants/GrantRow.tsx, web/src/features/admin/grants/GrantsTab.tsx, web/src/features/admin/grants/RevokeGrantModal.tsx, web/src/features/admin/grants/grantText.ts, web/src/features/admin/grants/GrantsTab.test.tsx]
review_rounds: 0
---

## Goal
The cluster's **Access** tab lists user and group grants side by side the way OCP's RoleBindings list does, so an
admin sees who can reach the cluster and why. Prepares the `group` perspective that the group's Cluster access tab
(T-0264) reuses.

## Scope
- In: columns, subject-kind filter, `group` perspective, row kebab for both kinds, revoke confirmation copy for groups.
- Out: the Grant access / Edit access modal (T-0262 — it owns `GrantFormModal.tsx`), Groups pages (T-0263).

## Contract / design notes
- `GrantPerspective = 'user' | 'cluster' | 'group'`. Columns:
  - `cluster` (cluster Access tab, OCP RoleBinding-list order): **Subject kind** (`SubjectKindLabel`), **Subject
    name** (user → `userDetailPath`, group → `groupDetailPath`), Access mode, **Priority** (`-` for users), Credential,
    Granted, kebab.
  - `user`: unchanged (Cluster, Access mode, Credential, Granted).
  - `group`: Cluster, Access mode, Priority, Credential, Granted (T-0264 mounts it).
  `GRANT_COLUMN_COUNT` becomes a function of the perspective (empty/skeleton rows).
- `SubjectKindLabel` and `groupDetailPath` come from T-0260. Until T-0263 lands, group links 404 in the mock app only.
- Filter: add `kind: { kind: 'multi', values: ['user', 'group'] }` to `GRANT_FILTERS` (URL `?kind=`), checkbox filter
  "Subject kind" shown only for the `cluster` perspective; text filter matches `subjectName` (+ user display name, credential).
- Kebab copy: "Edit access" / "Revoke access" for both kinds (spec UIG-4; rename today's "Change" if it differs).
- Revoke for a group (spec §5, verbatim): title "Revoke access?", body "Revoke access of group **`X`** to
  **`C`**? Members lose access within a minute." User copy unchanged. Toast texts in `grantText.ts` name the group.
- UIG-6: read-only admins see every control, disabled with `readOnlyReason` (existing `GrantsTabContent` behaviour — keep it for the new column/filter).

## Context pack
- Docs: `UX.md` § 5 List pages; `FRONTEND.md` § UI conventions (Table, `LOW_PRIORITY_COLUMN`).
- Exemplars: `grants/GrantsTable.tsx` (whole, 127 lines), `grants/GrantRow.tsx:UserCell/ClusterCell`, `shared/table/useUrlFilters.ts` L74 (multi filter example), `features/admin/clusters/ClustersListPage.tsx` (checkbox filter on `FilterToolbar`).
- Touch points: `grants/GrantsTab.tsx:GrantsTabContent/ClusterGrantsTab`, `grants/RevokeGrantModal.tsx` L45-50, `grants/grantText.ts:revokedText/alreadyRevokedText`, `users/userColumns.tsx:userDetailPath`.
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/RBAC/bindings.tsx:useRoleBindingsColumns` (L89-134, Subject kind / Subject name columns, `nowrap`).

## Acceptance criteria
- [x] UIG-4: cluster Access tab columns in the order above; Subject kind label; group name links to `/fleet/admin/groups/<name>`; Priority `-` for users; rows in API order.
- [x] UIG-4: `?kind=group` filter shows only group grants, has a removable filter label and "Clear all filters".
- [x] UIG-4 / §5: revoking a group grant shows the group confirmation copy naming group and cluster; success toast names the group.
- [x] UIG-6: read-only admin persona — kebab actions disabled with tooltip on both kinds.
- [x] User perspective table unchanged (existing tests pass); `group` perspective renders with a test fixture.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-24 frontend-engineer: started; OCP ref `RBAC/bindings.tsx:useRoleBindingsColumns`.
- 2026-11-24 frontend-engineer: per-perspective columns (`grantColumns`), `?kind=` checkbox filter, Edit/Revoke access
  kebab, group revoke copy + toasts, 5 new tests; T-0260 follow-up (mock cluster `grantCount` = user grants; group links). Gate green; probe ours-only (OCP ref down).
- 2026-11-24 frontend-engineer: fix round 1 — Subject kind is plain text (OCP `cell: binding.subject.kind`), doc wraps, import order.

## Review
- 2026-11-24 frontend-architect, round 1: **APPROVE**. All ACs, UIG-4/UIG-6, spec §5 copy and the T-0260 follow-ups are met; `scripts/check-fe.sh` green (1261 tests).
  - Engineer note on `grantCount`: correct. The contract says "Number of users with access", so the mock is right. BE is not: `GetClusterHandler.cs:56` and `ListClustersHandler.cs:40` count every grant, group grants included. Orchestrator: add a BE follow-up (filter `SubjectKind == User`, or extend T-0252).
  - Engineer note on optional `subjectKind`: fine. `RevokeGrantModal` passes the full `Grant`, so group toasts already work. Optional for T-0262: pass it from `GrantFormModal` and then make it required.
  - Engineer note on out-of-path files: `mocks/handlers/representations.ts` is the listed T-0260 follow-up, so accepted. `CredentialPicker.tsx`, `GrantFormModal.tsx`, `GrantStateLabels.tsx` and `api.ts` have prettier-only changes (to the committed `printWidth` 110). They are harmless and T-0262 is still `todo`, so they are accepted. Optional: say so in the work log.
  - Nit (optional): `GrantsTab.tsx:90,117`: TSDoc lines are over 110 characters; rewrap them.
  - Nit (optional): `GrantsTable.tsx:13`: the `@/shared/api` import moved below `@/shared/table`; restore alphabetical order.
- 2026-11-24 ux-designer (round 1): CHANGES_REQUESTED. Mock UI 1280 light, text probe; OCP source `public/components/RBAC/bindings.tsx`.
  - staging-eu-1 Access — Subject kind cell is a compact PF `Label` ("User"/"Group"), and the Subject name link already carries the U/G resource badge, so the kind shows twice per row — OCP renders the kind as plain text (`bindings.tsx` L184 `cell: binding.subject.kind`) — render "User"/"Group" as plain text in this column (keep the badge on the name link).
  - OK: column order Subject kind, Subject name, Access mode, Priority (`-` for users), Credential, Granted, kebab; Subject kind/name `nowrap` (`useRoleBindingsColumns` L108-123); rows in API order; group links → `/fleet/admin/groups/<name>`.
  - OK: "Subject kind" checkbox filter (OCP `DataViewCheckboxFilter` pattern, L247-255), count badge, removable "Subject kind: Group" label, "Clear all filters"; `?kind=group` shows only ghost-team and sre.
  - OK: kebab "Edit access" / "Revoke access" on both kinds and on alice's Access tab; group revoke modal "Revoke access?" + staging label + spec §5 body, one close control (X) plus Revoke/Cancel.
  - OK: alice's Access tab columns unchanged; cluster details "Users with access" = 1 on staging-eu-1.

## Handover notes
- `GrantRow.tsx` owns the columns: `grantColumns(perspective)` / `grantColumnCount(perspective)` replace
  `GRANT_COLUMN_COUNT`; `GrantCell` switches per column; Subject kind/name are `nowrap` (OCP).
- `group` perspective works in `GrantsTable` (tested with a fixture); T-0264 must add a `GroupGrantsTab` in
  `GrantsTab.tsx` (`GrantsTabContent` is module-private) using `useGroupGrants`.
- `?kind=` is ignored outside the cluster perspective. Rows keep API order (mock: alice, ghost-team, sre).
- `revokedText`/`alreadyRevokedText` take an optional `subjectKind` so `GrantFormModal` (T-0262) compiles
  unchanged; T-0262 should pass `subjectKind` for group edits and may make `changedText` group-aware.
- Follow-up: mock `grantCount` on cluster list/detail now counts user grants only (contract: "Number of users with
  access"); confirm BE T-0252 does the same. `dataViewTestUtils.withoutBadges` doesn't strip the Group badge (tests
  match group rows by link name) — T-0263 may extend it.
- Style probe ran ours-only: OCP reference console on :9000 was not running.

## Follow-ups from T-0260 review
- Cluster details "Users with access" now counts group grants in the mock (1→3 on staging-eu-1). Count users only, or relabel (e.g. "1 user, 2 groups"). Also fix group-name links (they point to `/admin/users/<group>`) and the user wording in row actions.
