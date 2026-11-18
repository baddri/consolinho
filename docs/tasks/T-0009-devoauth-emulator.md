---
id: T-0009
title: DevOAuth emulator project and AppHost wiring
status: done
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
- [x] AUTH-15: emulator serves the 5 endpoints of contract §11 with users `admin` (`fleetconsole-admins`), `alice`
      (`sre`), `bob` (no groups), `ines` (`auditors`); `aspire run` shows the `devoauth` resource healthy.
- [x] Contract tests (`tests/FleetConsole.Api.Tests/DevOAuth/`) over `WebApplicationFactory<DevOAuthEntryPoint>`:
      discovery document; full code flow with S256 PKCE → token → `users/~` returns name/fullName/groups; cancel →
      `error=access_denied`; code reuse, expired code, wrong verifier, wrong redirect_uri, wrong secret → `invalid_grant`
      / `invalid_client`; bad bearer → 401.
- [x] Architecture test: the Api does not reference DevOAuth.
- [x] README: how to log in locally (pick a user), list of dev users; note that it is never deployed.
- [x] Build, lint and tests green (CLAUDE.md rule 4).

## Work log
- 2026-11-18 backend-engineer: started (resumed after a rate-limit interruption; nothing had been written to disk). Plan: new `FleetConsole.DevOAuth` minimal API (options + validation, in-memory code/token store on `TimeProvider`, HTML picker, 5 endpoints), AppHost resource, contract + architecture tests, README/TROUBLESHOOTING notes.

- 2026-11-18 backend-engineer: implemented `src/FleetConsole.DevOAuth` (options + startup validation, `DevOAuthStore`
  on `TimeProvider`, `Pkce`, `AuthorizationRequest` parser shared by GET/POST, HTML picker, 5 endpoints), AppHost
  resource `devoauth` (launch profile `http`, port 5190, `/health` check; Api gets `Auth__OpenShift__HostApiServerUrl`
  and `WaitFor`), slnx entry, test project reference, 40 contract tests in `tests/FleetConsole.Api.Tests/DevOAuth/`,
  3 project-file architecture tests, README "Logging in locally" + TROUBLESHOOTING entries. Checked `users/~` against
  OpenShift's oauth-apiserver source (`pkg/user/apiserver/registry/user/etcd/etcd.go`) and `openshift/api`
  `user/v1` types (deviations below). Main tree did not build because of parallel, untracked T-0010 files (CA1716 in
  `Application/Abstractions/Kubernetes/IClusterProbeSession.cs`, later CS1739 in
  `tests/FleetConsole.Api.Tests/Fakes/TestCertificateAuthority.cs`), so verification ran in a scratch git worktree =
  HEAD + only this task's files: `dotnet build FleetConsole.slnx -warnaserror` OK, `dotnet test FleetConsole.slnx`
  35 + 35 + 110 passed (Api tests incl. Testcontainers/podman). `aspire start --launch-profile http && aspire wait web`
  from that worktree: `devoauth` Running/Healthy on :5190, discovery curl OK, Api process env has
  `Auth__OpenShift__HostApiServerUrl=http://localhost:5190`; `aspire stop`, nothing left running, scratch volume and
  worktree removed. Re-run in the main tree once the parallel work settled: `dotnet build FleetConsole.slnx
  -warnaserror` OK, `dotnet test FleetConsole.slnx` 153 + 35 + 110 passed. -> in_review.

## Review
**Round 1 — 2026-11-18 backend-architect: APPROVE**

Checks (run by reviewer, main tree with podman env): `dotnet build FleetConsole.slnx -warnaserror` green. The first
attempt failed with CS0234 in `tests/FleetConsole.Application.Tests/ServiceProviderBuilder.cs`, caused by the parallel
T-0010 folder `tests/FleetConsole.Application.Tests/Abstractions/` mid-edit, not by T-0009. A re-run was green, and
DevOAuth, AppHost and Api.Tests each build on their own with 0 warnings. `dotnet test FleetConsole.slnx`:
153 + 43 + 139 passed. `FleetConsole.Api.deps.json` has no DevOAuth entry.

Checklist: layering OK (DevOAuth -> ServiceDefaults only, enforced by 3 project-file tests). XML docs complete and
accurate. No secrets or codes/tokens logged (log lines carry only user and client). Constant-time secret/PKCE compare.
HTML picker encodes every reflected value, no JS, strict CSP/no-store/no-referrer. `TimeProvider` used throughout.
Expired entries are swept. Every acceptance-criteria case has a contract test, plus the extra cases.

Rulings on the deviations from contract §11 (all **accepted**; contract §11 and ADR-0010 updated by the reviewer):
1. `system:authenticated` / `system:authenticated:oauth` in `users/~` groups: accepted. This matches real OCP and the
   contract example already shows it. T-0014 ignores `system:*` for admin matching and display.
2. `fullName` omitted when empty: accepted (matches `omitempty`). Api DTO must treat it as optional (T-0014).
3. Failed HTTP Basic client auth -> 401 + `WWW-Authenticate: Basic`: accepted (RFC 6749 §5.2 MUST). The Api uses
   form-field auth and sees 400 as contracted. Also accepted: `unsupported_grant_type` and `no-store`.
4. Invalid authorize request -> 400 HTML page, no error redirect; any absolute http(s) `redirect_uri` accepted:
   accepted for a localhost dev tool. The Api never sends invalid requests, a page is easier to debug, and the
   per-run Vite port rules out a static allow-list. `redirect_uri` equality at the token endpoint plus PKCE still bind
   the code.
5. Code consumed on any redemption attempt (after successful client auth): accepted. This is stricter than RFC 6749
   §4.1.2 and stops verifier guessing. The ASP.NET Core OAuth handler never retries a code.
6. `internal partial class Program`: accepted and required (the .NET 10 generator makes `Program` public, which causes
   CS0433 in Api.Tests). It is documented in `Program.cs`, `DevOAuthEntryPoint` and TROUBLESHOOTING. No
   `InternalsVisibleTo` to the test project, so the options tests go through the host, which is fine.
7. `IsPublishable=false` + refuse to start outside Development: accepted as defence in depth.
8. AppHost `launchProfileName: "http"` + `WithHttpHealthCheck("/health")`: accepted. They give a stable port under
   both AppHost profiles and make `WaitFor(devOAuth)` meaningful. `/health` exists because DevOAuth only ever runs in
   Development.

"Never in the production image": confirmed for the current tree. (a) The Api has no reference to DevOAuth (an
architecture test enforces it, and the Api deps.json has none). (b) DevOAuth is not publishable. (c) DevOAuth throws
at startup outside Development (tested). (d) There is no Containerfile yet. ADR-0010 states the CP3 Containerfile
publishes `FleetConsole.Api` only. Follow-up for the CP3 Containerfile task: publish the Api project explicitly (not
the slnx) and add a check that the image contains no `FleetConsole.DevOAuth*` files.

Optional (not blocking):
- `src/FleetConsole.AppHost/AppHost.cs:17`: if `aspire publish`/`deploy` is ever used, wrap the `devoauth` resource
  and the Api's `HostApiServerUrl` env in `builder.ExecutionContext.IsRunMode`. That keeps it out of generated
  manifests. Not needed while deployment is Containerfile + kustomize (ADR-0006).
- `src/FleetConsole.DevOAuth/OAuth/AuthorizationRequest.cs:146`: could restrict `redirect_uri` to loopback hosts
  (`uri.IsLoopback`) to remove the open-redirect shape at no cost to dev or tests.

## Handover notes
**Deviations from contract §11 / task (deliberate, for fidelity with a real cluster or RFC; please confirm):**
1. **`users/~` `groups` includes `system:authenticated` and `system:authenticated:oauth`**, sorted and de-duplicated,
   e.g. alice → `["sre","system:authenticated","system:authenticated:oauth"]`, bob → only the two virtual groups. The
   real oauth-apiserver returns all request-context groups (code checked above), and the OAuth token authenticator
   adds both virtual groups. The contract example shows `["sre"]`. **T-0014/T-0015 must handle `system:` groups**
   (store as-is, or filter `system:*` before storing/showing). Contract §11's example should be updated (docs agent).
2. **`fullName` is omitted** (not `null`) when the user has none (`omitempty` on the Go type). `groups` is always
   present. The Api's `users/~` DTO must treat `fullName` as optional.
3. Token endpoint: a client that authenticates with **HTTP Basic** and fails gets **401** + `WWW-Authenticate: Basic`
   (RFC 6749 §5.2 MUST). Form-field client auth (what ASP.NET Core's OAuth handler sends) gets 400 as in the contract.
   Also returns `unsupported_grant_type` for grant types other than `authorization_code`. Responses carry
   `Cache-Control: no-store` / `Pragma: no-cache`.
4. Authorize: every invalid request (unknown client, bad/relative/fragment `redirect_uri`, `response_type` other than
   `code`, missing or unknown `scope`, bad PKCE method or challenge, repeated parameter) gets the 400 HTML page. No
   error redirect is sent. Any absolute http(s) `redirect_uri` is accepted, because the dev callback is on the Vite
   origin whose port changes per run. Real OpenShift checks it against the client's registered redirect URIs.
   `scope` is required.
5. PKCE at the token endpoint: missing or malformed `code_verifier` → `invalid_request`; mismatch → `invalid_grant`.
   A code is consumed by **any** redemption attempt, including a failed one.

**Other notes for follow-up tasks:**
- `Program` in DevOAuth is declared `internal partial class Program;`. The .NET 10 generator otherwise makes it public
  and `WebApplicationFactory<Program>` in the Api tests becomes ambiguous (CS0433). DevOAuth must never get
  `InternalsVisibleTo` to the test project for the same reason. That is also why the options/validator are tested
  through the host (`DevOAuthConfigurationTests`), not directly.
- Guards for "never deployed": `<IsPublishable>false</IsPublishable>`, the app refuses to start outside Development,
  and the architecture tests (only the AppHost may reference it; DevOAuth references only ServiceDefaults).
- T-0015: host the emulator with `new DevOAuthFactory()` (or a sibling) and point the Api's `"openshift-host"` client at
  `devOAuthFactory.Server.CreateHandler()`. The discovery issuer is then `http://localhost`. Test helpers in
  `tests/FleetConsole.Api.Tests/DevOAuth/DevOAuthFlow.cs` (PKCE, picker POST, token exchange) can be reused.
  `DevOAuthFactory.Time` advances code/token expiry.
- AppHost uses `AddProject(..., launchProfileName: "http")` so the emulator stays on http://localhost:5190 under the
  https AppHost profile too. `WithHttpHealthCheck("/health")` gives the dashboard's Healthy state and makes the Api's
  `WaitFor(devOAuth)` meaningful.
