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

## Acceptance criteria
- [ ] Root cause in the work log; the test passes 20/20 in a loop under a parallel full suite.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
