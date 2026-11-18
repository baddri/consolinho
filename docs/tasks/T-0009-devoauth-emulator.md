---
id: T-0009
title: DevOAuth emulator project and AppHost wiring
status: todo
owner: backend-engineer
checkpoint: 1
depends_on: []
paths: [src/FleetConsole.DevOAuth/, src/FleetConsole.AppHost/, FleetConsole.slnx, Directory.Packages.props, tests/FleetConsole.Api.Tests/DevOAuth/, tests/FleetConsole.Api.Tests/ProjectFileArchitectureTests.cs, tests/FleetConsole.Api.Tests/FleetConsole.Api.Tests.csproj, README.md, docs/dev/TROUBLESHOOTING.md]
review_rounds: 0
---

## Goal
Provide `FleetConsole.DevOAuth`, an in-repo emulator of the OpenShift OAuth server + `users/~` endpoint, so local
development and integration tests run the exact production login code path (ADR-0007, ADR-0010). **Parallel group W1**
(with T-0007, T-0010).

## Scope
- In: new web project `src/FleetConsole.DevOAuth` (minimal API, no FleetConsole project references), its config,
  HTML user picker, AppHost resource, contract tests, architecture test, README dev notes.
- Out: anything in the Api (login wiring is T-0015). Do not add the Api env vars for OAuth beyond what's listed below.

## Contract / design notes
Exact endpoint contract and config: `docs/specs/CP1-api-contract.md` §11. Design: ADR-0010 "DevOAuth emulator".
- Project: `Microsoft.NET.Sdk.Web`, references ServiceDefaults only (telemetry/health in Aspire dashboard is fine);
  nullable, warnings as errors, XML docs like every other project.
- Entry-point marker: `public sealed class DevOAuthEntryPoint;` in namespace `FleetConsole.DevOAuth`, and a top-level
  `Program` that is **not** `public partial class Program` in the global namespace (the Api owns that name in tests).
  Tests use `WebApplicationFactory<DevOAuthEntryPoint>`.
- State: in-memory `ConcurrentDictionary` for codes (single-use, 60 s, bound to client id, redirect_uri, PKCE
  challenge+method, username) and access tokens (`sha256~` + 43 random base64url chars, 24 h). Time via `TimeProvider`
  so tests can advance it.
- PKCE: `S256` and `plain`; when the authorize request had a challenge, `/oauth/token` requires a matching verifier.
- The authorize page is server-rendered HTML (a string template with HTML-encoded values; no JS). One `<form method=post>`
  per user button carrying the original OAuth parameters as hidden inputs; a Cancel button posts `cancel=1`.
- `issuer`/endpoint URLs in the discovery document are built from the request's scheme+host (the emulator has no
  public-origin issue: browser and Api both reach it directly).
- Options: `DevOAuthOptions { IReadOnlyList<DevOAuthClient> Clients; IReadOnlyList<DevOAuthUser> Users; }`, validated on
  start (unique names, at least one client).
- AppHost (`AppHost.cs`):
  ```csharp
  var devOAuth = builder.AddProject<Projects.FleetConsole_DevOAuth>("devoauth");
  var api = builder.AddProject<Projects.FleetConsole_Api>("api")
      .WithReference(consoleDb).WaitFor(consoleDb)
      .WithEnvironment("Auth__OpenShift__HostApiServerUrl", devOAuth.GetEndpoint("http"))
      .WaitFor(devOAuth);
  ```
  (The Api ignores the variable until T-0015.) Give the emulator a fixed launch-profile port (`http://localhost:5190`).
- Architecture: extend `ProjectFileArchitectureTests` — no `src/` project except the AppHost may reference
  `FleetConsole.DevOAuth`, and DevOAuth references no FleetConsole project other than ServiceDefaults (AUTH-15).
- Test project: `tests/FleetConsole.Api.Tests` references the DevOAuth project (it will host it in-process for login
  tests in T-0015).

## Acceptance criteria
- [ ] AUTH-15: emulator serves the 5 endpoints of contract §11 with users `admin` (`fleetconsole-admins`), `alice`
      (`sre`), `bob` (no groups), `ines` (`auditors`); `aspire run` shows the `devoauth` resource healthy.
- [ ] Contract tests (`tests/FleetConsole.Api.Tests/DevOAuth/`) over `WebApplicationFactory<DevOAuthEntryPoint>`:
      discovery document; full code flow with S256 PKCE → token → `users/~` returns name/fullName/groups; cancel →
      `error=access_denied`; code reuse, expired code, wrong verifier, wrong redirect_uri, wrong secret → `invalid_grant`
      / `invalid_client`; bad bearer → 401.
- [ ] Architecture test: the Api does not reference DevOAuth.
- [ ] README: how to log in locally (pick a user), list of dev users; note that it is never deployed.
- [ ] Build, lint and tests green (CLAUDE.md rule 4).

## Work log

## Review

## Handover notes
