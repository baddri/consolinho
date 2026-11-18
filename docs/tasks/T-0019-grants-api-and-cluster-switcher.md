---
id: T-0019
title: Grants API (single, bulk, change, revoke, per-user/per-cluster lists) and GET /api/clusters for the switcher
status: todo
owner: backend-engineer
checkpoint: 1
depends_on: [T-0015]
paths: [src/FleetConsole.Application/Grants/, src/FleetConsole.Application/Clusters/ListAccessibleClusters/, src/FleetConsole.Api/Endpoints/Admin/GrantsAdminEndpoints.cs, src/FleetConsole.Api/Endpoints/Admin/GrantRequests.cs, src/FleetConsole.Api/Endpoints/Admin/AdminEndpoints.cs, src/FleetConsole.Api/Endpoints/ClustersEndpoints.cs, src/FleetConsole.Api/Endpoints/ApiEndpoints.cs, tests/FleetConsole.Application.Tests/Grants/, tests/FleetConsole.Api.Tests/Integration/Admin/Grants/, tests/FleetConsole.Api.Tests/Integration/Clusters/, web/src/shared/api/schema.gen.ts]
review_rounds: 0
---

## Goal
Let admins connect users to clusters through credentials (GRANT-1..6), including the all-or-nothing bulk grant, and
give every user the list of clusters they may switch to (SW-1). **Wave W6** — parallel with T-0016/T-0017/T-0018/T-0021
(max 3 agents at once; worktrees).

## Scope
- In: contract §9 (all grant routes incl. `GET /api/admin/users/{username}/grants`,
  `GET /api/admin/clusters/{name}/grants`, bulk) and §6 (`GET /api/clusters`).
- Out: anything about the proxy (CP2).

## Contract / design notes
Contract §2, §6, §9. Domain `Grant.Create/Change/Revoke` (T-0008). Application folder `Application/Grants/` (Domain
folder is `Access/`; the feature is called "grants" everywhere in the UI and API).

| Use case | Request | Response |
|---|---|---|
| `ListUserGrants` | `ListUserGrantsQuery(string Username)` | `IReadOnlyList<GrantDto>` |
| `ListClusterGrants` | `ListClusterGrantsQuery(string ClusterName)` | `IReadOnlyList<GrantDto>` |
| `CreateGrant` | `CreateGrantCommand(string Username, string ClusterName, Guid CredentialId, AccessMode AccessMode)` | `GrantDto` |
| `BulkGrant` | `BulkGrantCommand(string Username, AccessMode AccessMode, IReadOnlyList<BulkGrantItem> Items)` | `IReadOnlyList<GrantDto>` (command returns the ids; endpoint re-queries via a `GetGrantsByIdsQuery`, request order) |
| `UpdateGrant` | `UpdateGrantCommand(Guid GrantId, AccessMode AccessMode, Guid CredentialId, uint Version)` | `GrantDto` |
| `RevokeGrant` | `RevokeGrantCommand(Guid GrantId)` | `Result` |
| `ListAccessibleClusters` (`Application/Clusters/ListAccessibleClusters/`) | `ListAccessibleClustersQuery : IRequireAuthenticated` | `IReadOnlyList<AccessibleClusterDto>` |

> **Response shapes (ADR-0013 §5):** the "Response" column is what the *endpoint* returns. Commands return only the key
> (`Result<string>` username/name, `Result<Guid>` id) or `Result`; the endpoint then dispatches the matching `Get…`
> query so `version` is the post-commit value.

- Body references → **400 field errors** (contract §9.3); `Grants.AlreadyExists` is 409 on single create, a field
  error `items[i].clusterName` on bulk (§9.4). Build field errors as `ValidationError` from the handler (keys in C#
  path form `Items[3].ClusterName`; the Api camelCases them).
- Bulk: load user once, clusters via `GetByNamesAsync`, credentials via `GetByIdsAsync`, existing grant cluster ids
  once; validate every item, collect **all** item errors, return them together; only if none, create all grants (one
  `GrantCreated` each → one audit entry each, ADR-0008). Max 100 items, unique cluster names (validator).
- `ListAccessibleClusters`: enabled clusters with a grant for the current user who is active; `accessMode` is the
  effective mode (`readOnly` if `currentUser.IsReadOnly`); sorted by environment enum order then name. One SQL query.
- Endpoints: `GrantsAdminEndpoints.cs` (tag `Grants`; OperationIds `ListUserGrants`, `ListClusterGrants`,
  `CreateGrant`, `BulkGrant`, `UpdateGrant`, `RevokeGrant`); `ClustersEndpoints.cs` at `/api/clusters` (tag
  `Clusters`, OperationId `ListMyClusters`) mapped from `ApiEndpoints`.

## Acceptance criteria
- [ ] GRANT-1: second grant 409 `Grants.AlreadyExists` with the spec message; credential of another cluster → 400
      on `credentialId`; unknown user/cluster/credential → 400 field errors.
- [ ] GRANT-3: change mode/credential (+ stale version 409), revoke 204, both audited with old→new details.
- [ ] GRANT-4: bulk success writes N grants + N audit entries; one bad item → 400 listing every bad item by index and
      **nothing** written (assert DB and audit count unchanged).
- [ ] GRANT-5: grants of disabled clusters, deactivated users, expired credentials still listed with
      `clusterIsEnabled`/`userStatus`/`credentialExpiryStatus` reflecting it. GRANT-6: admin without grants gets `[]`
      from `/api/clusters`.
- [ ] SW-1: `/api/clusters` filters disabled clusters and deactivated users, applies effective mode for globally
      read-only users, sorts production→staging→development then name, exposes no API URL/CA/credential fields
      (assert JSON property set); 401 anonymous.
- [ ] CRED-2: `TokenLeakScanner` (T-0015) run over grant responses. Read-only admin 403 on commands.
- [ ] `schema.gen.ts` regenerated. Build, lint and tests green (rule 4).

## Work log

## Review

## Handover notes
