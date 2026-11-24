---
id: T-0283
title: Database unreachable → 503 ProblemDetails Persistence.Unavailable (CACHE-5 error path)
status: todo
owner: backend-engineer
checkpoint: 4.5b
depends_on: []
paths: [src/FleetConsole.Application/Abstractions/Persistence/PersistenceUnavailableException.cs, src/FleetConsole.Application/Abstractions/Persistence/PersistenceErrors.cs, src/FleetConsole.Infrastructure/Persistence/ReadModel.cs, src/FleetConsole.Infrastructure/Persistence/ConsoleDbContext.cs, src/FleetConsole.Api/Http/GlobalExceptionHandler.cs, tests/FleetConsole.Api.Tests/Http/, tests/FleetConsole.Api.Tests/Integration/PersistenceUnavailableTests.cs]
review_rounds: 0
---

## Goal
CACHE-5: when the cache has no valid entry and the database can't be reached, the request must fail with **503
ProblemDetails**, not a generic 500 and never a stale entry (ADR-0040 §8). Today every database exception becomes 500.

## Scope
- In: an Application exception for "data source unreachable", translation at the two Infrastructure boundaries
  (`ReadModel` queries, `ConsoleDbContext.SaveChangesAsync`), mapping in `GlobalExceptionHandler`, tests.
- Out: retry policy changes; health checks; any cache code (T-0281/T-0282).

## Contract / design notes
```csharp
// Application/Abstractions/Persistence/PersistenceUnavailableException.cs (next to ConcurrencyConflictException)
public sealed class PersistenceUnavailableException(string message, Exception inner) : Exception(message, inner);
```
- Translate: `NpgsqlException { IsTransient: true }` (includes connection refused/timeouts), `TimeoutException`, and
  EF `RetryLimitExceededException` (Aspire enrichment enables retries). Not `PostgresException` with a SQLSTATE that
  isn't transient (those stay bugs/existing mappings). Message without values (no host, no SQL).
- `ReadModel.ToListAsync` / other async terminal methods and `ConsoleDbContext.SaveChangesAsync` (after the existing
  catches) wrap. Keep it one private helper per class.
- `GlobalExceptionHandler`: if the exception **or any inner exception** is `PersistenceUnavailableException` (the cache
  may wrap factory exceptions) → 503, `Title = "The service is temporarily unavailable."`, extension `code =
  "Persistence.Unavailable"` (`ResultExtensions.ErrorCodeExtension`, same as Result-mapped problems), `Retry-After: 5`,
  Warning log (EventId new, method + path, no exception text beyond type). Development `Detail` behaviour unchanged.
- The proxy route reaches the same handler (exceptions before forwarding starts); confirm with a test.

## Context pack
- Docs: ADR-0040 §8; BACKEND.md §Results and errors (L133–140).
- Exemplars: `Application/Abstractions/Persistence/ConcurrencyConflictException.cs` (exception shape);
  `Infrastructure/Persistence/ConsoleDbContext.cs` L95–115 (existing `catch … when` translations).
- Touch points: `Infrastructure/Persistence/ReadModel.cs:ToListAsync` (L38–39), `Api/Http/GlobalExceptionHandler.cs:TryHandleAsync`,
  `Api/Http/ResultExtensions.cs:ErrorCodeExtension` (the `code` member), `tests/.../Integration/ApiFactory.cs:CreateVariantAsync`
  (`configureServices` to swap in a failing `IReadModel`, or point `ConnectionStrings:consoledb` at a closed port after start).

## Acceptance criteria
- [ ] Unit tests: each translated exception type → `PersistenceUnavailableException`; a non-transient
      `PostgresException` is not translated.
- [ ] Api test: signed-in user, database unreachable → `GET /api/clusters` and a proxy `GET /api/clusters/{name}/k8s/...`
      both answer 503 `application/problem+json` with `code` `Persistence.Unavailable` and `Retry-After`; no token or
      connection string in body or logs (`TokenLeakScanner`).
- [ ] XML docs; `scripts/check-be.sh` green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
