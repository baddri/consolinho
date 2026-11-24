---
id: T-0252
title: Group grant admin use cases and endpoints (create, bulk, update priority, list)
status: todo
owner: backend-engineer
checkpoint: 4.5a
depends_on: [T-0250]    # wave 2, parallel with T-0253, T-0255, T-0258
paths: [src/FleetConsole.Application/Grants, src/FleetConsole.Api/Endpoints/Admin/GrantsAdminEndpoints.cs, src/FleetConsole.Api/Endpoints/Admin/GrantRequests.cs, tests/FleetConsole.Application.Tests/Grants, tests/FleetConsole.Api.Tests/Integration/Admin]
review_rounds: 0
---

## Goal
Admins can grant a host group access to one or many clusters with a priority, edit its priority, and see group grants
next to user grants on a cluster (GRP-2..7, GPG-3 backend, UIG-3/4 data).

## Scope
- In: `CreateGroupGrant`, `BulkGroupGrant`, `ListGroupGrants` use cases; `UpdateGrant` priority; `GrantDto` subject
  fields; `ListClusterGrants` returns both kinds; endpoints + OpenAPI.
- Out: Groups list/detail (T-0256); host group lookup (free text is always allowed — no host call here).

## Contract / design notes
Exact routes, request/response shapes, field errors and messages: **`docs/specs/CP4.5-api-contract.md` §1–§3** (the
FE consumes the same). Summary:
- `POST /api/admin/groups/{groupName}/grants` (`CreateGroupGrant`) → 201 `Grant`; `POST .../grants/bulk`
  (`BulkGroupGrant`) → as `BulkGrant`; `GET .../grants` (`ListGroupGrants`) → `Grant[]` by cluster name.
- Use-case folders `Grants/CreateGroupGrant`, `Grants/BulkGroupGrant`, `Grants/ListGroupGrants` (command/query,
  handler, validator). Commands: `CreateGroupGrantCommand(string GroupName, string ClusterName, Guid CredentialId,
  AccessMode AccessMode, int Priority) : ICommand<Guid>, IAdminRequest, IMutatingCommand`;
  `BulkGroupGrantCommand(string GroupName, AccessMode AccessMode, int Priority, IReadOnlyList<BulkGrantItem> Items)`
  (`MaxItems` = `BulkGrantCommand.MaxItems`). Validators: `groupName` via `GroupName.Create` (system-group message
  first), `priority` 1–1000 — field names `groupName`, `priority` (route value bound into the command; check how
  `BulkGrant` maps `username`).
- Handlers read the cluster's group grants as `GroupGrantSlot`s in **one query per request** (bulk: one query for
  all item clusters, then add earlier items' slots), then call `Grant.CreateForGroup`. Bulk keeps all-or-nothing and
  reports every failing item: `items[i].clusterName` for `AlreadyExists`/`PriorityTaken`/cluster not found,
  `items[i].credentialId` for `CredentialNotInCluster` — copy `BulkGrantHandler` L90-110.
- `UpdateGrantCommand` gains `int? Priority`; handler: group grant → `ChangeGroupGrant` (priority required; slots =
  other group grants on the cluster); user grant with a priority → field error `priority` "Priority applies to group
  grants only." `UpdateGrantRequest` gains `int? Priority = null` (last parameter, optional — existing clients unaffected).
- `GrantDto`: add `SubjectKind`, `SubjectName`, `int? Priority`; make `Username`, `UserDisplayName`, `UserStatus`
  nullable. `GrantProjection.LoadAsync`: **left join** users (group grants have none); still one statement.
  `ListClusterGrants` order: `SubjectKind`, then `SubjectName` ordinal. `ListUserGrants`: direct grants only (unchanged).
- Lookups go through `GrantLookup`/`ClusterLookup`/`CredentialLookup` like `CreateGrantHandler`.

## Context pack
- Docs: `BACKEND.md` §Use case folder convention (L107-132), §HTTP API and OpenAPI (L141-183), §Recipes "Adding a use case".
- Exemplars: `Grants/CreateGrant/*` (copy for CreateGroupGrant); `Grants/BulkGrant/BulkGrantHandler.cs` L90-110 (item errors);
  `Api/Endpoints/Admin/GrantsAdminEndpoints.cs:CreateGrant` L82-96 and route table L34-41.
- Touch points: `Grants/GrantDto.cs`, `Grants/GrantProjection.cs:LoadAsync`, `Grants/UpdateGrant/*`,
  `Api/Endpoints/Admin/GrantRequests.cs`, `Domain/Access/Grant.cs:CreateForGroup/ChangeGroupGrant` (T-0250).
- Tests: `tests/FleetConsole.Api.Tests/Integration/TestData.cs` (add a `GroupGrantAsync` helper), `ApiTestExtensions.LoginAsAsync`.

## Acceptance criteria
- [ ] GRP-2/3/6: 400 field errors with the contract messages (system group any case, invalid name, priority missing/out of range).
- [ ] GRP-4: same priority on the same cluster → 409 `Grants.PriorityTaken` naming the other group; also on PUT.
- [ ] GRP-5: second grant for the same group on a cluster → 409 `Grants.AlreadyExists`.
- [ ] GPG-3: bulk with one taken priority and one already-granted cluster → 400 listing both items, nothing written.
- [ ] UIG-4 data: `GET /clusters/{name}/grants` returns both kinds with `subjectKind`/`subjectName`/`priority`, ordered as specified.
- [ ] PUT priority on a user grant → 400 `priority`; read-only admin → `Auth.ReadOnly` for the new commands.
- [ ] Existing grant endpoint tests pass unchanged; OpenAPI document test updated; `scripts/check-be.sh` green.

## Work log

## Review

## Handover notes
