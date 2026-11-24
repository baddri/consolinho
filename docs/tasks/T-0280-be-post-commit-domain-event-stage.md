---
id: T-0280
title: Post-commit domain event stage (IPostCommitDomainEventHandler, ADR-0008 §6)
status: done
owner: backend-engineer
checkpoint: 4.5b
depends_on: []
paths: [src/FleetConsole.Application/Abstractions/Events/, src/FleetConsole.Application/Abstractions/IDomainEventDispatcher.cs, src/FleetConsole.Infrastructure/Events/, src/FleetConsole.Infrastructure/Persistence/ConsoleDbContext.cs, src/FleetConsole.Infrastructure/Persistence/DesignTimeConsoleDbContextFactory.cs, tests/FleetConsole.Api.Tests/, tests/FleetConsole.Application.Tests/, docs/architecture/BACKEND.md]
review_rounds: 0
---

## Goal
Cache invalidation (CACHE-2) must run only after the write committed. ADR-0008 has a pre-commit stage only; build the
deferred post-commit stage exactly as ADR-0040 §1 says, with no consumer yet (T-0282 adds the cache handler).

## Scope
- In: the port, dispatch after `base.SaveChangesAsync`, failure isolation, tests, BACKEND.md Pipeline step 6 +
  §Persistence sentence on the new stage.
- Out: any cache code; changing the pre-commit stage or audit handlers.

## Contract / design notes
```csharp
// Application/Abstractions/Events/IPostCommitDomainEventHandler.cs
public interface IPostCommitDomainEventHandler<in TEvent> where TEvent : IDomainEvent
{ Task HandleAsync(TEvent domainEvent, CancellationToken cancellationToken); }

// IDomainEventDispatcher gains:
Task DispatchPostCommitAsync(IReadOnlyList<IDomainEvent> domainEvents, CancellationToken cancellationToken);
```
- `ConsoleDbContext.SaveChangesAsync`: capture → pre-commit dispatch (unchanged) → `base.SaveChangesAsync` → clear →
  `DispatchPostCommitAsync(pending.Events, CancellationToken.None)` (capture the list before `Clear()`). Not called when
  the write throws, nor when there were no events. Name/explain why `CancellationToken.None` in a comment.
- `DomainEventDispatcher.DispatchPostCommitAsync`: resolves `IEnumerable<IPostCommitDomainEventHandler<T>>` from the
  scope per event (same reflection/closed-generic approach as `DispatchAsync`), runs them sequentially; each handler
  call is wrapped: exception → `LogWarning` (EventId new, message names event type + handler type, never payload) and
  continue with the next handler. `OperationCanceledException` is treated the same (logged, swallowed).
- Design-time dispatcher: no-op for the new method.
- Handler rules (XML doc on the interface): at-most-once, best effort; no `DbContext`, no new events, bounded I/O only.

## Context pack
- Docs: ADR-0008 §Decision 1–2, 6; ADR-0040 §1; BACKEND.md §Pipeline step 6 (L94–104).
- Exemplars: `Infrastructure/Events/DomainEventDispatcher.cs:DispatchAsync` (L32+) — copy its resolution pattern;
  `Application/Audit/EventHandlers/ClusterAuditHandler.cs` (a multi-event handler class shape).
- Touch points: `Infrastructure/Persistence/ConsoleDbContext.cs:SaveChangesAsync` (L126–139),
  `Application/Abstractions/IDomainEventDispatcher.cs`, `Infrastructure/Persistence/DesignTimeConsoleDbContextFactory.cs:DesignTimeDomainEventDispatcher`,
  `Infrastructure/DependencyInjection.cs` L110 (dispatcher registration; post-commit handlers are registered by their
  feature, e.g. T-0282 — add an assembly-scan only if `AddApplication` already scans `IDomainEventHandler<>`; mirror it).

## Acceptance criteria
- [x] Integration test (Api.Tests, Testcontainers Postgres): a test post-commit handler registered via
      `configureServices` observes the event only after the row is visible in a fresh scope; a failing write (e.g.
      duplicate key) dispatches nothing.
- [x] A throwing post-commit handler: the command still returns success, the change is persisted, a Warning is logged
      (`CapturedLogs`), later handlers still run.
- [x] Unit test: request cancellation after commit still dispatches (token passed is `None`).
- [x] BACKEND.md Pipeline step 6 mentions the post-commit stage; XML docs on all new public members.
- [x] `scripts/check-be.sh` green (CLAUDE.md rule 4)

## Work log
- 2026-11-24 backend-engineer: in_progress → in_review. Port + `DispatchPostCommitAsync` (per-handler try/catch, Warning
  EventId 3600, type names only), context dispatch after commit with `CancellationToken.None`, design-time no-op, BACKEND.md.
  Outside `paths` (minimal, as the task's touch points ask): `Application/DependencyInjection.cs` — the existing
  `AddDomainEventHandlers` scan now also registers `IPostCommitDomainEventHandler<>`. check-be green (944 Api tests).

## Review
- 2026-11-24 backend-architect, round 1: **APPROVE**. Best-effort post-commit with `CancellationToken.None` matches
  ADR-0040 §1 / CACHE-4 (a missed invalidation is bounded by `Cache:Duration`); `Application/DependencyInjection.cs`
  scan extension is what the Context pack asked for (mirror existing scan) — accepted. Filtered tests 42/42 green.
- Optional: `src/FleetConsole.Infrastructure/Events/DomainEventDispatcher.cs:325` — `GetServices` resolution sits outside
  the try, so a handler-construction failure throws after the commit (500 for a committed write); consider resolving
  inside the isolation or leave it (config bug, caught by T-0282's integration tests).

## Handover notes
- Post-commit handlers: implement `IPostCommitDomainEventHandler<TEvent>` anywhere in the Application assembly — the
  scan registers them scoped; elsewhere register them explicitly. They receive `CancellationToken.None`.
- Failures log Warning `DomainEventDispatcher.PostCommitHandlerFailedEventId` (3600) with event/handler/exception *type
  names only* (exception text could carry payload) — no stack trace; T-0282 handlers should log details themselves if needed.
- Tests: `Api.Tests/Events/DomainEventDispatcherTests.cs` (unit, incl. OCE swallowed),
  `Api.Tests/Persistence/PostCommitDispatchTests.cs` (variant hosts: visibility in a fresh scope, failing write,
  throwing handler via HTTP register-cluster, token None via a `SaveChangesInterceptor` cancelling after the save).
- `DomainEventDispatcher` ctor now takes `ILogger<DomainEventDispatcher>`.
