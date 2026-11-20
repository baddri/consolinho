---
id: T-0016
title: Admin users API — list, detail, pre-create, role, read-only, deactivate/reactivate (+ HTTP validation tests)
status: done
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
- [x] Integration tests (logged-in via `LoginAsAsync`, data via `TestData`) for every endpoint's happy path and main
      failures (QG-1): 400 validation, 404, 409 (`UsernameTaken`, `LastAdmin`, `SelfChange`, `AdminViaConfiguration`,
      `Concurrency.Conflict` with a stale version).
- [x] ADM-1: `GET /api/admin/users` and `POST /api/admin/users` → 401 anonymous, 403 `Auth.Forbidden` as non-admin.
- [x] ADM-2: read-only admin → 200 on GETs, 403 `Auth.ReadOnly` on every command.
- [x] Contract §7 check order (T-0044): read-only admin + well-formed JSON that fails field validation (e.g.
      `POST /api/admin/users` with `"username": ""`) → 403 `Auth.ReadOnly`, not 400 — at least one command endpoint.
      Malformed JSON / wrong content type still yields 400/415 first (model binding precedes the pipeline).
- [x] USR-1 fields incl. `status` pending/active/deactivated, `grantCount`, groups; USR-2 username rules; USR-4
      deactivate ends the user's session (with revalidation interval 0) and keeps grants; USR-6 `isAdminViaConfiguration`
      and `isAdminByAssignment` (projected straight from the column).
- [x] ADR-0017: promoting a config-only admin → 200, `isAdminByAssignment: true`, one `user.promoted` entry (manual,
      `configurationSource` set); promoting again → 200, no entry.
- [x] AUD-1: each successful command writes exactly its audit entry; idempotent repeats write none.
- [x] QA R6 (`Integration/Http/RequestValidationTests`): malformed JSON → 400 ProblemDetails; missing required
      property → 400 with field key `username`; quoted number for `version` → 400; unknown enum (`"role":"root"`) → 400;
      validation `errors` keys are camelCase JSON paths; wrong content type → 415 ProblemDetails.
- [x] `schema.gen.ts` regenerated. Build, lint and tests green (CLAUDE.md rule 4).

## Contract amendments (orchestrator 2026-11-18)
- `UserListItemDto` gains `AdminConfigurationSource` (string?) and `Version` (uint) — contract §7.1.
- Contract-first FE types (ADR-0016): after regenerating `schema.gen.ts`, also run `cd web && npm run typecheck`. A failure means the Api deviates from the contract — report it in NOTES, don't patch web/ silently.

## Work log
- 2026-11-19 (backend-engineer): started. Read CLAUDE.md, BACKEND.md, SECURITY.md, ADR-0009/0013/0017, contract §1–3, §7 (+ amendments), T-0015 handover.
- 2026-11-19 (backend-engineer): paused on coordinator request (session ending). Application use cases + Api endpoints
  written and building; no tests written yet, no full build/test run yet. Touched outside `paths` (minimal, explained):
  `src/FleetConsole.Api/OpenApi/StringEnumSchemaTransformer.cs` (new) + one registration line in `OpenApiSetup.cs`
  (the optional T-0015 D7 follow-up the task invites).
- 2026-11-19 (backend-engineer): resumed; full build + EF translation OK; unit + integration tests added; schema.gen.ts
  regenerated (with `--default-non-nullable false`, see handover). Outside `paths`: `OpenApiDocumentTests` (tightened),
  `Domain/Users/UserStatus.cs` summary made consumer-facing (now in OpenAPI). check-be green (462 Api tests).

## Review
**Round 1 (backend-architect, 2026-11-19): APPROVE.** check-be green (323/237/462). Layering, one-statement projection
(role/status/grant count in SQL, verified on Postgres), version check before rules, xmin at commit, audit once/no-op
repeats, XML docs all good. ADM-5 count-then-save write skew = accepted gap (ADR-0009 "Known gap"), not a finding.
Optional nits:
- `src/FleetConsole.Application/Users/CreateUser/CreateUserHandler.cs:35` — a create race returns 409 `Persistence.DuplicateKey`, not `Users.UsernameTaken` — optional: map the username unique constraint to `UsernameTaken` later (follow-up, not here).
- `tests/FleetConsole.Api.Tests/Integration/Admin/Users/LastAdminTests.cs:20` — one variant host per test (3x) vs. once-per-class guidance — acceptable (each needs an empty DB); keep the count small.
- `tests/FleetConsole.Api.Tests/Integration/Admin/Users/LastAdminTests.cs:4` — `using static AuthEndpointsTests` couples test classes — optional: move `MeStatusAsync` into a shared helper.
- Merge note (T-0017/18): `AdminEndpoints.cs` is one line; `OpenApiDocumentTests` (tests appended after the same test) and `schema.gen.ts` will conflict textually — keep both sides, regenerate `schema.gen.ts` after the merge.

## Handover notes
- Use cases in `Application/Users/<UseCase>/`; `UserRow.Project` is the shared one-statement projection (role/status in
  SQL, correlated grant count) — EF translates it (verified by integration tests on Postgres). `UserChanges.LoadAsync`
  does 404 + stale-version check for all transitions.
- Tests: `Application.Tests/Users/` (handlers, validators); `Api.Tests/Integration/Admin/Users/` (shared host:
  `UsersAdminEndpointsTests`; per-test variants: `LastAdminTests` incl. USR-4 session end) with helper `UsersApi`;
  `Integration/Http/RequestValidationTests` (QA R6). `OpenApiDocumentTests` now requires `type: string` on enums and
  checks user operationIds/schemas.
- First login of a config admin already writes a `user.promoted` (source `configuration`): filter audit asserts by
  `source` when promoting config admins.
- An escaped `..` in a URL is normalized away by HttpClient, so the HTTP 404 test uses other unknown names; the unit
  test covers invalid route usernames.
- **FE follow-up (not done, web/ is FE territory):** openapi-typescript's default `defaultNonNullable: true` turns
  `CreateUserRequest.isReadOnly` (`default: false` in the OpenAPI doc, correctly optional) into a required field and
  breaks `npm run typecheck`. The committed `schema.gen.ts` was generated with `--default-non-nullable false` (only
  that line differs); `web/scripts/gen-api.mjs` should pass that flag so `npm run gen:api` reproduces it.
