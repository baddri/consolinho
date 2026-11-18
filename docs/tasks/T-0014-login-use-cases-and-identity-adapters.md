---
id: T-0014
title: Login use cases (complete login, session state, current user, logout) and OpenShift identity adapters
status: todo
owner: backend-engineer
checkpoint: 1
depends_on: [T-0009, T-0011, T-0012]
paths: [src/FleetConsole.Application/Auth/, src/FleetConsole.Application/DependencyInjection.cs, src/FleetConsole.Infrastructure/Identity/, src/FleetConsole.Infrastructure/DependencyInjection.cs, tests/FleetConsole.Application.Tests/Auth/, tests/FleetConsole.Api.Tests/Identity/]
review_rounds: 0
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
- [ ] Handler unit tests (fakes, no EF): AUTH-5 provisioning (+ `user.provisioned` / `auth.login` events raised);
      AUTH-6 AutoProvision=false → NotRegistered + `auth.login_denied` recorded, pre-created user logs in; AUTH-7
      deactivated → Deactivated + recorded; AUTH-8 bootstrap user and admin group → Admin with source text, role-change
      event with `Configuration` source only when it changes; removal from group → back to User unless assigned (Q8).
- [ ] `GetSessionStateQuery` / `GetCurrentUserQuery` / `LogOutCommand` tests; `AdminConfigurationResolver` table test.
- [ ] Adapter tests against the in-process DevOAuth emulator (T-0009): discovery, `users/~` mapping, 401 →
      `ExternalIdentityUnavailableException`, unreachable host → null metadata then recovery after the retry window
      (use `TimeProvider`/`IClock`), static override bypasses discovery.
- [ ] AUTH-3 groundwork: the access token never appears in captured logs of these tests.
- [ ] Build, lint and tests green (CLAUDE.md rule 4).

## Contract amendments (orchestrator 2026-11-18)
- `users/~` returns OCP virtual groups (`system:authenticated`, `system:authenticated:oauth`) — see T-0009 notes and contract §11. Ignore `system:*` groups for admin-group matching and display; storing them is allowed.

## Work log

## Review

## Handover notes
