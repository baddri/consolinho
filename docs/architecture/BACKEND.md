# Backend architecture

Goal: a codebase a new engineer can navigate in an hour, where cross-cutting features (cache, mutation blocking,
audit, rate limiting) are added in **one place** without touching use cases.

## Projects and dependency rules

```
FleetConsole.Api ──────────────┐
   │                           ▼
   └──► FleetConsole.Application ──► FleetConsole.Domain
FleetConsole.Infrastructure ───┘
```

| Project | Contains | May reference |
|---|---|---|
| Domain | Aggregates, entities, value objects, domain events, domain errors | nothing (BCL only) |
| Application | Commands, queries, handlers, validators, pipeline behaviors, proxy policy abstractions, **ports** (`IUserRepository`, `ITokenProtector`, `IClock`, `ICurrentUser`, `IReadModel`…) | Domain, FluentValidation, logging abstractions |
| Infrastructure | EF Core `ConsoleDbContext`, configurations, migrations, repositories, read model, Data Protection token protector, per-cluster HTTP clients, password hasher adapter | Application, Domain, EF Core, Npgsql, YARP (client side only) |
| Api | Minimal API endpoint groups, auth setup, ProblemDetails mapping, proxy endpoint + transforms, SPA hosting, composition root | everything |

An architecture test (`tests/FleetConsole.Api.Tests/ArchitectureTests.cs`, NetArchTest or reflection) enforces these rules.

## Domain

```
Domain/
  Common/      Entity<TId>, AggregateRoot<TId>, IDomainEvent, Error, Result, Guard
  Users/       User (aggregate), UserId, Username, UserRole, events
  Clusters/    Cluster (aggregate), ClusterId, ClusterSlug, ApiServerEndpoint (url + CA + skipTls), EnvironmentTag
  Credentials/ Credential (aggregate), CredentialId, EncryptedToken (opaque bytes), TokenFingerprint
  Access/      Grant (aggregate), GrantId, AccessMode
  Audit/       AuditEntry
```

- Strongly typed IDs (`readonly record struct UserId(Guid Value)`).
- Aggregates expose behaviour (`user.Deactivate(clock)`, `grant.ChangeAccessMode(mode)`), not setters.
- Aggregates reference other aggregates **by ID only**.
- Domain never sees plaintext tokens: `Credential` holds `EncryptedToken`. Encryption happens in the Application layer via the `ITokenProtector` port.
- Domain events (`CredentialRotated`, `GrantRevoked`, `UserDeactivated`) are collected on the aggregate and dispatched after a successful save (used for audit and, later, cache invalidation).

## Application: CQRS

### Building blocks (`Application/Abstractions/Messaging`)

```csharp
public interface IBaseCommand;                                // marker for command-only behaviors (constraint target)
public interface ICommand : IRequest<Result>, IBaseCommand;   // state change, no payload
public interface ICommand<TResponse> : IRequest<Result<TResponse>>, IBaseCommand;
public interface IQuery<TResponse> : IRequest<Result<TResponse>>;

public interface IRequestHandler<in TRequest, TResponse> where TRequest : IRequest<TResponse>
{ Task<TResponse> Handle(TRequest request, CancellationToken ct); }

public interface IPipelineBehavior<in TRequest, TResponse> where TRequest : IRequest<TResponse>
{ Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken ct); }

public delegate Task<TResponse> RequestHandlerDelegate<TResponse>(CancellationToken ct);

public interface IDispatcher { Task<TResponse> Send<TResponse>(IRequest<TResponse> request, CancellationToken ct); }
```

The dispatcher is in-house (~100 lines, ADR-0002): resolves the handler and wraps it in all registered behaviors
in registration order. Handlers and validators are registered by assembly scanning in `AddApplication()`.

### Pipeline (order matters, registered in `DependencyInjection.cs`)

1. `LoggingBehavior` — structured log + timing + OpenTelemetry activity per request.
2. `AuthorizationBehavior` — requests implement `IRequireRole(UserRole.Admin)` / `IRequireAuthenticated`; denied → `Error.Forbidden`.
3. `ValidationBehavior` — runs FluentValidation validators → `Error.Validation` with field errors.
4. `ReadOnlyGuardBehavior` — commands marked `IMutatingCommand` fail for globally read-only users (except self-service like change-own-password).
5. *(future)* `CachingBehavior` — queries implementing `ICacheableQuery`.
6. `UnitOfWorkBehavior` — commands only (constrained on `IBaseCommand`, so the container never builds it for
   queries): calls `IUnitOfWork.SaveChangesAsync` after the handler returns a successful `Result`. The `IUnitOfWork`
   implementation (`ConsoleDbContext`) owns domain events: after a successful save it collects them from tracked
   `IHasDomainEvents` aggregates, clears them, and hands them to the `IDomainEventDispatcher` port. Collection needs
   the change tracker, so it lives in Infrastructure, not in the behavior.

Behaviors that apply to a subset of requests use **generic constraints** (e.g. `where TRequest : IBaseCommand`); MS DI
skips open-generic registrations whose constraints the request does not satisfy.

### Use case folder convention

```
Application/
  Clusters/
    RegisterCluster/
      RegisterClusterCommand.cs     // record + XML doc describing the use case
      RegisterClusterHandler.cs
      RegisterClusterValidator.cs
    ListClusters/
      ListClustersQuery.cs
      ListClustersHandler.cs
      ClusterSummaryDto.cs
```

- Commands go through repositories (`IClusterRepository`) + aggregates.
- Queries read through `IReadModel` (no-tracking `IQueryable`s exposed by Infrastructure) and project straight to DTOs. Queries never load aggregates just to map them.
- Handlers are `internal sealed`; commands/queries/DTOs are `public sealed record`.
- Never name a feature folder after a BCL root namespace (`System`, `Threading`, …): the namespace
  `FleetConsole.Application.System` would shadow `System` for all Application code. Example: `Application/SystemInfo/`.
- DTO type names end in `Dto`; the OpenAPI schema drops the suffix (`SystemInfoDto` → `SystemInfo`). Never have both
  `Foo` and `FooDto` in the API contract.

### Results and errors

`Result` / `Result<T>` with `Error(Code, Message, ErrorType)` where `ErrorType ∈ {Validation, NotFound, Conflict, Forbidden, Unauthorized, Failure}`.
The Api maps them centrally (`ResultExtensions.ToHttpResult()`) to ProblemDetails with `type`, `title`, `detail`,
`code` (the stable `Error.Code`), `traceId`, and for `ValidationError` an `errors` dictionary whose keys are the
validator's property paths converted to the JSON naming policy (camelCase per segment: `Endpoints[0].Url` →
`endpoints[0].url`), so the UI can attach messages to form fields.

## HTTP API and OpenAPI (T-0004)

- `Api/Endpoints/ApiEndpoints.MapApiEndpoints()` creates the `/api` group and calls one `Map<Feature>Endpoints()`
  extension per feature (`Api/Endpoints/<Feature>Endpoints.cs`). Shared filters (auth, CSRF header) go on that group, once.
- Endpoints dispatch a command/query and return the typed union from `ToHttpResult()`
  (`Results<Ok<T>, ProblemHttpResult>` …), plus `.WithName("<OperationId>")`. Success schemas come from those types.
- Error responses (400 `HttpValidationProblemDetails`, 401/403/404/409/500 `ProblemDetails`) are declared **once** on
  the `/api` group, not per endpoint. Some operations therefore list statuses they never return; that is accepted.
- `UseStatusCodePages()` gives bodiless 4xx/5xx responses (unknown route 404, 405, auth challenges) a ProblemDetails body.
  The Kubernetes proxy route must disable it per request (`IStatusCodePagesFeature.Enabled = false`) so upstream
  responses pass through untouched.
- JSON uses ASP.NET web defaults **with strict number handling** (`JsonNumberHandling.Strict`): numbers are never
  read from or documented as strings, so generated TS types stay `number`. A quoted number in a request body is a
  400 (ProblemDetails via status-code pages). Configured in `Api/Http/JsonSetup.AddApiJson()`.
- `/openapi/v1.json` is mapped **in Development only** (FE type generation and integration tests run in Development;
  production has no consumer and gains nothing from exposing the API surface). The document has no `servers` entry: paths
  already contain `/api` and the SPA's base URL is the page origin.
- XML doc comments on endpoint handler methods and DTOs are **published** in the OpenAPI document (and in
  `web/src/shared/api/schema.gen.ts`); they override `.WithSummary()`. Write them for API consumers, avoid `&lt;`/`&gt;`,
  and keep implementation notes in `//` comments.
- After changing the contract, run `cd web && npm run gen:api` against a running Api and commit `schema.gen.ts`.

## The proxy

```
Application/Proxy/
  IProxyPolicy                 // Task<ProxyDecision> Evaluate(ProxyRequestContext ctx, CancellationToken ct)
  IProxyResponseObserver       // post-response hook (audit)
  ProxyRequestContext          // user, cluster, access mode, verb, k8s path, parsed RequestInfo (group/version/resource/subresource/ns/name)
  KubernetesRequestInfo        // parser: "/apis/apps/v1/namespaces/x/deployments/y/scale" → structured
  Policies/
    MutationGuardPolicy        // denies mutations when grant is ReadOnly or user is globally read-only
  ResolveClusterAccess/        // query: (userId, clusterSlug) → ClusterAccess (endpoint, token, mode)
Infrastructure/Kubernetes/
  ClusterHttpClientPool        // cached HttpMessageInvoker per cluster (CA bundle / skipTls), invalidated on change
Api/Proxy/
  KubernetesProxyEndpoint      // maps route, runs policies, calls IHttpForwarder
  KubernetesRequestTransformer // header stripping + bearer injection + path rewrite
```

Policies are registered in order with `services.AddProxyPolicy<T>()`. **To stop users from mutating even when their
token allows it, you add or configure a policy — the endpoint never changes.**

## Recipes (keep these working; they are the maintainability contract)

### Adding a cache later
1. Mark the query: `public sealed record ResolveClusterAccessQuery(...) : IQuery<ClusterAccess>, ICacheableQuery { string CacheKey => ...; TimeSpan Ttl => ...; }`.
2. Register `CachingBehavior<,>` (uses `HybridCache`) in the pipeline before the handler.
3. Invalidate from domain event handlers (`GrantRevoked` → remove key). No handler code changes.

### Blocking a class of operations
Add `IProxyPolicy` (e.g. `DenyDeleteNamespacePolicy`, `BusinessHoursChangeWindowPolicy`) or an `IPipelineBehavior` for
admin commands. Register it. Write a unit test on the policy alone.

### Adding a use case
Create the folder + command/query + handler + validator, map an endpoint in `Api/Endpoints/<Feature>Endpoints.cs`,
add a handler unit test and an endpoint integration test.

## Persistence

- `ConsoleDbContext` with `IEntityTypeConfiguration<T>` per aggregate; snake_case naming; strongly typed ID converters.
- Migrations live in `Infrastructure/Persistence/Migrations` (treated as generated code by a nested `.editorconfig`);
  applied on startup in Development by `DevelopmentDatabaseMigrator`, via a migration job/init container in production.
  Add one with `dotnet tool restore` then `dotnet ef migrations add <Name> -p src/FleetConsole.Infrastructure
  -s src/FleetConsole.Api -o Persistence/Migrations` (uses the design-time factory; no database needed). The history
  table is `__ef_migrations_history`.
- **Registration:** a regular scoped `AddDbContext` + Aspire `EnrichNpgsqlDbContext` (retries, health check, telemetry),
  **not** the pooled `AddNpgsqlDbContext`: the context takes the scoped `IDomainEventDispatcher`. Because Enrich turns
  on retrying execution, code that opens an explicit transaction must run inside
  `Database.CreateExecutionStrategy().ExecuteAsync(...)`.
- **Domain events:** `ConsoleDbContext.SaveChangesAsync` snapshots the tracked aggregates with pending events
  *before* saving (deleted aggregates are detached afterwards), and only after a successful save clears them and calls
  `IDomainEventDispatcher`. Dispatch is post-commit and in-process: a crash between commit and dispatch loses the
  events. The first event-driven feature (audit) must decide whether that is acceptable or needs an outbox (ADR).
  Synchronous `SaveChanges` throws `NotSupportedException`.
- `IgnoreDomainEventsConvention` explicitly unmaps `IHasDomainEvents.DomainEvents` on every aggregate (EF 10 skips it
  today anyway; the convention makes that independent of discovery rules).
- Optimistic concurrency via Postgres `xmin`.

## Testing

| Layer | Approach |
|---|---|
| Domain | Pure unit tests of invariants |
| Application | Handler tests with in-memory fakes of ports (not EF in-memory provider); behavior tests |
| Proxy policies | Table-driven unit tests over `KubernetesRequestInfo` + access mode |
| Api | `WebApplicationFactory` + Testcontainers Postgres + a **fake kube-apiserver** (Kestrel stub) to assert forwarded headers/paths/streaming |
| Architecture | Layer dependency rules |

## Documentation style

```csharp
/// <summary>
/// Denies proxy requests that would change cluster state when the caller's grant is <see cref="AccessMode.ReadOnly"/>
/// or the user is globally read-only. Runs before forwarding, so the cluster never sees the request.
/// </summary>
/// <remarks>
/// "Mutation" includes exec/attach/portforward even though they arrive as GET + WebSocket upgrade.
/// SelfSubjectAccessReview/RulesReview POSTs are treated as reads so the UI can probe permissions.
/// </remarks>
```
