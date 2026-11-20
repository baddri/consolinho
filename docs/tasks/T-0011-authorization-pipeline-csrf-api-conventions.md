---
id: T-0011
title: Authorization behaviors, typed current user, cookie scheme, CSRF middleware, API conventions
status: done
owner: backend-engineer
checkpoint: 1
depends_on: [T-0007]
paths: [src/FleetConsole.Application/Abstractions/ICurrentUser.cs, src/FleetConsole.Application/Abstractions/Messaging/, src/FleetConsole.Application/Behaviors/, src/FleetConsole.Application/DependencyInjection.cs, src/FleetConsole.Api/Auth/, src/FleetConsole.Api/Http/, src/FleetConsole.Api/Endpoints/ApiEndpoints.cs, src/FleetConsole.Api/Endpoints/SystemEndpoints.cs, src/FleetConsole.Api/Endpoints/Admin/AdminEndpoints.cs, src/FleetConsole.Api/Program.cs, tests/FleetConsole.Application.Tests/, tests/FleetConsole.Api.Tests/Http/, tests/FleetConsole.Api.Tests/Integration/, tests/FleetConsole.Api.Tests/Auth/, web/src/shared/api/schema.gen.ts]
review_rounds: 2
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
  T-0015 extends this file with OAuth and revalidation. Session settings come from `Api/Auth/ConsoleSessionOptions`
  (renamed in review from `SessionOptions`, which clashed with `Microsoft.AspNetCore.Builder.SessionOptions`)
  (bound to section `Auth`: `SessionLifetime` default 8 h, `RevalidationInterval` default 60 s, validated on start);
  the Application's `AuthOptions` (T-0014) binds the same section for the login rules — two small classes, one section.
- `Http/CsrfHeaderMiddleware` + `UseCsrfHeaderCheck()` (exempt methods GET/HEAD/OPTIONS only — contract §1, ADR-0012 amendment); order in Program: `UseExceptionHandler` → `UseStatusCodePages`
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
- [x] HANDOVER item: `IRequireRole.RequiredRole` is `UserRole`, `ICurrentUser.UserId` is `UserId?`; docs updated.
- [x] Behavior unit tests: anonymous → 401 error for `IRequireAuthenticated`; non-admin → 403 for `IAdminRequest`;
      read-only → 403 `Auth.ReadOnly` for `IMutatingCommand` only (queries and non-mutating commands pass) — ADM-1/ADM-2.
- [x] AUTH-13 / QA R2: integration tests — POST, PUT, PATCH, DELETE to `/api/...` (existing and unknown paths) without
      the header → 403 ProblemDetails with `code: Auth.CsrfHeaderMissing`; with `X-Console-Request: 1` → not 403;
      `X-Console-Request: 0` → 403; GET/HEAD unaffected; `/apix` and non-`/api` paths unaffected.
- [x] QA R3 / ADR-0012: test enumerating `EndpointDataSource` asserts that the only anonymous `/api` endpoints are the
      ADR-0012 list (today: `GET /api/system/info`; the test holds the full expected list so T-0015 only flips it on).
- [x] `HttpCurrentUser` + `SessionPrincipalFactory` round-trip unit tests (incl. malformed claims → unauthenticated).
- [x] BACKEND.md/SECURITY.md statements touched by this task still true (architect updated them in design; fix drift).
- [x] Build, lint and tests green (CLAUDE.md rule 4).

## Contract amendments (orchestrator 2026-11-18)
- The OpenAPI document must declare `code` and `traceId` extensions on the ProblemDetails/HttpValidationProblemDetails schemas (contract §1 Errors row).
- Contract-first FE types (ADR-0016): after regenerating `schema.gen.ts`, also run `cd web && npm run typecheck`. A failure means the Api deviates from the contract — report it in NOTES, don't patch web/ silently.

## Work log
- 2026-11-18 (backend-engineer): started. Read CLAUDE.md, BACKEND.md, SECURITY.md, ADR-0009/0012/0013/0014/0017, contract §1–§3 + amendments.
- 2026-11-19 (backend-engineer): implemented.
  - Application: `ICurrentUser` (`UserId?`, `IsReadOnly`, `IsInRole(UserRole)`), `IRequireRole.RequiredRole: UserRole`,
    new `IAdminRequest` (DIM → `UserRole.Admin`), `Abstractions/AuthErrors` (Unauthenticated, Forbidden **and ReadOnly** —
    kept all three auth errors together), `AuthorizationBehavior` (constraint `IRequireAuthenticated`) and
    `ReadOnlyGuardBehavior` (constraint `IMutatingCommand`) registered in their reserved slots. Neither constrains
    `TResponse`: a protected request with a non-`Result` response throws via `FailureResult` instead of DI silently
    skipping the check (tested).
  - Api/Auth: `SessionDefaults` (scheme `Cookies`, cookie `FleetConsole.Session` — ADR-0009 names the constant),
    `SessionClaims`, `SessionUser`, `SessionPrincipalFactory` (strict parse: missing/duplicated/malformed claim → no
    session), `HttpCurrentUser` (scoped, cached per principal instance), `AuthorizationPolicies.Admin`, `SessionOptions`
    (`Auth` section, validated on start), `AuthenticationSetup.AddApiAuthentication()`; 401/403 written through the
    central `Error.ToProblemDetails()` so bodies match every other API error.
  - Api/Http: `CsrfHeaderMiddleware` + `UseCsrfHeaderCheck()` (segment match, case-insensitive like routing; exactly one
    header value `1`; exempt GET/HEAD/OPTIONS/TRACE per ADR-0012), `JsonSetup` enum converter,
    `ProblemDetailsSchemaTransformer` (contract amendment: `code`/`traceId` on both problem schemas, optional strings).
  - Endpoints: `/api` `.RequireAuthorization()`, `/api/system/info` `.AllowAnonymous()`, `Admin/AdminEndpoints` (policy
    `Admin`, tag `Admin`, no endpoints yet), `Admin/VersionRequest`. Program order as specified.
  - **Outside `paths`:** (1) `src/FleetConsole.Api/OpenApi/OpenApiSetup.cs` — one `AddSchemaTransformer` line + remark,
    needed for the contract amendment; (2) `docs/architecture/BACKEND.md`/`SECURITY.md` — CSRF wording fixed (see
    criteria); (3) `Abstractions/AuthErrors.cs`, `Endpoints/Admin/VersionRequest.cs`, `Api/Auth/*` — named by the task
    text. Existing tests adjusted: `ProblemDetailsTests` DELETE 405 and `ExceptionPipelineTests` POST 405 now send
    `X-Console-Request: 1` (otherwise CSRF answers 403 first); `AddApplicationTests` expects the two new behaviors.
  - `schema.gen.ts` regenerated (Api run against a throwaway podman Postgres); diff = `code?`/`traceId?` on
    `ProblemDetails` and `HttpValidationProblemDetails`. `cd web && npm run typecheck` passes.
  - `dotnet build FleetConsole.slnx -warnaserror` clean; `dotnet test FleetConsole.slnx` 320 + 62 + 222 passed
    (Testcontainers via podman).
- 2026-11-19 (backend-engineer): review round 1 fixes.
  - Required 1: CSRF no longer exempts TRACE (`CsrfHeaderMiddleware`: only GET/HEAD/OPTIONS, everything else fails
    closed; summary/remarks updated); `TRACE /api/system/info` added to `CsrfHeaderTests.UnsafeRequests` (403 without
    the header, not 403 with it).
  - Required 2: `SessionOptions` → `ConsoleSessionOptions` (class + file, remark explains the prefix);
    `AuthenticationSetup` updated; alias removed from `AuthenticationSetupTests`, the three option tests renamed.
  - Optional, done: `IMutatingCommand : IBaseCommand, IRequireAuthenticated`, so an anonymous caller gets 401 from
    `AuthorizationBehavior` instead of passing the read-only guard; tests `MutatingCommand_Anonymous_Returns401…` and
    `PlainMutatingCommand_WritableUser_RunsHandler` (request `PlainMutatingCommand` with no other marker).
    `ReadOnlyGuardBehavior` remarks updated. BACKEND.md left untouched as instructed.
  - My throwaway podman Postgres (`t0011-pg`, `--rm`) was already stopped and removed; `podman ps` shows nothing running.
  - Build `-warnaserror` clean; tests 320 + 64 + 224 passed (podman); `npm run typecheck` passes. OpenAPI document
    unchanged, so `schema.gen.ts` not regenerated.

## Review
**Round 1 — backend-architect, 2026-11-19: CHANGES_REQUESTED**

Checks run by the reviewer: `dotnet build FleetConsole.slnx -warnaserror` clean; `dotnet test FleetConsole.slnx`
320 + 62 + 222 passed; `cd web && npm run typecheck` passes.

Required:
1. `src/FleetConsole.Api/Http/CsrfHeaderMiddleware.cs:65` — TRACE is exempt from the CSRF header. Ruling: the contract
   (§1, GET/HEAD/OPTIONS) is right, ADR-0012 and SECURITY.md were wrong (fixed by the architect; ADR-0012 now has an
   amendment). Keep the exemption list minimal and fail closed: drop `HttpMethods.IsTrace`, update the class summary
   (line 7) and remarks ("safe methods are exempt by definition" → "only GET/HEAD/OPTIONS are exempt"). In
   `tests/FleetConsole.Api.Tests/Integration/CsrfHeaderTests.cs` add `{ "TRACE", "/api/system/info" }` to
   `UnsafeRequests` (403 without the header, not 403 with it).
2. `src/FleetConsole.Api/Auth/SessionOptions.cs:11` — the name clashes with `Microsoft.AspNetCore.Builder.SessionOptions`
   (implicit using in the Web SDK), so every Api file outside `FleetConsole.Api.Auth` needs an alias (tests already
   do). Rename the class and file to `ConsoleSessionOptions` (matches the `ConsoleDbContext` prefix), update
   `AuthenticationSetup.cs` (lines 13, 29–41), `AuthenticationSetupTests.cs` (drop the alias at line 16, rename the
   two tests), and this task's handover notes. Task design text and T-0015 already use the new name.

Rulings on the engineer's open points (no action needed beyond the above):
- **401/403 app-wide:** correct as built. The cookie scheme is the app's default; scoping the ProblemDetails
  responses to `/api` would leave non-`/api` challenges redirecting to a non-existent `/Account/Login`. SPA routes,
  static files and health endpoints never challenge, and the OAuth challenge uses its own scheme. SECURITY.md updated
  to say so.
- **ADR-0012 "before routing":** the ADR text itself only says "before `UseAuthentication()`"; the stale wording was in
  BACKEND.md/SECURITY.md and the engineer fixed it. Added a "Placement, precisely" amendment to ADR-0012 anyway.
- **Real-host 401 and the enum assertion:** deferring to T-0015 is fine. Both are now explicit in T-0015's design
  notes ("From T-0011"), together with: `SessionValidator` must reject principals that `TryRead` can't parse.
- **Default Data Protection key ring:** acceptable until T-0012; T-0012 now says so and asks for a test.

Verified and good: behavior order Logging → Authorization → Validation → ReadOnlyGuard → UoW, both guards fail closed
(unconstrained `TResponse` throws rather than DI skipping the check, tested); strict principal parsing (missing,
duplicated incl. across identities, case-variant, empty-GUID → no session, tested); CSRF before authentication and
endpoint execution, segment- and case-insensitive path match, exactly one header value `1`, 403 body via the central
mapping; anonymous-surface test holds ADR-0012's full list, treats "no `IAuthorizeData`" as anonymous (catches
endpoints mapped outside the group), plus a non-vacuity guard and the admin-policy check; OpenAPI `code`/`traceId`
extensions tested; `schema.gen.ts` matches; out-of-`paths` edits are justified and minimal.

Optional:
- `src/FleetConsole.Application/Abstractions/Messaging/IMutatingCommand.cs` — consider `IMutatingCommand :
  IRequireAuthenticated` so a mutating command can't be declared without an auth requirement (today an anonymous
  caller passes the read-only guard because `IsReadOnly` is false). Not required: every planned mutating command is
  also `IAdminRequest`.

**Round 2 — backend-architect, 2026-11-19: APPROVE**

Checks run by the reviewer: `dotnet build FleetConsole.slnx -warnaserror` clean; `dotnet test FleetConsole.slnx`
320 + 64 + 224 passed; `cd web && npm run typecheck` passes.

- Required 1 resolved: `CsrfHeaderMiddleware.RequiresHeader` exempts only GET/HEAD/OPTIONS; the XML summary and remarks
  match the contract; `CsrfHeaderTests.UnsafeRequests` now includes `TRACE /api/system/info`.
- Required 2 resolved: `Api/Auth/ConsoleSessionOptions` (remark explains the prefix); `AuthenticationSetup` and
  its tests use it; the alias is gone; tests are renamed; handover notes are updated. No `SessionOptions` references
  remain in `src/` or `tests/`.
- Optional done: `IMutatingCommand : IBaseCommand, IRequireAuthenticated`, documented, with tests (anonymous
  `PlainMutatingCommand` → 401 without handler or save; signed-in writable user → handler runs). The existing
  `MutatingRawRequest` throw test still holds (it signs in, so the throw now comes from the read-only guard as intended).
  BACKEND.md pipeline item 4 updated by the architect.
- No new findings.

## Handover notes
- **For T-0015:** extend `Api/Auth/AuthenticationSetup.cs` (OAuth handler, `OnValidatePrincipal` → `SessionValidator`
  using `ConsoleSessionOptions.RevalidationInterval`). Build principals only with `SessionPrincipalFactory.Create`. When mapping
  `/api/auth/login` and `/api/auth/logout` with `.AllowAnonymous()`, flip `Mapped` to `true` in
  `tests/FleetConsole.Api.Tests/Integration/AnonymousSurfaceTests.cs`. Add the string-enum assertion to
  `OpenApiDocumentTests` when `CurrentUser.role` appears (placeholder comment there). The first real protected endpoint
  (`/api/auth/me`) should get an integration test for 401 `Auth.Unauthenticated` on the real host; today 401/403 are
  covered by `Auth/AuthenticationSetupTests` on a minimal TestServer host (no protected endpoint exists yet).
- **For admin feature tasks (T-0016+):** commands `: ICommand<…>, IAdminRequest, IMutatingCommand`, queries
  `: IQuery<…>, IAdminRequest`; map with one `Map<Feature>AdminEndpoints()` call in `AdminEndpoints.MapAdminEndpoints`.
  `AnonymousSurfaceTests.AdminEndpoints_RequireTheAdminPolicy` then checks them automatically.
- Session settings class is `ConsoleSessionOptions` (renamed in review round 1 to avoid the clash with
  `Microsoft.AspNetCore.Builder.SessionOptions`).
- `IMutatingCommand` implies `IRequireAuthenticated` (review round 1, optional item): mutating commands need a session
  even without `IAdminRequest`.
- CSRF exempts only GET/HEAD/OPTIONS (contract §1; ADR-0012/SECURITY.md corrected by the reviewer).
- Cookie events always answer 401/403 ProblemDetails (not only under `/api`); confirmed correct in review round 1.
- No Data Protection key ring persistence yet (cookie uses the default key ring); T-0012 owns it.
