---
id: T-0044
title: Run ReadOnlyGuard before Validation in the CQRS pipeline
status: todo
owner: backend-engineer
checkpoint: 1
depends_on: [T-0011]
paths: [src/FleetConsole.Application/DependencyInjection.cs, src/FleetConsole.Application/Behaviors/, tests/FleetConsole.Application.Tests/, docs/architecture/BACKEND.md]
review_rounds: 0
---

## Goal
Contract §7 check order (orchestrator ruling 2026-11-19, from T-0023 review): CSRF → 401 → Forbidden → ReadOnly →
field validation. Today the pipeline runs Validation before ReadOnlyGuard, so a read-only admin sending an invalid body
gets 400 instead of 403 `Auth.ReadOnly`. Move `ReadOnlyGuardBehavior` before `ValidationBehavior`.

## Scope
- In: registration order in `AddApplication()`; XML docs/remarks mentioning the order; `AddApplicationTests` order
  assertion; a new behavior-level test: read-only user + invalid mutating command → `Auth.ReadOnly`, validator not run.
  BACKEND.md pipeline list.
- Out: anything else.

## Acceptance criteria
- [ ] Order is Logging → Authorization → ReadOnlyGuard → Validation → UnitOfWork, documented in BACKEND.md and code
- [ ] Test proves read-only beats validation; existing tests green
- [ ] Build + tests green

## Work log

## Review

## Handover notes
