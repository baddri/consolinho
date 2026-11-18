---
id: T-0011
title: Authorization behaviors, typed current user, cookie scheme, CSRF middleware, API conventions
status: todo
owner: backend-engineer
checkpoint: 1
depends_on: [T-0007]
paths: [src/FleetConsole.Application/Abstractions/ICurrentUser.cs, src/FleetConsole.Application/Abstractions/Messaging/, src/FleetConsole.Application/Behaviors/, src/FleetConsole.Application/DependencyInjection.cs, src/FleetConsole.Api/Auth/, src/FleetConsole.Api/Http/, src/FleetConsole.Api/Endpoints/ApiEndpoints.cs, src/FleetConsole.Api/Endpoints/SystemEndpoints.cs, src/FleetConsole.Api/Endpoints/Admin/AdminEndpoints.cs, src/FleetConsole.Api/Program.cs, tests/FleetConsole.Application.Tests/, tests/FleetConsole.Api.Tests/Http/, tests/FleetConsole.Api.Tests/Integration/, tests/FleetConsole.Api.Tests/Auth/, web/src/shared/api/schema.gen.ts]
review_rounds: 0
---

## Goal
Put the request-level security plumbing in place once, before any CP1 endpoint exists: typed identity in the
Application layer, the authorization and read-only behaviors, the cookie authentication scheme with API-friendly
401/403, the CSRF middleware with tests (QA R2), the explicit anonymous surface (QA R3), the `/api/admin` group, and
API-wide enum serialization. Also resolves the HANDOVER item "replace `IRequireRole.RequiredRole: string` /
`ICurrentUser.UserId: Guid?`". **Parallel group W2** (with T-0008).

## Scope
- In: everything listed under design notes. Unit tests for behaviors; integration tests for CSRF and the anonymous surface.
- Out: OAuth, revalidation, auth endpoints (T-0015); real admin endpoints (T-0016+).

## Contract / design notes
Read ADR-0009 (typed identity, claims, cookie), ADR-0012 (CSRF, anonymous surface), ADR-0013 §6 (enums), contract §1–§2.

**Application**
```csharp
public interface ICurrentUser
{
    bool IsAuthenticated { get; }
    UserId? UserId { get; }
    string? Username { get; }
    bool IsReadOnly { get; }
    bool IsInRole(UserRole role);
}
public interface IRequireRole : IRequireAuthenticated { UserRole RequiredRole { get; } }
public interface IAdminRequest : IRequireRole { UserRole IRequireRole.RequiredRole => UserRole.Admin; }
```
- `AuthorizationBehavior<TRequest,TResponse>` (constraint `TRequest : IRequireAuthenticated` so DI skips it otherwise —
  same trick as `UnitOfWorkBehavior`): unauthenticated → `Error.Unauthorized("Auth.Unauthenticated", "Authentication required.")`;
  `IRequireRole` and not in role → `Error.Forbidden("Auth.Forbidden", "You don't have access to Administration.")`.
  Put these two errors in `Application/Abstractions/AuthErrors`.
- `ReadOnlyGuardBehavior` (constraint `TRequest : IMutatingCommand`): `currentUser.IsReadOnly` →
  `Error.Forbidden("Auth.ReadOnly", "Your account is read-only.")` (ADM-2).
- Register both in the reserved slots of `AddApplication()`; uncomment-and-replace the placeholder comments.
  Use `FailureResult<TResponse>` to build failures (as `ValidationBehavior` does).

**Api**
- `Auth/SessionClaims` — claim type constants `fc:uid`, `name`, `role`, `fc:ro`, `fc:stamp` (ADR-0009).
- `Auth/SessionUser` record `(UserId UserId, string Username, UserRole Role, bool IsReadOnly, Guid SecurityStamp)` and
  `Auth/SessionPrincipalFactory.Create(SessionUser) : ClaimsPrincipal` / `TryRead(ClaimsPrincipal, out SessionUser)` —
  the only code that writes or parses session claims. Role claim values `admin`/`user`.
- `Auth/HttpCurrentUser : ICurrentUser` (scoped, from `IHttpContextAccessor`), registered in Program.
- `Auth/AuthenticationSetup.AddApiAuthentication(builder)` — cookie scheme per ADR-0009 (name, HttpOnly, SameSite=Lax,
  secure policy, `Auth:SessionLifetime`, sliding), `OnRedirectToLogin` → 401 and `OnRedirectToAccessDenied` → 403 written
  as ProblemDetails via `IProblemDetailsService` with `code` `Auth.Unauthenticated` / `Auth.Forbidden`.
  `AddAuthorization` with policy `AuthorizationPolicies.Admin` (authenticated + role claim `admin`).
  T-0015 extends this file with OAuth and revalidation. Session settings come from `Api/Auth/SessionOptions`
  (bound to section `Auth`: `SessionLifetime` default 8 h, `RevalidationInterval` default 60 s, validated on start);
  the Application's `AuthOptions` (T-0014) binds the same section for the login rules — two small classes, one section.
- `Http/CsrfHeaderMiddleware` + `UseCsrfHeaderCheck()`; order in Program: `UseExceptionHandler` → `UseStatusCodePages`
  → `UseCsrfHeaderCheck` → `UseAuthentication` → `UseAuthorization` → endpoints. 403 body: `code`
  `Auth.CsrfHeaderMissing`, `detail` "Missing CSRF header."
- `Endpoints/ApiEndpoints`: `/api` group `.RequireAuthorization()`; `SystemEndpoints` `/info` `.AllowAnonymous()` with a
  `//` comment pointing to ADR-0012. Create `Endpoints/Admin/AdminEndpoints.MapAdminEndpoints(this RouteGroupBuilder api)`
  → `/api/admin` group `.RequireAuthorization(AuthorizationPolicies.Admin)`, tag `Admin`, called from `MapApiEndpoints`;
  it has no endpoints yet — feature tasks add one `Map<Feature>AdminEndpoints()` line each. Also add the shared body
  record `Endpoints/Admin/VersionRequest(uint Version)` (contract §7.2) with its XML doc, used by T-0016/T-0017. Update the `ApiEndpoints`
  remarks (CSRF is middleware now).
- `Http/JsonSetup.AddApiJson()`: add `JsonStringEnumConverter(JsonNamingPolicy.CamelCase, allowIntegerValues: false)`;
  extend the XML doc. Confirm the OpenAPI document renders enums as string enums (add an assertion once the first enum
  appears in a schema — T-0015 `CurrentUser.role`; leave a note).
- Regenerate `schema.gen.ts` if the document changed.

## Acceptance criteria
- [ ] HANDOVER item: `IRequireRole.RequiredRole` is `UserRole`, `ICurrentUser.UserId` is `UserId?`; docs updated.
- [ ] Behavior unit tests: anonymous → 401 error for `IRequireAuthenticated`; non-admin → 403 for `IAdminRequest`;
      read-only → 403 `Auth.ReadOnly` for `IMutatingCommand` only (queries and non-mutating commands pass) — ADM-1/ADM-2.
- [ ] AUTH-13 / QA R2: integration tests — POST, PUT, PATCH, DELETE to `/api/...` (existing and unknown paths) without
      the header → 403 ProblemDetails with `code: Auth.CsrfHeaderMissing`; with `X-Console-Request: 1` → not 403;
      `X-Console-Request: 0` → 403; GET/HEAD unaffected; `/apix` and non-`/api` paths unaffected.
- [ ] QA R3 / ADR-0012: test enumerating `EndpointDataSource` asserts that the only anonymous `/api` endpoints are the
      ADR-0012 list (today: `GET /api/system/info`; the test holds the full expected list so T-0015 only flips it on).
- [ ] `HttpCurrentUser` + `SessionPrincipalFactory` round-trip unit tests (incl. malformed claims → unauthenticated).
- [ ] BACKEND.md/SECURITY.md statements touched by this task still true (architect updated them in design; fix drift).
- [ ] Build, lint and tests green (CLAUDE.md rule 4).

## Work log

## Review

## Handover notes
