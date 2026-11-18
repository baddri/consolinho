---
id: T-0002
title: CQRS dispatcher, behaviors, Result/Error, domain building blocks, ProblemDetails, architecture tests
status: todo
owner: backend-engineer
checkpoint: 0
depends_on: [T-0001]
paths: [src/FleetConsole.Domain, src/FleetConsole.Application, src/FleetConsole.Api, tests/]
review_rounds: 0
---

## Goal
Implement the CQRS core and DDD building blocks exactly as described in `docs/architecture/BACKEND.md` and ADR-0002,
so later features only add folders.

## Scope
- Domain/Common: `Entity<TId>`, `AggregateRoot<TId>` (domain event collection: `RaiseDomainEvent`, `DomainEvents`,
  `ClearDomainEvents`), `IDomainEvent`, `Error` (Code, Message, `ErrorType`), `Result`/`Result<T>` (Success/Failure,
  implicit conversions from value and Error, `ValidationError` carrying field errors), `Guard` helpers.
  (Result/Error live in Domain so aggregates can return them.)
- Application/Abstractions/Messaging: `IRequest<T>`, `ICommand`, `ICommand<T>`, `IQuery<T>`, `IRequestHandler<,>`,
  `IPipelineBehavior<,>`, `RequestHandlerDelegate<T>`, `IDispatcher` + `Dispatcher` (cached per-request-type wrapper,
  behaviors in registration order), marker interfaces `IRequireAuthenticated`, `IRequireRole`, `IMutatingCommand`.
- Application/Abstractions: ports `IUnitOfWork`, `IClock`, `ICurrentUser` (interfaces only; implementations later).
- Behaviors: `LoggingBehavior`, `ValidationBehavior` (FluentValidation → `Result` failure, never throws),
  `UnitOfWorkBehavior` (commands only; calls `IUnitOfWork.SaveChangesAsync` after successful handler).
  (Authorization & ReadOnlyGuard behaviors come in CP1 with users.)
- `AddApplication()` DI extension: scans handlers + validators, registers behaviors in documented order.
- Api: `ResultExtensions.ToHttpResult()` / `ToProblemDetails()` mapping ErrorType → status (Validation 400 with `errors`
  dictionary, Unauthorized 401, Forbidden 403, NotFound 404, Conflict 409, Failure 500); global exception handler →
  500 ProblemDetails without leaking exception details outside Development.
- Tests: dispatcher ordering, handler-not-found, validation behavior, unit-of-work only for commands, Result mapping,
  architecture tests (reflection or NetArchTest.Rules — check license is permissive) enforcing BACKEND.md dependency rules.

## Acceptance criteria
- [ ] Spec CP0 criteria 2, 3, 4 satisfied with tests
- [ ] Every public type/member has meaningful XML docs
- [ ] Build + tests green

## Work log

## Review

## Handover notes
