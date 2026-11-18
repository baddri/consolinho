---
id: T-0004
title: EF Core persistence, OpenAPI, system info query, integration test harness, AppHost web wiring
status: done
owner: backend-engineer
checkpoint: 0
depends_on: [T-0001, T-0002, T-0003]
paths: [src/, tests/, Directory.Packages.props, web/package.json]
review_rounds: 2
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
  Endpoints return the typed unions from `ResultExtensions.ToHttpResult()` (`Results<Ok<T>, ProblemHttpResult>` etc.)
  so success schemas are emitted automatically. Error responses are documented **once** on the `/api` group:
  `.ProducesValidationProblem()` (400) and `.ProducesProblem(...)` for 401/403/404/409/500 (T-0002 review round 2).
  Ignore `IHasDomainEvents.DomainEvents` in the EF model (a convention over all aggregates; T-0002 review nit 5).
- AppHost: add the Vite app (`Aspire.Hosting.JavaScript` `AddViteApp("web", "../../web")` or the Aspire 13 equivalent),
  `.WithReference(api).WaitFor(api)`; ensure `npm install` runs (or document it).
- tests/FleetConsole.Api.Tests: `ApiFactory : WebApplicationFactory<Program>` + Postgres Testcontainer (podman via
  DOCKER_HOST), xUnit collection fixture, helper to create `HttpClient`. Tests: `/api/system/info` 200 shape; unknown
  `/api/x` → 404 ProblemDetails; `/openapi/v1.json` contains the system info path with a typed 200 schema and the group-level ProblemDetails responses.
- Regenerate `web/src/shared/api/schema.gen.ts` from the real document (`npm run gen:api` against a running Api or
  by fetching the document in a test/script) so FE types match.

## Acceptance criteria
- [x] Spec CP0 criteria 5, 6, 7 satisfied (5: integration-tested; 6: `ConsoleDbContext` + `Initial` migration +
  Development auto-migrate, integration-tested; 7: verified manually with `dotnet run --project src/FleetConsole.AppHost
  --launch-profile http` on podman — see work log)
- [x] Integration tests run green against Testcontainers Postgres on podman
- [x] Build + tests green (backend and `web` build still passes)

## Work log
- 2026-11-18 (backend-engineer): status → in_progress. Read CLAUDE.md, BACKEND.md, FRONTEND.md, SECURITY.md, the CP0
  spec, T-0001/T-0002/T-0003 review + handover notes, `web/vite.config.ts`, `web/scripts/gen-api.mjs`.
- 2026-11-18: Packages (central, all MIT/Apache-2.0): Aspire.Npgsql.EntityFrameworkCore.PostgreSQL 13.6.5,
  EFCore.NamingConventions 10.0.1, Microsoft.EntityFrameworkCore.Design 10.0.14 (Api only, PrivateAssets=all),
  Microsoft.AspNetCore.OpenApi 10.0.14, Aspire.Hosting.JavaScript 13.6.5, Microsoft.AspNetCore.Mvc.Testing 10.0.14,
  Testcontainers.PostgreSql 4.17.0. Local tool manifest `.config/dotnet-tools.json` with dotnet-ef 10.0.14 (the SDK
  created it at the repo root; moved to `.config/`). `dotnet list package --vulnerable --include-transitive` → none.
- 2026-11-18: Application: ports `IDomainEventDispatcher`, `IReadModel` (empty placeholder), `IAppEnvironment`;
  use case `SystemInfo/GetSystemInfo/` (`GetSystemInfoQuery`, internal sealed `GetSystemInfoHandler`, `SystemInfoDto`).
  **Deviation: folder/namespace `SystemInfo`, not `System`** — `FleetConsole.Application.System` would shadow the BCL
  `System` namespace for all Application code (e.g. the existing `<see cref="System.Diagnostics.ActivitySource"/>` in
  `ApplicationDiagnostics.cs` would stop resolving). Application.Tests' `ServiceProviderBuilder` now registers a
  `FakeAppEnvironment`, since `ValidateOnBuild` validates every scanned handler.
- 2026-11-18: Infrastructure: `Persistence/ConsoleDbContext` (public sealed; snake_case; `ApplyConfigurationsFromAssembly`;
  history table renamed `__ef_migrations_history`; explicit `IUnitOfWork.SaveChangesAsync`; overrides
  `SaveChangesAsync(bool, ct)` to capture aggregates with events **before** saving (deleted aggregates are detached
  afterwards), then clear + dispatch after a successful save; sync `SaveChanges` throws `NotSupportedException`),
  `PendingDomainEvents`, `Conventions/IgnoreDomainEventsConvention` (IEntityTypeAddedConvention over all
  `IHasDomainEvents`), `DesignTimeConsoleDbContextFactory`, `DevelopmentDatabaseMigrator` (hosted service, Development
  only), `ReadModel` placeholder, `Events/NoOpDomainEventDispatcher`, `Time/SystemClock`, `DependencyInjection.AddInfrastructure(IHostApplicationBuilder)`.
  Migration `Initial` (empty model) in `Persistence/Migrations` + a nested `.editorconfig` marking that folder
  `generated_code = true` (generated migrations otherwise fail IDE0161 under -warnaserror).
  **Deviation: `AddDbContext` + `EnrichNpgsqlDbContext` instead of `AddNpgsqlDbContext`.** Aspire's
  `AddNpgsqlDbContext` registers a *pooled* context, which can't take the scoped `IDomainEventDispatcher` the task asks
  the context to use. Enrich adds the same Aspire extras (retries, health check, logging, telemetry). The connection
  string is still `ConnectionStrings:consoledb`, read lazily when the first context is created.
- 2026-11-18: Finding on review nit 5 (T-0002): EF Core 10 does **not** map `AggregateRoot.DomainEvents` even without an
  ignore (its element type is an interface, so no navigation is discovered; model builds fine). The convention is kept
  as an explicit, discovery-independent guarantee; docs say so, and `PersistenceModelTests` proves the convention is
  what records the ignore (design-time model, separate context types because EF caches models per context type).
- 2026-11-18: Api: `Endpoints/ApiEndpoints.MapApiEndpoints()` creates the `/api` group with `ProducesValidationProblem()`
  + `ProducesProblem(401/403/404/409/500)` and calls `MapSystemEndpoints()`; `Endpoints/SystemEndpoints.cs`
  (`GET /api/system/info`, operationId `GetSystemInfo`, returns `Results<Ok<SystemInfoDto>, ProblemHttpResult>`);
  `Hosting/HostAppEnvironment` (Api assembly informational version + host environment); `OpenApi/OpenApiSetup`
  (`AddOpenApi`: schema ids drop a `Dto` suffix so the FE keeps `components['schemas']['SystemInfo']`; document
  transformer removes `servers` — the generator otherwise emits the requesting host, e.g. `http://localhost:5180/`;
  no `/api` server). Program: `AddInfrastructure`, `UseStatusCodePages()` (bodiless 404/405 → ProblemDetails),
  `MapOpenApi()` **in Development only** (same as the health endpoints; decision for review, see handover),
  `public partial class Program`.
- 2026-11-18: Finding: .NET 10 copies XML doc comments of endpoint handlers and DTOs into the OpenAPI document (it
  overrode `.WithSummary()`, and `&lt;…&gt;` showed up escaped in descriptions). Rewrote those docs for API consumers,
  moved implementation notes to `//` comments, and added a test guarding it.
- 2026-11-18: AppHost: `AddViteApp("web", "../../web").WithReference(api).WaitFor(api)`; resource name `api` kept
  (comment explains it's the contract for `services__api__*` in `web/vite.config.ts`). AddViteApp adds a
  `web-installer` resource that runs `npm install` before the dev server (observed in the Aspire log), so no manual step.
- 2026-11-18: Tests: Api.Tests `Integration/` — `ApiFactory` (WebApplicationFactory<Program> + Testcontainers
  `docker.io/library/postgres:18.3`, Development env, `ConnectionStrings:consoledb` via `UseSetting`,
  `CreateApiClient()`), `ApiCollectionDefinition` (collection fixture; named so to satisfy CA1711),
  `SystemEndpointsTests` (200 shape; `/health` incl. DB check, `/alive`), `ProblemDetailsTests` (`/api/x` → 404
  problem+json with instance/traceId; 405 → problem+json), `OpenApiDocumentTests` (operationId, typed 200 `$ref`
  SystemInfo, group-level 400/401/403/404/409/500 problem schemas, no `servers`, consumer-facing docs + `required`),
  `DatabaseTests` (Initial applied, nothing pending, snake_case history table). `Persistence/PersistenceModelTests`
  (convention, `PendingDomainEvents` order/clear/capture-time, sync SaveChanges throws). Application.Tests:
  `GetSystemInfoHandlerTests` (handler + through the dispatcher).
- 2026-11-18: AppHost verification (podman, `--launch-profile http`): postgres:18.3 container started, `consoledb`
  migrated (`__ef_migrations_history` row `20261118130314_Initial`), api healthy, `web-installer` finished, Vite got
  `services__api__http__0=http://localhost:5180`; `GET <vite>/api/system/info` → 200
  `{"version":"1.0.0+1aa4e22…","environment":"Development"}`, `<vite>/` serves the SPA, `<vite>/api/x` → 404
  ProblemDetails. Not done: loading the SPA in a real browser (proxy path verified with curl). All processes stopped
  afterwards (SIGTERM; see gotchas).
- 2026-11-18: `API_URL=http://localhost:5180 npm run gen:api` regenerated `web/src/shared/api/schema.gen.ts` from the
  running Api (now also has ProblemDetails/HttpValidationProblemDetails schemas and the error responses).
  `dotnet ef migrations has-pending-model-changes` → none.
- 2026-11-18: Checks: `dotnet build FleetConsole.slnx -warnaserror --no-incremental` → 0 warnings/0 errors;
  `dotnet test FleetConsole.slnx` (DOCKER_HOST=podman socket, TESTCONTAINERS_RYUK_DISABLED=true) → 123 passed
  (Domain 35, Application 35, Api 53, incl. 15 Testcontainers integration tests); `cd web && npm run lint && npm run
  typecheck && npm test -- --run && npm run build` → all pass (34 tests; existing >500 kB chunk warning).
  Status → in_review.
- 2026-11-18 (backend-engineer, review round 1 fixes): **Required 1:** `Api/Http/JsonSetup.AddApiJson()` sets
  `JsonNumberHandling.Strict` via `ConfigureHttpJsonOptions` (XML doc explains why: web defaults' AllowReadingFromString
  documents every integer as `integer | string` → `number | string` in `schema.gen.ts`); called from Program.cs.
  `OpenApiDocumentTests.Integers_AreDocumentedAsStrictNumbers` asserts `status` is `["null","integer"]` with no
  `pattern`, for ProblemDetails and HttpValidationProblemDetails (mutation-checked: fails without `AddApiJson()`).
  **Optional nit:** `OpenApi/SchemaNamingTests` checks that `Dto`-stripped names in the Application/Api exported types
  are unique and don't collide with another exported type name. Regenerated `web/src/shared/api/schema.gen.ts`
  against the AppHost-run Api (`API_URL=http://localhost:5180 npm run gen:api`) → `status?: null | number`; AppHost
  stopped afterwards, no processes or containers left. Architect's BACKEND.md edits untouched.
  Checks: `dotnet build FleetConsole.slnx -warnaserror` → 0 warnings/0 errors; `dotnet test FleetConsole.slnx` (podman)
  → 126 passed (Domain 35, Application 35, Api 56); `cd web && npm run lint && npm run typecheck && npm test -- --run &&
  npm run build` → pass (34 tests; existing chunk-size warning). Status → in_review.

## Review

### Round 1 — 2026-11-18 (backend-architect): CHANGES_REQUESTED

Checks run by reviewer (podman env set): `dotnet build FleetConsole.slnx -warnaserror` → 0 warnings, 0 errors;
`dotnet test FleetConsole.slnx` → 123 passed (Domain 35, Application 35, Api 53, incl. Testcontainers integration);
`cd web && npm run typecheck && npm run build` → pass (existing >500 kB chunk warning only).

Very solid work: layering is clean, the persistence plumbing is careful (capture-before-save is the right call), the
integration harness is reusable as-is, and the docs are accurate and written for the right audience. One required change,
which is my ruling on question 8 below, not a defect in what was asked.

**Required**

1. `src/FleetConsole.Api/Program.cs:18` (JSON setup) — the API uses ASP.NET's web JSON defaults
   (`JsonNumberHandling.AllowReadingFromString`). That documents every integer as `number | string` in the OpenAPI
   document, and it will spread to every CP1 DTO in `schema.gen.ts`. Decision: **strict number handling API-wide, now**,
   while the only affected schema is ProblemDetails. Fix: `builder.Services.ConfigureHttpJsonOptions(o =>
   o.SerializerOptions.NumberHandling = JsonNumberHandling.Strict)`, placed in a small `Api/Http` extension (e.g.
   `AddApiJson()`, with an XML doc saying why) and called from Program.cs. Add an `OpenApiDocumentTests` case asserting
   `ProblemDetails.status` is `["null","integer"]` (no `"string"`), then regenerate `web/src/shared/api/schema.gen.ts`
   (`status?: null | number`). I checked this locally: the schema becomes `{"type":["null","integer"],"format":"int32"}`
   and all integration tests still pass.

**Rulings on the engineer's deviations and decisions**

1. `AddDbContext` + `EnrichNpgsqlDbContext` instead of pooled `AddNpgsqlDbContext`: **accepted.** Pooling can't take a
   scoped dependency, and Enrich keeps the Aspire extras (the `/health` DB check test proves it). Consequence recorded in
   BACKEND.md: Enrich turns on retrying execution, so explicit transactions must run inside an execution strategy.
2. `Application/SystemInfo/` instead of `System/`: **accepted.** The rule "never name a feature folder after a BCL root
   namespace" is now in BACKEND.md.
3. `/openapi/v1.json` in Development only: **keep it.** Its only consumers (gen:api, integration tests) run in
   Development, and production gains nothing from publishing the API surface. If a production consumer ever appears,
   that's a SECURITY.md change, not a one-line toggle. Recorded in BACKEND.md.
4. `Dto` suffix stripped, `servers` removed, group-level problem responses, `UseStatusCodePages()`: **all accepted**
   and recorded in BACKEND.md. Two constraints added there: never have both `Foo` and `FooDto` in the contract
   (the schema ids would collide), and the CP2 proxy route must turn status-code pages off per request
   (`IStatusCodePagesFeature`) so upstream kube-apiserver responses pass through unchanged.
5. Explicit `IgnoreDomainEventsConvention`: **accepted.** The test that proves the convention is what records the ignore
   (not EF's own discovery) is good.
6. XML docs flowing into OpenAPI: **accepted as a convention.** Consumer-facing docs on handlers and DTOs, `//` comments
   for implementation notes, recorded in BACKEND.md. The guard test is worth keeping.
7. SaveChanges ordering (capture before save, clear and dispatch after success) and sync `SaveChanges` throwing:
   **accepted.** Dispatch is post-commit and in-process, so a crash between commit and dispatch loses the events. That's
   fine with the no-op dispatcher. The first event-driven feature (audit, CP1) must decide between that and an outbox,
   recorded in BACKEND.md. The handover's follow-up (an integration test of context → dispatcher with the first real
   aggregate) stands.
8. `ProblemDetails.status` typed `null|number|string`: **set strict now.** See Required 1.

**ADR-0007 (OpenShift OAuth + DevOAuth emulator) compatibility:** no conflicts. The AppHost has the `var api = ...`
handle, so a `devoauth` project resource can be added and referenced from `api` without restructuring. `ApiFactory`
configures the host via `UseSetting`, so the CP1 in-process emulator can plug in the same way. `UseStatusCodePages()`
gives 401 challenges on `/api` a ProblemDetails body, which is what the SPA wants. Note for CP1 design (not this task):
the OAuth callback should live under `/api/auth/...` so the Vite dev proxy (which only forwards `/api`) delivers it.

**Optional nits (no action required)**

- `/api/system/info` is anonymous and returns the full commit SHA. That's fine for now. The CP1 auth task should decide
  explicitly whether it stays anonymous (e.g. for the login page footer) and note it in SECURITY.md.
- `OpenApiSetup`: a duplicate schema id after stripping `Dto` would currently fail silently. A test that every schema id
  is unique would be cheap insurance once there are more DTOs.

Reviewer edits: `docs/architecture/BACKEND.md` (new "HTTP API and OpenAPI" section; Persistence and use-case conventions
from this task).

### Round 2 — 2026-11-18 (backend-architect): APPROVE

Checks run by reviewer (podman env set): `dotnet build FleetConsole.slnx -warnaserror` → 0 warnings, 0 errors;
`dotnet test FleetConsole.slnx` → 126 passed (Domain 35, Application 35, Api 56); `cd web && npm run typecheck && npm run
build` → pass.

Required 1 is resolved. `Api/Http/JsonSetup.AddApiJson()` sets `JsonNumberHandling.Strict`, its XML doc explains why,
and Program.cs calls it. `Integers_AreDocumentedAsStrictNumbers` asserts `["null","integer"]` with no `pattern` for both
problem schemas. `schema.gen.ts` now has `status?: null | number`. The optional schema-name uniqueness test was added too
(`OpenApi/SchemaNamingTests.cs`).

Side effect the engineer flagged (request bodies with quoted numbers now get 400): **intended and accepted.** The SPA
sends typed numbers (zod), and a strict contract is the point. That 400 comes from body binding with no body of its own;
`UseStatusCodePages` gives it a ProblemDetails body. Recorded in BACKEND.md.

Optional (no action): `SchemaNamingTests` compares CLR type names in the Application and Api assemblies. That matches
how schema ids are built today for non-generic DTOs. If generic or nested contract types appear, assert on the generated
document's schema ids instead.

## Handover notes
- **Done:** everything in Scope. Where things live: Application `Abstractions/{IDomainEventDispatcher,IReadModel,IAppEnvironment}.cs`,
  `SystemInfo/GetSystemInfo/`; Infrastructure `DependencyInjection.cs`, `Persistence/` (context, conventions,
  migrations, migrator, design-time factory), `Events/`, `Time/`; Api `Endpoints/` (`ApiEndpoints` = the `/api` root,
  one `<Feature>Endpoints.cs` per feature), `OpenApi/OpenApiSetup.cs`, `Hosting/HostAppEnvironment.cs`;
  tests `tests/FleetConsole.Api.Tests/Integration/` (reuse `ApiFactory` via `[Collection(ApiCollectionDefinition.Name)]`).
- **Deviations (for review):**
  1. `AddDbContext` + `EnrichNpgsqlDbContext` instead of `AddNpgsqlDbContext` (pooling vs. the scoped event dispatcher).
  2. Use case folder `Application/SystemInfo/` instead of `Application/System/` (namespace would shadow `System`).
     Rule of thumb for future features: never name a feature folder after a BCL root namespace.
  3. `/openapi/v1.json` is mapped in Development only (like `/health` and `/alive`). Gen:api and the tests run in
     Development, so nothing needs it elsewhere today; if the architect wants it in every environment, delete the
     `IsDevelopment()` guard in Program.cs. Decide together with the CP3 health-probe follow-up.
  4. OpenAPI schema names drop a `Dto` suffix; `servers` is removed from the document.
- **Adding a use case endpoint now:** handler returns `Result<T>` → endpoint method returns
  `Task<Results<Ok<T>, ProblemHttpResult>>` via `ToHttpResult()`, `.WithName("<OperationId>")`; map it from the feature's
  `Map<Feature>Endpoints()` and call that from `ApiEndpoints.MapApiEndpoints()`. Then `npm run gen:api` against a
  running Api. Error responses are already documented by the group.
- **Not done / follow-ups:**
  - `ConsoleDbContext.SaveChangesAsync` → dispatcher wiring is only covered indirectly (the `PendingDomainEvents`
    helper is unit-tested); add an integration test with the first real aggregate (CP1).
  - `IReadModel`/`ReadModel` are empty placeholders; the first query over persisted data adds `IQueryable` members.
  - (Resolved in review round 1: JSON number handling is strict API-wide, `AddApiJson()`; quoted numbers in request
    bodies are now rejected with 400.)
  - Not checked in a real browser: the SPA footer calling `/api/system/info` (proxy path verified with curl).
- **Gotchas:**
  - XML doc comments on endpoint handler methods and DTOs (summary/param) are published in `/openapi/v1.json` and in
    `schema.gen.ts`, and they override `.WithSummary()`. Write them for API consumers; avoid `&lt;`/`&gt;` (shows up
    escaped); keep implementation notes in `//` comments.
  - EF Core caches the model per DbContext *type*: test contexts that vary configuration need distinct types.
  - Migrations: `dotnet tool restore` then `dotnet ef migrations add <Name> -p src/FleetConsole.Infrastructure
    -s src/FleetConsole.Api -o Persistence/Migrations` (uses the design-time factory; no DB needed). EF 10 throws on
    startup if the model has changes without a migration (PendingModelChangesWarning), which is a useful guard.
  - Integration tests need the podman env vars; without `DOCKER_HOST` Testcontainers fails at fixture start.
    They share one database: tests that write must use unique data.
  - Stopping a backgrounded AppHost: `dotnet run` → `aspire run` (CLI bundle) → AppHost → dcp. Non-interactive
    background jobs ignore SIGINT, so send SIGTERM to the AppHost/aspire processes; dcp then removes the Postgres
    container (the data volume stays).
  - Vite's port is assigned by Aspire per run (seen 28036, 28720); the Api's stable proxied port is 5180 (http).
