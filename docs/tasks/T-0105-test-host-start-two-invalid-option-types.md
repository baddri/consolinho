---
id: T-0105
title: In-process test that a real host start reports two invalid option types at once
status: todo
owner: backend-engineer
checkpoint: 6
depends_on: [T-0099, T-0100]
paths: [tests/FleetConsole.Api.Tests]
review_rounds: 0
---

## Goal
`ConsoleHostRunner` runs `IStartupValidator.Validate()` before `StartAsync` (T-0100 fix) so that two invalid option
types (e.g. missing `Console:PublicOrigin` + missing DP certificate) both get a Critical line and exit code 1. Today only
`scripts/check-image.sh` step 7 covers this path; add an in-process test (filed by the T-0100 review).

## Context pack
- `src/FleetConsole.Api/Hosting/ConsoleHostRunner.cs` (`TryGetConfigurationFailures`, the pre-start validate call).
- `tests/FleetConsole.Api.Tests/Integration/Hosting/ProductionConfigurationTests.cs` (two-failure test via validator).
- Gotcha (T-0094): don't assert on exceptions thrown from WebApplicationFactory host *start* — it races. Exercise the
  runner directly (e.g. build the app without WAF, or test the runner method with a fake host).

## Acceptance criteria
- [ ] A test fails if the pre-start `Validate()` call is removed (both failures no longer reported).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
