---
id: T-0401
title: Audit entries store the client IP (domain, migration, API field)
status: todo
owner: backend-engineer
checkpoint: 6a
depends_on: []
paths: [src/FleetConsole.Domain/Audit, src/FleetConsole.Application/Abstractions, src/FleetConsole.Application/Audit, src/FleetConsole.Infrastructure/Persistence, src/FleetConsole.Api/Http, src/FleetConsole.Api/Program.cs, tests/FleetConsole.Domain.Tests, tests/FleetConsole.Application.Tests/Audit, tests/FleetConsole.Api.Tests/Integration/Admin/Audit, docs/architecture/SECURITY.md]
review_rounds: 0
size: M (0.5–1 d)
---

## Goal
Every audit entry (admin, auth, proxy) records the client IP (spec FWD-2) so incident review sees who, from where.
Parallel with T-0400: the value comes from `Connection.RemoteIpAddress`, which T-0400 makes correct behind the Route.

## Scope
- In: `AuditEntry.ClientIp`, `IClientAddress` port + Api implementation, `AuditTrail` fills it, EF column + migration,
  `AuditEntryDto.ClientIp`, tests, SECURITY.md § Audit.
- Out: SPA expanded row (frontend task, regenerates types); filtering by IP.

## Contract / design notes
ADR-0042 §3. **Shared FE/BE contract** (also in the frontend architect's task): the audit list item schema `AuditEntry`
gains `clientIp: string | null` (required, nullable) — IPv4 dotted or IPv6 text; `null` for entries before CP6a and
for system actions without a request. FE shows "—" for null.
- Domain: `AuditEntry` gains `public string? ClientIp { get; private init; }`; `Record(..., string? clientIp = null)`
  appended as **last optional** parameter; guard: null/blank → null, length ≤ 45 else throw (programming error; the
  caller passes `IPAddress.ToString()`).
- Application: `Abstractions/IClientAddress.cs` — `string? ClientIp { get; }` (XML doc: "the caller's IP as seen
  after trusted forwarded headers; null outside an HTTP request"). `AuditTrail` (L26) takes it and passes it.
  `AuditEntryDto` appends `string? ClientIp` (doc param), `ListAuditEntriesHandler` projection (`AuditRow`, L87) maps it.
- Api: `Http/HttpClientAddress.cs` (scoped; `IHttpContextAccessor`; `IPAddress.IsIPv4MappedToIPv6 ? MapToIPv4()`),
  registered next to `ICurrentUser` in `Program.cs`.
- Infrastructure: `AuditEntryConfiguration` `Property(a => a.ClientIp).HasMaxLength(45)`; migration
  `AuditClientIp` (nullable `client_ip`, no backfill, no index).
- Background/system writers without HttpContext must keep working (null) — check `UserAuditHandler` revalidation path.

## Context pack
- Touch points: `src/FleetConsole.Domain/Audit/AuditEntry.cs:Record` (L90-125), `src/FleetConsole.Application/Audit/AuditTrail.cs:Record`
  (L35-52), `src/FleetConsole.Application/Audit/ListAuditEntries/AuditEntryDto.cs` (L23-40), `ListAuditEntriesHandler.cs` (L87),
  `src/FleetConsole.Infrastructure/Persistence/Configurations/AuditEntryConfiguration.cs` (L41), `src/FleetConsole.Api/Auth/HttpCurrentUser.cs` (accessor pattern).
- Migration command: CLAUDE.md § Commands (`dotnet ef migrations add AuditClientIp …`).
- Tests: `tests/FleetConsole.Api.Tests/Integration/Admin/Audit/AuditEndpointsTests.cs` (add: admin action → entry has
  `clientIp`; schema property list); Domain test for the guard; `AuditTrail` unit test with a fake `IClientAddress`.
- OpenAPI: confirm `clientIp` is required+nullable like `correlationId`.

## Acceptance criteria
- [ ] FWD-2: admin, login and proxy-mutation entries carry `clientIp` (API test through `ApiFactory`); old rows null.
- [ ] Migration adds nullable column only; snapshot updated; one SQL statement per list unchanged.
- [ ] SECURITY.md § Audit lists `clientIp`; build + tests green.

## Work log

## Review

## Handover notes
