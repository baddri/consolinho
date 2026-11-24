---
id: T-0323
title: Fleet endpoint — GET /api/fleet/status NDJSON, pod-wide concurrency limiter (Fleet.Busy), Fleet options, metrics, OpenAPI, docs
status: todo
owner: backend-engineer
checkpoint: 5c
depends_on: [T-0321, T-0322]
paths: [src/FleetConsole.Api/Endpoints/FleetEndpoints.cs, src/FleetConsole.Api/Endpoints/ApiEndpoints.cs, src/FleetConsole.Api/Fleet/, src/FleetConsole.Api/Program.cs, src/FleetConsole.Api/appsettings.json, tests/FleetConsole.Api.Tests/Integration/Fleet/, web/src/shared/api/schema.gen.ts, docs/architecture/BACKEND.md, docs/architecture/SECURITY.md]
review_rounds: 0
---

## Goal
Expose the fleet stream (contract `docs/specs/CP5-api-contract.md` §2, ADR-0041 §1, §5, §6) with the pod-wide bound,
validated configuration and observability wiring, publish the line schema in OpenAPI, regenerate FE types, and
document the new conventions.

## Scope
- In: endpoint + NDJSON result, rate limiter, `Fleet` options binding/validation, `AddMeter`, appsettings defaults,
  integration + OpenAPI tests, `npm run gen:api`, BACKEND.md/SECURITY.md sections.
- Out: anything in Application/Infrastructure fleet code (T-0320..0322; bugs found → note, fix only if trivial and in scope).

## Contract / design notes
- `GET /api/fleet/status`, `RequireAuthorization()` (any active user), `.RequireRateLimiting("fleet-status")`,
  `.Produces<FleetClusterStatusDto>(200, "application/x-ndjson")`, `.ProducesProblem(503)`; tag `Fleet`.
- Handler: dispatch `GetFleetStatusQuery`; failure → ProblemDetails as usual (before any byte). Success → a small
  `NdjsonResult<T>(IAsyncEnumerable<T>)` `IResult` in `Api/Fleet/`: sets `Content-Type: application/x-ndjson`,
  `Cache-Control: no-store`, serializes each item with the app's `JsonOptions` (camelCase, enum strings) + `\n`, and
  **flushes after each line**; enumerates with `HttpContext.RequestAborted`; client abort ends quietly (no error log).
- Limiter: `AddRateLimiter` with a named policy `fleet-status` = `PartitionedRateLimiter` with **one global partition**
  `ConcurrencyLimiter(PermitLimit = Fleet:MaxConcurrentRequests, QueueLimit = Fleet:RequestQueueLimit, OldestFirst)`;
  `OnRejected` → 503 ProblemDetails `code: Fleet.Busy` + `Retry-After: 5` (reuse the ProblemDetails factory the other
  error paths use). `app.UseRateLimiter()` **after** `UseAuthorization` (Program.cs L86) so anonymous → 401 first.
  The permit is held for the whole stream (endpoint limiter semantics) — that is the intent.
- Options: bind `FleetOptions` from `Fleet`, `.Validate(o => o.IsValid(), FleetOptions.ValidationMessage)
  .ValidateOnStart()` in an `Api/Fleet/FleetSetup.cs` mirroring `Api/Proxy/ProxySetup.cs` L25. Add the five defaults
  to `appsettings.json`.
- Metrics: register `ApplicationDiagnostics.MeterName` with OpenTelemetry `WithMetrics(m => m.AddMeter(...))` next to
  the ActivitySource registration (Program.cs ~L53).
- OpenAPI: assert the operation's 200 response has `application/x-ndjson` with a `$ref` to `FleetClusterStatusDto` and
  the enum schemas are camelCase strings. Then `cd web && npm run gen:api` (Api running in Development) and commit the
  regenerated `schema.gen.ts` in this task's diff.
- Docs: BACKEND.md — short "Fleet status (ADR-0041)" section (stream shape, probe service, bounds, config keys) and a
  one-line exception note in §Recipes › Caching a query (fan-out services call `IQueryCache` directly; why).
  SECURITY.md — fleet probes use the user's winning grant token through the proxy pool and policy chain; cache keyed
  by credential; no upstream text in lines; limiter as DoS bound.

## Context pack
- Exemplar endpoint: `src/FleetConsole.Api/Endpoints/ClustersEndpoints.cs:L18-40` (dispatch + Result → HTTP, OpenAPI metadata).
- Touch points: `Api/Endpoints/ApiEndpoints.cs:L45` (add `api.MapFleetEndpoints();`); `Api/Program.cs:L53` (meter),
  `L85-86` (pipeline order); `Api/Proxy/ProxySetup.cs:L25` (options validation pattern);
  `ServiceDefaults/Extensions.cs:L71` (`WithMetrics`); existing OpenAPI tests under `tests/FleetConsole.Api.Tests/` (grep `openapi`).
- Test helpers: `ApiFactory.LoginAsAsync` (L237), `ConfigureTestServices` (L356, override `Fleet:*` and swap
  `IClusterHealthReader` with a gate-controlled fake for limiter tests); `TestData.UserAsync` (L44), `GrantAsync` (L163),
  `ProxyClusterAsync` (L193) + `FakeKubeApiServer` helpers from T-0322 for a real end-to-end line.

## Acceptance criteria
- [ ] Anonymous → 401; deactivated → 401; user with no grants → 200 empty body, `application/x-ndjson`, `no-store`.
- [ ] Two granted clusters (one OpenShift fake, one closed port) → two lines; one `failure: "unreachable"`, the other
      full facts; JSON is camelCase with string enums; first line readable before a delayed third cluster finishes.
- [ ] Limiter: `MaxConcurrentRequests=1, RequestQueueLimit=0`, first request held by a gated fake → second gets 503
      `Fleet.Busy` + `Retry-After: 5`; anonymous request while saturated still gets 401.
- [ ] Invalid `Fleet:*` config fails start-up (one test like the Proxy options test).
- [ ] OpenAPI test green; `schema.gen.ts` regenerated; BACKEND.md + SECURITY.md updated.
- [ ] `scripts/check-be.sh` green (and `scripts/check-fe.sh` still typechecks with the new schema).

## Work log

## Review

## Handover notes
