---
id: T-0004
title: EF Core persistence, OpenAPI, system info query, integration test harness, AppHost web wiring
status: todo
owner: backend-engineer
checkpoint: 0
depends_on: [T-0001, T-0002, T-0003]
paths: [src/, tests/, Directory.Packages.props, web/package.json]
review_rounds: 0
---

## Goal
Make the backend real end to end: database, first query endpoint, OpenAPI for FE type generation, and an
integration-test harness every later API task reuses.

## Scope
- Infrastructure: `ConsoleDbContext` (snake_case via `EFCore.NamingConventions`, applies configurations from assembly),
  implements `IUnitOfWork` (dispatches domain events after save — via an `IDomainEventDispatcher` port, no-op impl for now),
  `IReadModel` placeholder, `SystemClock : IClock`. `AddInfrastructure(IHostApplicationBuilder)` using Aspire
  `AddNpgsqlDbContext<ConsoleDbContext>("consoledb")`. Initial migration `Initial` (empty model or a `__schema_info` is fine).
  Development-only auto-migrate on startup (hosted service or startup step, documented).
- Application: `System/GetSystemInfo` query → `SystemInfoDto(string Version, string Environment)` (version from
  assembly informational version). Port `IAppEnvironment` if needed.
- Api: `Endpoints/SystemEndpoints.cs` → `GET /api/system/info` via dispatcher; built-in `AddOpenApi()` + `MapOpenApi()`
  at `/openapi/v1.json`; endpoint group convention `app.MapGroup("/api")` + per-feature `Map<Feature>Endpoints()` extension.
- AppHost: add the Vite app (`Aspire.Hosting.JavaScript` `AddViteApp("web", "../../web")` or the Aspire 13 equivalent),
  `.WithReference(api).WaitFor(api)`; ensure `npm install` runs (or document it).
- tests/FleetConsole.Api.Tests: `ApiFactory : WebApplicationFactory<Program>` + Postgres Testcontainer (podman via
  DOCKER_HOST), xUnit collection fixture, helper to create `HttpClient`. Tests: `/api/system/info` 200 shape; unknown
  `/api/x` → 404 ProblemDetails; `/openapi/v1.json` contains the system info path.
- Regenerate `web/src/shared/api/schema.gen.ts` from the real document (`npm run gen:api` against a running Api or
  by fetching the document in a test/script) so FE types match.

## Acceptance criteria
- [ ] Spec CP0 criteria 5, 6, 7 satisfied
- [ ] Integration tests run green against Testcontainers Postgres on podman
- [ ] Build + tests green (backend and `web` build still passes)

## Work log

## Review

## Handover notes
