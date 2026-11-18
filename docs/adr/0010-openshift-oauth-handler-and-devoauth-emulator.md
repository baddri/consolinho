# 0010 — OpenShift OAuth handler wiring and the DevOAuth emulator
**Status:** Accepted (2026-11-18) · **Refines:** 0007

## Context
ADR-0007 decides *what* (server-side auth code + PKCE against the host cluster's OAuth server, identity from
`users/~`, own cookie session, `FleetConsole.DevOAuth` emulator for dev and tests). CP1 needs the *how*:
- endpoint discovery from `{hostApiServer}/.well-known/oauth-authorization-server` must not make the Api fail to start
  when the host cluster is down (AUTH-14);
- the callback must live under `/api/auth/...` because the Vite dev server proxies only `/api` (T-0004 review), and
  Vite uses `changeOrigin`, so the Api cannot derive the browser-visible origin from the request;
- login outcomes (not registered, deactivated, cancelled, unavailable) must land on `/login` with a message, never a
  500 or a raw error page;
- integration tests must run the real flow against the emulator in-process.

## Decision

### Api side (`Api/Auth/`, `Infrastructure/Identity/`)
- `AddOAuth<OpenShiftOAuthOptions, OpenShiftOAuthHandler>("OpenShift", ...)`. `OpenShiftOAuthHandler` subclasses
  `OAuthHandler<>` and overrides **only** `BuildRedirectUri` to use `Console:PublicOrigin` + `CallbackPath`.
  `CallbackPath = /api/auth/callback`, `UsePkce = true`, `Scope = ["user:info"]`, `SaveTokens = false`,
  `SignInScheme = Cookies`.
- **Public origin:** `Console:PublicOrigin` (absolute origin, no path), validated at startup, required outside
  Development. It is the single source for the OAuth `redirect_uri` and (CP2) the WebSocket `Origin` check. In dev the
  AppHost injects the Vite endpoint (`api.WithEnvironment("Console__PublicOrigin", web.GetEndpoint("http"))`);
  running the Api alone defaults to `http://localhost:5180` (appsettings.Development.json).
- **Discovery:** `IOAuthServerMetadataProvider` (Infrastructure singleton) fetches and caches the metadata
  (`authorization_endpoint`, `token_endpoint`). A hosted service warms it at startup (failure is logged, never fatal);
  failed fetches are retried on demand at most every 10 s. `GET /api/auth/login` awaits the provider **before**
  challenging; no metadata → redirect `/login?error=unavailable`. A `IPostConfigureOptions<OpenShiftOAuthOptions>`
  copies the cached endpoints into the options; when metadata first loads (or changes), the provider evicts the
  options from `IOptionsMonitorCache<OpenShiftOAuthOptions>` so the next handler instance sees them. Optional static
  overrides `Auth:OpenShift:AuthorizationEndpoint` / `TokenEndpoint` skip discovery.
- **Host API server TLS:** one named `HttpClient` (`"openshift-host"`) for the OAuth backchannel, discovery and
  `users/~`. Trusts `Auth:OpenShift:CaBundlePath` when set (in-cluster: the SA `ca.crt`), else system trust.
  `Auth:OpenShift:SkipTlsVerify` is honoured **only in Development** (startup error otherwise).
- **Identity:** `IExternalIdentityClient.GetCurrentUserAsync(accessToken, ct)` (Application port, Infrastructure impl)
  calls `GET {HostApiServerUrl}/apis/user.openshift.io/v1/users/~` → `ExternalIdentity(Username, FullName?, Groups)`.
  Called from `OnCreatingTicket`; the access token is not stored anywhere and goes out of scope there.
- **Sign-in decision** in `OnTicketReceived`: dispatch `CompleteLoginCommand(ExternalIdentity)`. Outcome `Allowed` →
  replace `context.Principal` with `SessionPrincipalFactory.Create(...)` and set `context.ReturnUri` to the
  sanitized return URL; outcome `Denied(reason)` → redirect to `/login?error=<code>...` and `HandleResponse()` (no
  cookie issued). `OnRemoteFailure` maps `error=access_denied` → `cancelled`, network/timeout/5xx from the host →
  `unavailable`, anything else (bad state, PKCE mismatch) → `failed`; logs with the trace id, never the code/token.
- **Return URL:** `ReturnUrlPolicy.Sanitize(string?)` (pure, unit-tested): accept only paths starting with a single
  `/`, not `//`, no `\`, no control chars, no scheme; otherwise `/`. Applied on `/api/auth/login` and again on the
  callback.

### DevOAuth emulator (`src/FleetConsole.DevOAuth`)
- Small ASP.NET Core minimal API, **no** reference to any FleetConsole project except ServiceDefaults, not referenced by the Api
  (architecture test). Emulates: `GET /.well-known/oauth-authorization-server`, `GET /oauth/authorize` (HTML user
  picker + Cancel), `POST /oauth/authorize` (selection → redirect with `code`), `POST /oauth/token`,
  `GET /apis/user.openshift.io/v1/users/~`. In-memory, single-use codes (60 s), opaque `sha256~`-style tokens.
  Validates `client_id`/`client_secret`, `redirect_uri` equality between authorize and token, PKCE (`S256`, `plain`).
  Users and clients come from its `appsettings.json` (`DevOAuth:Users`, `DevOAuth:Clients`). Exact contract:
  `docs/specs/CP1-api-contract.md` §11.
- Entry-point marker type `FleetConsole.DevOAuth.DevOAuthEntryPoint` so tests can use
  `WebApplicationFactory<DevOAuthEntryPoint>` alongside the Api's global `Program` without a name clash.
- AppHost: resource `devoauth` (`AddProject<Projects.FleetConsole_DevOAuth>`), Api gets
  `Auth__OpenShift__HostApiServerUrl` = its http endpoint and `.WaitFor(devoauth)`.
- Integration tests host the emulator in-process and point the Api's `"openshift-host"` client at the emulator's
  `TestServer` handler (`ConfigurePrimaryHttpMessageHandler` override in `ApiFactory`). A test helper drives the
  browser legs (login → authorize POST → callback) with a cookie-keeping client.
- Never deployed: the CP3 Containerfile publishes `FleetConsole.Api` only.

## Consequences
- Dev, tests and production run the identical Api code path; only configuration differs.
- The Api starts when the host OAuth server is down; logins show "unavailable" until it answers.
- Two subclass overrides (`BuildRedirectUri`) and an options-cache eviction are the only non-default pieces; both are
  documented in code and covered by integration tests.
