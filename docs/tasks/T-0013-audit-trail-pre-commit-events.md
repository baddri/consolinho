---
id: T-0013
title: Audit trail — pre-commit domain event dispatch, event-to-entry mapping, atomicity tests
status: in_review
owner: backend-engineer
checkpoint: 1
depends_on: [T-0012]
paths: [src/FleetConsole.Application/Abstractions/Events/, src/FleetConsole.Application/Abstractions/IDomainEventDispatcher.cs, src/FleetConsole.Application/Abstractions/IUnitOfWork.cs, src/FleetConsole.Application/Abstractions/Persistence/ConcurrencyConflictException.cs, src/FleetConsole.Application/Audit/, src/FleetConsole.Application/DependencyInjection.cs, src/FleetConsole.Infrastructure/Events/, src/FleetConsole.Infrastructure/Persistence/ConsoleDbContext.cs, src/FleetConsole.Infrastructure/Persistence/PendingDomainEvents.cs, src/FleetConsole.Infrastructure/DependencyInjection.cs, tests/FleetConsole.Application.Tests/Audit/, tests/FleetConsole.Api.Tests/Persistence/, tests/FleetConsole.Api.Tests/Events/]
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

**From T-0008 (architect review, 2026-11-19)** — the Domain as built; see T-0008's handover notes for details.
- T-0008 adds 12 events; the mapping (contract §10), actor = current user for all of them:
  `ClusterRegistered` → `cluster.registered` `{environment, apiUrl, tlsMode, isEnabled}`; `ClusterUpdated` →
  `cluster.updated` `{changedFields}`; `ClusterEnabled`/`ClusterDisabled` → `{}`; `ClusterDeleted` →
  `{credentialCount, grantCount}`; `CredentialAdded` → `{fingerprint, tokenType, serviceAccount}`; `CredentialRotated` →
  `{oldFingerprint, newFingerprint}`; `CredentialDeleted` → `{fingerprint}`; `CredentialTested` →
  `{succeeded, failedStep, headline}`; `GrantCreated`/`GrantRevoked` → `{username, accessMode, credential}`;
  `GrantChanged` → `{oldAccessMode, newAccessMode, oldCredential, newCredential}`. Cluster entries: target = the
  cluster, `clusterName` = its name; credential entries: target = credential (`Name`), `clusterName` = `ClusterName`;
  grant entries: target name `"<username> → <cluster>"`, `clusterName` set.
- `CredentialRotated` is raised on every rotation and `CredentialTested` on every recorded test run (intended: each is
  an admin action, not an idempotent transition). `ClusterDeleted` covers the cascaded credentials/grants: no
  per-child events exist.
- Handler unit tests cover all 12 (plus T-0007's); the coverage test's allow-list stays empty.

**From T-0012 (architect review, 2026-11-19)**: persistence as built. See T-0012's handover notes.
- **Related username.** `AuditEntry.RelatedUsername` and the indexed `audit_entries.related_username` column exist
  already (in the CP1 migration, so this task needs no migration). `AuditRecord` doesn't carry it yet: append
  `string? RelatedUsername = null` as the **last** optional parameter of `AuditRecord`, and have `AuditTrail` pass it
  to `AuditEntry.Record(..., relatedUsername: record.RelatedUsername)`. Set it to the target user's username for every
  `user.*` entry and to the grant's username for every `grant.*` entry. Leave it null for everything else. Handler
  tests assert it.
- **Keep T-0012's commit translation.** The explicit `IUnitOfWork.SaveChangesAsync` in `ConsoleDbContext` wraps the
  save and translates `DbUpdateConcurrencyException` → `ConcurrencyConflictException` and 23505 →
  `DuplicateKeyException`. Keep that wrapper around the whole new capture → dispatch → write sequence. Exceptions
  thrown by event handlers are bugs and must **not** be translated (they stay 500s). Atomicity test (b) therefore sees
  a `DuplicateKeyException` through `IUnitOfWork`.
- **Translate foreign-key races (architect ruling, T-0012 deviation 8).** Every 23503 (`foreign_key_violation`) that
  CP1 can produce is a lost race against a concurrent delete or insert. Examples: a credential is deleted while a
  grant that uses it is created; a cluster is deleted while a credential or grant is added to it. The client needs to
  do the same thing as for a stale version: reload and retry. In the same wrapper, translate
  `DbUpdateException { InnerException: PostgresException { SqlState: PostgresErrorCodes.ForeignKeyViolation } }` into
  `ConcurrencyConflictException`. Its message names the constraint and contains no values. It becomes the existing
  409 `Concurrency.Conflict`, so there is no new public error code. **Do not** translate 23001
  (`restrict_violation`, `fk_grants_users_user_id`): users are never deleted, so a 23001 is a bug and stays a 500.
  Update `ConstraintAndConcurrencyTests.DeletingCredentialStillUsedByAGrant_Fails` to expect
  `ConcurrencyConflictException`. Add a test where a grant is inserted after its credential was deleted, which also
  expects `ConcurrencyConflictException`. Update the XML docs of `ConcurrencyConflictException` and
  `ConsoleDbContext`, and the BACKEND.md Pipeline sentence on `UnitOfWorkBehavior`. The orchestrator amends contract
  §2's `Concurrency.Conflict` row to "stale `version`, or a commit-time race with a concurrent change or delete".
- **Synchronous `SaveChanges`.** The override must keep allowing saves where only `DataProtectionKey` rows are
  pending: Data Protection's EF key repository saves synchronously in its own scope, and every key creation fails
  otherwise. It must keep refusing every other pending change.
- A failed commit leaves the staged entities (including audit entries) tracked in the request's context. That is fine
  because the scope ends with the request. Don't retry a save on the same context.

## Acceptance criteria
- [x] AUD-1 / QA R5 integration tests (real Postgres, real `ConsoleDbContext` + repositories + dispatcher):
      (a) saving a `User` created via `PreCreate` writes the user and exactly one `user.created` entry in one
      transaction; (b) a failing save (duplicate username) writes neither user nor audit entry; (c) a throwing event
      handler aborts the save — nothing written; (d) a handler that raises a new event triggers the
      `InvalidOperationException`; (e) events are cleared after a successful save (second save writes no extra entry).
- [x] Unit tests per audit handler: action, category, target, cluster, actor rule, `details` JSON shape (contract §10),
      and that no `details` or summary contains token material (fingerprints only).
- [x] Coverage test green.
- [x] `AuditRecord.RelatedUsername` is set for every `user.*` and `grant.*` entry and is null otherwise (handler tests).
- [x] SQLSTATE 23503 at commit becomes `ConcurrencyConflictException`, so the behavior returns 409 `Concurrency.Conflict` (integration tests: deleting a credential that is in use; inserting a grant whose credential was deleted). 23001 is not translated.
- [x] Docs: BACKEND.md Persistence/Pipeline text matches the code (architect pre-updated it; fix drift).
- [x] Build, lint and tests green (CLAUDE.md rule 4).

## Contract amendments (orchestrator)
- Audit entries store a related-username column (target user for `user.*`, the grant's user for `grant.*`, null otherwise), indexed, so contract §10 `user` filter = actor OR related username (orchestrator 2026-11-19).

## Work log
- 2026-11-19 (backend-engineer): started in worktree; read ADR-0008/0017, contract §2/§10, BACKEND.md, T-0012 code.
- 2026-11-19 (backend-engineer): resumed after rate-limit pause (only this file had changed). Implemented
  `IDomainEventHandler<T>`, `DomainEventDispatcher` (NoOp deleted), pre-commit dispatch in `ConsoleDbContext` with the
  no-new-events assertion, 23503 → `ConcurrencyConflictException`, `AuditTrail`, `AuditRecord.RelatedUsername`, the
  four audit handlers (19 events), unit, coverage and integration tests. Build -warnaserror and all tests are green on podman.
- Edits outside `paths`, kept minimal:
  - `Domain/Common/{AggregateRoot,IDomainEvent,IHasDomainEvents}.cs`: doc comments only. They said "after the save"; the
    task asks for the AggregateRoot remarks to change.
  - `Application/Behaviors/UnitOfWorkBehavior.cs`: doc comment only (FK races, pre-commit dispatch).
  - `Infrastructure/Persistence/DesignTimeConsoleDbContextFactory.cs`: it used `NoOpDomainEventDispatcher`, which the
    task deletes. It now has a private dispatcher that throws, because EF tooling never saves.
  - `docs/architecture/BACKEND.md`: Pipeline step 6 (23503, and 23001 not translated); Persistence (never re-save a
    failed context).
  - `tests/FleetConsole.Application.Tests/ServiceProviderBuilder.cs` + one line in `AuthorizationBehaviorTests`. That
    test suite builds its container with `ValidateOnBuild`, which now validates the audit handlers → `AuditTrail` →
    `ICurrentUser`/`IClock`/`IAuditEntryRepository`. The builder registers fakes for them (`withAuditPorts`, default
    on). The one test that proves "runs with no ICurrentUser registered" opts out, and validate-on-build is off for it.
  - Existing persistence tests (`AggregateRoundTrip`, `ConstraintAndConcurrency`, `RepositoryAndReadModel`,
    `TokenProtection`) now save through `factory.Services.CreateSignedInScope()` (new `Persistence/TestSession.cs`).
    Saving an aggregate dispatches its events, and `AuditTrail` fails closed when there is no actor.
- Bug found and fixed: `AuditActor.Configuration` is a static instance, and EF maps `AuditEntry.Actor` as an
  owned type. When two entries in one save shared it, only one of them got the `actor_*` columns, and the save failed
  with a not-null violation. This showed up when several users with configuration role changes were saved in one save.
  `AuditTrail` now copies explicit actors (`record.Actor with { }`). A regression test was added for it.

## Review

## Handover notes
- **Flow:** `UnitOfWorkBehavior` → `IUnitOfWork.SaveChangesAsync` (translation wrapper) → `ConsoleDbContext.SaveChangesAsync`:
  `PendingDomainEvents.Capture` → `DomainEventDispatcher.DispatchAsync` (resolves `IDomainEventHandler<T>` from the
  scope, cached closed-generic invoker per event type) → `EnsureNoEventsRaisedSince` (throws `InvalidOperationException`
  naming the aggregate type and the new events) → `base.SaveChangesAsync` → `Clear()`.
- **Translation:** `DbUpdateConcurrencyException` and 23503 → `ConcurrencyConflictException`. The 23503 message names
  the constraint only. 23505 → `DuplicateKeyException`. 23001 and handler exceptions are not translated.
- **Actors:** `AuditTrail` uses the explicit `AuditRecord.Actor` (copied), or else `ICurrentUser`. If there is neither,
  it throws `InvalidOperationException`. **Consequence for every later task:** any code path that saves aggregates
  without a session must only raise events with explicit actors. Today that is true for the login events
  (`UserProvisioned`, `UserLoggedIn`, configuration `UserRoleChanged`), which is what T-0014 needs. Any other save
  outside an authenticated request fails closed. Integration tests that save below HTTP need
  `factory.Services.CreateSignedInScope()` (`tests/FleetConsole.Api.Tests/Persistence/TestSession.cs`).
- **Mapping choices not spelled out in the contract** (reviewer please confirm):
  - `auth.login` target is the session, with `targetId` = user id, `targetName` = username, and RelatedUsername null
    (it is not a `user.*` entry; the user is the actor).
  - Target ids are the aggregate GUIDs (`"D"` format) for user, cluster, credential and grant.
  - Details keep `null` members (e.g. `configurationSource: null`, `failedStep: null`) so each action has a stable shape.
- **Summaries:** one sentence, e.g. "Granted alice ReadOnly on prod-eu-1 via fleet-view" and "Promoted bob to
  administrator by configuration (group x)".
- **Tests:** handler tests check the exact property set of `details`, which also guards against token material. A
  reflection test checks that no event has an `EncryptedToken`, `byte[]` or `*Token*` string property. The coverage test
  `AuditCoverageTests` also checks that `AddApplication` registers the handlers. The atomicity tests (a)–(e) are in
  `Persistence/AuditAtomicityTests.cs`; (c) and (d) use `factory.WithWebHostBuilder` to add an extra handler. QA R5
  end to end across all four aggregates is in `Events/DomainEventDispatchIntegrationTests.cs`.
- **Merge:** the DI edits are one block after validator scanning in Application (does not touch T-0044's pipeline
  reorder) and one line in Infrastructure (`NoOp…` → `DomainEventDispatcher`). T-0014 may add lines next to them.
- **Follow-up suggestion (not done):** `AuditEntryRepository.Add` or `AuditEntry.Record` could defend against shared
  actor instances themselves, so callers that build `AuditEntry` directly are safe too. Today only `AuditTrail` and the
  tests build entries.
