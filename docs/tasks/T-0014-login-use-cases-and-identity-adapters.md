---
id: T-0014
title: Login use cases (complete login, session state, current user, logout) and OpenShift identity adapters
status: done
owner: backend-engineer
checkpoint: 1
depends_on: [T-0009, T-0011, T-0012]
paths: [src/FleetConsole.Application/Auth/, src/FleetConsole.Application/DependencyInjection.cs, src/FleetConsole.Infrastructure/Identity/, src/FleetConsole.Infrastructure/DependencyInjection.cs, tests/FleetConsole.Application.Tests/Auth/, tests/FleetConsole.Api.Tests/Identity/]
review_rounds: 1
---

## Goal
Implement the identity decisions of CP1 as testable Application use cases (provision / refuse / bootstrap admins /
config-sourced role, AUTH-5..8, AUTH-11 data source) and the Infrastructure adapters that talk to the host cluster
(`users/~`, OAuth metadata discovery). The Api wiring (T-0015) then only translates HTTP ⇄ these use cases.
**Wave W4**, parallel with T-0013 (worktree).

## Scope
- In: the Application use cases and ports below, `AuthOptions`, `AdminConfigurationResolver`, Infrastructure
  `OpenShiftUserClient`, `OAuthServerMetadataProvider` + warm-up hosted service, named HttpClient `"openshift-host"`
  with TLS settings, `OpenShiftHostOptions`; unit + adapter tests.
- Out: OAuth handler, cookie events, endpoints, AppHost changes (T-0015).

## Contract / design notes
Read ADR-0007, ADR-0009, ADR-0010, ADR-0008 §4 (denied login is a *successful* command outcome so its audit entry is
saved). Contract §4.4 (`CurrentUserDto`), §10 (`auth.*`, `user.provisioned`, `user.promoted/demoted`), §12 (config).

**Application/Auth/**
```csharp
public sealed class AuthOptions   // section "Auth"
{ public bool AutoProvision { get; set; } = true; public IList<string> BootstrapAdminUsers { get; } = []; public IList<string> AdminGroups { get; } = []; }

public sealed record ExternalIdentity(string Username, string? FullName, IReadOnlyList<string> Groups);
public interface IExternalIdentityClient
{   /// GET users/~ on the host API server. Throws ExternalIdentityUnavailableException on network/TLS/5xx/401.
    Task<ExternalIdentity> GetCurrentUserAsync(SensitiveString accessToken, CancellationToken ct); }
public sealed class ExternalIdentityUnavailableException : Exception;

public sealed record OAuthServerMetadata(Uri AuthorizationEndpoint, Uri TokenEndpoint);
public interface IOAuthServerMetadataProvider
{   OAuthServerMetadata? Current { get; }                                  // last good value, null until loaded
    ValueTask<OAuthServerMetadata?> GetAsync(CancellationToken ct);        // loads if needed; null when unavailable
    event Action? MetadataChanged; }                                       // Api evicts its OAuth options cache (ADR-0010)

public static class AdminConfigurationResolver
{   public static string? Resolve(string username, IReadOnlyList<string> groups, AuthOptions options); }
    // "user list" if in BootstrapAdminUsers (ordinal), else "group <g>" for the first AdminGroups entry the user has, else null

// CompleteLogin/
public sealed record CompleteLoginCommand(ExternalIdentity Identity) : ICommand<LoginOutcomeDto>;   // anonymous; not IMutatingCommand
public enum LoginDecision { Allowed, NotRegistered, Deactivated }
public sealed record LoginOutcomeDto(LoginDecision Decision, SessionUserDto? User);   // User set only when Allowed
public sealed record SessionUserDto(UserId UserId, string Username, UserRole Role, bool IsReadOnly, Guid SecurityStamp);

// GetSessionState/   (internal-use query, NOT IRequireAuthenticated — ADR-0009)
public sealed record GetSessionStateQuery(UserId UserId) : IQuery<SessionStateDto>;   // Users.NotFound when missing
public sealed record SessionStateDto(UserId UserId, string Username, UserRole Role, bool IsReadOnly, bool IsActive, Guid SecurityStamp);

// GetCurrentUser/
public sealed record GetCurrentUserQuery : IQuery<CurrentUserDto>, IRequireAuthenticated;   // CurrentUserDto per contract §4.4

// LogOut/
public sealed record LogOutCommand : ICommand, IRequireAuthenticated;   // records auth.logout via IAuditTrail
```
`CompleteLoginHandler` flow: parse `Username` (invalid → treat as NotRegistered + audit) → load user →
- missing & `AutoProvision` → `User.Provision` + `Add` → `RecordLogin(..., provisioned: true)` → Allowed;
- missing & !`AutoProvision` → `IAuditTrail.Record(auth.login_denied, reason notRegistered, actor
  AuditActor.Anonymous(username))` → NotRegistered;
- deactivated → `auth.login_denied` (deactivated, actor = the user) → Deactivated;
- else `RecordLogin(fullName, groups, AdminConfigurationResolver.Resolve(...), provisioned: false, now)` → Allowed.
`SessionUserDto`/`SessionStateDto` are internal plumbing (not HTTP DTOs); keep the `Dto` suffix rule anyway.
Note: `CompleteLoginCommand`'s `ToString` must not include anything sensitive (it carries no token — keep it that way).

**Infrastructure/Identity/**
- `OpenShiftHostOptions` (section `Auth:OpenShift`): `HostApiServerUrl` (required), `ClientId`, `ClientSecret`,
  `AuthorizationEndpoint?`, `TokenEndpoint?`, `CaBundlePath?`, `SkipTlsVerify` (Development only — fail validation
  otherwise). `ValidateOnStart`.
- Named HttpClient `"openshift-host"` (constant `OpenShiftHostHttpClient.Name`) with a primary handler honouring
  CA/skip settings and a 10 s timeout; **no** standard resilience retries on the token POST (codes are single-use) — if
  ServiceDefaults adds resilience to all clients, opt this one out and comment why.
- `OpenShiftUserClient : IExternalIdentityClient` — `GET {HostApiServerUrl}/apis/user.openshift.io/v1/users/~` with
  Bearer; maps `metadata.name`, `fullName`, `groups`. Never logs the token.
- `OAuthServerMetadataProvider : IOAuthServerMetadataProvider` (singleton): static overrides win; else fetch
  `{HostApiServerUrl}/.well-known/oauth-authorization-server`; cache on success; on failure log a warning (no secrets)
  and allow a retry after 10 s; raises `MetadataChanged` when the value first loads or changes.
  `OAuthMetadataWarmupService : IHostedService` triggers one non-blocking load at startup.

## Acceptance criteria
- [x] Handler unit tests (fakes, no EF): AUTH-5 provisioning (+ `user.provisioned` / `auth.login` events raised);
      AUTH-6 AutoProvision=false → NotRegistered + `auth.login_denied` recorded, pre-created user logs in; AUTH-7
      deactivated → Deactivated + recorded; AUTH-8 bootstrap user and admin group → Admin with source text, role-change
      event with `Configuration` source only when it changes; removal from group → back to User unless assigned (Q8).
- [x] `GetSessionStateQuery` / `GetCurrentUserQuery` / `LogOutCommand` tests; `AdminConfigurationResolver` table test.
- [x] Adapter tests against the in-process DevOAuth emulator (T-0009): discovery, `users/~` mapping, 401 →
      `ExternalIdentityUnavailableException`, unreachable host → null metadata then recovery after the retry window
      (use `TimeProvider`/`IClock`), static override bypasses discovery.
- [x] AUTH-3 groundwork: the access token never appears in captured logs of these tests.
- [x] Build, lint and tests green (CLAUDE.md rule 4).

## Contract amendments (orchestrator 2026-11-18)
- `users/~` returns OCP virtual groups (`system:authenticated`, `system:authenticated:oauth`) — see T-0009 notes and contract §11. Ignore `system:*` groups for admin-group matching and display; storing them is allowed.

## Work log
- 2026-11-19 — backend-engineer: started (after T-0013 merge at 810565c, main tree per orchestrator ruling).
- 2026-11-19 — backend-engineer: implemented Application/Auth (ports, `AuthOptions`, `AdminConfigurationResolver`,
  `OpenShiftGroups`, CompleteLogin / GetSessionState / GetCurrentUser / LogOut) and Infrastructure/Identity
  (`OpenShiftHostOptions` + validator, `"openshift-host"` client, `OpenShiftUserClient`, `OAuthServerMetadataProvider`,
  `OAuthMetadataWarmupService`, `AddOpenShiftIdentity()`). Tests: Application `Auth/` (35 new), Api `Identity/` (27).
  `dotnet build FleetConsole.slnx -warnaserror` 0 warnings; `dotnet test FleetConsole.slnx` (podman) Domain 323,
  Application 202, Api 302, all green. No containers/processes left over.
- **Deviations / rulings applied:**
  1. **`SessionUserDto` → `SignedInUserDto`** (accepted by orchestrator). The Api already has `Auth/SessionUser`, and
     `SchemaNamingTests` forbids a `FooDto` next to a `Foo`. `LoginOutcomeDto.User` is now `SignedInUserDto?`.
     The task's design block above still shows the old name; the contract should be amended.
  2. **`AddOpenShiftIdentity()` is separate from `AddInfrastructure`** (ruling 2): `Auth:OpenShift` is required and
     validated on start, so wiring it into `AddInfrastructure` would break every host without login config. T-0015 calls
     it from `Program.cs`. `AuthOptions` (section `Auth`) is bound + validated in `AddInfrastructure`.
  3. **`system:*` groups are filtered once at login, before storing** (ruling 3; `OpenShiftGroups.WithoutVirtualGroups`).
     The resolver also ignores them, `GetCurrentUser` filters again (old rows). `Auth:AdminGroups` validation refuses
     `system:*` entries (everyone is in them).
  4. **No resilience handlers at all on `"openshift-host"`** (ruling 3) via `RemoveAllResilienceHandlers()`, which is
     marked experimental (EXTEXP0001): suppressed locally with a comment; `OpenShiftIdentityRegistrationTests` proves
     no retries under the real `AddServiceDefaults()` (503 → one attempt; structural check with a positive control).
- **Other choices:** `/me` for a session whose user row is missing → `Auth.Unauthenticated` (not 404). `GetCurrentUser`
  takes role/read-only from the session (contract §4.4), profile from the DB. Unusable username from `users/~` →
  NotRegistered + `auth.login_denied` with actor `(unknown)` when blank. `users/~` 401/5xx/network/timeout →
  `ExternalIdentityUnavailableException`; other statuses / malformed body → `InvalidOperationException` (→ `failed`).
  Static OAuth endpoints must be set together (validation). `CaBundlePath` replaces system trust (ADR-0010 wording);
  the bundle must therefore cover the API server and the OAuth route. Metadata is cached for the process lifetime once
  loaded, so `MetadataChanged` fires once. Provider uses `IClock` (not `TimeProvider`) like the rest of the app.
  Log event ids 3300–3301 (users/~), 3310–3311 (discovery).
- **Edits outside `paths`** (minimal, forced): `Infrastructure.csproj` (+ `Microsoft.Extensions.Http.Resilience`
  reference, version already central), `tests/FleetConsole.Application.Tests/ServiceProviderBuilder.cs` (+ `AddOptions`,
  in-memory `IUserRepository`/`IReadModel`, because validate-on-build constructs the new handlers).
- 2026-11-19 — backend-engineer: review round 1 fixes.
  1. https only outside Development: `OpenShiftHostOptionsValidator` requires `https` for `HostApiServerUrl` and both
     static endpoints unless Development (key-only messages). `OAuthServerMetadataProvider` accepts discovered `http`
     endpoints only when the host URL is `http`; otherwise warning 3310 "document without https endpoints" + null.
     Tests: Production + http host / http static endpoint → `OptionsValidationException`; Production + https → starts
     (positive control); https host with discovered http `token_endpoint` → null + warning.
  2. CA bundle parsed in the validator (`ImportFromPemFile`, ≥ 1 certificate; message names the key only). Test with a
     garbage file.
  3. `OpenShiftUserClient` no longer uses `ResponseHeadersRead`: the body is buffered inside `SendAsync`, so the 10 s
     timeout covers it and a body-read network error is an `HttpRequestException` → `ExternalIdentityUnavailableException`
     (comment in code). Test with a stream that breaks mid-body (fails with the old code: the `IOException` escaped).
  Optional items done: `_retryNotBefore` stored as UTC ticks with `Volatile.Read/Write`; `HostUri` moved to
  `Identity/HostUri.cs`; table test pinning `GetSessionState`'s role projection to `User.Role` (4 combinations).
  Gates: build 0 warnings; tests Domain 323, Application 206, Api 308, all green (podman). No containers left.
  No git write commands used in the shared tree.

## Review
**Round 1 — backend-architect, 2026-11-19: CHANGES_REQUESTED**

Checks: `dotnet build FleetConsole.slnx -warnaserror` 0 warnings; `dotnet test FleetConsole.slnx` (podman) Domain 323,
Application 202, Api 302, all green.

Overall the work is strong. Layering is right, the handlers stay thin, the denial and audit conventions match T-0013,
there are no tokens in logs or exception messages, the no-retry claim is proven against real ServiceDefaults with a
positive control, and the CA trust is tested against a real TLS server. Three security/correctness gaps remain in the
host adapter, all small:

1. `src/FleetConsole.Infrastructure/Identity/OpenShiftHostOptionsValidator.cs:20-43` and
   `OAuthServerMetadataProvider.cs:155-157`. Plain `http://` is accepted in every environment, for
   `HostApiServerUrl`, the static endpoints and the discovered endpoints. Outside Development this would send the
   client secret (the SA token), the authorization code and the user's access token in cleartext. T-0010 already
   refuses this for managed clusters.
   **Required fix:** outside Development, require `https` for `HostApiServerUrl` and both static endpoints (key-only
   messages, as now). In the provider, accept discovered `http` endpoints only when `HostApiServerUrl` is itself
   `http` (which is then possible only in Development). Otherwise log 3310 "document without https endpoints" and
   return null. Tests: Production + `http://` host → `OptionsValidationException`; https host whose discovery
   document has an http `token_endpoint` → null + warning.
2. `OpenShiftHostOptionsValidator.cs:45-48` with `OpenShiftHostHttpClient.cs:88-101`. A `CaBundlePath` that exists
   but holds no readable PEM passes validation and only fails when the first handler is built.
   - With discovery, the `InvalidOperationException` escapes `FetchAsync` (its catch filter doesn't cover it). It then
     faults the warm-up `BackgroundService`, which stops the host with a generic error.
   - With static endpoints, the first login fails instead.

   **Required fix:** check the bundle in the validator (`ImportFromPemFile`, at least 1 certificate; message names the
   key only) so a bad bundle is a startup validation error like the other keys. Add a test with a garbage file.
3. `OpenShiftUserClient.cs:47,73-81`. With `HttpCompletionOption.ResponseHeadersRead`, `HttpClient.Timeout` stops at
   the headers. A host that stalls mid-body then hangs the login callback with no limit. A network error while reading
   the body (`HttpRequestException`/`IOException`) also escapes unclassified, when the port contract says it is
   "unavailable".
   **Required fix:** drop `ResponseHeadersRead`. The body is a few hundred bytes, so buffering it inside the timeout
   is correct. Alternatively, put the body read under the same catch/timeout. No new test is needed if you drop the
   option; a one-line comment on why is enough.

Optional (not blocking):
- `OAuthServerMetadataProvider.cs:38,77`: `_retryNotBefore` (a 16-byte `DateTimeOffset`) is read outside the lock, so
  a torn read is possible. The only effect is a spurious early null or an extra attempt. Store it as `long` UTC ticks
  with `Volatile.Read/Write`, or drop the unlocked fast-path check.
- `OpenShiftUserClient.cs:117-133`: `HostUri` is shared by two adapters; give it its own file.
- `GetSessionStateHandler.cs:22` restates `User.Role` as a projection, which is fine because `Role` isn't mapped. A
  table test over the four assignment/configuration combinations against `User.Role` would catch drift.

Rulings on the engineer's choices:
- **`/me` for a vanished user → 401 `Auth.Unauthenticated`: accepted.** It fails closed and agrees with revalidation:
  `GetSessionState` → `Users.NotFound` → `SessionValidator` rejects the cookie, so both paths say "not signed in". A 404
  would wrongly tell the SPA the session is valid.
- **`users/~` classification: accepted.** 401/5xx/network/TLS/timeout → `unavailable` (retrying the login can help);
  any other status (e.g. 403 when the scope lacks `user:info`) or a malformed body → `failed` (misconfiguration; a
  retry won't help). Finding 3 is needed for "timeout/network" to hold for the body too.
- **Metadata cached for the process lifetime: accepted.** The OAuth route moving on a running host cluster is rare, and
  a restart fixes it. `MetadataChanged` firing exactly once keeps T-0015's options eviction simple. Follow-up (b) is
  recorded.
- **`RemoveAllResilienceHandlers` under a scoped `EXTEXP0001` suppression: accepted.** It is the documented opt-out from
  `ConfigureHttpClientDefaults`. The pragma covers only the registration, the reason is commented, and
  `OpenShiftIdentityRegistrationTests` (503 → one attempt, plus a structural check with a positive control) fails if a
  package upgrade changes its behaviour. Dropping resilience on the GETs too is deliberate and acceptable.
- **CA bundle replaces system trust (`CustomRootTrust`): accepted for CP1** (ADR-0010 wording). Consequence for CP3: in
  cluster the bundle must be the SA `ca.crt` concatenated with the ingress CA that signs the OAuth route
  (`openshift-config-managed/default-ingress-cert`), or a public root if the route uses a public certificate. This is a
  CP3 deploy follow-up. I updated SECURITY.md to say this.
- **`AddOpenShiftIdentity()` separate from `AddInfrastructure`, required on every Api host once T-0015 calls it:
  accepted.** I added the consequences to T-0015's task file, in the "From T-0014" section: the config for every
  `Program` test host, including the Production ones in `ExceptionPipelineTests`, `ApiHostOverDatabase` added to its
  paths, and no outbound warm-up from test hosts.
- **Edits outside `paths` (`Infrastructure.csproj` + `Microsoft.Extensions.Http.Resilience`, `ServiceProviderBuilder.cs`):
  accepted.** Both are minimal, forced by the design and commented. The package version is central and already used by
  ServiceDefaults.
- **`SessionUserDto` → `SignedInUserDto`, filtering `system:*` at login, refusing `system:*` in `AdminGroups`:**
  consistent with the contract amendment at HEAD (5ff1adb).

Doc fix made by the reviewer: `docs/architecture/SECURITY.md` host TLS bullet (bundle replaces system trust and must
cover the OAuth route; https outside Development; no retries on the host client).

**Round 2 — backend-architect, 2026-11-19: APPROVE**

Checks: `dotnet build FleetConsole.slnx -warnaserror` 0 warnings; `dotnet test FleetConsole.slnx` (podman) Domain 323,
Application 206, Api 308, all green.

All three required findings are resolved:
1. https outside Development: `OpenShiftHostOptionsValidator` now allows `http` only in Development, for the host URL
   and both static endpoints, with key-only messages. The provider accepts discovered `http` endpoints only when the
   host itself is `http`; otherwise it logs 3310 "without https endpoints" and returns null. Tested: Production plus an
   http host or token endpoint fails startup, and an https host with an http `token_endpoint` gives null and a warning.
2. CA bundle: the validator parses the PEM (the same parser as `OpenShiftHostTrust`, certificates disposed, IO errors
   caught). Tested: a garbage file fails startup.
3. `users/~` uses the default `ResponseContentRead`, with a comment explaining why. The client timeout now covers the
   body, and a body-read failure surfaces as `HttpRequestException` → `ExternalIdentityUnavailableException`.

The optional items are done too: Volatile ticks for `_retryNotBefore`, `HostUri.cs` in its own file, and the
role-projection table test (it runs on the in-memory read model, so it pins the logic, not the EF translation; that is
enough).

Nothing new found.

## Handover notes
- **For T-0015 (wiring):**
  - Call `builder.AddOpenShiftIdentity()` (namespace `FleetConsole.Infrastructure.Identity`) in `Program.cs`, after
    `AddInfrastructure()` (it needs `IClock` from there). It registers `OpenShiftHostOptions` (`Auth:OpenShift`,
    `ValidateOnStart`: `HostApiServerUrl`, `ClientId`, `ClientSecret` required; static endpoints both-or-neither;
    `CaBundlePath` must exist; `SkipTlsVerify` Development only), the `OpenShiftHostHttpClient.Name` client,
    `IExternalIdentityClient`, `IOAuthServerMetadataProvider` (singleton) and the warm-up hosted service.
  - Every Api host then needs `Auth:OpenShift:*`: add the contract §11 dev values to `appsettings.Development.json`
    (`HostApiServerUrl` comes from the AppHost) and to every test host, including the non-Development ones in
    `ExceptionPipelineTests`. `IdentityTestHost.DevConfiguration()` in `tests/FleetConsole.Api.Tests/Identity/` shows the
    minimum.
  - OAuth backchannel: `IHttpClientFactory.CreateClient(OpenShiftHostHttpClient.Name)` (no retries, 10 s timeout).
    Tests override its primary handler with `services.AddHttpClient(OpenShiftHostHttpClient.Name).ConfigurePrimaryHttpMessageHandler(() => devOAuth.Server.CreateHandler())`.
  - `CompleteLoginCommand` returns `LoginOutcomeDto(Decision, SignedInUserDto?)`; map `SignedInUserDto` to the Api's
    `SessionUser` for `SessionPrincipalFactory.Create`. Denials are successful results (audit saved). A racing first login
    of the same new user can come back as 409 `Persistence.DuplicateKey`; treat it as `failed`.
  - `OnRemoteFailure`: `ExternalIdentityUnavailableException` → `unavailable`; `InvalidOperationException` from the
    client → `failed`.
  - `GetSessionStateQuery` returns `Users.NotFound` for a missing user. `GetCurrentUserQuery` returns
    `Auth.Unauthenticated` when the session's user row is missing. `LogOutCommand` needs a session (dispatch only when
    authenticated); it is not `IMutatingCommand`, so read-only users can log out.
- **Contract amendment needed:** §4/T-0014 design: `SessionUserDto` → `SignedInUserDto`. Contract §4.4 `groups`:
  virtual `system:*` groups are never stored or shown. §12: `Auth:AdminGroups` refuses `system:*` entries, and the
  static OAuth endpoints must be set together.
- **Follow-ups:** (a) `RemoveAllResilienceHandlers` is experimental (EXTEXP0001); re-check on package upgrades (the
  registration test fails if it stops working). (b) Metadata never refreshes after the first success; add a refresh if
  an OAuth route move without restart ever matters.
