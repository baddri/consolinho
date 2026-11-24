---
id: T-0261
title: Grants tables show subject kind, subject name and priority; subject-kind filter; group-aware revoke (UIG-4, UIG-6)
status: todo
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
- [ ] UIG-4: cluster Access tab columns in the order above; Subject kind label; group name links to `/fleet/admin/groups/<name>`; Priority `-` for users; rows in API order.
- [ ] UIG-4: `?kind=group` filter shows only group grants, has a removable filter label and "Clear all filters".
- [ ] UIG-4 / §5: revoking a group grant shows the group confirmation copy naming group and cluster; success toast names the group.
- [ ] UIG-6: read-only admin persona — kebab actions disabled with tooltip on both kinds.
- [ ] User perspective table unchanged (existing tests pass); `group` perspective renders with a test fixture.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes

## Follow-ups from T-0260 review
- Cluster details "Users with access" now counts group grants in the mock (1→3 on staging-eu-1). Count users only, or relabel (e.g. "1 user, 2 groups"). Also fix group-name links (they point to `/admin/users/<group>`) and the user wording in row actions.
