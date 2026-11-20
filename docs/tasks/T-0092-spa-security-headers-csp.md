---
id: T-0092
title: Security headers (CSP, nosniff, Referrer-Policy, frame protection, COOP) on every Api response
status: todo
owner: backend-engineer
checkpoint: 3
depends_on: [T-0098]
paths: [src/FleetConsole.Api/Http/SecurityHeadersMiddleware.cs, src/FleetConsole.Api/Program.cs, tests/FleetConsole.Api.Tests/Integration/Http/]
review_rounds: 0
---

## Goal
SECURITY.md § HTTP requires security headers, and the Api sends none. With CP3 the Api serves the SPA (T-0098), so
the headers land now. Filed from the T-0077 review; spec HOST-3 (backend part), QG-2. The browser-side check that
Monaco works under the CSP is **T-0104** (frontend).

## Scope
- In: one middleware setting the ADR-0029 headers on every response; integration tests.
- Out: reporting endpoint; HSTS (Route, ADR-0030); the Playwright CSP check (T-0104).

## Contract / design notes (ADR-0029 — the CSP string is a contract, copy it exactly)
- `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`,
  `Cross-Origin-Opener-Policy: same-origin`.
- `Api/Http/SecurityHeadersMiddleware.cs` (+ `UseSecurityHeaders()` extension), values as `public const string`s with
  XML docs explaining each relaxation; registered right after `app.UseExceptionHandler()`. Set the headers in
  `Response.OnStarting` with indexer assignment (overwrite), so proxied Kubernetes responses (YARP copies upstream
  headers) and exception/status-code-page responses carry our values. Applies in all environments.
- T-0099 edits Program.cs at the same time (start/run section); your change is one line near the top of the pipeline.

## Context pack
- Docs: ADR-0029; SECURITY.md § HTTP (already updated).
- Exemplar: `src/FleetConsole.Api/Http/CsrfHeaderMiddleware.cs` (middleware + extension + XML-doc style);
  pipeline: `src/FleetConsole.Api/Program.cs:L49-61`.
- Tests: `tests/FleetConsole.Api.Tests/Integration/Hosting/ProductionHost.cs` (T-0098: Production host with a temp web
  root holding `index.html` + `assets/app-3f2a1b.js`); proxy exemplar with the fake apiserver:
  `tests/FleetConsole.Api.Tests/Integration/Proxy/` (one existing GET-forwarding test as the pattern);
  `Integration/CsrfHeaderTests.cs` (a 403 problem response); `Integration/ExceptionPipelineTests.cs` (500 response).

## Acceptance criteria
- [ ] All five headers, CSP byte-for-byte equal to the contract, on: `index.html` (direct + fallback), a hashed
      asset, an `/api` JSON response, a 403 CSRF problem, a 500 problem, `/alive`, and a proxied Kubernetes response
      whose upstream sent its own `Content-Security-Policy` (ours wins).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
