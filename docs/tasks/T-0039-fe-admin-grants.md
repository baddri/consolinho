---
id: T-0039
title: Grants — tables on user and cluster pages, create / change / revoke
status: done
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0032, T-0036]
paths: [web/src/features/admin/grants/, web/src/features/admin/users/UserDetailPage.tsx, web/src/features/admin/clusters/ClusterDetailPage.tsx, web/src/features/admin/credentials/api.ts, web/src/features/admin/credentials/DeleteCredentialModal.tsx]
review_rounds: 2
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
- [x] USR-7/CLU-8: both tabs list grants with all columns; GRANT-5 labels for the disabled cluster, deactivated user
      and expired credential fixtures; text filter on the cluster Access tab.
- [x] GRANT-2: create from both pages; credential pre-selected for single-credential cluster; default ReadOnly;
      production RW warning; Q7 labels in the picker; request body exact + CSRF header.
- [x] GRANT-1: duplicate → 409 detail inline on the picker field; credential of another cluster (MSW 400) inline on
      `credentialId`.
- [x] GRANT-3: change mode/credential with `version` (conflict handled, ADM-4); revoke text names user, cluster and
      environment; 204 removes the row.
- [x] Create, change and revoke invalidate `accessibleClustersQueryKey`: an admin granting themselves a cluster
      sees it in the switcher without reload (test with the `admin` persona).
- [x] QG-3 loading/empty/error per tab; ADM-2 disabled for `ines`. TSDoc. Build, lint, tests green.

## Work log
- 2026-11-20 frontend-engineer: started; grants/ api + table + modals, wired into user/cluster detail tabs.
- 2026-11-20 frontend-engineer: done; 12 tests in `grants/GrantsTab.test.tsx`; `scripts/check-fe.sh` green → in_review.
- 2026-11-20 frontend-engineer: round 1 fixes — `version` in form values (reset only by reload) + repeat-409 test; revoke 404 → toast+close; picker load errors; `useClusterGrants` deduped into `grants/api.ts`.

## Review
**Round 1 — frontend-architect: CHANGES_REQUESTED** (`scripts/check-fe.sh` green: 41 files / 477 tests)
- Required: `grants/GrantFormModal.tsx:177` — edit sends `props.grant.version`, the *live* cache value; a 409 runs `invalidateAfterError` → list refetch → `GrantsTab.tsx:68` passes the fresh grant, so a second "Save" without "Reload latest values" silently overwrites the other admin's change (ADM-4 lost update) — capture `version` with the form values (in the schema/`valuesOf`, reset only by `reload`), as `ClusterForm` does; add a test: 409, Save again → still a conflict.
- Judged OK: `POST /api/admin/grants` matches `schema.gen.ts:506` + mock; `target` + `fieldMap`/`codeToField` mapping; invalidation of `adminKeys.all` + `accessibleClustersQueryKey` (tested with spy); `grants → ../credentials|users|clusters` imports are intra-feature (`features/admin` is one boundary element, precedent in clusters/credentials/audit) — no index needed.
- Nit: `grants/RevokeGrantModal.tsx:213` — a 404 shows inline, then the refetch drops the row and the modal vanishes without feedback; treat 404 as "already revoked" (warning toast + close) like the edit path.
- Nit: `grants/TypeaheadSelectField.tsx:164` — duplicates the audit `TypeaheadFilter` keyboard logic; also no `aria-controls` → `SelectList` id (same gap in audit); generalise both into `shared/forms` in T-0040 (follow-up).
- Nit: `grants/ClusterTypeahead.tsx:272` / `UserTypeahead.tsx:324` — options-query error renders as "No results"; show "Could not load …".
- Nit/follow-up: `credentials/api.ts:46` duplicate `useClusterGrants` — T-0037 has landed, dedupe in a follow-up task.

**Round 2 — frontend-architect: APPROVE** (scoped: grants + credentials vitest 3 files / 41, typecheck, eslint green)
- Fixed: `version` lives in form values (`grantForm.schema.ts:16`, `GrantFormModal.tsx:181`), reset only by `reload`; test proves a second Save after 409 still sends version 1 and conflicts.
- Fixed: revoke 404 → "already revoked" warning toast + close (`RevokeGrantModal.tsx:38`, tested); "Could not load clusters/users" via `loadError`; `useClusterGrants` deduped (`DeleteCredentialModal.tsx:17` imports `grants/api`).
- Deferred to T-0040: `TypeaheadSelectField`/`TypeaheadFilter` consolidation + `aria-controls`.

## Handover notes
- Files: `grants/` = `api.ts` (queries + create/update/revoke; success invalidates `adminKeys.all` + `accessibleClustersQueryKey`,
  update/revoke also patch both cached lists), `GrantsTab.tsx` (`UserGrantsTab`, `ClusterGrantsTab`, shared dialog state by
  grant id so dialogs always get the current `version`), `GrantsTable`/`GrantRow`, `GrantFormModal`, `RevokeGrantModal`,
  `GrantStateLabels`, `AccessModeLabel`, `CredentialPicker`, `ClusterTypeahead`/`UserTypeahead` over `TypeaheadSelectField`.
- Form field `target` = the picked side; server `clusterName`/`username` errors map onto it via `fieldMap`, and
  `Grants.AlreadyExists` via `codeToField` (same effect as the spec's mapping, one schema for both perspectives).
- 404 on change or revoke closes with an "already revoked" warning toast; other revoke errors show inline.
- Edit form keeps `version` in its values (seeded on open, changed only by "Reload latest values"), so a background refetch after a 409 never turns a stale save into an overwrite (ADM-4). `credentials/DeleteCredentialModal` now uses `grants/api.ts` `useClusterGrants`.
- Follow-up (T-0040): merge `TypeaheadSelectField` and audit `TypeaheadFilter` into `shared/forms`, adding `aria-controls`.
- Text filter `q` is on both tabs (spec AC only requires the cluster tab).
