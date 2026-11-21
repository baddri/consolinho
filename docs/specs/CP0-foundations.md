# CP0 — Foundations (spec)

Technical checkpoint; written by the orchestrator (no user-facing features, so no product-owner spec needed).

## Acceptance criteria
1. `dotnet build FleetConsole.slnx -warnaserror` and `dotnet test FleetConsole.slnx` pass on a clean clone (with podman socket).
2. Projects and references match `docs/architecture/BACKEND.md`; an architecture test fails if Domain references anything or Application references Infrastructure/Api.
3. Dispatcher executes behaviors in registration order; Validation behavior returns a validation `Result` with field errors; unit tests prove both.
4. `Result` errors map to RFC 9457 ProblemDetails with correct status codes (400/401/403/404/409/500) — tested.
5. Api exposes `/health` + `/alive` (ServiceDefaults), `/openapi/v1.json`, and a sample `GET /api/system/info` implemented as a CQRS query (version, environment) — integration-tested against Testcontainers Postgres.
6. `ConsoleDbContext` exists with snake_case naming and an initial migration; Api applies migrations on startup in Development.
7. `aspire run` starts Postgres (podman), Api and the Vite dev server; the SPA loads and calls `/api/system/info` through the Vite proxy.
8. `web/`: PatternFly 6 shell (masthead with placeholder cluster switcher dropdown *(superseded by CP3.5, T-0111: the switcher is at the top of the sidebar)*, user menu placeholder, sidebar nav with OCP-like sections, routes for `/c/:cluster/...` and `/admin/...` placeholder pages, 404 page); lint/typecheck/test/build scripts pass; ESLint forbids `any` and cross-feature internal imports; MSW-based test exists; `npm run gen:api` generates `shared/api/schema.gen.ts` from the Api OpenAPI document.
9. Root `README.md` explains setup (podman socket, env vars), `aspire run`, tests, and points to CLAUDE.md/docs.
