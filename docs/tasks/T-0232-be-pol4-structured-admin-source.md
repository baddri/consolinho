---
id: T-0232
title: POL-4 — serve the admin configuration source as a structured field
status: done
owner: backend-engineer
checkpoint: 4c
depends_on: []          # FE follow-up (gen:api, delete users/adminSource.ts parsing) is the frontend-architect's T-021x task, which depends on this
paths: [src/FleetConsole.Domain/Users, src/FleetConsole.Application/Auth, src/FleetConsole.Application/Users, src/FleetConsole.Infrastructure/Persistence, tests/FleetConsole.Domain.Tests/Users, tests/FleetConsole.Application.Tests, tests/FleetConsole.Api.Tests, docs/architecture/BACKEND.md]
review_rounds: 0
---

## Goal
Spec CP4c **POL-4**: the API returns *why* a user is an admin through configuration as a structured value instead of
the text `"user list"` / `"group <name>"`, so the SPA stops parsing strings (`web/src/features/admin/users/adminSource.ts`).
Model it as a domain value object so no layer parses text except the one EF converter that owns the stored format.

## Scope
- In: Domain value object, resolver, `User.RecordLogin`/error, EF value converter (same column, **no migration**),
  three DTOs, OpenAPI shape, tests.
- Out: audit contract — `UserRoleChanged.ConfigurationSource` and the audit `details.configurationSource` /
  summaries stay the **same text** (`VO.ToString()`), so old and new audit rows read alike; the FE change.

## Contract / design notes
- Domain `FleetConsole.Domain/Users/AdminConfigurationSource.cs`: `sealed record AdminConfigurationSource` with
  `AdminConfigurationSourceKind Kind` (`enum { UserList, Group }`) and `string? Group` (non-blank iff `Group`); private
  ctor; factories `static AdminConfigurationSource UserList { get; }` and `static AdminConfigurationSource ForGroup(string group)`
  (guard: not blank); `ToString()` → `"user list"` / `"group <name>"` — documented as the persisted and audit text.
- `AdminConfigurationResolver.Resolve(...)` returns `AdminConfigurationSource?` (drop `UserListSource` const or make it
  delegate to the VO). `User.AdminConfigurationSource` → `AdminConfigurationSource?`; `RecordLogin(..., AdminConfigurationSource? adminConfigurationSource, ...)`
  (blank-string normalisation disappears); `UserRoleChanged(... ConfigurationSource: (current ?? old)?.ToString())`;
  `UserErrors.AdminViaConfiguration(AdminConfigurationSource source)` — message text unchanged.
- Infrastructure: `AdminConfigurationSourceConverter` (next to `UsernameConverter`, registered in
  `ConsoleDbContext.ConfigureConventions`, XML-doc'd) mapping to/from the existing text column; unknown stored text throws
  `InvalidOperationException` (bug/corruption — values are rewritten at every login). `u.AdminConfigurationSource != null`
  in LINQ keeps translating to `IS NULL` (verify `UserRepository` L27 + `UserRow` projection via Api tests).
- Application `Users/AdminConfigurationSourceDto.cs`: `public sealed record AdminConfigurationSourceDto(AdminConfigurationSourceKind Kind, string? Group)`
  with `static AdminConfigurationSourceDto? From(AdminConfigurationSource? source)`.
- Wire contract (same property name, new type) on `CurrentUserDto`, `UserListItemDto`, `UserDetailDto`:
  ```json
  "adminConfigurationSource": { "kind": "userList" | "group", "group": "fleetconsole-admins" | null } | null
  ```
  `isAdminViaConfiguration` unchanged. Enums serialise camelCase via `JsonSetup` (`JsonStringEnumConverter`); check
  `/openapi/v1.json` shows the enum + nullable object (`web/src/shared/api/schema.test.ts` will see it after gen:api).
- FE dependency (frontend-architect, T-0210+): `npm run gen:api`, replace `adminSourceText/adminSourceReason` string
  parsing with a switch on `kind`, delete the `"group "` prefix logic; copy stays identical.

## Context pack
- Docs: BACKEND.md § Domain, § Persistence; ADR-0009 (admin sources), spec POL-4 (grep `POL-4` in `docs/specs/CP4-workloads.md`).
- Exemplars: `Infrastructure/Persistence/ConsoleDbContext.cs` L174–181 (`ConfigureConventions`:
  `Properties<Username>().HaveConversion<UsernameConverter>()`) — register the new converter the same way, next to it,
  and copy `UsernameConverter`'s shape (it then doesn't need `UserConfiguration` changes).
- Touch points: `Application/Auth/AdminConfigurationResolver.cs:Resolve`; `Application/Auth/CompleteLogin/CompleteLoginHandler.cs` L75–76;
  `Domain/Users/User.cs` L54–57, L162–196 (`RecordLogin`), L244–246; `Domain/Users/UserErrors.cs:AdminViaConfiguration` (L46);
  `Domain/Users/Events/UserRoleChanged.cs`; `Application/Audit/EventHandlers/UserAuditHandler.cs` L84–95 (must not change output);
  `Application/Auth/GetCurrentUser/{CurrentUserDto.cs,GetCurrentUserHandler.cs L29–44}`; `Application/Users/UserRow.cs` L25, L50–52, L69–71, L85–87;
  `Users/GetUser/UserDetailDto.cs`, `Users/ListUsers/UserListItemDto.cs`; `Infrastructure/Persistence/Configurations/UserConfiguration.cs` L24;
  `Infrastructure/Persistence/Repositories/UserRepository.cs` L27; `Application/Auth/GetSessionState/GetSessionStateHandler.cs` L22.
- Tests to update: `Domain.Tests/Users/UserTests.cs` (L23–244, L357), `Application.Tests/Auth/CompleteLoginHandlerTests.cs`
  (L62–205), `Application.Tests/Users/UserHandlerTests.cs` L197.

## Acceptance criteria
- [x] Domain tests: VO factories/guards/`ToString`; `RecordLogin` events carry the unchanged text.
- [x] Converter round-trip test (both kinds + null) against Postgres; unknown text throws.
- [x] Api tests: `GET /api/me` (or the current-user route), user list and user detail return the structured object for
      a user-list admin, a group admin and a non-config user (`null`); audit `details.configurationSource` text unchanged.
- [x] No EF migration generated (`dotnet ef migrations add` would be empty — check the model snapshot is untouched).
- [x] Build, lint and tests green (CLAUDE.md rule 4): `scripts/check-be.sh`.

## Work log
- 2026-11-24 backend-engineer: started; VO + converter + DTO approach per contract.
- 2026-11-24 backend-engineer: done. VO `AdminConfigurationSource` + kind enum, `AdminConfigurationSourceConverter` (only
  text parser), `AdminConfigurationSourceDto` on 3 DTOs; `has-pending-model-changes` = none. Test helpers
  (`AuthFakes.LoggedInBefore`, `ConfigAdmin`) now take the VO. BACKEND.md § Persistence +2 lines — note that file also
  carries T-0231's uncommitted hunk (§ probes); stage hunks separately. check-be.sh green (339/711/858).

## Review
- 2026-11-24 backend-architect, round 1: **APPROVE**. VO/factories/guard, resolver, `RecordLogin`, error message,
  converter (sole parser, throws on corrupt text), DTO + 3 wire DTOs and OpenAPI shape match the contract; audit text
  unchanged (`ToString()`), no migration; AC tests present (domain, Postgres round-trip + corrupt, 3-route endpoint, OpenAPI).
  Optional: `ValueObjectConverters.cs` `GroupPrefix` duplicates the `"group "` literal in `AdminConfigurationSource.ToString`
  — a shared `internal const` isn't possible across assemblies, so a short cross-reference comment would do.

## Handover notes
- Wire: `adminConfigurationSource: { kind: "userList" | "group", group: string | null } | null` on CurrentUser,
  UserListItem, UserDetail; OpenAPI = `oneOf [null, $ref AdminConfigurationSource]`, enum `AdminConfigurationSourceKind`.
- Audit text/`UserRoleChanged.ConfigurationSource`/error message unchanged (`VO.ToString()`); same column, no migration.
- Converter round-trip + corrupt-text tests: `Api.Tests/Persistence/AggregateRoundTripTests`; endpoint shape for all
  three cases on a variant host (`Auth:BootstrapAdminUsers=[bob]`): `Integration/Admin/Users/AdminConfigurationSourceEndpointsTests`.
- FE follow-up: `npm run gen:api`, replace `web/src/features/admin/users/adminSource.ts` string parsing with a switch on `kind`.
