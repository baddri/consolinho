---
id: T-0039
title: Grants — tables on user and cluster pages, create / change / revoke
status: todo
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0032, T-0036]
paths: [web/src/features/admin/grants/, web/src/features/admin/users/UserDetailPage.tsx, web/src/features/admin/clusters/ClusterDetailPage.tsx]
review_rounds: 0
---

## Goal
Answer "who can touch prod-eu-1?" and "what can alice reach?" (US-9, USR-7) and manage single grants from both
places (GRANT-1/2/3/5/6, Q7). Backend counterpart: T-0019; MSW until then. **Parallel group F8.**

## Scope
- In: `grants/` (`api.ts`, `GrantsTable`, `GrantFormModal`, `RevokeGrantModal`, `GrantStateLabels`,
  `CredentialPicker`, `ClusterTypeahead`, `UserTypeahead`), user "Cluster access" tab, cluster "Access" tab.
- Out: bulk grant (T-0040).

## Contract / design notes
Endpoints (§9): `GET /api/admin/users/{username}/grants`, `GET /api/admin/clusters/{name}/grants` → `Grant[]`;
`POST /api/admin/grants` (`CreateGrantRequest` → 201; 409 `Grants.AlreadyExists`; 400 on `username`,
`clusterName`, `credentialId`); `PUT /api/admin/grants/{grantId}` (`UpdateGrantRequest` with `version`);
`DELETE /api/admin/grants/{grantId}` (204). Pickers use `GET /api/admin/clusters`, `GET /api/admin/users`,
`GET /api/admin/clusters/{name}/credentials`. Keys: `adminKeys.userGrants`, `adminKeys.clusterGrants`, plus the list
keys; create/change/revoke `onSuccess` invalidate `adminKeys.all` and `accessibleClustersQueryKey` (import from `@/features/cluster-context`, never the literal) —
an admin granting/revoking their own access (GRANT-6) must see the switcher update immediately (T-0029 review).
- `GrantsTable({ grants, perspective: 'user' | 'cluster', onChange(grant), onRevoke(grant), readOnlyReason? })`:
  user perspective columns: Cluster (env label + link to cluster), Access mode (`Label` "Read only" / "Read write";
  RW on production in orange), Credential (name + `CredentialExpiryLabel` from `credentialExpiryStatus`/
  `credentialExpiresAt` + `LastTestLabel`), Granted (`RelativeTime` + by). Cluster perspective: User (link) + user
  status instead of cluster. Text filter (`q`) above the table. Kebab: Change, Revoke.
- `GrantStateLabels` (GRANT-5): "Cluster disabled" (`!clusterIsEnabled`), "Credential expired"
  (`credentialExpiryStatus === 'expired'`), "User deactivated" (`userStatus === 'deactivated'`).
- `GrantFormModal` mode create/edit (RHF+zod):
  - create from user page: `ClusterTypeahead` (PF6 typeahead `Select` + `TextInputGroup` pattern, options = admin
    clusters with env label; clusters where the user already has a grant shown disabled "already has access");
    from cluster page: `UserTypeahead` (users; existing holders disabled likewise);
  - `CredentialPicker` (credentials of the chosen cluster; pre-selected when exactly one; each option shows expiry
    label and "Never tested" / "Last test failed" — Q7; no hard gating);
  - access mode radio, default **Read only**;
  - RW + production → inline warning "This user will be able to change production cluster `prod-eu-1`." (GRANT-2);
  - edit: mode + credential only, `version`, `ConflictAlert`;
  - errors: `codeToField: { 'Grants.AlreadyExists': perspective === 'user' ? 'clusterName' : 'username' }`;
    400 `credentialId` inline.
- `RevokeGrantModal`: danger `ConfirmModal` "Revoke `alice`'s access to `prod-eu-1` (production)?" (GRANT-3).
- Toasts: "Granted alice ReadOnly on prod-eu-1", "Changed alice's access to prod-eu-1", "Revoked …".
- User tab empty: "No cluster access yet" + "Add access" (T-0040 adds "Grant access to clusters"). Cluster tab empty:
  "Nobody has access to this cluster" + "Grant access". Role Admin never implies access (GRANT-6): admins appear only
  with grants.

## Acceptance criteria
- [ ] USR-7/CLU-8: both tabs list grants with all columns; GRANT-5 labels for the disabled cluster, deactivated user
      and expired credential fixtures; text filter on the cluster Access tab.
- [ ] GRANT-2: create from both pages; credential pre-selected for single-credential cluster; default ReadOnly;
      production RW warning; Q7 labels in the picker; request body exact + CSRF header.
- [ ] GRANT-1: duplicate → 409 detail inline on the picker field; credential of another cluster (MSW 400) inline on
      `credentialId`.
- [ ] GRANT-3: change mode/credential with `version` (conflict handled, ADM-4); revoke text names user, cluster and
      environment; 204 removes the row.
- [ ] Create, change and revoke invalidate `accessibleClustersQueryKey`: an admin granting themselves a cluster
      sees it in the switcher without reload (test with the `admin` persona).
- [ ] QG-3 loading/empty/error per tab; ADM-2 disabled for `ines`. TSDoc. Build, lint, tests green.

## Work log

## Review

## Handover notes
