---
id: T-0250
title: Grant subject User|Group with priority — domain, audit, EF mapping and migration
status: done
owner: backend-engineer
checkpoint: 4.5a
depends_on: []          # wave 1, parallel with T-0251 and T-0254
paths: [src/FleetConsole.Domain/Access, src/FleetConsole.Domain/Users, src/FleetConsole.Application/Audit/EventHandlers, src/FleetConsole.Application/Grants, src/FleetConsole.Application/Proxy/AuthorizeProxyRequest, src/FleetConsole.Application/Clusters/ListAccessibleClusters, src/FleetConsole.Infrastructure/Persistence, tests/FleetConsole.Domain.Tests, tests/FleetConsole.Application.Tests, tests/FleetConsole.Api.Tests]
review_rounds: 1
---

## Goal
Give a grant a subject that is a user **or** a host group name with a priority (ADR-0034 §1/§3/§4, GRP-1..7), and let
the User aggregate replace its recorded groups (used by revalidation, T-0255). Existing behaviour is unchanged: all
current grants become `User` subjects; existing grant tests keep passing. No new endpoints here (T-0252).

**API contract for the FE (all of CP4.5a): `docs/specs/CP4.5-api-contract.md`.** Task map: T-0250 model · T-0251
resolver · T-0252 group-grant endpoints · T-0253 proxy/switcher on the resolver · T-0254 host group directory ·
T-0255 revalidation sync · T-0256 Groups endpoints · T-0257 Effective access · T-0258 deploy RBAC · T-0259 QA lane.

## Scope
- In: `GroupName`, `GrantSubjectKind`, group factory/change on `Grant`, errors, event fields, audit formatting,
  `User.ReplaceGroups` + `UserGroupsChanged` + audit, EF mapping + one migration, compile fixes in queries that join
  grants to users (keep their current user-only results via inner joins).
- Out: use cases/endpoints (T-0252), resolver (T-0251), `user_group_checks` table (T-0255).

## Contract / design notes
**Domain (`Domain/Access`)**
- `enum GrantSubjectKind { User = 0, Group = 1 }`.
- `sealed record GroupName` (copy the shape of `Clusters/ClusterName.cs`): `MaxLength = 253`;
  `static Result<GroupName> Create(string? value)` trims, then checks **in this order**: starts with `system:`
  (`OrdinalIgnoreCase`) → `GrantErrors.SystemGroup()`; empty, > 253, `.`/`..`, contains `/`, `%`, `:` or a control
  char → `GrantErrors.InvalidGroupName()`. Equality ordinal (OpenShift names are case-sensitive).
- `Grant`: `SubjectKind`; `UserId? UserId` (was non-null); `GroupName? GroupName`; `int? Priority`;
  `const int MinPriority = 1, MaxPriority = 1000`. Invariant: User ⇒ UserId set, GroupName/Priority null; Group ⇒
  UserId null, GroupName set, Priority in range.
- `static Result<Grant> CreateForGroup(GroupName group, Cluster cluster, Credential credential, AccessMode mode,
  int priority, IReadOnlyCollection<GroupGrantSlot> groupGrantsOnCluster, string actor, DateTimeOffset now)` with
  `sealed record GroupGrantSlot(GroupName Group, int Priority)` (the cluster's existing group grants; for bulk, plus
  earlier items). Error order: `CredentialNotInCluster` → `PriorityOutOfRange` → `GroupAlreadyExists` (GRP-5) →
  `PriorityTaken` (GRP-4).
- Existing `Create`/`Change` stay for user grants (`Change` throws `InvalidOperationException` on a group grant — a
  bug, not a user error). New `Result ChangeGroupGrant(AccessMode mode, Credential newCredential, int priority,
  IReadOnlyCollection<GroupGrantSlot> otherGroupGrantsOnCluster, GrantLabels current, string actor,
  DateTimeOffset now)`; no-op when nothing changes; errors `CredentialNotInCluster`, `PriorityOutOfRange`, `PriorityTaken`.
- `GrantErrors`: `SystemGroup()` Validation `Grants.SystemGroup` "System groups can't be granted access.";
  `InvalidGroupName()` Validation `Grants.InvalidGroupName` "Enter a valid group name."; `PriorityOutOfRange()`
  Validation `Grants.PriorityOutOfRange` "Priority must be between 1 and 1000."; `GroupAlreadyExists(group, cluster)`
  Conflict **`Grants.AlreadyExists`** `Group "X" already has access to "C".`; `PriorityTaken(priority, otherGroup)`
  Conflict `Grants.PriorityTaken` ``Priority N is already used by group `X` on this cluster.``
- `GrantLabels.Username` → rename to `SubjectName` (username or group name; LSP rename).
- Events `GrantCreated`/`GrantChanged`/`GrantRevoked`: `UserId?`, `Username` → `SubjectName`, add
  `GrantSubjectKind SubjectKind`, `int? Priority` (Changed: `OldPriority`, `NewPriority`).
- `Domain/Users`: `bool User.ReplaceGroups(IReadOnlyList<string> groups)` — set comparison (ordinal,
  order-insensitive); when different, stores `[.. groups]` and raises `UserGroupsChanged(UserId, Username,
  IReadOnlyList<string> Added, IReadOnlyList<string> Removed)`, returns `true`; else `false`, nothing raised.
  Callers pass groups already filtered by `OpenShiftGroups.WithoutVirtualGroups`; guard against `system:*` anyway
  (`ArgumentException`).

**Audit (`Application/Audit/EventHandlers`)** — GRP-7. `GrantAuditHandler.RecordGrant`: target name
`"{SubjectName} → {cluster}"` for users (unchanged), ``"group {SubjectName} → {cluster}"`` for groups; summary e.g.
"Granted group sre-emea ReadOnly on prod-eu-1 via sa-view (priority 50)"; details add `subjectKind`, `groupName`,
`priority`; `RelatedUsername` only for user grants. `UserAuditHandler`: `user.groups_changed`, target the user,
details `{ added, removed }`, actor `system (revalidation)` (copy how `UserRoleChanged` from configuration gets
`system (config)`). Add both to the audit action table in the CP4.5 contract if one is kept by the coverage test.

**Persistence** (`GrantConfiguration`, one migration `GrantGroupSubjects`):
- columns `subject_kind int not null default 0`, `user_id` nullable, `group_name varchar(253) null`, `priority int null`;
- check constraint `ck_grants_subject`: `(subject_kind = 0 AND user_id IS NOT NULL AND group_name IS NULL AND priority
  IS NULL) OR (subject_kind = 1 AND user_id IS NULL AND group_name IS NOT NULL AND priority BETWEEN 1 AND 1000)`;
- keep unique `(user_id, cluster_id)` (NULLs are distinct in PostgreSQL); add unique `(group_name, cluster_id)` and
  unique `(cluster_id, priority)` **filtered `WHERE subject_kind = 1`** (race backup for GRP-4/5; `IUnitOfWork` maps
  unique violations to the existing conflict path — check `ConsoleDbContext` remarks) and index `(group_name)`;
- existing rows: default `subject_kind = 0` → no data step needed. Verify `Down` works.
- Query compile fixes: joins `g.UserId equals u.Id` become `equals (UserId?)u.Id` (or `g.UserId == u.Id` where);
  result sets unchanged (group grants drop out of user-joined queries until T-0252/T-0253).

## Context pack
- Docs: `BACKEND.md` §Domain (L25-55), §Persistence (L245-280), §Recipes "Adding an audited admin action" (L238-244); ADR-0034.
- Exemplars: `Domain/Clusters/ClusterName.cs` (value object); `Domain/Access/Grant.cs:Create` L77-113 (factory + event);
  `Domain/Users/User.cs:RecordLogin` L162-196 (event + role-change pattern); `Audit/EventHandlers/GrantAuditHandler.cs:RecordGrant` L73-82.
- Touch points: `Infrastructure/Persistence/Configurations/GrantConfiguration.cs:Configure`;
  `Application/Grants/GrantProjection.cs` L55-90 (join on user); `Proxy/AuthorizeProxyRequest/AuthorizeProxyRequestHandler.cs` L50-66;
  `Clusters/ListAccessibleClusters/ListAccessibleClustersHandler.cs` L30-40; `Application/Auth/OpenShiftGroups.cs:IsVirtual`.
- Migration command: CLAUDE.md §Commands.

## Acceptance criteria
- [x] GRP-1: existing grant tests (Domain/Application/Api) pass unchanged except mechanical renames; migrated rows are `User`.
- [x] GRP-2/3/5/6 domain tests: `GroupName.Create` table (system: any case first, invalid chars, trim, 253); `CreateForGroup` error order; priority range.
- [x] GRP-4: `PriorityTaken` names the other group; `ChangeGroupGrant` excludes the grant itself from the slots.
- [x] GRP-7: audit entries for group create/change/revoke carry kind, group name, priority; target filter finds them by group name (handler unit test).
- [x] `ReplaceGroups` tests: unchanged set → false/no event; change → added/removed correct; `system:*` throws.
- [x] Migration up/down green on Testcontainers; check constraint and filtered unique indexes exist (Api DB test).
- [x] XML docs on every new public member; `scripts/check-be.sh` green.

## Work log
- 2026-11-24 backend-engineer: GroupName/GrantSubjectKind/GroupGrantSlot, Grant.CreateForGroup/ChangeGroupGrant, User.ReplaceGroups
  + UserGroupsChanged, audit handlers, EF config + migration `GrantGroupSubjects`, tests. check-be.sh green (430/718/866).
  Deviation: `subject_kind` stored as **text** ('User'/'Group', default 'User') per the enum-as-string convention, not int.
  Outside paths (minimal): `Domain/Audit/AuditActor.cs` (+`Revalidation` actor), `Application/Audit/IAuditTrail.cs` (doc only).
- 2026-11-24 backend-engineer (review r1): action renamed to `user.groups_changed`; the migration test now seeds a user grant
  before Up (asserts 'User') and checks that Down removes only the group grant. Up drops the 'User' default after the backfill;
  `ReplaceGroups` de-duplicates. The test exposed a Down bug (Guid.Empty default left on user_id), now removed. check-be.sh green (431/722/888).

## Review
**Round 1 — backend-architect, 2026-11-24: CHANGES_REQUESTED.** check-be green (430/722/888). Domain invariants, error order, check constraint, filtered indexes, event payloads, GRP-7 audit and XML docs are good.
1. `Application/Audit/EventHandlers/UserAuditHandler.cs:138` (+ L11, `Domain/Users/Events/UserGroupsChanged.cs:7`, `UserAuditHandlerTests.cs:153`) — action `user.groups-changed` breaks the snake_case action convention (`user.read_only_changed`); my ADR-0039 typo — rename to `user.groups_changed` (ADR-0039, T-0255 and the CP4.5 contract are already fixed).
2. `tests/FleetConsole.Api.Tests/Persistence/GrantSubjectPersistenceTests.cs:113` — down/up runs on an empty DB, so neither the existing-row path nor Down's `DELETE` is exercised — at the previous migration insert a user grant (raw SQL), migrate up and assert `subject_kind = 'User'`; add a group grant, migrate down, assert it is gone and the user grant survives.
- Optional: `20261124075802_GrantGroupSubjects.cs:40` — `DEFAULT 'User'` stays on the column but the model doesn't know it; consider `ALTER COLUMN subject_kind DROP DEFAULT` after the add.
- Optional: `Domain/Users/User.cs:565` — `Groups = [.. groups]` keeps input duplicates; storing `newSet`-distinct values in input order would be tidier.
- Deviations accepted (r1): text `subject_kind` (enum-as-name convention, `ConsoleDbContext` L34-35); `AuditActor.Revalidation` + `IAuditTrail` doc line; explicit `ix_grants_cluster_id`; Down deleting group grants (rollback can't keep them). Contract audit line added by architect.

**Round 2 — backend-architect, 2026-11-24: APPROVE.** check-be green (431/722/888). (1) `user.groups_changed` everywhere, no `groups-changed` left in src/tests. (2) Migration test seeds a user grant before Up (asserts 'User') and Down drops only the group grant. Optionals done: Up drops the 'User' default (covered by a test); `ReplaceGroups` stores distinct groups in input order.
- Down fix accepted: dropping EF's scaffolded `Guid.Empty` default on `user_id` is correct; the old schema had none, and a leftover default would fill `user_id` on group inserts after a re-Up and break `ck_grants_subject`.
- `session_replication_role = replica` in the test is acceptable: it runs on a throwaway per-test database, one command per session, and the pool resets the session on return; it needs a superuser, which the Testcontainers role is.

## Handover notes
- `subject_kind` is a text column (convention), not int as the contract says; check `ck_grants_subject` uses 'User'/'Group'.
- `User.ReplaceGroups` stores the groups de-duplicated, keeping the first occurrence in order.
- Filtered unique indexes `(group_name, cluster_id)` and `(cluster_id, priority)` WHERE subject_kind='Group'; an explicit
  plain `ix_grants_cluster_id` is kept because EF would otherwise drop it (the partial index can't serve the FK).
- Migration Up drops the 'User' default after backfilling (DB matches the model); Down deletes group grants, then makes user_id NOT NULL with no default.
- `Grant.Change` throws on a group grant; use `ChangeGroupGrant` (excludes its own slot). Error order in CreateForGroup:
  CredentialNotInCluster → PriorityOutOfRange → AlreadyExists → PriorityTaken.
- `GroupName` refuses `system:` in any case; `User.ReplaceGroups` throws on Ordinal `system:` (matches OpenShiftGroups.IsVirtual).
- Audit: user grants keep the CP1 detail shape; group grants add subjectKind/groupName/priority (changed: old/newPriority),
  RelatedUsername null. New action `user.groups_changed` (actor "system (revalidation)").
- Existing user-only queries (GrantProjection, AuthorizeProxyRequest, ListAccessibleClusters) inner-join Users, so group
  grants are ignored until T-0251+/admin list work wires them in.
