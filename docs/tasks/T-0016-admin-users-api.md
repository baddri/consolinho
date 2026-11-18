---
id: T-0016
title: Admin users API — list, detail, pre-create, role, read-only, deactivate/reactivate (+ HTTP validation tests)
status: todo
owner: backend-engineer
checkpoint: 1
depends_on: [T-0015]
paths: [src/FleetConsole.Application/Users/, src/FleetConsole.Api/Endpoints/Admin/UsersAdminEndpoints.cs, src/FleetConsole.Api/Endpoints/Admin/UserRequests.cs, src/FleetConsole.Api/Endpoints/Admin/AdminEndpoints.cs, tests/FleetConsole.Application.Tests/Users/, tests/FleetConsole.Api.Tests/Integration/Admin/Users/, tests/FleetConsole.Api.Tests/Integration/Http/, web/src/shared/api/schema.gen.ts]
review_rounds: 0
---

## Goal
The admin user-management API (USR-1..8) with authorization (ADM-1/2), optimistic concurrency (ADM-4) and last-admin
protection (ADM-5). As the first command endpoint it also carries the QA R6 HTTP-level validation tests.
**Wave W6** — parallel with T-0017, T-0018 (worktrees; shared touch points: one line in `AdminEndpoints.cs`,
`schema.gen.ts` regen).

## Scope
- In: use cases + endpoints of contract §7.2 except the two grant routes (T-0019). Body-less transitions use the
  shared `VersionRequest` from T-0011.
- Out: grants, audit viewer.

## Contract / design notes
Contract §2 (codes), §3 (enums), §7 (routes, records, validation, semantics). ADR-0009 (role sources, stamp), ADR-0013.

Use cases (`Application/Users/<UseCase>/`); all implement `IAdminRequest`, commands also `IMutatingCommand`:
| Use case | Request | Response |
|---|---|---|
| `ListUsers` | `ListUsersQuery` | `IReadOnlyList<UserListItemDto>` |
| `GetUser` | `GetUserQuery(string Username)` | `UserDetailDto` |
| `CreateUser` | `CreateUserCommand(string Username, UserRole Role, bool IsReadOnly)` | `UserDetailDto` |
| `ChangeUserRole` | `ChangeUserRoleCommand(string Username, UserRole Role, uint Version)` | `UserDetailDto` |
| `SetUserReadOnly` | `SetUserReadOnlyCommand(string Username, bool IsReadOnly, uint Version)` | `UserDetailDto` |
| `DeactivateUser` / `ReactivateUser` | `...Command(string Username, uint Version)` | `UserDetailDto` |

> **Response shapes (ADR-0013 §5):** the "Response" column is what the *endpoint* returns. Commands return only the key
> (`Result<string>` username/name, `Result<Guid>` id) or `Result`; the endpoint then dispatches the matching `Get…`
> query so `version` is the post-commit value.

- Queries project through `IReadModel` (role computed in SQL from `IsAdminByAssignment || AdminConfigurationSource != null`;
  `GrantCount` via correlated count — one SQL statement, no N+1). Commands return the username; the endpoint dispatches
  `GetUserQuery` for the body (see note above).
- Version check in each command handler first (`Concurrency.Conflict` with "This user was changed by someone else.
  Reload and try again."), then the aggregate method with `CountActiveWritableAdminsAsync()` and
  `currentUser.UserId`.
- Endpoints `Endpoints/Admin/UsersAdminEndpoints.cs` under the admin group, tag `Users`; request records in
  `UserRequests.cs`. OperationIds: `ListUsers`, `CreateUser`, `GetUser`, `ChangeUserRole`, `SetUserReadOnly`,
  `DeactivateUser`, `ReactivateUser`. Create returns `Created<UserDetailDto>` with `Location`.

## Acceptance criteria
- [ ] Integration tests (logged-in via `LoginAsAsync`, data via `TestData`) for every endpoint's happy path and main
      failures (QG-1): 400 validation, 404, 409 (`UsernameTaken`, `LastAdmin`, `SelfChange`, `AdminViaConfiguration`,
      `Concurrency.Conflict` with a stale version).
- [ ] ADM-1: `GET /api/admin/users` and `POST /api/admin/users` → 401 anonymous, 403 `Auth.Forbidden` as non-admin.
- [ ] ADM-2: read-only admin → 200 on GETs, 403 `Auth.ReadOnly` on every command.
- [ ] USR-1 fields incl. `status` pending/active/deactivated, `grantCount`, groups; USR-2 username rules; USR-4
      deactivate ends the user's session (with revalidation interval 0) and keeps grants; USR-6 `isAdminViaConfiguration`
      and `isAdminByAssignment` (projected straight from the column).
- [ ] ADR-0017: promoting a config-only admin → 200, `isAdminByAssignment: true`, one `user.promoted` entry (manual,
      `configurationSource` set); promoting again → 200, no entry.
- [ ] AUD-1: each successful command writes exactly its audit entry; idempotent repeats write none.
- [ ] QA R6 (`Integration/Http/RequestValidationTests`): malformed JSON → 400 ProblemDetails; missing required
      property → 400 with field key `username`; quoted number for `version` → 400; unknown enum (`"role":"root"`) → 400;
      validation `errors` keys are camelCase JSON paths; wrong content type → 415 ProblemDetails.
- [ ] `schema.gen.ts` regenerated. Build, lint and tests green (CLAUDE.md rule 4).

## Work log

## Review

## Handover notes
