---
id: T-0281
title: Query cache core — IQueryCache on FusionCache (L1 + Redis L2 + backplane), CachingBehavior, Redis wiring + health
status: done
owner: backend-engineer
checkpoint: 4.5b
depends_on: []
paths: [Directory.Packages.props, src/FleetConsole.Application/Abstractions/Caching/, src/FleetConsole.Application/Behaviors/CachingBehavior.cs, src/FleetConsole.Application/DependencyInjection.cs, src/FleetConsole.Application/FleetConsole.Application.csproj, src/FleetConsole.Infrastructure/Caching/, src/FleetConsole.Infrastructure/DependencyInjection.cs, src/FleetConsole.Infrastructure/FleetConsole.Infrastructure.csproj, src/FleetConsole.AppHost/, src/FleetConsole.Api/appsettings*.json, tests/FleetConsole.Application.Tests/Behaviors/, tests/FleetConsole.Api.Tests/Caching/, tests/FleetConsole.Api.Tests/Integration/RedisFixture.cs, tests/FleetConsole.Api.Tests/Integration/Hosting/, tests/FleetConsole.Api.Tests/FleetConsole.Api.Tests.csproj]
review_rounds: 1
---

## Goal
Provide the generic, tested caching machinery of ADR-0040 §2–3, §6–7 (CACHE-1, CACHE-4, CACHE-5 fail-safe off,
CACHE-7, OPS-1 AppHost part) so T-0282 only has to declare one cacheable query and its invalidation.

## Scope
- In: packages, port, FusionCache adapter, options, behavior + registration helper, Redis connection + Degraded health
  check, production config validation, AppHost Redis, `RedisFixture` (Testcontainers), tests.
- Out: the access snapshot query, invalidation handlers, 503 mapping (T-0283), kustomize (T-0284), BACKEND.md recipe
  (T-0282).

## Contract / design notes
Packages (central versions; check NuGet for the newest stable, don't assume): `ZiggyCreatures.FusionCache`,
`ZiggyCreatures.FusionCache.Serialization.SystemTextJson`, `ZiggyCreatures.FusionCache.Backplane.StackExchangeRedis`,
`Microsoft.Extensions.Caching.StackExchangeRedis`, `Aspire.Hosting.Redis` 17.0.0 (AppHost), `Testcontainers.Redis`
4.17.0. Client: `Aspire.StackExchange.Redis` only if a stable version exists (same rule as the Npgsql package, ADR-0025
note in Directory.Packages.props); otherwise `StackExchange.Redis` directly — either way **one** `IConnectionMultiplexer`.
```csharp
// Application/Abstractions/Caching/IQueryCache.cs — the only cache API Application sees
public interface IQueryCache
{
    ValueTask<TValue> GetOrLoadAsync<TValue>(string key, Func<CancellationToken, Task<TValue>> load,
        Func<TValue, IReadOnlyCollection<string>> tagsFor, CancellationToken cancellationToken);
    ValueTask RemoveByTagsAsync(IReadOnlyCollection<string> tags, CancellationToken cancellationToken);
}
// Application/Abstractions/Caching/ICacheableQuery.cs
public interface ICacheableQuery<TValue> : IQuery<TValue>
{
    string CacheKey { get; }                                  // versioned, e.g. "access:v1:user:{id}"
    IReadOnlyCollection<string> TagsFor(TValue value);        // result-derived tags
}
// Application/Abstractions/Caching/CacheTags.cs — the one place tag strings are built
public static class CacheTags { User(UserId) "user:{id}"; Cluster(ClusterId); Credential(CredentialId); Group(string name) "group:{name}" }
// Application/Behaviors/CachingBehavior.cs
internal sealed class CachingBehavior<TQuery, TValue>(IQueryCache cache)
    : IPipelineBehavior<TQuery, Result<TValue>> where TQuery : ICacheableQuery<TValue>;
// Application/DependencyInjection.cs
internal static IServiceCollection AddCacheableQuery<TQuery, TValue>(this IServiceCollection services)
    where TQuery : ICacheableQuery<TValue>;   // closed registration of CachingBehavior, see ADR-0040 §3
```
- Behavior: `load` calls `next`; a failure `Result` is not cached — throw a private sentinel carrying it inside `load`,
  catch outside, return it. Replace the "(future)" comment/registration slot at Pipeline step 5 with a note that
  cacheable queries register through `AddCacheableQuery` there. A test must prove the closed registration runs in step
  5 order (after Validation, before the handler) — MS DI ordering of closed vs open-generic registrations is the risk.
- Adapter `Infrastructure/Caching/FusionQueryCache` (internal): `IFusionCache.GetOrSetAsync` setting
  `ctx.Tags = tagsFor(value)`, `RemoveByTagAsync` per tag. Entry options per ADR-0040 §6: `Duration = Cache:Duration`,
  `IsFailSafeEnabled = false` (explicit), no factory timeouts, no eager refresh, `ReThrowSerializationExceptions = false`,
  distributed-cache + backplane circuit breakers (~5 s), L2/backplane error log level Warning, `CacheName` /
  key prefix `fleetconsole:`.
- `CacheOptions` (`Cache:Duration`, default `00:00:30`, `ValidateOnStart` 1 s–60 s, message names the key).
- `ConnectionStrings:redis`: absent → L1-only (allowed only in Development; outside Development a `ValidateOnStart`
  failure "ConnectionStrings:redis is required outside Development" like `ConsoleDatabaseOptions`). Present → L2 +
  backplane on one multiplexer with `AbortOnConnectFail = false`.
- Health check `redis` (PING via the multiplexer, short timeout): Healthy / **Degraded** (never Unhealthy), so `/health`
  stays 200 (CACHE-7). Not tagged `live`.
- AppHost: `var redis = builder.AddRedis("redis");` + `api.WithReference(redis).WaitFor(redis)`; comment like the
  Postgres one. Name `redis` is the connection-string contract.
- Tests that switch to Production (`ProductionProbeTests` etc.) now need `ConnectionStrings:redis`: give them the
  `RedisFixture` or a closed loopback port (`abortConnect=false` keeps start-up working, health Degraded).

## Context pack
- Docs: ADR-0040 §2, 3, 6, 7; ADR-0035; BACKEND.md §Pipeline (L80–106), §Hosting (L281+).
- Exemplars: `Application/Behaviors/ValidationBehavior.cs` (behavior shape, `FailureResult<TResponse>`);
  `Application/DependencyInjection.cs:AddProxyPolicy` (L63, registration helper style) and L67–72 (pipeline slots);
  `Infrastructure/DependencyInjection.cs` L88–92 (`ConsoleDatabaseOptions` ValidateOnStart pattern);
  `Infrastructure/Crypto/KeyRingHealthCheck.cs` (custom health check); `AppHost/AppHost.cs` (Postgres resource).
- Touch points: `tests/.../Integration/PostgresFixture.cs` (copy for `RedisFixture`: `StartAsync`, `ConnectionString`,
  podman env per CLAUDE.md), `tests/.../Integration/ApiFactory.cs:CreateVariantAsync` (overrides dictionary to pass
  `ConnectionStrings:redis`), `tests/.../Integration/Hosting/ProductionProbeTests.cs`, `Readiness.cs`.

## Acceptance criteria
- [x] Behavior unit tests (fake `IQueryCache`): success cached once and served from cache; failure never cached; tags
      come from the value; pipeline order test (step 5).
- [x] Adapter tests against `RedisFixture`: value round-trips through L2 (second app instance / second FusionCache reads
      it); `RemoveByTagsAsync` on instance A makes instance B reload (backplane) — the machinery half of CACHE-3.
- [x] Fail-safe off (CACHE-5 machinery): entry expired + loader throws → the exception propagates, the stale value is
      not returned.
- [x] Redis unreachable (closed port): `GetOrLoadAsync` still loads and serves from L1, a Warning is logged, `/health`
      returns 200 with check `redis` Degraded (CACHE-7).
- [x] Production start without `ConnectionStrings:redis` fails with one Critical line naming the key; `Cache:Duration`
      of 0 or > 60 s fails start.
- [x] `aspire run` starts Redis (podman) and the Api gets `ConnectionStrings__redis` (note in Work log).
- [x] XML docs on all public types/members; `scripts/check-be.sh` green (CLAUDE.md rule 4)

## Work log
- 2026-11-24 backend-engineer: in_progress → in_review. Worktree was on 899c85c; merged 1b14a34 first. StackExchange.Redis used
  directly (Aspire.StackExchange.Redis 17 pulls OTel 1.18 + an Unhealthy check). AC6 checked via the AppHost publish
  manifest (redis container, Api env `ConnectionStrings__redis`), not a live `aspire run`. Outside paths: `ApiFactory.cs`
  (owns a RedisFixture, gives non-Development hosts `ConnectionStrings:redis`) and `DataProtectionSetupTests.cs` (adds
  the key to its Production hosts).

## Review
- 2026-11-24 backend-architect, round 1 (e572ba3 on top of cb0ac7b): **APPROVE**.
  - Judged OK: StackExchange.Redis direct (one multiplexer, `abortConnect=false`, avoids the Unhealthy check + OTel 1.18;
    recorded in Directory.Packages.props). Lazy L2/backplane in `WithPostSetup` is robust: fail-fast is independent of it
    (`RedisConnectionOptions` `ValidateOnStart` reads `IConfiguration` at resolve time, Production test covers the key).
    Fail-safe off + explicit entry defaults; prefix-only isolation fine (own Redis per deployment, T-0284). Password: never
    logged, asserted. Caching inserted after `ValidationBehavior` → Authorization/ReadOnlyGuard/Validation always run
    before a hit (step-5 + hit-skips-pipeline tests). Out-of-path ApiFactory/DataProtectionSetupTests edits are necessary
    and minimal.
  - Fixed by reviewer: `CachingSetup.cs` health check registered with `failureStatus: HealthStatus.Degraded` (an exception
    outside the RedisException/TimeoutException filter, e.g. malformed connection string, would otherwise be Unhealthy →
    503, breaking CACHE-7); `Infrastructure/DependencyInjection.cs:RedisHealthCheckName` doc said "registered only when
    set" (it is always registered); `BACKEND.md` §Pipeline step 5 no longer "(future)".
  - Optional: `CachingSetup.cs` — FusionCache logs every factory exception at `FactoryErrorsLogLevel` (default Warning),
    so each failure `Result` (`UncachedFailure`) writes a Warning with stack trace; consider `FactoryErrorsLogLevel =
    Debug` (real loader exceptions still propagate and are logged by the pipeline) when T-0282 adds the first query.
  - Optional (T-0282): BACKEND.md §Recipes "Adding a cache later" still describes `HybridCache`/open `CachingBehavior<,>`.

## Handover notes
- Port: `IQueryCache` + `ICacheableQuery<T>` + `CacheTags` (Application/Abstractions/Caching). Make a query cacheable by
  implementing `ICacheableQuery<T>` and calling `services.AddCacheableQuery<TQuery,T>()` after `AddApplication`'s
  pipeline (inserts the closed `CachingBehavior` right after `ValidationBehavior`; throws if the pipeline is missing).
- Failures are never cached (the behavior throws a private exception through the loader and unwraps it).
- Redis L2/backplane are attached in FusionCache's post-setup from `IOptions<RedisConnectionOptions>`, not at
  registration: WebApplicationFactory config sources aren't visible in Program before `Build()`. L1-only when no
  connection string (Development/tests only; validated on start elsewhere).
- FusionCache's default instance can't take a custom `CacheName` via DI (throws), so isolation is by key prefix
  `fleetconsole:` only; backplane channel uses the default name.
- `redis` health check always registered: Healthy if unconfigured, Degraded on PING failure/timeout (1 s), never
  Unhealthy; description carries no exception text. Logs asserted free of the Redis password.
- `DistributedCacheHardTimeout` 1 s, circuit breakers 5 s (L2 + backplane), all Redis errors logged at Warning.
- Test Redis image `docker.io/library/redis:8.0`; AppHost uses Aspire's default (8.10).
