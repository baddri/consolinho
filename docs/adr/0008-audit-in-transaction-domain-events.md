# 0008 — Audit entries written in the same transaction via pre-commit domain event handlers
**Status:** Accepted (2026-11-18)

## Context
Spec CP1 AUD-1 requires every successful admin command to write exactly one audit entry per affected object,
**atomically** with the change: no change without its entry, no entry without its change (Q9). CLAUDE.md requires
cross-cutting concerns (audit is one) to live in one place, not in every handler.

CP0 (T-0004) built domain event dispatch as **post-commit, in-process**: `ConsoleDbContext.SaveChangesAsync` saves,
then hands the collected events to `IDomainEventDispatcher` (no-op today). A crash between commit and dispatch loses
the events, so post-commit audit violates AUD-1. Options considered:

| Option | Verdict |
|---|---|
| Post-commit event handlers (current plumbing) | Rejected: a crash or handler failure after commit loses the entry. |
| Transactional outbox + background worker | Rejected: solves "reliably trigger an *external* side effect". Audit is a row in the same database; an outbox would add a table, a worker and retries to end up writing that same row. |
| Explicit `audit.Add(...)` calls in each handler | Rejected as the main mechanism: copy-pasted, easy to forget, and the aggregate already knows exactly what changed. |
| Database triggers | Rejected: no actor/correlation context, logic hidden from the code base. |
| **Pre-commit domain event handlers in the same unit of work** | **Chosen.** |

## Decision
1. **Dispatch moves before the write.** `ConsoleDbContext.SaveChangesAsync` now: captures pending events from tracked
   `IHasDomainEvents` aggregates → calls `IDomainEventDispatcher.DispatchAsync` → handlers add entities (audit entries)
   to the **same** context → `base.SaveChangesAsync` writes the aggregate changes and the audit entries in **one**
   database transaction (EF wraps a single `SaveChanges` in a transaction) → only after success, events are cleared.
   If the write fails, nothing is persisted; the request scope (and its context) is discarded.
2. **Handler contract** (`IDomainEventHandler<TEvent>` in `Application/Abstractions/Events`): runs in the request's
   DI scope, may only *stage* changes in the unit of work (e.g. `IAuditTrail.Record`), must not call
   `SaveChangesAsync`, must not do network I/O, and must not raise further domain events. The context asserts the last
   rule: if aggregates have new pending events after dispatch, it throws `InvalidOperationException` (no cascades).
3. **Audit composition in one place.** `IAuditTrail` (Application port, implemented in Application by `AuditTrail`)
   fills actor (from `ICurrentUser`, or an explicit `AuditActor` such as `AuditActor.Configuration`), timestamp
   (`IClock`), correlation id (`Activity.Current?.TraceId`) and appends an `AuditEntry` through `IAuditEntryRepository`.
   Event → entry mapping lives in `Application/Audit/EventHandlers/` (one handler class per feature area).
4. **Non-state events** that change no aggregate (login denied, logout, testing an unsaved token) are recorded by
   their command handler with an explicit `IAuditTrail.Record(...)`. They are still written by the
   `UnitOfWorkBehavior` save, so such commands return a **successful** `Result` describing the outcome (e.g. a login
   "denied" outcome is a success value, not an `Error`), otherwise nothing is saved.
5. **Coverage is enforced by a test:** a reflection test asserts every concrete `IDomainEvent` in the Domain assembly
   has an audit handler (or is listed in an explicit, commented "not audited" allow-list).
6. **Post-commit side effects** (cache invalidation, CP6) are a future, separate stage
   (`IPostCommitDomainEventHandler`, at-most-once, best effort). Not built in CP1.

## Consequences
- AUD-1 holds by construction; a broken audit mapping fails the command (fail-closed), which is the desired behaviour.
- The audit write adds one INSERT per affected object to the command's transaction — negligible at admin-action rates.
- `IDomainEventDispatcher`'s documented semantics change from "after a durable save" to "before the write, same
  transaction". BACKEND.md (Pipeline step 6, Persistence) is updated; the no-op dispatcher is replaced by
  `Infrastructure/Events/DomainEventDispatcher` resolving `IDomainEventHandler<T>` from the scope.
- Proxy mutation audit (CP2) is not a domain event of an aggregate; it will use `IAuditTrail` from a proxy response
  observer with its own small save. That is a CP2 design point, not changed here.
