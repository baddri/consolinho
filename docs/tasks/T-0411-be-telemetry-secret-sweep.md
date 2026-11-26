---
id: T-0411
title: Telemetry secret sweep — no OAuth code/state, tokens or cookies in spans, logs or metrics
status: todo
owner: backend-engineer
checkpoint: 6a
depends_on: [T-0403, T-0407]
paths: [src/FleetConsole.ServiceDefaults, src/FleetConsole.Api/Hosting, tests/FleetConsole.Api.Tests/Admin/TokenLeakSweepTests.cs, tests/FleetConsole.Api.Tests/Security, tests/FleetConsole.Api.Tests/Support/TokenLeakScanner.cs]
review_rounds: 0
size: M (1 d)
---

## Goal
Prove (and fix where needed) that telemetry never carries secrets (spec SEC-1, SEC-2): OAuth `code`/`state` in the
callback query, SA tokens, session cookies, `Authorization` headers.

## Contract / design notes
- Test harness: an `ActivityListener` on all sources + `ApiFactory.Logs` + a `MeterListener`, run over: full login
  (start → DevOAuth/fake callback → session), proxy GET/mutation, a watch, WebSocket exec (`ProxyKestrelTests` L63-189
  pattern), a login 429 and a proxy 429. Scan every tag value, event, log message/state/scope with `TokenLeakScanner`
  plus the literal `code` and `state` values of the run.
- Expected fix site: ASP.NET instrumentation records `url.query` on `/api/auth/callback`. Add
  `AddAspNetCoreInstrumentation(o => o.EnrichWithHttpRequest …)` or a filter in ServiceDefaults that redacts `url.query`
  (and `url.full`/`http.target` if present) for `/api/auth/*` only; document why (proxy queries such as
  `labelSelector` are useful for debugging and not secret).
  HttpClient instrumentation for the OAuth token exchange: ensure no request body/headers are recorded.
- Extend `TokenLeakSweepTests.NoToken_InAnyResponse_AuditEntry_DatabaseRow_OrLogLine` coverage list to the 429 and
  WebSocket paths rather than duplicating the scanner.

## Context pack
- `src/FleetConsole.ServiceDefaults/Extensions.cs:ConfigureOpenTelemetry` L62-89.
- `tests/FleetConsole.Api.Tests/Support/TokenLeakScanner.cs`, `Admin/TokenLeakSweepTests.cs`, `ApiFactory.Logs`, `RunLoginAsync`.

## Acceptance criteria
- [ ] SEC-1: no span/log/metric contains the OAuth code, state, SA token, cookie value or `Authorization` value across the listed flows (test).
- [ ] SEC-2: callback span keeps route/status but `url.query` is redacted (test).
- [ ] Build + tests green.

## Work log

## Review

## Handover notes
