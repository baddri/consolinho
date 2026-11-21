---
id: T-0094
title: "label: bug — flaky DevOAuthConfigurationTests.InvalidConfiguration_FailsAtStartup (duplicate Name)"
status: done
owner: backend-engineer
checkpoint: 3
depends_on: []
paths: [tests/FleetConsole.Api.Tests/DevOAuth/]
review_rounds: 0
---

## Goal
Make the test deterministic. During CP2 VERIFY it failed once in 4 runs: `InvalidConfiguration_FailsAtStartup(key:
"DevOAuth:Users:1:Name", value: "admin", expectedMessage: "duplicate Name 'admin'")` reported "`factory.CreateClient()`
should throw". That was a full `scripts/check-be.sh` run while `check-fe.sh` ran in parallel (log
`.git/checks/20261120-233609-37214/be-test.log`). It passed 3/3 in isolation and in the earlier full run.

## Suspected location
The test overrides one array element with `UseSetting`. It depends on base configuration (DevOAuth users from
appsettings or user secrets) and on options validation running at startup. Possible causes are shared host state, or
configuration-source ordering under load. Check whether `ValidateOnStart` always runs before `CreateClient` returns.

## Context pack
- CP3 quality gate QG-1. Runs in parallel with every other CP3 task (own path only).
- Start at `tests/FleetConsole.Api.Tests/DevOAuth/` (`grep -n InvalidConfiguration_FailsAtStartup`) and the options
  registration in `src/FleetConsole.DevOAuth/Configuration/DevOAuthOptions.cs` (`SectionName = "DevOAuth"`; find its
  `ValidateOnStart` with `grep -rn "DevOAuthOptions" src/FleetConsole.DevOAuth --include=*.cs`). Read-only outside
  the test folder; if the root cause is in `src/FleetConsole.DevOAuth/`, record it and ask the orchestrator to widen
  `paths` before changing it.
- Loop: `for i in $(seq 20); do dotnet test tests/FleetConsole.Api.Tests --no-build --filter "FullyQualifiedName~DevOAuth" | tail -1; done`
  while a full `scripts/check-be.sh` runs in another shell.

## Acceptance criteria
- [x] Root cause in the work log; the test passes 20/20 in a loop under a parallel full suite.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-21 backend-engineer: Root cause: the failing run threw `ObjectDisposedException`, not a config issue. WAF runs the
  minimal-hosting entry point on its own thread; when `ValidateOnStart` fails inside `app.RunAsync()`, that thread disposes
  the host, sometimes before `DeferredHost.StartAsync` resolves `IHostApplicationLifetime` from it. This is a framework race.
  Fix: the test removes `IStartupValidator` from the host (the host starts cleanly), then runs the captured validator itself.
  Proof: 25/25 loop runs pass while the full solution suite runs in parallel; `check-be.sh` passes.

## Review
- 2026-11-21 orchestrator: APPROVE (test-only; race analysis sound; validator still taken from Program.cs registration).

## Handover notes
- Only `tests/FleetConsole.Api.Tests/DevOAuth/DevOAuthConfigurationTests.cs` changed. No product code changed.
- The test still covers shipped appsettings.json + override, binding, and the `ValidateOnStart` registration made through
  Program.cs (it asserts the `IStartupValidator` descriptor exists). Only the caller of `Validate()` differs: the test
  calls it instead of `Host.StartAsync`.
- General rule for other WAF tests: never assert on exceptions thrown from host *start* (`StartAsync`/`RunAsync`).
  Exceptions thrown before `Build()` (e.g. `NonDevelopmentEnvironment_RefusesToStart`) do not race.
