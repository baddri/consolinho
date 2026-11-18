---
id: T-0044
title: Run ReadOnlyGuard before Validation in the CQRS pipeline
status: done
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
- [x] Order is Logging → Authorization → ReadOnlyGuard → Validation → UnitOfWork, documented in BACKEND.md and code
- [x] Test proves read-only beats validation; existing tests green
- [x] Build + tests green

## Work log
- 2026-11-19 backend-engineer: started. Move ReadOnlyGuardBehavior ahead of ValidationBehavior per contract §7 check order.
- 2026-11-19 backend-engineer: swapped registration in `AddApplication()` (ReadOnlyGuard now before Validation);
  updated `<remarks>` in `DependencyInjection.cs` and `ReadOnlyGuardBehavior.cs`, BACKEND.md pipeline list (steps 3/4
  swapped, contract §7 order cited). Tests: `AddApplicationTests` order assertion updated; the old
  `..._ReturnsValidationErrorsFirst` test inverted to `MutatingCommand_ReadOnlyAdminWithInvalidInput_ReturnsReadOnlyWithoutRunningValidator`
  plus a writable-admin control test. The test validator `AdminMutatingCommandValidator` now records "validator" in
  `CallLog` so "validator not run" is asserted directly. `dotnet build -warnaserror` clean; `dotnet test`: 323 Domain,
  74 Application, 260 Api (Testcontainers via podman) all passed.

## Review
- 2026-11-19 backend-architect: **APPROVE** (round 1).
  - Registration order, `AddApplication()` remarks, `ReadOnlyGuardBehavior` remarks and BACKEND.md §pipeline all agree:
    Logging → Authorization → ReadOnlyGuard → Validation → (Caching) → UnitOfWork, matching contract §7 check order.
    Anonymous still gets 401 first (`IMutatingCommand` ⊂ `IRequireAuthenticated`), non-admin 403 `Auth.Forbidden` first.
  - Tests: order assertion updated; inverted test asserts `Auth.ReadOnly` with validator and handler not run (validator
    now logs to `CallLog`, resolved via the singleton in `ServiceProviderBuilder`); writable-admin control test proves
    the validator is actually wired. `ValidationBehaviorTests` unaffected.
  - Checks (run by reviewer): `dotnet build FleetConsole.slnx -warnaserror` 0 warnings/0 errors; `dotnet test`
    323 Domain / 74 Application / 260 Api passed.
  - Reviewer doc fix: handover note pointed the endpoint-level test at T-0013/T-0014 (audit, login); corrected to
    T-0016 and added the criterion there.
  - Optional nit: none.

## Handover notes
- Pipeline is now Logging → Authorization → ReadOnlyGuard → Validation → (Caching) → UnitOfWork.
- No Api-level integration test was added (out of scope: paths limit to Application). Admin endpoint tasks
  (T-0016, the first admin command endpoint; captured as an acceptance criterion there) should add an endpoint test: read-only admin + invalid body → 403 `Auth.ReadOnly`. Model-binding 400s
  (malformed JSON) still precede this, as the contract says.
- T-0011's task file still records the old order in its review section; historical, left untouched.
