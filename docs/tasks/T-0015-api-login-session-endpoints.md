---
id: T-0015
title: Api login wiring — OpenShift OAuth handler, session revalidation, /api/auth endpoints, login test harness
status: done
owner: backend-engineer
checkpoint: 1
depends_on: [T-0009, T-0011, T-0013, T-0014]
paths: [src/FleetConsole.Api/Auth/, src/FleetConsole.Api/Hosting/PublicOriginOptions.cs, src/FleetConsole.Application/Auth/IOAuthServerMetadataProvider.cs, src/FleetConsole.Infrastructure/Identity/OAuthServerMetadataProvider.cs, tests/FleetConsole.Api.Tests/Identity/OAuthServerMetadataProviderTests.cs, src/FleetConsole.Domain/Users/UserRole.cs, web/src/shared/api/schema.test.ts, src/FleetConsole.Api/Endpoints/AuthEndpoints.cs, src/FleetConsole.Api/Endpoints/ApiEndpoints.cs, src/FleetConsole.Api/Program.cs, src/FleetConsole.Api/appsettings*.json, src/FleetConsole.AppHost/AppHost.cs, tests/FleetConsole.Api.Tests/Integration/, tests/FleetConsole.Api.Tests/Auth/, tests/FleetConsole.Api.Tests/Persistence/ApiHostOverDatabase.cs, web/src/shared/api/schema.gen.ts, README.md]
review_rounds: 2
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
- [x] AUTH-1 full flow via emulator lands on the original return URL with a session cookie.
- [x] AUTH-2 ≥ 4 malicious return URLs (`https://evil.example`, `//evil.example`, `/\evil.example`, `javascript:alert(1)`,
      `%2F%2Fevil.example`) → `/`; `ReturnUrlPolicy` unit-tested too.
- [x] AUTH-3 the access token appears in no cookie payload (decrypt the ticket with the app's Data Protection),
      no DB table, no captured log line.
- [x] AUTH-4 cookie attributes (HttpOnly, SameSite=Lax, Secure on https, expiry ≈ SessionLifetime, sliding renew).
- [x] AUTH-5..8 through HTTP incl. audit entries (`user.provisioned`, `auth.login`, `auth.login_denied`,
      `user.promoted` by `system (config)`), and `/login?error=not_registered&username=...` / `deactivated` redirects.
- [x] AUTH-9 `/api/auth/me` 200 shape and 401 ProblemDetails `Auth.Unauthenticated` when anonymous.
- [x] AUTH-10 logout → 204, cookie cleared, `auth.logout` audited; without CSRF header → 403.
- [x] AUTH-11 with interval 0: deactivate via `TestData` → next call 401; role/read-only change reflected in `/me`
      without re-login; deactivate→reactivate does not revive the old session (stamp).
- [x] AUTH-14 emulator cancel → `error=cancelled`; unreachable host → `/api/auth/login` redirects `error=unavailable`;
      `users/~` failure → `unavailable`.
- [x] OpenAPI: `CurrentUser.role` is a string enum (`admin`/`user`) — assertion added; `schema.gen.ts` regenerated.
      (Deviation: .NET 10 emits `{ enum: [...] }` without `type: string`; the test asserts string values and "type, if
      present, is string". See Work log.)
- [x] `aspire run`: log in as `admin` through the Vite URL works (checked with curl through the Vite URL under
      `aspire start --launch-profile http`, see Work log; no real browser used).
- [x] Build, lint and tests green (CLAUDE.md rule 4). Backend green; web typecheck + 350 tests green after the
      orchestrator's `schema.test.ts` fix (round 1).

## Contract amendments (orchestrator 2026-11-18)
- Contract-first FE types (ADR-0016): after regenerating `schema.gen.ts`, also run `cd web && npm run typecheck`. A failure means the Api deviates from the contract — report it in NOTES, don't patch web/ silently.

## Work log
- 2026-11-19 backend-engineer: started. Read CLAUDE.md, BACKEND.md, SECURITY.md, ADR-0007/0009/0010/0012/0014, contract §1–§5, §11, §12, handover notes of T-0009/T-0011/T-0013/T-0014.
- 2026-11-19 backend-engineer: implemented. Summary:
  - **Api/Auth:** `OpenShiftOAuthOptions` (scheme `OpenShift`, callback `/api/auth/callback`, PKCE, `user:info`,
    `SaveTokens=false`), `OpenShiftOAuthHandler`, `OpenShiftOAuthOptionsSetup` (client id/secret, `openshift-host`
    backchannel), `OpenShiftLoginEvents` (EventsType, scoped: `CreatingTicket` → `users/~`; `TicketReceived` →
    `CompleteLoginCommand`; `RemoteFailure` → cancelled/unavailable/failed, logged EventId 2200 with trace id),
    `OAuthServerUnavailableException`, `ReturnUrlPolicy`, `LoginRedirect` + `LoginErrorCodes`, `SessionValidator`
    (EventId 2210). `AuthenticationSetup`: `OnValidatePrincipal` → validator, `OnSigningIn` marks the ticket validated,
    `RevalidationInterval >= 0` (zero allowed for tests), new `AddOpenShiftLogin()`.
  - **Api/Hosting/PublicOriginOptions** (+ validator, `AddPublicOrigin()`): `Console:PublicOrigin`, origin only, required
    outside Development, Development default `http://localhost:5180`. `Hosting/` was not in `paths`, but the design
    note names this file; one new file there.
  - **Endpoints/AuthEndpoints:** `GET /login` (anonymous; sanitize; already-signed-in shortcut; awaits metadata;
    `Challenge`), `POST /logout` (anonymous; audits only with a session; 204), `GET /me`. Mapped in `ApiEndpoints`.
  - **Program.cs:** `AddOpenShiftIdentity()` after `AddInfrastructure()`, `AddPublicOrigin()`, `AddOpenShiftLogin()`.
  - **Config:** `appsettings.Development.json` (`Console:PublicOrigin`, `Auth:OpenShift:HostApiServerUrl`
    `http://localhost:5190` for running the Api alone, client id/secret per contract §11, `AdminGroups`, `AutoProvision`).
    AppHost: `api.WithEnvironment("Console__PublicOrigin", web.GetEndpoint("http"))` — Aspire accepted the
    bidirectional reference; **no Vite port pin needed**.
  - **Tests:** harness (`PostgresFixture`, `ApiFactory` refactor with variants/emulator/`LoginAsAsync`/`RunLoginAsync`,
    `TestOAuthServer` user pool, `OpenShiftHostStub`, `TestHostConfiguration`, `TestData`, `TokenLeakScanner` incl.
    `DumpDatabaseAsync`), integration (`AuthEndpointsTests`, `LoginOutcomeTests`, `SessionRevalidationTests`, OpenAPI
    and anonymous-surface updates), unit (`ReturnUrlPolicyTests`, `LoginFailureClassificationTests`,
    `PublicOriginOptionsTests`, `SessionValidatorTests`, `AuthenticationSetupTests` updated: `IClock`, interval 0).
    `ApiHostOverDatabase` and Production-environment derived hosts get offline `https://*.invalid` login config.
  - README "Logging in locally" updated; `schema.gen.ts` regenerated (auth paths, `CurrentUser`, `UserRole`).
- 2026-11-19 backend-engineer: **deviations from the design notes** (closest sound version, please confirm):
  1. `BuildRedirectUri` is **not virtual** in ASP.NET Core 10, so it can't be overridden. The handler overrides the two
     virtual methods that receive its result instead: `BuildChallengeUrl` (authorize) and `ExchangeCodeAsync` (token).
     Both use `{Console:PublicOrigin}/api/auth/callback`.
  2. **Endpoints are not copied into the options, and the options cache is not evicted on `MetadataChanged`.** That
     design can't work for the first login after the host comes back: `UseAuthentication` initializes the OAuth handler,
     and so reads its options, at the start of every request, before `/api/auth/login` awaits the metadata. That request
     would challenge with the placeholder endpoint. Instead, the options hold fixed `https://oauth-metadata-unavailable.invalid/`
     placeholders (the framework requires values), and the handler reads the real endpoints from
     `IOAuthServerMetadataProvider` when it uses them. Covered by `LoginOutcomeTests.HostBackAfterAnOutage_FirstLoginChallengesTheRealEndpoint`.
     `MetadataChanged` is now unused by the Api. Uses `IConfigureNamedOptions` rather than `IPostConfigureOptions` so the
     framework's post-configure doesn't create its own backchannel first.
  3. The token request is re-implemented in `ExchangeCodeAsync` (same form as the base) so that network failures and 5xx
     map to `unavailable`, other non-2xx and non-JSON bodies map to `failed`, and no remote body text reaches logs. The
     base can't tell these cases apart and throws on a non-JSON error body.
  4. `RemoteFailure` also maps OAuth `error=temporarily_unavailable|server_error` → `unavailable`.
  5. The session is issued with fresh `AuthenticationProperties { IsPersistent = true }`: nothing from the OAuth leg is
     carried over, and the cookie gets an `expires` of `SessionLifetime` (AUTH-4).
  6. `Auth:RevalidationInterval = 0` is now valid (every request). Before, it had to be > 0. The integration tests need
     zero, as this task specifies.
  7. OpenAPI enum: .NET 10 emits `UserRole` as `{ "enum": ["user","admin"] }` with no `type`. The assertion checks that
     the values are camelCase strings and that `type`, if present, is `string`. Adding `type: string` would take a schema
     transformer in `Api/OpenApi` (outside `paths`). Not needed for openapi-typescript, which already generates `"user" | "admin"`.
  8. `CapturedLogs` is reused from `tests/.../Identity/IdentityTestHost.cs` (T-0014) instead of a new copy in
     `Integration/`: same assembly, and moving it would edit a file outside `paths`.
- 2026-11-19 backend-engineer: checks. `dotnet build FleetConsole.slnx -warnaserror` passes. `dotnet test FleetConsole.slnx`
  passes: Domain 323, Application 206, Api 411 (Testcontainers on podman). End-to-end under
  `aspire start --launch-profile http` with the Vite URL `http://localhost:45723`, driven with curl:
  `GET <web>/api/auth/login?returnUrl=%2Fclusters` → 302 to `http://localhost:5190/oauth/authorize` with
  `redirect_uri=http://localhost:45723/api/auth/callback`, S256 PKCE, `scope=user:info`. POST picker `username=admin`
  → callback → 302 `/clusters` + `FleetConsole.Session` (HttpOnly, SameSite=Lax, expires +8 h). `GET <web>/api/auth/me` → 200
  `{"username":"admin","displayName":"Fleet Admin","role":"admin",...,"adminConfigurationSource":"group fleetconsole-admins"}`.
  Logout → 204, then `me` → 401. Then `aspire stop`: no listeners or containers left. `npm run gen:api` was run against
  the running Api. `npm run typecheck` **fails** at `web/src/shared/api/schema.test.ts:15` (see Handover notes). Not
  patched, as instructed.

- 2026-11-19 backend-engineer: **review round 1 fixes.**
  1. Token-exchange failure branches tested through HTTP (`Integration/TokenExchangeFailureTests.cs`). `OpenShiftHostStub`
     gained `TokenEndpointDown`, `TokenEndpointStatus` + `TokenEndpointBody`, and `Reset()`. Cases: 503 → unavailable,
     429 → unavailable, 400 `invalid_grant` with a marker in `error_description` → failed, 200 non-JSON → failed,
     200 `["…"]` / `"…"` → failed, 200 without `access_token` → failed, token endpoint unreachable → unavailable.
     Each ends on `/login?error=…&returnUrl=%2Fclusters` (the unreachable case proves `RememberReturnUrl`), with no
     session, `me` 401, an EventId 2200 entry with outcome and cause, and neither marker nor body in the captured logs.
  2. `OpenShiftOAuthHandler.ExchangeCodeAsync`: the parsed document must be a JSON object; otherwise it is disposed and
     the result is `failed`. **429 → `unavailable`** (my call: rate limiting is a server condition, and the code can't
     be retried anyway).
  3. The framework's Information log "Error from RemoteAuthentication" (remote `error_description`/`error_uri`) is
     suppressed. **Deviation from the suggested `AddFilter`:** rule selection prefers provider-specific rules over
     category rules, so a filter rule loses to any provider-scoped rule. Such rules include `Logging:Console:LogLevel`
     and the harness's capture provider, which would make the rule untestable. Instead the handler gets a
     `WarningOnlyLoggerFactory` (new `Auth/WarningOnlyLoggerFactory.cs`) whose loggers drop everything below Warning,
     whatever the configuration. Test: crafted callbacks with a valid state and `error=access_denied|server_error|invalid_request`,
     with a marker in `error_description`/`error_uri` → cancelled/unavailable/failed, and the marker is absent from the
     logs. Positive control: with the wrapper removed temporarily, the `server_error` and `invalid_request` cases fail
     (the `access_denied` message is fixed text).
  4. `MetadataChanged` is removed from `IOAuthServerMetadataProvider`, `OAuthServerMetadataProvider` and its tests (the
     warm-up test now polls `Current`). Docs of the port, the provider and `OpenShiftOAuthOptionsSetup` now refer to
     ADR-0018.
  5. `UserRole` `<summary>` is consumer-facing and the internal notes moved to `<remarks>`. `schema.gen.ts` regenerated
     against the running Api (`aspire start`, then stopped). The description now reads "The user's effective
     FleetConsole role: admin if assigned by an administrator or granted by configuration, otherwise user."
  - Optional: the ticket check now also requires the dotted keys to be a subset of `.issued`, `.expires`, `.persistent`.
  - Checks: `dotnet build FleetConsole.slnx -warnaserror` OK; `dotnet test FleetConsole.slnx` OK (Domain 323,
    Application 206, Api 422); `cd web && npm run typecheck` OK; `npm test -- --run` OK (29 files, 350 tests).
  - Note: ASP.NET Core's request-line log (`Microsoft.AspNetCore.Hosting.Diagnostics`, Information) quotes the full
    callback URL, including `code`, `state` and any `error_description`. `appsettings.json` filters `Microsoft.AspNetCore`
    to Warning, so production doesn't log it, but anyone who raises that category to Information will. The crafted-callback
    test excludes that category explicitly. Follow-up suggestion (CP3 hardening): redact the query of `/api/auth/callback`
    in request logging, or document the setting in the ops runbook.

## Review
### Round 1 — backend-architect, 2026-11-19 — **CHANGES_REQUESTED**
Checks run by the reviewer: `dotnet build FleetConsole.slnx -warnaserror` OK (0 warnings). `dotnet test FleetConsole.slnx`
OK (Domain 323, Application 206, Api 411). `cd web && npm run typecheck && npm test -- --run` OK (350) after the
orchestrator's `schema.test.ts` fix. E2E under Aspire was not re-run; the engineer's curl log is accepted.

Overall this is strong work. PKCE S256, `state` + correlation, `scope=user:info` and the configured `redirect_uri` are
asserted on the real challenge. `ReturnUrlPolicy` is tight: 5 AUTH-2 cases through the full flow plus 18 unit cases.
The cookie carries HttpOnly, SameSite=Lax, Secure on https / `Always` outside Development, and an 8 h persistent
expiry, with sliding renew tested. The session gets fresh properties, and the decrypted ticket is checked for exactly
the ADR-0009 claims. The AUTH-3 scan covers cookie, ticket, DB dump and logs. Revalidation (deactivate, stamp,
vanished user, unparseable claims) is fully tested. Logout CSRF is tested, and the anonymous surface is exact. Four
issues remain. Findings 1–2 are in the code that was re-implemented from the framework and was not tested on its own.

**Required (by severity)**
1. `tests/FleetConsole.Api.Tests/Integration/` (no test) — `OpenShiftOAuthHandler.ExchangeCodeAsync`'s failure branches
   have no test through HTTP. Only `Classify` is unit-tested on hand-made exceptions, and the emulator's happy path
   proves only the success form (verifier + redirect_uri). This is the security-relevant code we chose to own (ADR-0018).
   — Add token-endpoint switches to `OpenShiftHostStub` (e.g. `TokenEndpointStatus` + `TokenEndpointBody`, and a
   token-only connection failure). Then add integration tests that end on `/login?error=…&returnUrl=%2Fclusters` with
   no session cookie: 503 → `unavailable`; 400 `{"error":"invalid_grant","error_description":"<marker>"}` → `failed`;
   200 `not json` → `failed`; 200 `[]` → `failed` (see 2); token endpoint unreachable → `unavailable` (proves
   `RememberReturnUrl` keeps the return URL on the exception path). In each case assert that `factory.Logs.AllText`
   does not contain the marker/body.
2. `src/FleetConsole.Api/Auth/OpenShiftOAuthHandler.cs:126` — a 2xx JSON body that is not an object (`[]`, `"x"`) makes
   `OAuthTokenResponse`'s constructor throw `InvalidOperationException`, and the `JsonDocument` is never disposed. The
   outcome happens to be `failed`, but only by accident. — Parse, check `RootElement.ValueKind == JsonValueKind.Object`,
   and otherwise dispose and return `Failed(AuthenticationFailureException(...))`, like the non-JSON case.
3. `src/FleetConsole.Api/Auth/AuthenticationSetup.cs:101` (and the claim in `OpenShiftLoginEvents.cs:26`) — ASP.NET
   Core's `RemoteAuthenticationHandler` logs every failure's `Message` at Information ("Error from RemoteAuthentication:
   {ErrorMessage}", category `FleetConsole.Api.Auth.OpenShiftOAuthHandler`, which passes the `Microsoft.AspNetCore`
   filter). For authorize-leg errors, `OAuthHandler` builds that message as `error;Description=<error_description>;
   Uri=<error_uri>`, which is remote, attacker-influenceable text. The class doc says logs never carry messages from the
   remote side, and that is untrue today. — In `AddOpenShiftLogin`, add
   `builder.Logging.AddFilter(typeof(OpenShiftOAuthHandler).FullName, LogLevel.Warning)` with a comment (EventId 2200 is
   the record of the failure). Add a test: take the `state` from the authorize redirect, GET
   `/api/auth/callback?state=…&error=access_denied&error_description=<marker>` with the same client, expect
   `error=cancelled`, and expect the marker absent from `factory.Logs.AllText`.
4. `src/FleetConsole.Application/Auth/IOAuthServerMetadataProvider.cs:11,30`,
   `src/FleetConsole.Infrastructure/Identity/OAuthServerMetadataProvider.cs:24,67,114` — after deviation 2,
   `MetadataChanged` has no consumer, and the port's doc ("options … are rebuilt when MetadataChanged fires") is false.
   — Remove the event from the port and the implementation, its tests in `Identity/OAuthServerMetadataProviderTests.cs`,
   and the mention in `OpenShiftOAuthOptionsSetup`'s remarks. Fix the docs (ADR-0018 records the removal). Paths extended
   for this.
5. `src/FleetConsole.Domain/Users/UserRole.cs:3-7` — the summary is the OpenAPI description of `UserRole`, and it renders
   as "…It is never stored directly: UserRole User.Role derives it… used by `IRequireRole` in the Application layer"
   (broken cref text plus internal detail in the public contract). — Make the `<summary>` consumer-facing ("The user's
   effective FleetConsole role: `admin` if assigned by an admin or granted by configuration (ADR-0009), else `user`.")
   and move the implementation notes to `<remarks>`, which stays out of the description. Regenerate `schema.gen.ts`
   (`npm run gen:api`), then run `npm run typecheck`. Paths extended for this. It's a quick fix and the regen is needed
   anyway.

**Optional**
- `tests/.../Integration/AuthEndpointsTests.cs:125` — `Where(k => !k.StartsWith('.'))` lets any dotted item through. Assert
  the dotted keys are a subset of `.issued`, `.expires`, `.persistent` so a `.redirect`/`.xsrf` regression shows up.
- `OpenShiftOAuthHandler.ExchangeCodeAsync`: 429 currently maps to `failed`. `unavailable` would be the friendlier
  message. Your call.

**Rulings on the deviations and open points**
- **D1 (no `BuildRedirectUri` override → `BuildChallengeUrl` + `ExchangeCodeAsync`): accepted.** It is correct, and both
  legs send the identical configured URI. Recorded in ADR-0018.
- **D2 (endpoints read live from the provider, no eviction, `IConfigureNamedOptions`): accepted.** The analysis is
  right: the per-request handler instance is initialized by `UseAuthentication` before the endpoint awaits discovery.
  The design is also simpler than eviction. `HostBackAfterAnOutage_FirstLoginChallengesTheRealEndpoint` covers it.
  Consequence: finding 4.
- **D3 (re-implemented token request): accepted, subject to findings 1–2.** Against RFC 6749 §4.1.3/§5 and RFC 7636 §4.5,
  it matches the base exactly: `grant_type`, `code`, `redirect_uri` identical to the authorize leg, `client_id` +
  `client_secret` in the body (§2.3.1, same as the base), and `code_verifier` taken from the DP-protected state and
  removed from the properties. It is sent once, with no retries (`RemoveAllResilienceHandlers`), and a timeout is a
  `TaskCanceledException`, so it maps to `unavailable` correctly. §5.2 errors (400/401) → `failed` is right. A missing
  `access_token` is still rejected by the base.
- **D4 (`temporarily_unavailable`/`server_error` → `unavailable`): accepted.** RFC 6749 §4.1.2.1 defines both as
  server-side conditions. State and correlation are validated before the error parameter is read, so this can't be
  spoofed without a valid state.
- **D5 (fresh properties): accepted.** This is the right way to keep the OAuth leg out of the cookie.
- **D6 (`RevalidationInterval = 0` allowed): accepted.** It is a valid, explicit setting (one DB read per request), and
  production keeps 60 s. Noted in ADR-0018. Orchestrator: add "`0` = every request" to contract §12.
- **D7 (enum assertion without `type: string`): accepted.** The assertion checks what matters: camelCase string values,
  and if a type is present it is `string`. Follow-up (not this task): an OpenAPI schema transformer adding
  `type: string` to string enums (it also fixes `@enum {unknown}` in `schema.gen.ts`). Put it on T-0016 if convenient,
  else a small task.
- **D8 (`CapturedLogs` reused from `Identity/`): accepted.**
- **Per-variant database in one container: accepted.** Use variants only when configuration must differ, and create
  them once per class (`IAsyncLifetime`, as `SessionRevalidationTests` does) because each costs a migration run.
- **Emulator user pool (300 regular / 60 admin, per host): accepted.** Exhaustion throws with a clear message. Shared
  shipped users (`admin/alice/bob/ines`) are only for read-only assertions.
- `Hosting/PublicOriginOptions.cs` outside `paths`: accepted (named in the design notes).

**Docs done by the reviewer:** ADR-0018 (refines 0010; ADR-0010 status line and the ADR index updated). The harness
usage notes were copied into T-0016..T-0021 ("From T-0015"). BACKEND.md's Testing row already describes the harness.
The last acceptance box (build/lint/tests) can be ticked once findings 1–5 are green.

### Round 2 — backend-architect, 2026-11-19 — **APPROVE**
Checks run by the reviewer: `dotnet build FleetConsole.slnx -warnaserror` OK (0 warnings). `dotnet test FleetConsole.slnx`
OK (Domain 323, Application 206, Api 422). `cd web && npm run typecheck` OK, plus `src/shared/api` tests (35) OK. The
full web suite was not re-run because T-0042/T-0046 are editing `web/` in parallel.

All round-1 findings are resolved:
1. `TokenExchangeFailureTests`: 503, 429, 400 `invalid_grant`, non-JSON, `[]`/`"x"`, no `access_token`, and an
   unreachable token endpoint (the return URL is kept on the exception path). Each case ends on
   `/login?error=…&returnUrl=%2Fclusters` with no session and asserts the remote body is absent from the logs. The
   crafted-callback theory covers `error_description`/`error_uri`. The stub is reset after each test.
2. Non-object JSON is rejected and the document disposed (`OpenShiftOAuthHandler.ExchangeCodeAsync`).
3. **Ruling on `WarningOnlyLoggerFactory`: accepted.** The engineer is right that a category filter would lose to
   provider-specific rules. Capping the level inside the logger holds for every provider and configuration, the
   wrapper is small and documented, and the positive control (remove it → the marker leaks) proves the test can fail.
   The cost is that the handler's own Debug/Information diagnostics are gone, which is acceptable: EventId 2200 records
   every failure. ADR-0018 now describes this mechanism, and 429 → `unavailable` (reviewer doc fix).
4. `MetadataChanged` is removed from the port, the implementation and the tests, and the port doc is true again.
5. The `UserRole` summary is consumer-facing, the internal notes are in `<remarks>`, and `schema.gen.ts` is regenerated.
6. The ticket's dotted keys are restricted to `.issued/.expires/.persistent`.

**Ruling on the request-line log of the callback URL (`code`, `state`): CP3 follow-up, no action now.** It is
Information under `Microsoft.AspNetCore.Hosting.Diagnostics`, and `appsettings.json` keeps `Microsoft.AspNetCore` at
Warning in every environment. The exposure is limited: the code is single-use, expires in seconds, and is useless
without the PKCE verifier (inside the DP-protected state) and the client secret, and `state` is DP-encrypted. It is
still a "codes never in logs" rule (SECURITY.md) that only holds by configuration, which a provider-specific level can
override. CP3 must enforce it in code (cap that category, or redact the query of `/api/auth/callback`) and check the
OpenTelemetry `url.query` redaction. Recorded in SECURITY.md (reviewer doc fix). Orchestrator: add it to the HANDOVER
CP3 follow-ups.

Optional follow-up (unchanged from round 1): an OpenAPI transformer adding `type: string` to string enums (noted on T-0016).

## Handover notes
- **Frontend typecheck (for the frontend engineer / orchestrator):** `web/src/shared/api/schema.test.ts:15` asserts
  `paths['/api/auth/me']` equals the *contract* type. That held while `/me` wasn't generated. It is generated now, so the
  merged type correctly takes the generated path (ADR-0016), and the assertion fails. **This is not a contract
  deviation:** the 200 body (`CurrentUser`) matches contract §4.4 field for field (`role: "admin" | "user"`, nullable
  `displayName`/`adminConfigurationSource`). The only difference is the response key set: generated operations also list
  the group-level error statuses 400/403/404/409/500 (BACKEND.md: declared once on `/api`). Fix: point that assertion at
  a still contract-only path (e.g. `/api/clusters`) or assert `Gen.paths['/api/auth/me']`. Also note: `/api/auth/login`
  and `/logout` are now generated paths.
- **Test harness for T-0016..T-0021** (`tests/FleetConsole.Api.Tests/Integration/`):
  - `factory.LoginAsAsync(username)` → browser client (cookies, no redirects, `X-Console-Request: 1`) with a session.
    Users must exist in the emulator. Use `factory.NewUsername()` (no groups → regular user) or
    `factory.NewAdminUsername()` (in `fleetconsole-admins` → admin by configuration) for users no other test touches.
    Shipped users `admin/alice/bob/ines` are shared by every test. Pool sizes are in `TestOAuthServer` (300/60).
  - An admin by **assignment** (not configuration): `await factory.Data.UserAsync(role: UserRole.Admin)` (pre-created,
    username from the pool), then `LoginAsAsync(user.Username)`. A config admin can't be demoted (409
    `Users.AdminViaConfiguration`).
  - `factory.Data` (`TestData`): `UserAsync`, `DeactivateAsync`, `ReactivateAsync`, `SetReadOnlyAsync`, `SetRoleAsync`,
    `ClusterAsync`, `CredentialAsync` (encrypted via `ITokenProtector`; returns the plaintext for CRED-2 scans; fingerprint
    = first 8 hex of SHA-256, replace with T-0018's rule if it differs), `GrantAsync`, `FindUserAsync`,
    `AuditEntriesAsync(name)`. Each call saves in its own signed-in scope (actor `test-data`).
  - `factory.CreateVariantAsync(overrides, configureHost?, clock?)` → own database + own emulator in the same container.
    Dispose it (`await using`). Each variant costs a migration run (~1 s).
  - `factory.HostStub` (`Down`, `UsersEndpointStatus`, `IssuedAccessTokens`), `factory.Logs` (Debug+),
    `TokenLeakScanner.AssertAbsent(secret, ...)`, `TokenLeakScanner.DumpDatabaseAsync(factory.ConnectionString, ct)`.
  - Production-environment hosts derived with `WithWebHostBuilder(b => b.UseEnvironment("Production"))` get
    `TestHostConfiguration.Offline()` automatically.
- **ADR/doc follow-ups (architect):** ADR-0010 should be amended for deviations 1–3: no `BuildRedirectUri` override,
  endpoints read live from the provider, no options eviction. BACKEND.md needs no change. Contract §12 could note that
  `Auth:RevalidationInterval` may be `0`. Optional: a schema transformer adding `type: string` to enum schemas, and
  cleaning the `UserRole` XML doc (`<em>` and a `cref` leak into the OpenAPI description: "UserRole User.Role").
- **AppHost:** the `web` ⇄ `api` mutual endpoint reference works under Aspire 13.6.5. The fallback (pin the Vite port)
  was not needed.
- **CP2 note:** `PublicOriginOptions.GetOrigin()` is the value for the WebSocket `Origin` check.
