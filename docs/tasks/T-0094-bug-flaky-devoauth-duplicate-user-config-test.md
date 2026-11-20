---
id: T-0094
title: "label: bug — flaky DevOAuthConfigurationTests.InvalidConfiguration_FailsAtStartup (duplicate Name)"
status: todo
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
- [ ] Root cause in the work log; the test passes 20/20 in a loop under a parallel full suite.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
