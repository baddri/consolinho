---
id: T-0002
title: CQRS dispatcher, behaviors, Result/Error, domain building blocks, ProblemDetails, architecture tests
status: done
owner: backend-engineer
checkpoint: 0
depends_on: [T-0001]
paths: [src/FleetConsole.Domain, src/FleetConsole.Application, src/FleetConsole.Api, tests/]
review_rounds: 1
---

## Goal
Implement the CQRS core and DDD building blocks exactly as described in `docs/architecture/BACKEND.md` and ADR-0002,
so later features only add folders.

## Scope
- Domain/Common: `Entity<TId>`, `AggregateRoot<TId>` (domain event collection: `RaiseDomainEvent`, `DomainEvents`,
  `ClearDomainEvents`), `IDomainEvent`, `Error` (Code, Message, `ErrorType`), `Result`/`Result<T>` (Success/Failure,
  implicit conversions from value and Error, `ValidationError` carrying field errors), `Guard` helpers.
  (Result/Error live in Domain so aggregates can return them.)
- Application/Abstractions/Messaging: `IRequest<T>`, `ICommand`, `ICommand<T>`, `IQuery<T>`, `IRequestHandler<,>`,
  `IPipelineBehavior<,>`, `RequestHandlerDelegate<T>`, `IDispatcher` + `Dispatcher` (cached per-request-type wrapper,
  behaviors in registration order), marker interfaces `IRequireAuthenticated`, `IRequireRole`, `IMutatingCommand`.
- Application/Abstractions: ports `IUnitOfWork`, `IClock`, `ICurrentUser` (interfaces only; implementations later).
- Behaviors: `LoggingBehavior`, `ValidationBehavior` (FluentValidation → `Result` failure, never throws),
  `UnitOfWorkBehavior` (commands only; calls `IUnitOfWork.SaveChangesAsync` after successful handler).
  (Authorization & ReadOnlyGuard behaviors come in CP1 with users.)
- `AddApplication()` DI extension: scans handlers + validators, registers behaviors in documented order.
- Api: `ResultExtensions.ToHttpResult()` / `ToProblemDetails()` mapping ErrorType → status (Validation 400 with `errors`
  dictionary, Unauthorized 401, Forbidden 403, NotFound 404, Conflict 409, Failure 500); global exception handler →
  500 ProblemDetails without leaking exception details outside Development.
- Tests: dispatcher ordering, handler-not-found, validation behavior, unit-of-work only for commands, Result mapping,
  architecture tests (reflection or NetArchTest.Rules — check license is permissive) enforcing BACKEND.md dependency rules.

## Acceptance criteria
- [x] Spec CP0 criteria 2, 3, 4 satisfied with tests
- [x] Every public type/member has meaningful XML docs
- [x] Build + tests green

## Work log
- 2026-11-18 (backend-engineer): status → in_progress. Read CLAUDE.md, BACKEND.md, SECURITY.md, ADR-0002, SDLC,
  CP0 spec and the T-0001 review (nits to fold into the architecture tests).
- 2026-11-18: Domain/Common: `ErrorType`, `Error` (record + factories), `ValidationError : Error` (field errors,
  code `Validation.Failed`), `Result`/`Result<T>` (implicit from value and Error; `[MemberNotNullWhen]` so `Error` is
  non-null after `IsFailure`; `Value` throws on failure), `Entity<TId>` (identity equality by concrete type + id),
  `AggregateRoot<TId>`, `IDomainEvent`, `IHasDomainEvents` (non-generic view for the unit of work to collect events —
  small addition beyond the scope list), `Guard` (throwing guards for programming errors, return the value).
- 2026-11-18: Application/Abstractions/Messaging: `IRequest<T>`, `IBaseCommand` (non-generic command marker — addition,
  see notes), `ICommand`, `ICommand<T>`, `IQuery<T>`, `IRequestHandler<,>`, `IPipelineBehavior<,>`,
  `RequestHandlerDelegate<T>(CancellationToken)`, `IDispatcher`, internal `Dispatcher` (wrapper cached per
  response type + request type; behaviors chained so registration order = outermost first), markers
  `IRequireAuthenticated`, `IRequireRole`, `IMutatingCommand`. Ports `IUnitOfWork`, `IClock`, `ICurrentUser`.
- 2026-11-18: Behaviors: `LoggingBehavior` (activity + LoggerMessage logs; logs request type name only, never payload),
  `ValidationBehavior` (all validators, fresh context each, Severity.Error only, grouped/deduped per field; never
  throws for invalid input; fails fast with InvalidOperationException if a validated request doesn't return Result),
  `UnitOfWorkBehavior` (constrained `where TRequest : IBaseCommand` so the container skips it for queries — verified by
  a test that dispatches a query with no `IUnitOfWork` registered). `AddApplication()` registers dispatcher, handlers
  (internal scanning, throws on duplicate handlers), validators (FluentValidation DI extensions) and behaviors in the
  documented order with commented slots for CP1/future behaviors. `ApplicationDiagnostics.ActivitySourceName`.
- 2026-11-18: Api/Http: `ResultExtensions` (`ToHttpResult()` → 204/200/custom; `ToProblemDetails()`; ErrorType →
  400/401/403/404/409/500; `code` extension; validation `errors` keys converted to camelCase JSON paths),
  `ProblemDetailsSetup.AddApiProblemDetails()` (`instance` = path, `traceId`), `GlobalExceptionHandler`
  (500 ProblemDetails, exception detail only in Development; BadHttpRequestException keeps its 4xx; client abort → 499,
  no body). Program.cs: `AddApiProblemDetails`, `AddApplication`, OTel source subscription, `UseExceptionHandler()`.
- 2026-11-18: Packages (central): FluentValidation + FluentValidation.DependencyInjectionExtensions 12.2.0 (Apache-2.0),
  Microsoft.Extensions.DependencyInjection.Abstractions / Logging.Abstractions 10.0.0 (MIT; lowest 10.0 for a library),
  Microsoft.Extensions.DependencyInjection 10.0.0 (Application.Tests only). No NetArchTest (reflection is enough).
  `dotnet list package --vulnerable --include-transitive` → none.
- 2026-11-18: ArchitectureTests (T-0001 review nits): (a) "BCL" is now "assembly shipped in the Microsoft.NETCore.App
  shared framework directory" instead of `StartsWith("System")`, with a self-test proving System.IO.Abstractions /
  Microsoft.Extensions.* are rejected; (b) Application allow-list: Domain, BCL, FluentValidation(+DI extensions),
  `Microsoft.Extensions.*.Abstractions`. Added conventions: Application handlers internal sealed, requests sealed.
  Mutation-checked: a temporary Logging.Abstractions use in Domain made `Domain_ReferencesOnlyTheBaseClassLibrary` fail.
- 2026-11-18: Small out-of-folder edits within allowed scope: `InternalsVisibleTo` for the matching test project in the
  Application and Api csproj files. Three local `[SuppressMessage]`s with justification: CA1716 on `Error` and on the
  `next` parameter (VB-only keywords; names are BACKEND.md contract), CA1711 on `RequestHandlerDelegate` (contract name).
- 2026-11-18: Checks: `dotnet build FleetConsole.slnx -warnaserror --no-incremental` → 0 warnings/0 errors;
  `dotnet test FleetConsole.slnx` → 94 passed (Domain 35, Application 33, Api 26). No Testcontainers tests in this task.
  Smoke: Api boots in Development (ValidateOnBuild) and `/alive` → 200. Status → in_review.
- 2026-11-18 (backend-engineer, review round 1 fixes): **Required:** `ToHttpResult` overloads now return typed unions
  `Results<NoContent, ProblemHttpResult>`, `Results<Ok<TValue>, ProblemHttpResult>` and
  `Results<TSuccess, ProblemHttpResult>` (`TSuccess : IResult`, e.g. `Created<Guid>`); class XML doc gained an endpoint
  example. Tests assert on `.Result` types, plus a metadata test calling `IEndpointMetadataProvider.PopulateMetadata`
  on a `RouteEndpointBuilder`: 200 + `Sample` schema is emitted. Finding: `ProblemHttpResult` emits **no**
  produces-metadata (status varies per instance), only `IDisableCookieRedirectMetadata` — so error responses must be
  documented once at the `/api` group level in T-0004 (e.g. `.ProducesProblem(...)` / `ProducesValidationProblem()`);
  noted in handover. **Nits:** `StatusCodes.Status499ClientClosedRequest` replaces the local constant; handler remarks
  say the client-abort branch is defensive (middleware handles it first in .NET 10); `traceId` docs now say
  "W3C trace-context id (traceparent format)" and the explicit customization is kept with a comment explaining why;
  dropped `out` variance on `IRequest<TResponse>`. Architect's doc edits (BACKEND.md, ICommand.cs, Result.cs) kept.
  Checks: build -warnaserror --no-incremental → 0 warnings/0 errors; test → 98 passed (Domain 35, Application 33,
  Api 30). Status → in_review.

## Review

### Round 1 — 2026-11-18 (backend-architect): CHANGES_REQUESTED

Checks run by reviewer: `dotnet build FleetConsole.slnx -warnaserror --no-incremental` → 0 warnings, 0 errors;
`dotnet test FleetConsole.slnx` → 94 passed (Domain 35, Application 33, Api 26).

Overall this is very good work: correct dispatcher, sensible behaviors, accurate XML docs, and tests that check
behavior rather than implementation. One required change.

**Required**

1. `src/FleetConsole.Api/Http/ResultExtensions.cs:28,38,52` — the `ToHttpResult` overloads return `IResult`. Minimal
   APIs then emit no response metadata, so `/openapi/v1.json` has no success schema for any endpoint, and the FE's
   `schema.gen.ts` (T-0003/T-0004: "OpenAPI is the final source of FE types") gets untyped responses. Every endpoint
   would need a hand-written `.Produces<T>()`, which drifts. This is the one mapping point all endpoints share, so fix
   it here before the first endpoint (T-0004) exists. Fix: return typed unions:
   - `Results<NoContent, ProblemHttpResult> ToHttpResult(this Result result)`
   - `Results<Ok<TValue>, ProblemHttpResult> ToHttpResult<TValue>(this Result<TValue> result)`
   - `Results<TSuccess, ProblemHttpResult> ToHttpResult<TValue, TSuccess>(this Result<TValue> result, Func<TValue, TSuccess> onSuccess) where TSuccess : IResult`
     (e.g. `Created<Guid>`). Use `if/else` or explicit casts because a ternary can't unify the two arms.

   Update the tests: assert on `.Result` (e.g. `ShouldBeOfType<Ok<Sample>>()`). Add one test that
   `Results<Ok<Sample>, ProblemHttpResult>` populates endpoint metadata (via `IEndpointMetadataProvider.PopulateMetadata`
   on a `RouteEndpointBuilder`, or defer the assertion to T-0004's `/openapi/v1.json` test and note that in handover).
   Update the class XML doc example.

**Rulings on stated deviations and additions** (all accepted)

- `IBaseCommand` constraining `UnitOfWorkBehavior`: **accepted.** Constraints are the right tool, and the
  "query works with no `IUnitOfWork` registered" test proves the container skips the behavior. Documented in BACKEND.md.
- `IHasDomainEvents`: **accepted.** It is the only way to collect events from `ChangeTracker` without knowing each id
  type.
- `UnitOfWorkBehavior` only saves, and the `IUnitOfWork` implementation dispatches events: **accepted.** Collecting
  events needs the change tracker, and T-0004 already puts dispatch in `ConsoleDbContext` through an
  `IDomainEventDispatcher` port. I updated BACKEND.md pipeline step 6 to match.
- `IRequireRole.RequiredRole : string` and `ICurrentUser.UserId : Guid?`: **accepted** as temporary. CP1 design will
  include switching them to `UserRole` / `UserId` in the users/auth task's contract.
- Three `[SuppressMessage]`s (CA1716 ×2, CA1711): **accepted.** They are local, justified, and protect documented
  contract names.
- Client disconnect → 499: **accepted.** It matches the framework's own behavior. See nit 2.
- camelCased validation `errors` keys: **accepted.** They match the default JSON naming policy, so the UI can map
  them to form fields. Documented in BACKEND.md "Results and errors".

**Optional nits**

1. `src/FleetConsole.Api/Http/GlobalExceptionHandler.cs:27` — use the framework's `StatusCodes.Status499ClientClosedRequest`
   instead of the local constant.
2. `GlobalExceptionHandler.cs:35-40` — in .NET 10, `ExceptionHandlerMiddleware` already handles
   `OperationCanceledException`/`IOException` with `RequestAborted` itself (logs "request was aborted by the client",
   sets 499) before it calls any `IExceptionHandler`. So this branch can only run if the handler is invoked directly.
   It is harmless, but say so in the remarks ("defensive; the middleware normally handles this first").
3. `src/FleetConsole.Api/Http/ProblemDetailsSetup.cs:27-28` — the default ProblemDetails writer already adds
   `traceId = Activity.Current?.Id ?? TraceIdentifier`, so this line duplicates it. Keep it to make the dependency
   explicit if you like, but the XML doc "W3C trace id" should say "W3C trace-context id (traceparent format)",
   because `Activity.Id` is the full `00-<trace>-<span>-<flags>` string, not the bare trace id.
4. `Abstractions/Messaging/IRequest.cs:11` — `out` variance means `ICommand<Guid>` is also `IRequest<Result>`, so an
   explicit `Send<Result>(cmd)` fails at runtime with "No handler". The failure is loud and inference never picks
   that type, so this is fine. Drop `out` unless a use for it appears.
5. For T-0004 (no action here): `AggregateRoot.DomainEvents` is a public `IReadOnlyCollection<IDomainEvent>`. EF Core
   will try to map it as a navigation, so `ConsoleDbContext` must `Ignore` it (a convention over all
   `IHasDomainEvents` types is best).

**Reviewer edits (docs only)**

- `docs/architecture/BACKEND.md`: messaging block now shows `IBaseCommand` and the `RequestHandlerDelegate` signature.
  Pipeline step 6 explains save vs. event dispatch ownership and the generic-constraint rule. "Results and errors"
  documents the `code`/`traceId` members and the camelCase `errors` keys.
- `src/FleetConsole.Application/Abstractions/Messaging/ICommand.cs:17`: the remark said "the dispatcher persists".
  It now says `UnitOfWorkBehavior`.
- `src/FleetConsole.Domain/Common/Result.cs`: added a remark on `Result<TValue>` explaining that the implicit
  conversion doesn't apply when `TValue` is an interface (use `Result.Success(list)`).

### Round 2 — 2026-11-18 (backend-architect): APPROVE

Checks run by reviewer: `dotnet build FleetConsole.slnx -warnaserror --no-incremental` → 0 warnings, 0 errors;
`dotnet test FleetConsole.slnx` → 98 passed (Domain 35, Application 33, Api 30).

- Required finding 1 is resolved. `ResultExtensions` now returns `Results<NoContent, ProblemHttpResult>`,
  `Results<Ok<TValue>, ProblemHttpResult>`, and `Results<TSuccess, ProblemHttpResult>` (with `TSuccess : IResult`).
  It uses `if/else` instead of a ternary, and the class XML example shows the typed endpoint signature. Tests assert on
  `.Result`. `TypedUnion_PopulatesEndpointResponseMetadata_ForOpenApi` checks the metadata minimal APIs actually
  consume: a 200 response typed as `Sample`, and nothing produced for `ProblemHttpResult`.
- Nits 1–4 are addressed: the framework 499 constant, the "defensive" remark on the abort branch, the traceparent
  wording for `traceId`, and `IRequest` is no longer covariant. Nit 5 stays a T-0004 note.
- **Engineer proposal accepted:** `ProblemHttpResult` adds no response metadata, so error responses are documented
  once on the `/api` group (`ProducesProblem` for 401/403/404/409/500 and `ProducesValidationProblem` for 400). This
  over-documents a few statuses on some endpoints. That trade-off is fine, because the FE needs the ProblemDetails
  schema, not a per-endpoint status list. I added this and the openapi assertion to T-0004's scope.

## Handover notes
- Done: everything in Scope. Where things live: `src/FleetConsole.Domain/Common/`,
  `src/FleetConsole.Application/{Abstractions,Abstractions/Messaging,Behaviors}/`, `Application/DependencyInjection.cs`,
  `src/FleetConsole.Api/Http/`. Tests mirror these folders.
- Contract additions (not in the scope list, kept minimal): `IBaseCommand` (lets command-only behaviors constrain on
  commands; use cases implement `ICommand`/`ICommand<T>`, never `IBaseCommand` directly), `IHasDomainEvents`,
  `ApplicationDiagnostics`, `ProblemDetailsSetup`, `ResultExtensions.ToStatusCode()`, `Error.ToProblemDetails()`.
- Not done / for later tasks:
  - Domain event *dispatch* is not implemented; per T-0004 scope the `IUnitOfWork` implementation dispatches events
    after save (collect via `ChangeTracker.Entries<IHasDomainEvents>()`). BACKEND.md says UnitOfWorkBehavior does
    "SaveChangesAsync + dispatch"; here the behavior only calls `SaveChangesAsync` and the port's contract says the
    implementation dispatches — consistent with T-0004, but BACKEND.md wording could be aligned by the architect.
  - `IRequireRole.RequiredRole` is a `string` until `UserRole` exists (CP1): switch the type then.
    `ICurrentUser.UserId` is `Guid?` until the `UserId` value object exists.
  - Global exception handler and ProblemDetails are unit-tested against a `DefaultHttpContext` with the real DI
    registration; an end-to-end check through `UseExceptionHandler()` belongs in the T-0004 WebApplicationFactory
    harness. Unknown `/api/*` routes still return an empty 404 (T-0004 owns "404 ProblemDetails").
- OpenAPI (from review round 1): endpoint handlers should declare the typed union returned by `ToHttpResult()` as
  their return type so the success schema is emitted. `ProblemHttpResult` contributes no response metadata, so T-0004
  should add problem responses once on the `/api` group (`ProducesProblem`/`ProducesValidationProblem`) and verify
  both in its `/openapi/v1.json` test. Also for T-0004: EF must `Ignore` `AggregateRoot.DomainEvents` (convention over
  all `IHasDomainEvents` types).
- Gotchas:
  - Behaviors that should apply to a subset of requests: use generic constraints; MS DI silently skips open-generic
    registrations whose constraints don't match when resolving `IEnumerable<>` (relied upon and tested).
  - A validator on a request whose response isn't `Result`/`Result<T>` throws InvalidOperationException at dispatch.
  - Validation `errors` keys are camelCased per path segment in the Api (`Endpoints[0].Url` → `endpoints[0].url`),
    matching ASP.NET Core's default camelCase JSON; revisit if the JSON naming policy ever changes.
  - Internal types can't be NSubstitute'd from tests (Castle needs DynamicProxyGenAssembly2 IVT); tests use small
    hand-written fakes instead (preferred by BACKEND.md anyway).
  - `ExceptionHandlerMiddleware` in .NET 10 suppresses its own diagnostics when an `IExceptionHandler` handles the
    exception, so `GlobalExceptionHandler` does the logging (once).
