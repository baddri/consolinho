---
id: T-0256
title: Groups admin endpoints — list (host ∪ grants) and detail with members
status: todo
owner: backend-engineer
checkpoint: 4.5a
depends_on: [T-0252, T-0254]   # wave 3, parallel with T-0257
paths: [src/FleetConsole.Application/Groups, src/FleetConsole.Api/Endpoints/Admin/GroupsAdminEndpoints.cs, src/FleetConsole.Api/Endpoints/Admin/AdminEndpoints.cs, tests/FleetConsole.Application.Tests/Groups, tests/FleetConsole.Api.Tests/Integration/Admin]
review_rounds: 0
---

## Goal
Back the Fleet administration Groups list and Group detail (GPG-1/2/4) and the Subject-name typeahead (UIG-2) with
two admin queries that combine the host listing (T-0254) with FleetConsole's group grants, and never fail because the
host can't be read.

## Scope
- In: `ListGroups`, `GetGroup` queries + endpoints, OpenAPI.
- Out: group grants routes (T-0252 owns `/groups/{groupName}/grants*`); member editing (out of scope CP4.5).

## Contract / design notes
Shapes and rules: **`docs/specs/CP4.5-api-contract.md` §4** (`GroupList`, `GroupRow`, `GroupDetail`, `GroupMember`).
- `GET /api/admin/groups` → `ListGroupsQuery() : IQuery<GroupListDto>, IAdminRequest`; `GET /api/admin/groups/{groupName}`
  → `GetGroupQuery(string GroupName) : IQuery<GroupDetailDto>, IAdminRequest`. Folder `Application/Groups/<UseCase>/`;
  endpoints in `Api/Endpoints/Admin/GroupsAdminEndpoints.cs`, tag `Groups`, names `ListGroups`/`GetGroup`. Coordinate
  the route group with T-0252's `/groups/{groupName}/grants*` (same `MapGroup`, or two files — just no duplicate prefix
  registration).
- List: one `IHostGroupDirectory.GetAsync` + **one** SQL `GROUP BY group_name` count over group grants. Union by
  name (ordinal), drop `system:*`, sort ordinal. `foundOnHost`/`memberCount` null unless status `Ok`.
- Detail: invalid name → 404 `Groups.NotFound` (no echo of the raw name in the message). Members: host `users` of the
  group; **one** query for registered users `WHERE username IN (...)` (no N+1) to fill `isRegistered`,
  `displayName`, `status`. 404 only when listing `Ok`, not on host and `clusterCount == 0`.
- `GroupErrors.NotFound()` → `Groups.NotFound` "Group was not found." (Application-level error, next to the queries).
- These are GET queries: no audit, side-effect free (CSRF rule).

## Context pack
- Docs: `BACKEND.md` §Use case folder convention (L107-132), §HTTP API and OpenAPI (L141-183); ADR-0039 §1.
- Exemplars: `Application/Users/ListUsers/*` (admin list query + DTO docs); `Api/Endpoints/Admin/UsersAdminEndpoints.cs` L37-43.
- Touch points: `IHostGroupDirectory`, `HostGroupListing` (T-0254); `Grant.SubjectKind/GroupName` (T-0250);
  `Api/Endpoints/Admin/AdminEndpoints.cs` (registration).
- Tests: Api integration via DevOAuth groups (T-0254 test config) and `OpenShiftHostStub` Unreachable; a 403 case by
  wrong `GroupsReaderToken` in a dedicated factory or stub override.

## Acceptance criteria
- [ ] GPG-1: list = host groups ∪ grant-only groups (grant-only → `foundOnHost: false`), member counts, cluster counts, no `system:*`.
- [ ] GPG-2: detail members with `isRegistered` for existing FleetConsole users; one SQL for members (assert query count or review).
- [ ] GPG-4 / UIG-2 / Q7: host 403 → 200 `hostStatus: forbidden`, `memberCount`/`foundOnHost` null, grant-only groups still listed; unreachable → `unavailable`.
- [ ] 404 rules as in the contract; non-admin 403; OpenAPI test updated; `scripts/check-be.sh` green.

## Work log

## Review

## Handover notes
