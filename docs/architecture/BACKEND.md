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
| Application | Commands, queries, handlers, validators, pipeline behaviors, domain event handlers (audit), proxy policy abstractions, **ports** (`IUserRepository`, `ITokenProtector`, `IClock`, `ICurrentUser`, `IReadModel`, `IClusterProbeClient`, `IExternalIdentityClient`…) | Domain, FluentValidation, `Microsoft.Extensions.*.Abstractions`, `Microsoft.Extensions.Options` |
| Infrastructure | EF Core `ConsoleDbContext`, configurations, migrations, repositories, read model, Data Protection token protector, per-cluster HTTP clients, password hasher adapter | Application, Domain, EF Core, Npgsql, YARP (client side only) |
| Api | Minimal API endpoint groups, HTTP request records, auth setup (cookie + OpenShift OAuth), CSRF middleware, ProblemDetails mapping, proxy endpoint + transforms, SPA hosting, composition root | everything except `FleetConsole.DevOAuth` |
| DevOAuth | Development/test-only emulator of the OpenShift OAuth server + `users/~` (ADR-0010). Never deployed. | ServiceDefaults only |

An architecture test (`tests/FleetConsole.Api.Tests/ArchitectureTests.cs`, NetArchTest or reflection) enforces these rules.

## Domain

```
Domain/
  Common/      Entity<TId>, AggregateRoot<TId> (+ Version), IDomainEvent, Error, Result, Guard, DnsLabel (internal)
  Users/       User (aggregate), UserId, Username, UserRole, UserStatus, UserErrors, events
  Clusters/    Cluster (aggregate), ClusterId, ClusterName, ApiServerEndpoint (url + CaBundle + skipTls), ClusterEnvironment
  Credentials/ Credential (aggregate), CredentialId, CredentialName, EncryptedToken (opaque bytes), TokenFingerprint,
               TokenMetadata (type/sub/iat/exp, expiry status), ConnectionTestSummary
  Access/      Grant (aggregate), GrantId, AccessMode, GrantLabels
  Audit/       AuditEntry (append-only aggregate), AuditActor, AuditCategory, AuditTargetType
```

- Strongly typed IDs (`readonly record struct UserId(Guid Value)`).
- Aggregates expose behaviour (`user.Deactivate(clock)`, `grant.ChangeAccessMode(mode)`), not setters.
- Aggregates reference other aggregates **by ID only**.
- Domain never sees plaintext tokens: `Credential` holds `EncryptedToken`. Encryption happens in the Application layer via the `ITokenProtector` port.
- Domain events (`CredentialRotated`, `GrantRevoked`, `UserDeactivated`) are collected on the aggregate and handled
  **before the write, in the same transaction** (ADR-0008): their handlers stage audit entries that commit atomically
  with the change. Events carry ids **and** the display names audit needs.
- `AggregateRoot.Version` (uint) is the optimistic concurrency token (Postgres `xmin`); only persistence sets it.
- Cross-aggregate rules that need data from the database (last active admin, one grant per user+cluster) are enforced by
  aggregate methods that take the facts as arguments (`user.Deactivate(actingUserId, activeWritableAdminCount)`,
  `Grant.Create(..., clustersUserAlreadyHasGrantsOn, ...)`); handlers read the facts through repositories.
- Display names an aggregate does not own but its events need (e.g. the cluster name on credential events) are passed
  to the raising method as arguments (`credential.Rotate(..., clusterName, ...)`, `grant.Revoke(GrantLabels)`).
- Value-object factories return `Result<T>`. A factory that validates **one** request field returns a plain
  `Error.Validation(code, message)` (`ClusterName`, `CredentialName`, `Username`); validators put its message on that
  field. A factory that validates **several** fields together (`ApiServerEndpoint`, which includes `CaBundle`) returns a
  `ValidationError` keyed by the request's JSON field names, so validators/handlers can return it unchanged.

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
2. `AuthorizationBehavior` — requests implement `IRequireAuthenticated`, `IRequireRole` (`UserRole RequiredRole`) or,
   for every admin use case, `IAdminRequest` (supplies `RequiredRole => UserRole.Admin`); anonymous →
   `Auth.Unauthenticated` (401), missing role → `Auth.Forbidden` (403). Constrained on `IRequireAuthenticated`.
3. `ReadOnlyGuardBehavior` — commands marked `IMutatingCommand` fail with `Auth.ReadOnly` (403) for globally read-only
   users (ADM-2). Every admin command is `IAdminRequest` + `IMutatingCommand`; admin queries are only `IAdminRequest`.
   `IMutatingCommand` extends `IRequireAuthenticated`, so a mutating command always needs a session: anonymous callers
   get 401 from `AuthorizationBehavior` and never reach this guard, where `IsReadOnly` would be `false` for them.
   It runs **before** validation (contract §7 check order: CSRF → 401 → `Auth.Forbidden` → `Auth.ReadOnly` → field
   validation), so a read-only admin gets `Auth.ReadOnly`, never field errors.
4. `ValidationBehavior` — runs FluentValidation validators → `Error.Validation` with field errors.
5. *(future)* `CachingBehavior` — queries implementing `ICacheableQuery`.
6. `UnitOfWorkBehavior` — commands only (constrained on `IBaseCommand`, so the container never builds it for
   queries): calls `IUnitOfWork.SaveChangesAsync` after the handler returns a successful `Result`. The `IUnitOfWork`
   implementation (`ConsoleDbContext`) owns domain events: it collects them from tracked `IHasDomainEvents` aggregates,
   hands them to the `IDomainEventDispatcher` port **before** writing (handlers stage audit entries in the same
   context), writes everything in one transaction, then clears them (ADR-0008). Collection needs the change tracker, so
   it lives in Infrastructure, not in the behavior. The behavior maps `ConcurrencyConflictException` (stale `xmin`, or
   a foreign key violation 23503 from a concurrent delete/insert) → 409 `Concurrency.Conflict` and
   `DuplicateKeyException` → 409 `Persistence.DuplicateKey` (races the handler's own checks couldn't see). Exceptions
   from event handlers and a 23001 `restrict_violation` are bugs and stay 500s.

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
  Application can't reference EF Core, so the async terminal operators are members of the port: compose with
  `System.Linq`, then `await readModel.ToListAsync(query, ct)` (also `FirstOrDefaultAsync`, `CountAsync`, `AnyAsync`).
  Never enumerate a queryable synchronously.
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
  extension per feature (`Api/Endpoints/<Feature>Endpoints.cs`). The `/api` group `.RequireAuthorization()`; anonymous
  endpoints opt out explicitly with `.AllowAnonymous()` and must be in ADR-0012's list (a test enforces it).
  Admin endpoints live in `Api/Endpoints/Admin/<Feature>AdminEndpoints.cs`, mapped into the `/api/admin` group
  (`AdminEndpoints`, policy `Admin`).
- **CSRF** is middleware (`Http/CsrfHeaderMiddleware`), not an endpoint filter: it runs before authentication and
  before any endpoint executes (so before body binding; minimal hosting's implicit route *matching* happens earlier but
  has no effect) for every unsafe method under `/api` (ADR-0012).
- **API shape conventions** (ADR-0013, contract `docs/specs/CP1-api-contract.md`): natural keys in URLs, one command per
  endpoint (explicit transitions, no generic PATCH), `version` on every editable representation, enums as camelCase
  strings, plain arrays for bounded lists and `{ items, nextCursor }` for the audit log, 201/200/204 rules, unknown
  route ids → 404 but unknown body references → 400 field errors.
- **Commands return keys, endpoints re-query:** a command returns `Result<Guid>`/`Result<string>` (or `Result`); the
  endpoint dispatches the `Get…Query` for the response body, so the returned `version` is the post-commit `xmin`
  (the handler runs before `UnitOfWorkBehavior` saves).
- **Request records** (`<Action>Request`) live in the Api next to their endpoint file; endpoints combine route values +
  body into the command. Commands are never bound from HTTP directly. Secrets (SA tokens) are wrapped in
  `SensitiveString` before they enter the Application layer.
- Endpoints dispatch a command/query and return the typed union from `ToHttpResult()`
  (`Results<Ok<T>, ProblemHttpResult>` …), plus `.WithName("<OperationId>")`. Success schemas come from those types.
- Error responses (400 `HttpValidationProblemDetails`, 401/403/404/409/500 `ProblemDetails`) are declared **once** on
  the `/api` group, not per endpoint. Some operations therefore list statuses they never return; that is accepted.
  The `code` and `traceId` extension members are added to both schemas by `Http/ProblemDetailsSchemaTransformer`
  (optional in the schema: framework errors carry no `code`).
- `UseStatusCodePages()` gives bodiless 4xx/5xx responses (unknown route 404, 405, auth challenges) a ProblemDetails body.
  The Kubernetes proxy route must disable it per request (`IStatusCodePagesFeature.Enabled = false`) so upstream
  responses pass through untouched.
- Enums are serialized as camelCase strings (`JsonStringEnumConverter`, no integer values; ADR-0013).
  A query parameter bound as `string` (so the validator can key an unknown value by its name) is still published as
  its enum with `.WithQueryParameterSchema<TEnum>("name")` (`Api/OpenApi/`); the validator must enforce the values.
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

ADR-0019 (pipeline), ADR-0020 (forwarding), ADR-0021 (audit); FE-facing contract `docs/specs/CP2-api-contract.md`.

```
Application/Proxy/
  Requests/                    // pure: ProxyPath (raw-path allowlist, rejects never rewrites), KubernetesRequestInfo
                               //   (group/version/resource/subresource/ns/name + kubectl DisplayName), ProxyRequest
                               //   (verb, IsMutation, IsWatch, IsStreaming, watch timeoutSeconds cap)
  IProxyPolicy                 // ValueTask<Result> EvaluateAsync(ProxyRequestContext, CancellationToken)
  ProxyRequestContext          // user, cluster, environment, grant mode, effective read-only, ProxyRequest
  ProxyErrors / ProxyOptions   // Proxy.* errors; Proxy:* settings (bound in the Api)
  Policies/
    MutationGuardPolicy        // user read-only → Proxy.UserReadOnly, then ReadOnly grant → Proxy.ReadOnlyGrant
    RequestBodyLimitPolicy     // Content-Length over Proxy:MaxMutationBodyBytes → Proxy.BodyTooLarge
  AuthorizeProxyRequest/       // query: one SQL (grant ⋈ user ⋈ cluster ⋈ credential), decrypt token, run policies → ProxyTarget
  RecordProxyAudit/            // command: one audit entry per mutation (allowed/denied), dispatched after the response
Application/Abstractions/Kubernetes/
  IClusterForwardingClients    // TryGetInvoker(clusterId, ClusterConnection) — the pool port
Infrastructure/Kubernetes/
  ClusterTlsHandlerFactory     // Create (probes, records TLS failures, ADR-0011) / CreateForwarding (pool, records nothing)
  ClusterForwardingClientPool  // one invoker per cluster, rebuilt when the ClusterConnection value changes; the old one
                               //   lives on for the longest stream lifetime + 1 min, so edits never cut open streams
Api/Proxy/
  KubernetesProxyEndpoint      // raw path → authorize query → IHttpForwarder → audit; ProblemDetails via ProxyProblems;
                               //   streams get a hard lifetime (ProxyOptions.StreamLifetime, linked into RequestAborted; ADR-0036)
  KubernetesRequestTransformer // header stripping + bearer injection + exact URI; upstream 401 → 502 CredentialRejected
```

Policies are registered in order with `services.AddProxyPolicy<T>()` (in `AddApplication`). **To stop users from
mutating even when their token allows it, you add or configure a policy — the endpoint never changes.**
No access cache in CP2 (one indexed query per request); TLS failures are classified from `HttpRequestError`, not
`TlsValidationRecord` (probe-only). Never add response buffering/compression on the proxy route (watches stream).

## Recipes (keep these working; they are the maintainability contract)

### Adding a cache later
Decided for CP4.5 in ADR-0035 (FusionCache as the `HybridCache`, Redis L2 + backplane, tags, fail-safe off for
authorization, decrypted tokens only in L1); the steps below stay the shape of the change.
1. Extract the access lookup of `AuthorizeProxyRequestHandler` into its own query and mark it: `public sealed record ResolveClusterAccessQuery(...) : IQuery<ClusterAccess>, ICacheableQuery { string CacheKey => ...; TimeSpan Ttl => ...; }` (policies keep running per request, uncached).
2. Register `CachingBehavior<,>` (uses `HybridCache`) in the pipeline before the handler.
3. Invalidate from **post-commit** domain event handlers (`GrantRevoked` → remove key). That stage doesn't exist yet
   (ADR-0008 §6) — add it then; never invalidate from the pre-commit handlers, which run before the write. No use case
   handler code changes.

### Blocking a class of operations
Add `IProxyPolicy` (e.g. `DenyDeleteNamespacePolicy`, `BusinessHoursChangeWindowPolicy`) or an `IPipelineBehavior` for
admin commands. Register it. Write a unit test on the policy alone.

### Adding a use case
Create the folder + command/query + handler + validator, map an endpoint in `Api/Endpoints/<Feature>Endpoints.cs`
(admin: `Api/Endpoints/Admin/<Feature>AdminEndpoints.cs`, request record next to it), add a handler unit test and an
endpoint integration test (`LoginAsAsync` + `TestData`), then `npm run gen:api`.

### Adding an audited admin action
1. The aggregate method raises a domain event carrying ids + display names (no secrets).
2. Add `IDomainEventHandler<TheEvent>` to the feature's handler class in `Application/Audit/EventHandlers/` calling
   `IAuditTrail.Record(...)`; add the action to the contract's audit table. The coverage test fails until you do.
3. Actions that change no aggregate (e.g. a denied login) call `IAuditTrail.Record` from their command handler and
   return a successful `Result`, so `UnitOfWorkBehavior` saves the entry.

## Persistence

- `ConsoleDbContext` with `IEntityTypeConfiguration<T>` per aggregate; snake_case naming; strongly typed ID converters.
  Multi-value value objects are complex properties (flattened columns), except where a column needs an index: EF Core
  10 can't index complex-type columns, so `AuditEntry.Actor` is an owned type (same table, `actor_*` columns).
  List-valued value objects (e.g. `InspectNamespaces`) are a Postgres array column: a `ValueConverter` to `string[]`
  that re-validates through the VO's `Create`, **plus** an explicit `ValueComparer` (`Converters/ValueObjectConverters.cs`) —
  without it EF picks an array comparer that cannot snapshot the VO.
  Small structured VOs may instead keep a single text column through a converter that owns the text format, e.g.
  `AdminConfigurationSource` ↔ `"user list"` / `"group <name>"` (POL-4); unknown stored text throws (corrupt data).
- Migrations live in `Infrastructure/Persistence/Migrations` (treated as generated code by a nested `.editorconfig`);
  applied on startup in Development by `DevelopmentDatabaseMigrator`; in production by the image's `migrate` mode run
  as an init container (ADR-0027). Both use the same migrator; migrations are forward-only.
  Add one with `dotnet tool restore` then `dotnet ef migrations add <Name> -p src/FleetConsole.Infrastructure
  -s src/FleetConsole.Api -o Persistence/Migrations` (uses the design-time factory; no database needed). The history
  table is `__ef_migrations_history`.
- **Registration:** a regular scoped `AddDbContext` + Aspire `EnrichNpgsqlDbContext` (retries, health check, telemetry),
  **not** the pooled `AddNpgsqlDbContext`: the context takes the scoped `IDomainEventDispatcher`. Because Enrich turns
  on retrying execution, code that opens an explicit transaction must run inside
  `Database.CreateExecutionStrategy().ExecuteAsync(...)`.
- **Domain events (ADR-0008):** `ConsoleDbContext.SaveChangesAsync` snapshots the tracked aggregates with pending
  events, dispatches them to `IDomainEventHandler<T>`s **before** the write (handlers may only stage entities such as
  audit entries — no `SaveChanges`, no network I/O, no new events; the context throws if a handler raises one), writes
  everything in one transaction, and clears the events after success. A failed write persists neither the change nor
  its audit entries; the staged entities stay tracked, so the context is discarded with its scope and never saved
  again (the events would be dispatched twice). Synchronous `SaveChanges` throws `NotSupportedException` for application data; only Data
  Protection key rows (its EF key repository saves synchronously) may be saved that way. Post-commit side effects
  (cache invalidation) will be a separate, later stage.
- **Data Protection** key ring lives in Postgres (`data_protection_keys`, `ConsoleDbContext : IDataProtectionKeyContext`);
  used for session cookies and SA token encryption (purpose `FleetConsole.Credentials.v1`, ADR-0004).
- **Foreign keys (CP1):** credentials→clusters and grants→clusters cascade; grants→credentials is `NO ACTION` (checked
  at statement end, so deleting a cluster can cascade to both); grants→users restrict (users are never deleted).
- `IgnoreDomainEventsConvention` explicitly unmaps `IHasDomainEvents.DomainEvents` on every aggregate (EF 10 skips it
  today anyway; the convention makes that independent of discovery rules).
- Optimistic concurrency via Postgres `xmin`.

## Hosting & deployment (CP3)

- One image (ADR-0026) serves the API and the built SPA from `wwwroot` (ADR-0028): anonymous SPA fallback for
  extension-less `GET`/`HEAD` paths outside `/api`; `index.html` `no-cache`, `/assets/*` `immutable`.
- Modes: no argument = web host; `migrate` = apply migrations and exit (ADR-0027, needs only the connection string).
- Probes in every environment: `/alive` (liveness, no dependencies), `/health` (readiness, includes Postgres). Status
  word only.
- Behind the edge Route the app sees HTTP and trusts no forwarded headers; every absolute URL comes from
  `Console:PublicOrigin`, cookies are `Secure` by policy outside Development.
- Production configuration is validated on start (`ValidateOnStart`, messages name keys, never values); `Program`
  turns failures into one Critical line each and exit code 1. New required settings follow the same pattern.
- Logs: JSON console outside Development; the request-line log category is capped at Warning in code.
- Manifests and the configuration contract (env keys, Secret/ConfigMap names): ADR-0030, `deploy/kustomize/`;
  operations: `docs/ops/RUNBOOK.md`.
- **Always ≥ 3 replicas** behind an HPA (ADR-0030 amendment 2026-11-24). Nothing that affects correctness may live in
  one pod's memory: state goes to Postgres, caches need a cross-replica invalidation path (ADR-0035 backplane),
  one-time initialisation (migrations, the first Data Protection key) runs under a Postgres advisory lock, and a pod
  only turns ready once it can serve every request. Per-pod caches of *derived, value-compared* data (the cluster
  invoker pool) are fine.

## Testing

| Layer | Approach |
|---|---|
| Domain | Pure unit tests of invariants |
| Application | Handler tests with in-memory fakes of ports (not EF in-memory provider); behavior tests |
| Proxy policies | Table-driven unit tests over `KubernetesRequestInfo` + access mode |
| Api | `WebApplicationFactory` + Testcontainers Postgres (`PostgresFixture`, one DB per factory variant) + the DevOAuth emulator in-process (`ApiFactory.LoginAsAsync(username)`), `TestData` seeding (saves below HTTP go through `factory.Services.CreateSignedInScope()`: saving dispatches audit events and `AuditTrail` fails closed without an actor), `CapturedLogs` + `TokenLeakScanner` for secret-leak assertions, and a **fake kube-apiserver** (`Fakes/FakeKubeApiServer`, Kestrel with real TLS) for connection tests and, in CP2, forwarded headers/paths/streaming |
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
