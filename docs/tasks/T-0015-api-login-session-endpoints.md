---
id: T-0015
title: Api login wiring — OpenShift OAuth handler, session revalidation, /api/auth endpoints, login test harness
status: todo
owner: backend-engineer
checkpoint: 1
depends_on: [T-0009, T-0011, T-0013, T-0014]
paths: [src/FleetConsole.Api/Auth/, src/FleetConsole.Api/Endpoints/AuthEndpoints.cs, src/FleetConsole.Api/Endpoints/ApiEndpoints.cs, src/FleetConsole.Api/Program.cs, src/FleetConsole.Api/appsettings*.json, src/FleetConsole.AppHost/AppHost.cs, tests/FleetConsole.Api.Tests/Integration/, tests/FleetConsole.Api.Tests/Auth/, tests/FleetConsole.Api.Tests/Persistence/ApiHostOverDatabase.cs, web/src/shared/api/schema.gen.ts, README.md]
review_rounds: 0
---

## Goal
Deliver end-to-end login: `/api/auth/login` → host OAuth (DevOAuth locally) → `/api/auth/callback` → FleetConsole
cookie session, plus `me`, `logout`, revalidation, and every error outcome landing on `/login` with a reason. Also
build the shared integration-test harness (login helper + seeding) every admin endpoint task reuses. **Wave W5**
(critical path; it unblocks the frontend's real login and all admin API tasks).

## Scope
- In: OAuth handler + events, `ReturnUrlPolicy`, public-origin options, `SessionValidator`, `AuthEndpoints`
  (login, logout, me), AppHost/dev config, ApiFactory refactor + `LoginAsAsync` + `TestData`, AUTH integration tests,
  `schema.gen.ts` regen.
- Out: admin endpoints. The SPA side (`/login` page, 401 handling) is frontend work against contract §4.

## Contract / design notes
Contract §4 (routes, redirects, `CurrentUserDto`), §12 (config). ADR-0009 (revalidation), ADR-0010 (handler wiring,
discovery, `PublicOrigin`, test hosting), ADR-0012 (anonymous list).
- `Api/Auth/OpenShiftOAuthOptions : OAuthOptions`, `OpenShiftOAuthHandler : OAuthHandler<OpenShiftOAuthOptions>`
  overriding only `BuildRedirectUri` → `{Console:PublicOrigin}{CallbackPath}`. Scheme `"OpenShift"`, `CallbackPath
  /api/auth/callback`, `UsePkce`, scope `user:info`, `SaveTokens=false`, backchannel = `IHttpClientFactory` client
  `"openshift-host"`, `ClientId/Secret` from `OpenShiftHostOptions`.
- `IPostConfigureOptions<OpenShiftOAuthOptions>` fills endpoints from `IOAuthServerMetadataProvider.Current`
  (placeholder `https://oauth-metadata-unavailable.invalid/` when null); subscribe to `MetadataChanged` →
  `IOptionsMonitorCache<OpenShiftOAuthOptions>.TryRemove("OpenShift")`.
- `Api/Hosting/PublicOriginOptions` (`Console:PublicOrigin`): absolute http(s) origin without path; required outside
  Development; `ValidateOnStart`.
- Events: `OnCreatingTicket` → `IExternalIdentityClient.GetCurrentUserAsync(new SensitiveString(ctx.AccessToken))` →
  put the `ExternalIdentity` in `ctx.Properties`/`HttpContext.Items` (not in the principal's persisted claims).
  `OnTicketReceived` → dispatch `CompleteLoginCommand` → Allowed: `ctx.Principal = SessionPrincipalFactory.Create(...)`,
  `ctx.ReturnUri = ReturnUrlPolicy.Sanitize(...)`; Denied: redirect per contract §4.2 + `HandleResponse()`.
  `OnRemoteFailure` → `cancelled` / `unavailable` (incl. `ExternalIdentityUnavailableException`) / `failed`, logged at
  Warning with trace id, `HandleResponse()`.
- `Api/Auth/ReturnUrlPolicy.Sanitize(string?) : string` — pure; contract §4.1 rules.
- `Api/Auth/SessionValidator` hooked to `CookieAuthenticationEvents.OnValidatePrincipal` (extend T-0011's
  `AuthenticationSetup`): interval check via `IClock`, `GetSessionStateQuery`, reject / refresh per ADR-0009.
- `Endpoints/AuthEndpoints.cs` (`/api/auth`, tag `Auth`): `GET /login` (anonymous; awaits metadata; already-signed-in
  shortcut; `Results.Challenge` with `RedirectUri = sanitized returnUrl`), `POST /logout` (anonymous allowed; dispatch
  `LogOutCommand` only when authenticated; `SignOutAsync`; 204), `GET /me` → `Results<Ok<CurrentUserDto>, ProblemHttpResult>`.
  OperationIds: `Login`, `Logout`, `GetCurrentUser`. Flip the anonymous-surface test (T-0011) to the full ADR-0012 list.
- AppHost: `api.WithEnvironment("Console__PublicOrigin", web.GetEndpoint("http"))` after `web` is declared (verify
  Aspire accepts the bidirectional reference; if not, pin the Vite port and document it). Api `appsettings.Development.json`:
  `Console:PublicOrigin http://localhost:5180`, `Auth:OpenShift:ClientId/ClientSecret` (dev values from contract §11),
  `Auth:AdminGroups ["fleetconsole-admins"]`.
- **Test harness** (`tests/FleetConsole.Api.Tests/Integration/`):
  - Split the Postgres container into a `PostgresFixture`; `ApiFactory` takes the fixture + optional config overrides
    and uses its own database name per variant, so tests needing `Auth:AutoProvision=false` or
    `Auth:RevalidationInterval=00:00:00` get their own host without a second container.
  - Host DevOAuth in-process (`WebApplicationFactory<DevOAuthEntryPoint>`); override the Api's `"openshift-host"`
    primary handler with the emulator's `Server.CreateHandler()` and set `Auth:OpenShift:HostApiServerUrl` to its base address.
  - `ApiFactory.LoginAsAsync(string username) : Task<HttpClient>` — drives login → authorize POST → callback with a
    cookie-keeping client; returned client sends `X-Console-Request: 1` by default.
  - `TestData` helper — seeds users (role/read-only/deactivated), clusters, credentials (encrypted via `ITokenProtector`)
    and grants through a scoped `ConsoleDbContext`, with unique names per call. Used by T-0016..T-0021.
  - `CapturedLogs` (in-memory `ILoggerProvider` registered by `ApiFactory`) and `TokenLeakScanner.AssertAbsent(secret,
    params string[] haystacks)` — used for AUTH-3 here and CRED-2 in T-0018..T-0021.

**From T-0011 (architect review, 2026-11-19)** — what T-0011 left for this task:
- Session settings class is `Api/Auth/ConsoleSessionOptions` (renamed from `SessionOptions` in T-0011's review; section
  `Auth`, `SessionLifetime`, `RevalidationInterval`). Build principals only with `SessionPrincipalFactory.Create`.
- `SessionValidator` must also `RejectPrincipal()` + sign out when `SessionPrincipalFactory.TryRead` fails (malformed or
  old-format ticket). Otherwise the endpoint layer sees an authenticated cookie identity while `ICurrentUser` reports
  anonymous, and the two layers disagree (the pipeline still fails closed with 401, but `/me` must not 200).
- **Real-host 401:** T-0011 tested the API-friendly 401/403 only on a minimal TestServer host
  (`Auth/AuthenticationSetupTests`). Add an `ApiFactory` integration test: anonymous `GET /api/auth/me` → 401,
  `application/problem+json`, `code` `Auth.Unauthenticated`, `traceId` present, **no `Location` header**.
- **Enum assertion:** `OpenApiDocumentTests` has a placeholder comment; replace it with an assertion that
  `CurrentUser.role` is `type: string` with `enum: ["admin", "user"]` (camelCase, no integers).
- Flip `Mapped` to `true` for `GET /api/auth/login` and `POST /api/auth/logout` in
  `Integration/AnonymousSurfaceTests.cs` (`/api/auth/callback` stays unlisted: OAuth middleware, not an endpoint).

**From T-0014 (architect review, 2026-11-19)** — what T-0014 left for this task:
- Call `builder.AddOpenShiftIdentity()` (`FleetConsole.Infrastructure.Identity`) in `Program.cs` after
  `AddInfrastructure()`. From then on, **every host built from `Program`** fails startup without valid
  `Auth:OpenShift:*`: `HostApiServerUrl`, `ClientId` and `ClientSecret` are required, the static endpoints must be set
  both or neither, and `https` is required outside Development (T-0014 review fix).
- Put the test values in `ApiFactory` via `UseSetting`, not only in `appsettings.Development.json`. They must also
  reach the hosts derived from it with `UseEnvironment("Production")` (`Integration/ExceptionPipelineTests`, which
  doesn't load the Development file), and `Persistence/ApiHostOverDatabase.cs` (added to `paths`). Minimum set: see
  `tests/FleetConsole.Api.Tests/Identity/IdentityTestHost.DevConfiguration()`. For Production-environment hosts use an
  `https://*.invalid` `HostApiServerUrl` **plus both static endpoints**, so the warm-up makes no outbound call and
  validation passes. For Development hosts point `HostApiServerUrl` at the in-process DevOAuth and override the
  `OpenShiftHostHttpClient.Name` primary handler (see `IdentityTestHost`).
- Use the `OpenShiftHostHttpClient.Name` client as the OAuth backchannel. It has no retries and a 10 s timeout; don't add
  any handler that retries.
- `LoginOutcomeDto.User` is `SignedInUserDto?` (not `SessionUserDto`); map it to the Api's `SessionUser`. Denials are
  successful results. A racing first login can return 409 `Persistence.DuplicateKey` → treat it as `failed`.
- `OnRemoteFailure`: `ExternalIdentityUnavailableException` → `unavailable`; `InvalidOperationException` from
  `IExternalIdentityClient` → `failed`.
- `GetSessionStateQuery` → `Users.NotFound` for a missing user: `SessionValidator` must reject. `GetCurrentUserQuery`
  → `Auth.Unauthenticated` when the session's user row is missing (ruled: 401, not 404).
- `MetadataChanged` fires once (the first successful discovery; never for static endpoints).

## Acceptance criteria
- [ ] AUTH-1 full flow via emulator lands on the original return URL with a session cookie.
- [ ] AUTH-2 ≥ 4 malicious return URLs (`https://evil.example`, `//evil.example`, `/\evil.example`, `javascript:alert(1)`,
      `%2F%2Fevil.example`) → `/`; `ReturnUrlPolicy` unit-tested too.
- [ ] AUTH-3 the access token appears in no cookie payload (decrypt the ticket with the app's Data Protection),
      no DB table, no captured log line.
- [ ] AUTH-4 cookie attributes (HttpOnly, SameSite=Lax, Secure on https, expiry ≈ SessionLifetime, sliding renew).
- [ ] AUTH-5..8 through HTTP incl. audit entries (`user.provisioned`, `auth.login`, `auth.login_denied`,
      `user.promoted` by `system (config)`), and `/login?error=not_registered&username=...` / `deactivated` redirects.
- [ ] AUTH-9 `/api/auth/me` 200 shape and 401 ProblemDetails `Auth.Unauthenticated` when anonymous.
- [ ] AUTH-10 logout → 204, cookie cleared, `auth.logout` audited; without CSRF header → 403.
- [ ] AUTH-11 with interval 0: deactivate via `TestData` → next call 401; role/read-only change reflected in `/me`
      without re-login; deactivate→reactivate does not revive the old session (stamp).
- [ ] AUTH-14 emulator cancel → `error=cancelled`; unreachable host → `/api/auth/login` redirects `error=unavailable`;
      `users/~` failure → `unavailable`.
- [ ] OpenAPI: `CurrentUser.role` is a string enum (`admin`/`user`) — assertion added; `schema.gen.ts` regenerated.
- [ ] `aspire run`: log in as `admin` through the Vite URL works (manual check, noted in the work log).
- [ ] Build, lint and tests green (CLAUDE.md rule 4).

## Contract amendments (orchestrator 2026-11-18)
- Contract-first FE types (ADR-0016): after regenerating `schema.gen.ts`, also run `cd web && npm run typecheck`. A failure means the Api deviates from the contract — report it in NOTES, don't patch web/ silently.

## Work log

## Review

## Handover notes
