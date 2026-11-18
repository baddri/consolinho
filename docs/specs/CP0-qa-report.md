# CP0 — Foundations: QA report

**Date:** 2026-11-18 · **Branch:** `cp/0-foundations` @ `dc5aff8` (plus the uncommitted QA tests listed below) ·
**Spec:** `docs/specs/CP0-foundations.md` · **Verdict:** all 9 criteria **met**. One minor, non-blocking defect (T-0006).

## Checks run

| Command | Result |
|---|---|
| `dotnet build FleetConsole.slnx -warnaserror` | 0 warnings, 0 errors |
| `dotnet test FleetConsole.slnx` (podman env vars set) | Domain 35, Application 35, Api 67 (56 existing + 11 QA): all pass |
| `cd web && npm run lint && npm run typecheck && npm test -- --run && npm run build` | lint/typecheck clean; 42 tests (34 existing + 8 QA) pass; build OK (warning: 573 kB chunk, already tracked in T-0003) |
| Fresh `git clone` in a scratch directory, then backend build + test, and `npm ci` + all FE scripts | all green (criterion 1 "clean clone") |
| `aspire start --launch-profile http && aspire wait web`, then probes, then `aspire stop` | all resources Healthy; stopped cleanly; no leftover processes or containers |

## Traceability

| # | Criterion | Evidence | Verdict |
|---|---|---|---|
| 1 | Build `-warnaserror` + `dotnet test` pass on a clean clone (podman) | Fresh clone of `cp/0-foundations`: 0 warnings, 126/126 tests pass; Testcontainers Postgres on podman | **Met** |
| 2 | Projects/references match BACKEND.md; architecture test fails if Domain references anything or Application references Infra/Api | `ArchitectureTests` (8). **Mutation probe** in a scratch clone: Domain using `ILogger`, and Application using ASP.NET Core `HttpContext`, made `Domain_ReferencesOnlyTheBaseClassLibrary` and `Application_ReferencesOnly…` fail. **Gap found:** a *declared but unused* package reference in Domain passed (compiled references only). Closed with new `ProjectFileArchitectureTests` (4, csproj-level), which fails on that mutation. Application→Infrastructure/Api cannot be built at all (project cycle), so the test is a second line of defence. csproj graph checked by hand against the BACKEND.md table. | **Met** (gap closed by QA test) |
| 3 | Dispatcher runs behaviors in registration order; ValidationBehavior returns a validation `Result` with field errors | `DispatcherTests.Send_RunsBehaviorsInRegistrationOrder_AroundTheHandler` (before/after nesting), `AddApplicationTests.AddApplication_RegistersBehaviorsInDocumentedOrder` (real Logging→Validation→UoW order), `ValidationBehaviorTests` (field errors merged per field, handler skipped, warnings don't block, value-less `Result`, fail-fast on non-Result requests) | **Met** |
| 4 | `Result` errors → RFC 9457 ProblemDetails with 400/401/403/404/409/500 | `ResultExtensionsTests.Failure_IsWrittenAsProblemDetails_WithMappedStatus` (all 6 statuses, `application/problem+json`, type/title/detail/code/instance/traceId), `ValidationError_IncludesCamelCasedErrorsDictionary` (`errors` shape). Edge probes: `ProblemDetailsTests` (404, 405). **New** `ExceptionPipelineTests`: an unhandled exception through the real host returns a 500 ProblemDetails with no `detail`, exception type, message or stack frames in Production, and includes detail in Development. 404/405 are ProblemDetails in Production, with `status`/`instance`/`traceId`. Manual: proxied 404/405 bodies via Vite are ProblemDetails. | **Met** |
| 5 | `/health`, `/alive`, `/openapi/v1.json`, `GET /api/system/info` as CQRS query, integration-tested on Testcontainers Postgres | `SystemEndpointsTests` (200, exactly `version`+`environment`; `/health` includes the DB check), `OpenApiDocumentTests` (operationId, typed schema, group-level problem responses), `GetSystemInfoHandlerTests`. Manual under Aspire: `/health` and `/alive` 200 `Healthy`; `/openapi/v1.json` served; `/api/system/info` 200. | **Met** (see risk R1) |
| 6 | `ConsoleDbContext` snake_case + initial migration; migrations applied on startup in Development | `DatabaseTests` (Initial applied, none pending; `__ef_migrations_history` exists). **New** `NamingConventionTests`: `ConsoleDbContext.ConfigureProvider` maps tables, columns and PK to snake_case (existing tests only covered the history table name). **New** `ExceptionPipelineTests.OutsideDevelopment_DatabaseMigratorIsNotRegistered` / `InDevelopment_…IsRegistered`. | **Met** |
| 7 | `aspire run` starts Postgres (podman), Api, Vite; SPA loads and calls `/api/system/info` through the Vite proxy | Independently reproduced: `aspire describe` showed api, consoledb, postgres and web Running/Healthy. `curl` on Vite port `/api/system/info` returned 200 with the same body as the Api. SPA `index.html` and the deep link `/c/prod-eu-1/ns/default/pods` return 200 HTML. A headless Firefox load of `/c/prod-eu-1/overview` rendered the shell with the version footer, and `aspire otel spans api` recorded the browser's `GET /api/system/info`. `aspire stop`: no dcp/Api/Vite processes and no containers remain. | **Met** (cosmetic defect T-0006) |
| 8 | PF6 shell (switcher, user menu, OCP-like nav, `/c/:cluster/...`, `/admin/...`, 404); scripts pass; ESLint forbids `any` and cross-feature internals; MSW test; `gen:api` | `AppShell.test.tsx` (7), `router.test.tsx` (routes, redirects, admin, login, 404s), `system.test.tsx` + `client.test.ts` (MSW). **ESLint probe** with temporary files (since removed): `any`, `document.querySelector`, a feature importing another feature's internal file (alias **and** relative path), and shared importing a feature all error. Importing through `index.ts` is allowed. **gen:api**: run against the live Api, it regenerated `schema.gen.ts` with zero diff; with the Api down it exits 1 and leaves the file intact. **New** FE tests: shared `apiClient` sends `X-Console-Request: 1` on POST/PUT/PATCH/DELETE (the existing tests covered only the helper and GET), requests are same-origin, and `SystemInfoFooter` loading, ProblemDetails-error and network-error states render. | **Met** |
| 9 | README: setup (podman socket, env vars), `aspire run`, tests, links to CLAUDE.md/docs | README sections Prerequisites, podman socket and env vars, Run everything, Tests and checks, gen:api, migrations, Repository map, Further reading. All relative links resolve. The commands in it were the ones used in this verification. | **Met** |

## Tests added by QA (uncommitted)
- `tests/FleetConsole.Api.Tests/ProjectFileArchitectureTests.cs`: csproj-level layer rules (closes the unused-reference blind spot).
- `tests/FleetConsole.Api.Tests/Integration/ExceptionPipelineTests.cs`: end-to-end 500 without leaks (Production) / with detail (Development); 404/405 ProblemDetails in Production; migrator registered only in Development.
- `tests/FleetConsole.Api.Tests/Persistence/NamingConventionTests.cs`: snake_case tables/columns/keys through `ConfigureProvider`.
- `web/src/shared/api/client.test.ts` (extended): CSRF header on mutating verbs through `apiClient`; same-origin requests.
- `web/src/app/layout/SystemInfoFooter.test.tsx`: loading / ProblemDetails error / network error states.

## Defects

| Task | Severity | Owner | Summary |
|---|---|---|---|
| T-0006 | Minor (cosmetic), **non-blocking** | frontend-engineer | Sidebar version footer clips the 40-char commit SHA at the sidebar edge; no way to see the full value. |

No blocking defects.

## Risks / notes for later checkpoints (not CP0 defects)
- **R1:** `/health`, `/alive` and `/openapi/v1.json` are mapped in Development only. Production probes need a decision (already in HANDOVER, CP3). The Production tests above confirm the current behaviour.
- **R2:** The backend does not enforce the `X-Console-Request` CSRF header or any auth yet (SECURITY.md). Only the FE side exists. CP1 must add the `/api` group filter, with a test that a non-GET without the header gets 4xx ProblemDetails.
- **R3:** `GET /api/system/info` is anonymous and returns the full commit SHA. That is minor information disclosure; decide it together with the open CP1 question "does system/info stay anonymous".
- **R4:** The local Aspire CLI/DCP is 13.6.4. The repo packages are pinned to 13.6.5 because of GHSA-f7vh-h5g3-7jrh. This is a dev tool only, but consider updating the CLI within 13.x (not to 17).
- **R5:** Domain-event dispatch after `SaveChangesAsync` has no integration test yet (no aggregate exists). Add one with the first CP1 aggregate (already noted in T-0004).
- **R6:** Validation `errors` shape and malformed-body 400s are only unit-tested: no endpoint accepts input yet. Add HTTP-level tests with the first command endpoint (CP1).
- **R7:** The main JS bundle is 573 kB (T-0003 follow-up: route-level code-splitting). There are 17 high-severity `npm audit` findings, all in dev-only tooling (T-0003).
