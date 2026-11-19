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

**From T-0015 (architect review, 2026-11-19)** — the integration-test harness (`tests/FleetConsole.Api.Tests/Integration/`).
See T-0015's handover notes for details.
- Test classes use `[Collection(ApiCollectionDefinition.Name)]` and take the shared `ApiFactory factory`. Tests in the
  collection run sequentially over **one shared database**, so use unique names (the helpers generate them) and never
  assume an empty table.
- **Logging in:** `await factory.LoginAsAsync(username)` returns a browser client (cookies, no auto-redirect,
  `X-Console-Request: 1`) that holds a session. Users must exist in the emulator. Use `factory.NewUsername()` for a
  regular user and `factory.NewAdminUsername()` for an admin **by configuration** (group `fleetconsole-admins`; can't be
  demoted → 409 `Users.AdminViaConfiguration`). For an admin **by assignment**, first
  `var u = await factory.Data.UserAsync(role: UserRole.Admin)`, then `LoginAsAsync(u.Username)`. For a read-only admin,
  add `isReadOnly: true`. Shipped users (`admin/alice/bob/ines`) are shared by all tests: use them for read-only
  assertions only.
- **Seeding below HTTP:** `factory.Data` (`TestData`): `UserAsync`, `DeactivateAsync`, `ReactivateAsync`,
  `SetReadOnlyAsync`, `SetRoleAsync`, `ClusterAsync`, `CredentialAsync` (encrypted via `ITokenProtector`; returns the
  plaintext token for CRED-2 scans), `GrantAsync`, `FindUserAsync`, `AuditEntriesAsync(name)`. Each call saves in its own
  signed-in scope (actor `test-data`), so seeding writes audit entries too. Filter audit assertions by name or action.
- **Other configuration** (e.g. `Auth:RevalidationInterval=00:00:00` so a role/read-only change is visible on the next
  request): `await using var host = await factory.CreateVariantAsync(overrides)` gives its own database and emulator.
  Each variant costs a migration run (~1 s). Create it once per class (`IAsyncLifetime`), not per test.
- **Secret leaks (CRED-2):** `TokenLeakScanner.AssertAbsent(secret, haystacks...)` over response bodies,
  `await TokenLeakScanner.DumpDatabaseAsync(factory.ConnectionString, ct)` (plaintext must not be in the DB) and
  `factory.Logs.AllText` (Debug and above).
- **Errors through HTTP:** assert `status`, `application/problem+json` and `code` (e.g. 401 `Auth.Unauthenticated`
  without a session, 403 `Auth.Forbidden` for non-admins, 403 `Auth.CsrfHeaderMissing` when the header is removed).
- After adding endpoints, regenerate `web/src/shared/api/schema.gen.ts` (`cd web && npm run gen:api`, Api running) and
  run `npm run typecheck` (ADR-0016).
- Optional follow-up from T-0015 (D7), if convenient here: an OpenAPI schema transformer in `Api/OpenApi` that adds
  `type: string` to string-enum schemas (`UserRole`, …), then tighten `OpenApiDocumentTests.Enums_AreCamelCaseStrings`.

## Acceptance criteria
- [ ] Integration tests (logged-in via `LoginAsAsync`, data via `TestData`) for every endpoint's happy path and main
      failures (QG-1): 400 validation, 404, 409 (`UsernameTaken`, `LastAdmin`, `SelfChange`, `AdminViaConfiguration`,
      `Concurrency.Conflict` with a stale version).
- [ ] ADM-1: `GET /api/admin/users` and `POST /api/admin/users` → 401 anonymous, 403 `Auth.Forbidden` as non-admin.
- [ ] ADM-2: read-only admin → 200 on GETs, 403 `Auth.ReadOnly` on every command.
- [ ] Contract §7 check order (T-0044): read-only admin + well-formed JSON that fails field validation (e.g.
      `POST /api/admin/users` with `"username": ""`) → 403 `Auth.ReadOnly`, not 400 — at least one command endpoint.
      Malformed JSON / wrong content type still yields 400/415 first (model binding precedes the pipeline).
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

## Contract amendments (orchestrator 2026-11-18)
- `UserListItemDto` gains `AdminConfigurationSource` (string?) and `Version` (uint) — contract §7.1.
- Contract-first FE types (ADR-0016): after regenerating `schema.gen.ts`, also run `cd web && npm run typecheck`. A failure means the Api deviates from the contract — report it in NOTES, don't patch web/ silently.

## Work log

## Review

## Handover notes
