---
id: T-0013
title: Audit trail — pre-commit domain event dispatch, event-to-entry mapping, atomicity tests
status: todo
owner: backend-engineer
checkpoint: 1
depends_on: [T-0012]
paths: [src/FleetConsole.Application/Abstractions/Events/, src/FleetConsole.Application/Abstractions/IDomainEventDispatcher.cs, src/FleetConsole.Application/Abstractions/IUnitOfWork.cs, src/FleetConsole.Application/Audit/, src/FleetConsole.Application/DependencyInjection.cs, src/FleetConsole.Infrastructure/Events/, src/FleetConsole.Infrastructure/Persistence/ConsoleDbContext.cs, src/FleetConsole.Infrastructure/Persistence/PendingDomainEvents.cs, src/FleetConsole.Infrastructure/DependencyInjection.cs, tests/FleetConsole.Application.Tests/Audit/, tests/FleetConsole.Api.Tests/Persistence/, tests/FleetConsole.Api.Tests/Events/]
review_rounds: 0
---

## Goal
Make AUD-1 true by construction: domain events raised by aggregates are handled **before** the database write, in the
same unit of work, and their audit entries are committed atomically with the change (ADR-0008). Delivers the QA R5
follow-up: an integration test of domain-event dispatch with real aggregates. **Wave W4**, parallel with T-0014
(use worktree isolation; both touch the two `DependencyInjection.cs` files).

## Scope
- In: `IDomainEventHandler<T>`; real `DomainEventDispatcher`; `ConsoleDbContext` pre-commit dispatch; `AuditTrail`
  (implements T-0012's `IAuditTrail`); audit handlers for **every** domain event of T-0007/T-0008; coverage test;
  atomicity integration tests; doc comments on the changed ports.
- Out: audit query endpoint (T-0021); explicit `IAuditTrail.Record` calls inside login/logout/test-token handlers
  (their own tasks).

## Contract / design notes
Read ADR-0008 completely; contract §10 (actions, targets, `details` shapes) is the mapping spec.
```csharp
// Application/Abstractions/Events/IDomainEventHandler.cs
public interface IDomainEventHandler<in TEvent> where TEvent : IDomainEvent
{ Task Handle(TEvent domainEvent, CancellationToken cancellationToken); }
```
- `AddApplication()` scans and registers all `IDomainEventHandler<>` implementations (scoped), next to handler scanning.
- `Infrastructure/Events/DomainEventDispatcher : IDomainEventDispatcher` (scoped) — for each event in order, resolves
  `IEnumerable<IDomainEventHandler<TEvent>>` from the scope (cache the closed generic per event type) and awaits them.
  Replaces `NoOpDomainEventDispatcher` (delete it).
- `ConsoleDbContext.SaveChangesAsync`: capture → dispatch → assert no new pending events (throw
  `InvalidOperationException` naming the aggregate type) → `base.SaveChangesAsync` → clear captured events. Update XML
  docs of `ConsoleDbContext`, `IDomainEventDispatcher` ("before the write, same transaction"), `IUnitOfWork`,
  `AggregateRoot` remarks.
- `Application/Audit/AuditTrail : IAuditTrail` (internal sealed, scoped): actor = `record.Actor` ??
  `AuditActor.ForUser(currentUser.UserId, currentUser.Username)` (throws `InvalidOperationException` if neither — a
  bug); `occurredAt = clock.UtcNow`; `correlationId = Activity.Current?.TraceId.ToHexString()`; details serialized
  with `JsonSerializerDefaults.Web` + camelCase enum strings (`{}` when null); `AuditEntry.Record(...)` →
  `IAuditEntryRepository.Add`.
- `Application/Audit/EventHandlers/`: `UserAuditHandler`, `ClusterAuditHandler`, `CredentialAuditHandler`,
  `GrantAuditHandler` — one class per area implementing `IDomainEventHandler<X>` for each event. Actor rules:
  `UserProvisioned`/`UserLoggedIn` → the user (`AuditActor.ForUser(e.UserId, e.Username)`); `UserRoleChanged` with
  `Source == Configuration` → `AuditActor.Configuration`; everything else → current user. `UserRoleChanged` →
  `user.promoted` when `NewRole == Admin`, `user.demoted` when `NewRole == User` — never derive it from
  `OldRole`/`NewRole` differing: promoting a config admin raises `Admin → Admin` (ADR-0017). Summaries are one sentence
  ("Deactivated user alice", "Granted alice ReadOnly on prod-eu-1 via fleet-view"). Target names per contract §10
  (grant: "alice → prod-eu-1").
- Coverage test (`AuditCoverageTests`): every concrete `IDomainEvent` in the Domain assembly has ≥ 1
  `IDomainEventHandler<>` in the Application assembly whose namespace is `...Audit.EventHandlers` (or is in a
  commented allow-list — expected empty in CP1).

## Acceptance criteria
- [ ] AUD-1 / QA R5 integration tests (real Postgres, real `ConsoleDbContext` + repositories + dispatcher):
      (a) saving a `User` created via `PreCreate` writes the user and exactly one `user.created` entry in one
      transaction; (b) a failing save (duplicate username) writes neither user nor audit entry; (c) a throwing event
      handler aborts the save — nothing written; (d) a handler that raises a new event triggers the
      `InvalidOperationException`; (e) events are cleared after a successful save (second save writes no extra entry).
- [ ] Unit tests per audit handler: action, category, target, cluster, actor rule, `details` JSON shape (contract §10),
      and that no `details` or summary contains token material (fingerprints only).
- [ ] Coverage test green.
- [ ] Docs: BACKEND.md Persistence/Pipeline text matches the code (architect pre-updated it; fix drift).
- [ ] Build, lint and tests green (CLAUDE.md rule 4).

## Work log

## Review

## Handover notes
