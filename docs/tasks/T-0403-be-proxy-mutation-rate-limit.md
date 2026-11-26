---
id: T-0403
title: Rate-limit proxy mutations per user (token bucket); reads/watches/logs never limited
status: todo
owner: backend-engineer
checkpoint: 6a
depends_on: [T-0402]
paths: [src/FleetConsole.Api/Http/RateLimiting, src/FleetConsole.Api/Proxy, src/FleetConsole.Api/appsettings.json, tests/FleetConsole.Api.Tests/Proxy, tests/FleetConsole.Api.Tests/Integration/Proxy, docs/architecture/BACKEND.md, docs/architecture/SECURITY.md, docs/ops/RUNBOOK.md]
review_rounds: 0
size: M (1 d)
---

## Goal
A runaway script or stuck UI loop can fire mutations at a cluster fast. Limit mutations (incl. exec/attach upgrades) per
user, never reads or streams (spec RL-2, RL-3, RL-4; Q4).

## Scope
- In: `RateLimiting:ProxyMutations` options, `proxy-mutations` endpoint policy, `KubernetesProxyEndpoint.TryClassify`
  extraction, 429 mapping, tests, docs.
- Out: auth limit (T-0402, done before this); metrics (T-0407).

## Contract / design notes
ADR-0042 §5–6.
- Config `RateLimiting:ProxyMutations:TokenLimit` (30), `:TokensPerPeriod` (30), `:ReplenishmentPeriod` (`00:00:10`);
  add to T-0402's `RateLimitingOptions` + validator.
- Extract from `KubernetesProxyEndpoint.HandleAsync` (L83-98) an
  `internal static bool TryClassify(HttpContext context, string cluster, out ProxyRequest? request)` (split raw target,
  `ProxyPath.TryParse`, `IsUpgradeRequest`, `ProxyRequest.Create`); `HandleAsync` uses it (behaviour unchanged, Origin
  check stays in the handler).
- Register policy `ProxyMutationsRateLimitPolicy = "proxy-mutations"` via `AddRateLimiter` (same `RateLimiterOptions`
  as fleet-status — `AddRateLimiter` is additive; verify `OnRejected` composition: set rejection per policy with
  `AddPolicy<TPolicy>` implementing `IRateLimiterPolicy<string>.OnRejected`, so fleet's 503 stays as is). Partition:
  route value `cluster` + `TryClassify` → not mutation / unparsable → `GetNoLimiter`; else
  `GetTokenBucketLimiter(userId)` (`SessionClaims` user id; QueueLimit 0, AutoReplenishment true). Map on the proxy
  route: `.RequireRateLimiting(...)` in `MapKubernetesProxy` (L42).
- Rejection: 429 ProblemDetails `Proxy.RateLimited`, title "Too many changes", detail "Wait a few seconds and retry.",
  `Retry-After`. One Warning log per user per window (`ProxyLog`, user id + cluster only), **no audit entry**: amend
  SECURITY.md § Audit ("rate-limited requests are not forwarded and not audited; see metrics").
- RL-4: BACKEND.md § Rate limiting lists all three policies with keys/defaults; fleet limiter untouched (its tests green).

## Context pack
- Touch points: `src/FleetConsole.Api/Proxy/KubernetesProxyEndpoint.cs:HandleAsync` (L59-100), `:MapKubernetesProxy` (L42),
  `src/FleetConsole.Api/Proxy/ProxyProblems.cs` (write helper), `src/FleetConsole.Api/Proxy/ProxyLog.cs` (LoggerMessage pattern),
  `src/FleetConsole.Api/Fleet/FleetSetup.cs` (L50-70 policy registration), `src/FleetConsole.Api/Auth/SessionClaims.cs` (user id claim).
- Mutation rule (do not re-implement): `src/FleetConsole.Application/Proxy/Requests/ProxyRequest.cs:Create` (L67-90, `IsMutation`).
- Tests: copy `tests/FleetConsole.Api.Tests/Integration/Proxy/ProxyMutationVerbTests.cs` (fake upstream `tests/FleetConsole.Api.Tests/Fakes/FakeKubeApiServer.cs`; streams: `ProxyLogStreamTests.cs`)
  — limit 2 tokens: 3rd PATCH → 429; meanwhile GET list, `?watch=1` and `log?follow=true` keep working; second user unaffected;
  exec upgrade counts as mutation; SSAR POST does not.

## Acceptance criteria
- [ ] RL-2: mutations/exec over budget → 429 `Proxy.RateLimited` + `Retry-After`, nothing forwarded; reads, watches,
      log streams, SSAR/SSRR never limited (tests).
- [ ] RL-3: one user's burst does not throttle another (test).
- [ ] RL-4: fleet-status limiter unchanged (existing tests green); BACKEND.md lists every policy; RUNBOOK tuning updated.
- [ ] Build + tests green.

## Work log

## Review

## Handover notes
