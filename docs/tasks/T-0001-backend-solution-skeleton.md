---
id: T-0001
title: Backend solution skeleton with Aspire
status: done
owner: backend-engineer
checkpoint: 0
depends_on: []
paths: [FleetConsole.slnx, Directory.Build.props, Directory.Packages.props, global.json, .editorconfig, src/, tests/]
review_rounds: 0
---

## Goal
Create the .NET solution layout every later task builds on (see `docs/architecture/BACKEND.md`).

## Scope
- In: `global.json` (SDK 10.0.x, rollForward latestFeature); `FleetConsole.slnx`; `Directory.Build.props` (net10.0,
  nullable, implicit usings, `TreatWarningsAsErrors`, `GenerateDocumentationFile` true for src projects, analyzers
  `AnalysisLevel latest-recommended`); `Directory.Packages.props` (central package management); `.editorconfig`
  (C# style: file-scoped namespaces, `var` when apparent, 4 spaces; 2 spaces for json/ts/yaml).
- Projects: `src/FleetConsole.{Domain,Application,Infrastructure,Api,AppHost,ServiceDefaults}`,
  `tests/FleetConsole.{Domain,Application,Api}.Tests` (xUnit v3 + Shouldly + NSubstitute). Project references per BACKEND.md.
- ServiceDefaults from the Aspire 13 template (OpenTelemetry, health checks, service discovery, resilience).
- AppHost: Postgres (`AddPostgres("postgres").WithDataVolume().AddDatabase("consoledb")`, pgAdmin optional off) and
  the Api project referencing the database with `WaitFor`. (The Vite app is added in T-0004.)
- Api: minimal Program.cs with `AddServiceDefaults`, `MapDefaultEndpoints`, empty `/api` route group placeholder.
- One trivial passing test per test project so the pipeline is green.
- Out: dispatcher, EF, endpoints (T-0002/T-0004).

## Contract / design notes
Root namespace `FleetConsole.*`. Use `dotnet new aspire-apphost` / `aspire-servicedefaults` templates (Aspire 13.6 is installed),
then adapt. XML docs required, so suppress CS1591 only in tests and AppHost if needed (document why in Directory.Build.props).

## Acceptance criteria
- [x] `dotnet build FleetConsole.slnx -warnaserror` passes
- [x] `dotnet test FleetConsole.slnx` passes
- [x] Reference graph matches BACKEND.md (Domain has no project/package references)
- [x] All package versions in Directory.Packages.props, none in csproj

## Work log
- 2026-11-18 (backend-engineer): status → in_progress. Generated `aspire-apphost` / `aspire-servicedefaults` templates in
  a scratch dir and adapted them into `src/`.
- 2026-11-18: Root files: `global.json` (10.0.100, latestFeature), `FleetConsole.slnx`, `Directory.Build.props`
  (net10.0, nullable, implicit usings, TreatWarningsAsErrors, AnalysisLevel latest-recommended, EnforceCodeStyleInBuild,
  GenerateDocumentationFile for non-test projects; test projects detected by `*.Tests` name → Exe, not packable, CA1515
  off, global usings Xunit/Shouldly), `Directory.Packages.props` (CPM), `.editorconfig`.
- 2026-11-18: Projects Domain / Application / Infrastructure / Api / ServiceDefaults / AppHost and Domain/Application/Api
  test projects. References exactly per BACKEND.md (Domain: none; Application → Domain; Infrastructure → Application,
  Domain; Api → all + ServiceDefaults; AppHost → Api). Each inner layer has a documented `<Layer>Assembly` anchor class
  (for scanning in T-0002 and for architecture tests).
- 2026-11-18: Api.Tests contains `ArchitectureTests` (reflection over compiled references, as BACKEND.md names) instead
  of a pure placeholder: Domain references only BCL, Application doesn't reference Infrastructure/Api, Infrastructure
  doesn't reference Api. Domain/Application tests are trivial anchor tests.
- 2026-11-18: **Deviation — Aspire 13.6.5 instead of 13.6.4.** The installed template emits 13.6.4, but NuGet audit fails
  the build (NU1903, GHSA-f7vh-h5g3-7jrh / CVE-2026-120006, Aspire.Hosting < 13.6.5). SDK + Aspire.Hosting.PostgreSQL
  pinned to 13.6.5.
- 2026-11-18: **Deviation — test runner.** xunit.v3 4.x enables Microsoft.Testing.Platform v2; on the .NET 10 SDK that
  only runs in MTP mode, and MTP mode rejects `dotnet test FleetConsole.slnx` (requires `--solution`). To keep the
  documented command working, tests use `xunit.v3.mtp-off` (same xUnit v3 framework, no MTP runner) +
  `Microsoft.NET.Test.Sdk` + `xunit.runner.visualstudio` (VSTest).
- 2026-11-18: AppHost `http` launch profile: added `ASPIRE_ALLOW_UNSECURED_TRANSPORT=true` (template omits it, so the
  http profile crashed on startup).
- 2026-11-18: Verified: build -warnaserror clean (0 warnings), 6 tests pass; Api standalone `/alive` → Healthy,
  `/health` → 200; `dotnet run --project src/FleetConsole.AppHost --launch-profile http` with podman started
  postgres (postgres:18.3 container + data volume), consoledb, then api after WaitFor. Status → in_review.

## Review
### Round 1 — 2026-11-18 (backend-architect): **APPROVE**
Checks run by reviewer: `dotnet build FleetConsole.slnx -warnaserror --no-incremental` → 0 warnings / 0 errors;
`dotnet test FleetConsole.slnx` → 6/6 passed (Domain 1, Application 1, Api 4); `dotnet list package --vulnerable
--include-transitive` → none. No bin/obj in untracked files.

All acceptance criteria verified: reference graph matches BACKEND.md (Domain has no references; Api → all +
ServiceDefaults; AppHost → Api), no versions in any csproj (only the `Aspire.AppHost.Sdk/13.6.5` SDK pin, which
can't live in CPM), XML docs on every public src type, AppHost matches the contract (Postgres + data volume +
`consoledb`, Api `WithReference` + `WaitFor`, no pgAdmin).

Deviations, evaluated:
- **Aspire 13.6.5 instead of 13.6.4**: accepted. It's a security patch inside the decided Aspire 13 line, so no ADR is
  needed. The SDK/package lockstep is documented in both places.
- **xunit.v3.mtp-off + Microsoft.NET.Test.Sdk (VSTest)**: accepted. It's still xUnit v3 per the stack, and it keeps the
  documented `dotnet test FleetConsole.slnx` working. The rationale is in Directory.Packages.props.
- **`ASPIRE_ALLOW_UNSECURED_TRANSPORT` in the AppHost http profile**: accepted. It's dev-only (launchSettings) and is
  needed for the http profile to start without trusted dev certs.
- **Health endpoints in Development only**: keep as is for now and handle as a **CP3 follow-up**, not now. ROADMAP CP3
  already lists "health probes", and no production deployment exists before CP3. When CP3 does it: map `/alive`
  (liveness, `live` tag) and `/health` (readiness, including the Postgres check) in every environment; keep the
  default status-only response writer (no per-check details); allow anonymous access and exclude both paths from
  SPA fallback, auth and CSRF filters; and remove the `IsDevelopment()` guard in `MapDefaultEndpoints` instead of
  adding a second mapping.

Reviewer fix applied: `src/FleetConsole.ServiceDefaults/Extensions.cs:131` pointed to SECURITY.md for the probe
decision, but SECURITY.md doesn't cover it. Repointed it to ROADMAP CP3.

Optional nits (no action required for this task):
- `tests/FleetConsole.Api.Tests/ArchitectureTests.cs:32`: `StartsWith("System")` would also accept third-party
  `System.*` NuGet packages (e.g. System.IO.Abstractions). That's fine while Domain has no package references; tighten it
  if NetArchTest is adopted later.
- `ArchitectureTests` doesn't yet assert BACKEND.md's Application allow-list (Domain, FluentValidation, logging
  abstractions only). Add this in T-0002 when FluentValidation arrives.
- `src/FleetConsole.AppHost/AppHost.cs:8`: with `WithDataVolume()`, the generated Postgres password lives in AppHost
  user secrets. If those are cleared, the existing volume won't accept the new password. Worth one line in a dev
  README/HANDOVER gotcha later.
- `src/FleetConsole.Api/appsettings.json:8`: `AllowedHosts: "*"` is the template default. Set the real route host
  with the CP3 deployment config.

## Handover notes
- Done: full skeleton; build/test green; AppHost verified end-to-end with podman (http profile).
- Not done (by design): dispatcher/Result (T-0002), EF/OpenAPI/integration harness and Vite resource (T-0004). The `/api`
  route group in `Program.cs` is an unassigned placeholder — T-0004 assigns it to a variable and hangs groups off it.
  `public partial class Program` for WebApplicationFactory is not added yet (T-0004).
- Gotchas:
  - Keep `Aspire.AppHost.Sdk/<ver>` in the AppHost csproj and `Aspire.Hosting.*` in Directory.Packages.props in step;
    must be ≥ 13.6.5. Aspire CLI reports 17.0.0 available — not adopted (stack says Aspire 13; would need an ADR).
  - Test projects must reference `xunit.v3.mtp-off`, not `xunit.v3`, or `dotnet test FleetConsole.slnx` fails.
  - No `--` inside XML comments in .props files (breaks MSBuild parsing silently into NU1602 restore errors).
  - `aspire.config.json` lives in `src/FleetConsole.AppHost/` (template default). Not verified: `aspire run` from the
    repo root (verification used `dotnet run --project`; CLI should scan for the AppHost). The https AppHost profile needs trusted dev certs (`dotnet dev-certs https --trust` only partially
    succeeds on this Fedora box); use `--launch-profile http` or trust the cert.
  - Health endpoints are mapped in Development only (template default); OpenShift probes are a deployment-task decision.
  - Architecture tests read compiled references, so a project reference with no used types is invisible to them.
