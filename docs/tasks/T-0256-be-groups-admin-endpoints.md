---
id: T-0256
title: Groups admin endpoints — list (host ∪ grants) and detail with members
status: done
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
- [x] GPG-1: list = host groups ∪ grant-only groups (grant-only → `foundOnHost: false`), member counts, cluster counts, no `system:*`.
- [x] GPG-2: detail members with `isRegistered` for existing FleetConsole users; one SQL for members (assert query count or review).
- [x] GPG-4 / UIG-2 / Q7: host 403 → 200 `hostStatus: forbidden`, `memberCount`/`foundOnHost` null, grant-only groups still listed; unreachable → `unavailable`.
- [x] 404 rules as in the contract; non-admin 403; OpenAPI test updated; `scripts/check-be.sh` green.

## Work log
- 2026-11-24 backend-engineer: `Application/Groups/{ListGroups,GetGroup}` + `GroupErrors`, `GroupGrantCounts` (one `GROUP BY` /
  one `COUNT`); `GroupsAdminEndpoints` (own `/groups` MapGroup, grant routes stay full paths in `GrantsAdminEndpoints`).
  Members: one `WHERE username IN (...)`. Unit tests (11) + integration (host ok / 403 then down / non-admin) + OpenAPI.
  `scripts/check-be.sh` green (431/767/922). FE mock 404 detail echoes the name; API follows the contract ("Group was not found.").

## Review
- 2026-11-24 backend-architect, round 1: **APPROVE**. Contract §4 shapes and 404 rules are met. One host read, one
  `GROUP BY` (or one `COUNT`), and one `username IN (...)` member query, so there is no N+1. Access is admin-only (policy
  plus `IAdminRequest`). Tokens are passed through, XML docs are complete, and `system:*` is filtered in the list and
  refused by `GroupName` in the detail. Build is green; filtered tests (Group|OpenApiDocument) pass 222/222.
  Engineer's choices:
  (a) null `members`/`memberCount` off-host is accepted. Nothing is known about the members of a group that isn't on
      the host.
  (b) Invalid host usernames are listed as unregistered. Correct.
  (c) Keep the API's "Group was not found." (contract, no echo). Aligning the FE mock is an optional follow-up for the
      FE side; it is not a blocker.
  (d) The OpenApiDocumentTests rows outside `paths` are accepted. That file is the shared contract test.
  (e) 200 with `forbidden`/`unavailable` is correct per ADR-0039.
  - optional: `GetGroupHandler.cs` MembersAsync is the third inline copy of the UserStatus derivation (`UserRow.cs:53`,
    `GrantProjection.cs:82`). Extract it to a shared expression in a follow-up.

## Handover notes
- `members` is null whenever the group isn't on the host (incl. host ok + grant-only), matching the FE mock; `memberCount`
  likewise null for grant-only rows. `system:*` names → 404 (GroupName refuses them).
- Host usernames that aren't valid `Username`s are listed as unregistered without querying.
- FE mock difference: mock 404 `detail` is "Group {name} doesn't exist."; the API returns "Group was not found." (contract).
- Query count asserted by review (unit tests show one read per step), not by an EF interceptor.
