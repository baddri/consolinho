---
id: T-0140
title: Saved inspect namespaces on the credential — value object, persistence, add-credential API, DTO, audit
status: todo
owner: backend-engineer
checkpoint: 3.7
depends_on: [T-0139]   # migration ordering only (shared model snapshot); no code dependency
paths: [src/FleetConsole.Domain/Credentials, src/FleetConsole.Application/Credentials/AddCredential, src/FleetConsole.Application/Credentials/InspectNamespacesRules.cs, src/FleetConsole.Application/Credentials/CredentialDto.cs, src/FleetConsole.Application/Credentials/CredentialProjection.cs, src/FleetConsole.Application/Credentials/TestCredential/TestCredentialHandler.cs, src/FleetConsole.Application/Audit/EventHandlers/CredentialAuditHandler.cs, src/FleetConsole.Infrastructure/Persistence, src/FleetConsole.Api/Endpoints/Admin/CredentialRequests.cs, src/FleetConsole.Api/Endpoints/Admin/CredentialsAdminEndpoints.cs, tests/FleetConsole.Domain.Tests/Credentials, tests/FleetConsole.Application.Tests/Credentials, tests/FleetConsole.Api.Tests/Integration/Admin/Credentials]
review_rounds: 0
---

## Goal
A credential remembers the namespaces its connection test inspects (NST-5, NST-7 add part), so the test dialog can
prefill them and CP5.5 can use them as the namespace-picker fallback. This task adds the domain concept, storage, the
add-credential input and the DTO; T-0141 makes the tests use and replace it.

## Scope
- In: `InspectNamespaces` value object + `Credential` changes, EF mapping + migration, `AddCredential` input/validator,
  `CredentialDto.InspectNamespaces`, shared FluentValidation rule, audit details for add/test events.
- Out: test commands/requests/tester (T-0141). Don't touch `ConnectionTesting/InspectNamespaceRules.cs` (T-0141 deletes it).

## Contract / design notes
Contract: **T-0139 §Contract B** (field names, messages, error keys, DTO position). Design:
- `public sealed record InspectNamespaces` (or sealed class with value equality) in `Domain/Credentials`:
  `public const int MaxCount = 10; public const int MaxLength = 63;` `public static InspectNamespaces Empty`;
  `public IReadOnlyList<string> Values`; `public static Result<InspectNamespaces> Create(IEnumerable<string>? values)`
  returning `Error.Validation(...)` with keys `inspectNamespaces` / `inspectNamespaces[i]` (camelCase JSON names, like
  `ApiServerEndpoint.Create`). Collect **all** entry errors, then the count error. Value equality over `Values` (EF change tracking).
  Regex = today's `^[a-z0-9]([-a-z0-9]*[a-z0-9])?$`.
- `Credential`:
  - `public InspectNamespaces InspectNamespaces { get; private set; } = InspectNamespaces.Empty;`
  - `Add(..., TokenMetadata metadata, InspectNamespaces inspectNamespaces, string actor, DateTimeOffset now)`;
    `CredentialAdded` gains `IReadOnlyList<string> InspectNamespaces`.
  - `RecordTest(ConnectionTestSummary summary, InspectNamespaces inspectNamespaces, string clusterName)`: stores summary
    **and** replaces the list (the list the test used — spec Q7); `CredentialTested` gains `IReadOnlyList<string> InspectNamespaces`.
  - `Rotate` unchanged (keeps the list; add a test).
- `TestCredentialHandler`: compile fix only — pass `credential.InspectNamespaces` (T-0141 replaces it with the request's list).
- Shared rule `Application/Credentials/InspectNamespacesRules.cs`:
  `public static IRuleBuilderOptionsConditions<T, IReadOnlyList<string>?> ValidInspectNamespaces<T>(this IRuleBuilderInitial<T, IReadOnlyList<string>?> rule)`
  — a `Custom` rule that calls `InspectNamespaces.Create` and copies each field error with `context.AddFailure(field, message)`
  (same technique as `ClusterSettingsRules` L42-63). The Domain stays the single source of the rule.
- `AddCredentialCommand` gains `IReadOnlyList<string>? InspectNamespaces` (last param); validator adds the rule; handler
  does `InspectNamespaces.Create(request.InspectNamespaces).Value` (validated before).
- `AddCredentialRequest(string Name, string? Description, string Token, IReadOnlyList<string>? InspectNamespaces = null)`
  with XML param doc: "Optional namespaces (up to 10) the connection test lists the token's rules in; saved on the credential."
- `CredentialDto.InspectNamespaces` (`IReadOnlyList<string>`) after `Description`; projection reads the column (no extra query).
- EF: `builder.Property(c => c.InspectNamespaces).HasColumnName("inspect_namespaces").HasConversion(<to string[] and back
  via Create(...).Value>).Metadata.SetValueComparer(...)` — or map once in `ConfigureConventions` if you prefer, with a
  comment. Column `text[] NOT NULL DEFAULT '{}'` (Npgsql maps `string[]` to `text[]`). Migration name `CredentialInspectNamespaces`.
- Audit: `credential.added` and `credential.tested` details add `inspectNamespaces` (array of names).

## Context pack
- Docs: `BACKEND.md` §Domain, §Results and errors, §Persistence; spec NST-2/5/7 (grep `NST-` in `docs/specs/CP3.7-fleet-foundations.md`).
- Exemplars: `Domain/Clusters/ApiServerEndpoint.cs:Create` L61-95 (value object returning field errors);
  `Application/Clusters/ClusterSettingsRules.cs` L42-63 (copy domain field errors into FluentValidation);
  `Application/Credentials/ConnectionTesting/InspectNamespaceRules.cs` (today's single-namespace rule and message).
- Touch points: `Domain/Credentials/Credential.cs:Add` L86-115, `RecordTest` L162-175, `Rotate` L131-154;
  `Domain/Credentials/Events/CredentialAdded.cs`, `CredentialTested.cs`;
  `Application/Credentials/AddCredential/AddCredentialCommand.cs` L19, `AddCredentialHandler.cs` L54, `AddCredentialValidator.cs`;
  `Application/Credentials/CredentialDto.cs`, `CredentialProjection.cs` L85-140;
  `Application/Credentials/TestCredential/TestCredentialHandler.cs` (RecordTest call);
  `Application/Audit/EventHandlers/CredentialAuditHandler.cs:Handle(CredentialAdded)` L25, `Handle(CredentialTested)` L72-83;
  `Infrastructure/Persistence/Configurations/CredentialConfiguration.cs` L30-52; `ConsoleDbContext.cs:ConfigureConventions` L188;
  `Api/Endpoints/Admin/CredentialRequests.cs` L11, `CredentialsAdminEndpoints.cs:AddCredential` L86.
- Tests: `tests/FleetConsole.Domain.Tests/Credentials/CredentialValueObjectTests.cs` (VO), `CredentialTests.cs`;
  `tests/FleetConsole.Application.Tests/Credentials/CredentialValidatorTests.cs`, `CredentialCommandHandlerTests.cs`;
  `tests/FleetConsole.Api.Tests/Integration/Admin/Credentials/CredentialsEndpointsTests.cs`, `CredentialApi.cs` (builders).

## Acceptance criteria
- [ ] VO: trims, dedups keeping first order, rejects blank/invalid entries with `inspectNamespaces[i]` naming the entry,
      rejects > 10 distinct with `inspectNamespaces`; `Empty` for null/empty input (domain tests).
- [ ] `Credential.Add` stores the list; `RecordTest` replaces it (empty clears); `Rotate` keeps it.
- [ ] Add credential with `inspectNamespaces: [" team-a ", "team-a", "team-b"]` → 201, GET returns `["team-a","team-b"]`;
      11 names or `"Team_A"` → 400 with the field key; omitted → `[]`.
- [ ] Migration: existing credentials read back with `[]`.
- [ ] `credential.added` audit details contain the names; token-leak sweep still passes.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
