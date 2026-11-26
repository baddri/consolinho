---
id: T-0402
title: Rate-limit login start and OAuth callback per client IP (429 + audit once per window)
status: todo
owner: backend-engineer
checkpoint: 6a
depends_on: [T-0400]
paths: [src/FleetConsole.Api/Http/RateLimiting, src/FleetConsole.Api/Program.cs, src/FleetConsole.Api/appsettings.json, src/FleetConsole.Application/Auth, tests/FleetConsole.Api.Tests/Integration/Auth, tests/FleetConsole.Application.Tests/Auth, docs/architecture/BACKEND.md, docs/ops/RUNBOOK.md]
review_rounds: 0
size: M (1 d)
---

## Goal
Anonymous login endpoints are the cheapest way to load the host OAuth server through us (spec RL-1, RL-3). Limit them
per client IP, answer 429 with `Retry-After`, audit once per window.

## Scope
- In: `RateLimitingOptions` (shared section for T-0403), `AuthRateLimitMiddleware`, audit command, tests, docs.
- Out: proxy mutations (T-0403); metrics counter (T-0407 adds `fleetconsole.rate_limit.rejections` at the one
  rejection helper you create here — leave a `// T-0407` free seam, not a TODO comment: just keep rejection in one method).

## Contract / design notes
ADR-0042 §4, §6.
- Config `RateLimiting:Login:PermitLimit` (int ≥ 1, default 20), `RateLimiting:Login:Window` (TimeSpan 1 s–1 h, default
  `00:01:00`). `src/FleetConsole.Api/Http/RateLimiting/RateLimitingOptions.cs` with nested `Login` (T-0403 adds
  `ProxyMutations`), validated on start (messages name keys).
- `AuthRateLimitMiddleware` (`UseAuthRateLimit()` extension) placed **after `UseCsrfHeaderCheck`/static files and
  before `UseAuthentication`** in `Program.cs`. Applies only when `Path` equals `/api/auth/login` or
  `OpenShiftOAuthOptions.CallbackPathValue` (shared limit, one partition per IP). `PartitionedRateLimiter.Create<HttpContext, string>`
  with `RateLimitPartition.GetFixedWindowLimiter(ip, …QueueLimit = 0, AutoReplenishment = true)`; key = 
  `RemoteIpAddress?.ToString() ?? "unknown"`. Singleton limiter, disposed with the app.
- Rejection response: **429** ProblemDetails, `code` `Auth.RateLimited`, title "Too many sign-in attempts", detail
  without IP; header `Retry-After` = whole seconds to the window end (`RateLimitLease.TryGetMetadata(MetadataName.RetryAfter)`,
  fallback window length). Write via the app's ProblemDetails service (see `FleetSetup.WriteBusyAsync` L72).
  Browser note: login is a full-page navigation; the SPA's login page handles `?error=` only — a raw 429 JSON page is
  acceptable for an abuser; document it.
- Audit: command `Application/Auth/RecordLoginRateLimited/{Command,Handler}.cs` — `AuditRecord` action
  `auth.rate_limited` (add to `AuthAuditActions`), `Actor = AuditActor.Anonymous("anonymous")`, `TargetType.Session`,
  target name "login", summary "Sign-in rate limit reached", details `{ permitLimit, windowSeconds }` (no IP in details —
  T-0401 stores `clientIp`). Dispatch only for the **first** rejection of a partition in a window: track per IP the
  window start in an `IMemoryCache` entry with absolute expiry = window (per pod; accepted by ADR-0042 §6). Audit failure
  is logged at Error and never changes the 429.
- BACKEND.md: new § "Rate limiting" (under § The proxy or Hosting) listing all limiter policies (fleet-status,
  login; T-0403 adds proxy-mutations) — RL-4. RUNBOOK: "Rate limits" tuning subsection (keys, symptoms, LB/PROXY note).

## Context pack
- Docs: ADR-0042 §4/§6; BACKEND.md § Fleet status (limiter text L225-238) for the existing policy.
- Exemplars: `src/FleetConsole.Api/Fleet/FleetSetup.cs:AddFleetStatus` (L41-70 limiter + options validation), `:WriteBusyAsync` (L72);
  `src/FleetConsole.Application/Auth/LogOut/LogOutHandler.cs` (an auth audit command through `IAuditTrail`).
- Touch points: `src/FleetConsole.Api/Program.cs` (pipeline between `UseSpaStaticFiles` and `UseAuthentication`),
  `src/FleetConsole.Application/Auth/AuthAuditActions.cs`, `src/FleetConsole.Domain/Audit/AuditActor.cs:Anonymous` (L49).
- Tests: copy `tests/FleetConsole.Api.Tests/Integration/Fleet/FleetStatusLimiterTests.cs` (factory with tiny limits via
  config); login flow helpers `ApiFactory.RunLoginAsync` / `LoginAsAsync` (`tests/FleetConsole.Api.Tests/Integration/ApiFactory.cs` L189-240).
  Set the remote IP per request (T-0400's test helper) to prove two IPs have separate budgets (RL-3).

## Acceptance criteria
- [ ] RL-1: (limit+1)th login start or callback from one IP within the window → 429 `Auth.RateLimited` + `Retry-After`;
      exactly one `auth.rate_limited` audit entry per IP per window (test with limit 2).
- [ ] RL-3: another IP (via trusted XFF) is unaffected (test); spoofed XFF from an untrusted peer does not change partition.
- [ ] Other `/api/auth/*` routes (`me`, `logout`) are not limited; options validated on start.
- [ ] BACKEND.md § Rate limiting + RUNBOOK tuning; build + tests green.

## Work log

## Review

## Handover notes
