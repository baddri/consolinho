---
id: T-0098
title: Production hosting — SPA static files + fallback, cache headers, probes in every environment, safe JSON logs
status: todo
owner: backend-engineer
checkpoint: 3
depends_on: []
paths: [src/FleetConsole.Api/Program.cs, src/FleetConsole.Api/Hosting/, src/FleetConsole.Api/appsettings.json, src/FleetConsole.ServiceDefaults/Extensions.cs, tests/FleetConsole.Api.Tests/Integration/Hosting/, tests/FleetConsole.Api.Tests/Integration/AnonymousSurfaceTests.cs, tests/FleetConsole.Api.Tests/Integration/SystemEndpointsTests.cs]
review_rounds: 0
---

## Goal
Make the Api ready to run as the single production container (ADR-0006/0026): serve the built SPA with deep-link
fallback and correct caching, expose liveness/readiness in Production, and guarantee that request URLs (OAuth
`code`/`state`) never reach the logs. Spec: HOST-1, HOST-2, HOST-5, PRB-1, PRB-2, QG-2 (for these IDs).

## Scope
- In: static files + SPA fallback; cache headers; probes mapped in all environments; request-line log cap in code;
  JSON console logs outside Development; Production-host test helper reused by T-0099/T-0092.
- Out: security headers (T-0092), config validation / migrate mode / DP cert (T-0099), Containerfile (T-0100).

## Contract / design notes (ADR-0028 §1, §2, §4, §5)
- **Static + fallback** (`Api/Hosting/SpaHosting.cs`, e.g. `app.UseSpaStaticFiles()` + `app.MapSpaFallback()`):
  `UseStaticFiles` (web root = `wwwroot`, absent under `aspire run` → inert) placed after `UseCsrfHeaderCheck` and
  before `UseAuthentication`; fallback = `MapFallbackToFile("index.html")` restricted to **GET/HEAD**, paths **not**
  starting with segment `/api` (case-insensitive, same rule as `CsrfHeaderMiddleware`) and without a file extension
  (`{*path:nonfile}`), `.AllowAnonymous()`. Unknown `/api/**` (any method) stays ProblemDetails 404 via
  `UseStatusCodePages`; `/assets/missing.js` → 404.
- **Caching**: `StaticFileOptions.OnPrepareResponse` — `index.html` → `Cache-Control: no-cache`; path under `/assets/`
  → `public, max-age=31536000, immutable`. The fallback-served `index.html` must also carry `no-cache` (it goes
  through the same static file pipeline; assert it).
- **Probes**: `ServiceDefaults.Extensions.MapDefaultEndpoints` maps `/health` and `/alive` in every environment (drop
  the `IsDevelopment` guard; update its XML doc + the remark on `AddDefaultHealthChecks`). Default writer (status word
  only). Must not require auth (check the endpoint metadata against the fallback policy, if any) and are outside
  `/api` so CSRF never applies.
- **Logging** (`Api/Hosting/LoggingSetup.cs`, called from Program outside Development):
  `builder.Logging.AddJsonConsole(o => { o.UseUtcTimestamp = true; o.IncludeScopes = false; })`, and
  `services.PostConfigure<LoggerFilterOptions>(...)` that adds a `LoggerFilterRule(providerName, "Microsoft.AspNetCore.Hosting.Diagnostics", LogLevel.Warning, null)`
  for `providerName = null` and for every distinct non-null `ProviderName` already in `options.Rules`. Explain in
  the XML doc why (rule selection prefers provider-specific rules). Confirm OTel ASP.NET Core 1.17 redacts
  `url.query` by default (comment, no code).
- Update the stale comment above `MapOpenApi` in Program (OpenAPI stays Development-only; decision: unchanged in CP3).
- **Test helper** `Integration/Hosting/ProductionHost.cs`: from the shared `ApiFactory`,
  `WithWebHostBuilder(b => { b.UseEnvironment("Production"); b.UseSetting(WebHostDefaults.WebRootKey, <temp dir>); })`
  with a temp web root containing `index.html` (`<div id="root"></div>`) and `assets/app-3f2a1b.js`; disposes the
  temp dir. ApiFactory already adds `TestHostConfiguration.Offline()` outside Development (T-0099 will add the DP
  certificate there — keep the helper going through ApiFactory so it picks that up).

## Context pack
- Docs: ADR-0028; ADR-0012 (anonymous surface); BACKEND.md § Hosting & deployment (CP3).
- Touch points: `src/FleetConsole.Api/Program.cs:L47-72` (pipeline order); `src/FleetConsole.ServiceDefaults/Extensions.cs:L106-150`
  (`AddDefaultHealthChecks`, `MapDefaultEndpoints`); `src/FleetConsole.Api/Http/CsrfHeaderMiddleware.cs:L35,L61` (the
  `/api` segment rule to mirror); `src/FleetConsole.Api/appsettings.json` (Logging defaults stay).
- Tests: `tests/FleetConsole.Api.Tests/Integration/ApiFactory.cs:L282-330` (`ConfigureWebHost`, Production → Offline
  settings, `Logs` = `CapturedLogs`); `Integration/ExceptionPipelineTests.cs:L100-110` (`WithWebHostBuilder` +
  `UseEnvironment` exemplar); `Integration/SystemEndpointsTests.cs:HealthEndpoints_AreHealthy`;
  `Integration/AnonymousSurfaceTests.cs:L15-40` (add `/health`, `/alive` and the fallback to the expected anonymous
  set, with an ADR-0028 reference); `Identity/IdentityTestHost.cs:CapturedLogs`; `Integration/TokenLeakScanner.cs`.
- PRB-2 test: a Production host variant with an unreachable connection string (e.g. `Host=127.0.0.1;Port=1`) →
  `/alive` 200, `/health` 503.

## Acceptance criteria
- [ ] HOST-1: Production host — `GET /c/x/k8s/ns/a/pods/b` and `GET /` → 200 `text/html` index; `HEAD` too;
      `GET /api/nope` and `POST /api/nope` (with CSRF header) → 404 `application/problem+json`; `GET /assets/missing.js` → 404;
      `/health`/`/alive` are never answered by the fallback.
- [ ] HOST-2: `index.html` (direct and via fallback) `no-cache`; `/assets/app-3f2a1b.js` `public, max-age=31536000, immutable`.
- [ ] PRB-1: Production `/alive` and `/health` → 200 body `Healthy`, anonymous, no CSRF header needed, no check names.
- [ ] PRB-2: with Postgres unreachable `/alive` 200 and `/health` 503.
- [ ] HOST-5: Production host with `Logging:LogLevel:Default=Trace` **and** a provider-specific override enabling
      `Microsoft.AspNetCore.Hosting.Diagnostics` at Trace → a request to `/api/auth/callback?code=fake-code-123&state=s`
      leaves no captured log containing `fake-code-123`; JSON console formatter active in Production (options assertion).
- [ ] Anonymous-surface test updated; XML docs on new public types; Development behaviour unchanged (`aspire run`).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
