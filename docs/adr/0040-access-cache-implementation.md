# 0040 — Access cache implementation: post-commit event stage, `IQueryCache` port, per-user access snapshot
**Status:** Accepted (2026-11-24, backend-architect; CP4.5b) · amends ADR-0035 §1/§5, implements ADR-0008 §6 ·
refines ADR-0019 (one authorization statement per request — now per cache miss)

## Context
ADR-0035 decided FusionCache (L1 memory + Redis L2 + Redis backplane), tags, fail-safe off for authorization and
"decrypted token only in L1". Designing CP4.5b (spec §4.6–4.7) left five points open:
1. Invalidation must run **after** commit; ADR-0008 only has a pre-commit stage (§6 deferred the post-commit one).
2. `HybridCache.GetOrCreateAsync` takes its tags **before** the factory runs. The tags CACHE-2 needs
   (`cluster:{id}`, `credential:{id}`, `group:{name}`) are only known from the loaded result.
3. What exactly is cached: `ClusterAccessReader` (T-0253) takes the session read-only flag and an optional cluster.
4. How the decrypted token stays out of Redis.
5. Behaviour when Redis or the database is down (CACHE-5, CACHE-7), and the Redis deploy shape for 3+ replicas and a
   disconnected production cluster.

## Decision
1. **Post-commit stage** (ADR-0008 §6). New port `IPostCommitDomainEventHandler<TEvent>` (`Application/Abstractions/
   Events`). `ConsoleDbContext.SaveChangesAsync` dispatches the events it already captured **after**
   `base.SaveChangesAsync` succeeded, through `IDomainEventDispatcher.DispatchPostCommitAsync`, in the request scope,
   sequentially, with `CancellationToken.None` (the commit happened; an aborted client must not skip invalidation).
   Contract: at-most-once, best effort; a handler exception is logged (Warning, event + handler type only) and
   swallowed — the commit is not undone and the TTL backstop heals. Handlers must not use the `DbContext`, raise
   events, or block unboundedly (cache calls only, with timeouts). Nothing is dispatched when the write fails.
2. **Application depends on a small port, not on `HybridCache`** (amends ADR-0035 §1). `IQueryCache`
   (`Application/Abstractions/Caching`) offers `GetOrLoadAsync(key, load, tagsFor, ct)` with **result-derived tags**
   and `RemoveByTagsAsync(tags, ct)`. Infrastructure implements it with `IFusionCache` (adaptive tagging: tags are set
   from the factory result). FusionCache types never appear outside `Infrastructure/Caching`. `AsHybridCache()` is not
   registered until a consumer needs plain HybridCache (CP6 discovery cache, fail-safe on there).
3. **Caching is a pipeline behavior.** Queries implement `ICacheableQuery<TValue>` (`CacheKey`, `TagsFor(TValue)`);
   `CachingBehavior<TQuery, TValue>` is registered **closed** per query (`services.AddCacheableQuery<TQuery, TValue>()`,
   right after `ValidationBehavior`) because an open generic can't map `Result<TValue>` responses. Only successful
   results are cached; a failure result is returned uncached.
4. **Cached unit = per-user access snapshot** `access:v1:user:{userId}`: every candidate row of the T-0253 statement
   for the user — including grants on **disabled** clusters (flagged, filtered on read) so `ClusterEnabled` finds the
   entry by tag — with primitives only (System.Text.Json; `v1` is bumped on any shape change so mixed versions during a
   rolling deploy never read each other's entries). Session read-only flag, cluster filter, `AccessResolver` and the
   tie log run **per request** on the snapshot (pure, in memory). One entry serves the proxy, the cluster switcher and
   Effective access, so all three keep agreeing (PREC-8).
   Tags: `user:{id}`, `cluster:{id}` and `credential:{id}` of every row, `group:{name}` of every recorded group of the
   user (not only groups with grants: a new group grant must reach members). Event → tag table: `BACKEND.md` §Recipes.
5. **No decrypted token is cached anywhere** (tightens ADR-0035 §5). The snapshot carries the Data Protection
   ciphertext; `AuthorizeProxyRequestHandler` keeps decrypting the winner's token per request, after the policies
   (µs; measured in OPS-3). L1 and L2 therefore hold the same, non-secret-in-clear payload.
6. **Options** `Cache:Duration` (default **30 s**, validated 1–60 s; CACHE-4, Q6). Fail-safe **off** set explicitly,
   no factory soft/hard timeouts, no eager refresh, `ReThrowSerializationExceptions = false` (a corrupt L2 entry reloads
   from the database). L2 and backplane errors log at Warning; FusionCache circuit breakers (a few seconds) keep a dead
   Redis off the hot path.
7. **Redis is required outside Development**: `ConnectionStrings:redis` validated on start (same pattern as
   `consoledb`); in Development/tests without it the cache is L1-only (single process, no backplane). One
   `IConnectionMultiplexer` (`abortConnect=false`) serves L2, backplane and the health check `redis`, which reports
   **Degraded, never Unhealthy** — readiness stays 200 and pods keep serving from L1 + database (CACHE-7).
   During an outage the local replica invalidates its own L1 immediately; other replicas' L1 heal within
   `Cache:Duration` (backplane auto-recovery re-publishes on reconnect). Access is never *granted* from an error path.
8. **Database unreachable → 503.** `IReadModel`/`ConsoleDbContext` translate transient connection failures
   (`NpgsqlException` with `IsTransient`, `TimeoutException`, EF `RetryLimitExceededException`) into the Application
   exception `PersistenceUnavailableException`; `GlobalExceptionHandler` maps it (searching the inner-exception chain,
   since the cache may wrap it) to 503 ProblemDetails, code `Persistence.Unavailable`. With fail-safe off an expired
   entry is never served instead (CACHE-5).
9. **Deploy.** Redis is part of `deploy/kustomize/base` (every overlay runs ≥ 3 replicas, so every overlay needs the
   backplane): one-replica `Deployment` `consolinho-redis`, no persistence (`emptyDir`, RDB/AOF off), `maxmemory` with
   LRU eviction, `Service` on 6379, `NetworkPolicy` admitting only `app.kubernetes.io/component: server` pods, egress
   6379 added to `consolinho-egress`. Password from Secret `consolinho-redis` (key `password`, created out of band like
   every Secret, CFG-5); the server composes `ConnectionStrings__redis` from it with `$(REDIS_PASSWORD)` env expansion.
   The image is the single kustomize image name `redis` (default `registry.redhat.io/rhel9/redis-7`, same registry as
   the Postgres image, runs under restricted-v2), so a disconnected overlay rewrites one `images:` entry to its mirror.
   AppHost: `AddRedis("redis")` referenced by the Api (podman).

## Consequences
- One authorization statement per **cache miss** instead of per request; Postgres CPU per request should drop (OPS-3).
- A load that started before a commit can write a pre-commit snapshot after the invalidation; this narrow race and any
  lost post-commit notification are bounded by `Cache:Duration`, like a missed invalidation (CACHE-4).
- Redis holds token ciphertext, ids, names and group lists — the same classes of data as Postgres, behind a password
  and a NetworkPolicy; no TLS inside the namespace (same as Postgres in the in-cluster overlays).
- Spec CACHE-1 wording ("through `HybridCache`") is met in spirit: FusionCache is the hybrid cache, reached through
  `IQueryCache`; the PO is told in the CP4.5b design section.
- The host group snapshot (ADR-0039 §2) stays per process; it is not moved into the cache in CP4.5b.

## Alternatives rejected
- **`HybridCache` with up-front tags only (`user:{id}`)**: cluster/credential/group events would need a database
  lookup of affected users in the post-commit handler — more code, more queries, and a second source of truth.
- **One entry per (user, cluster)**: two key shapes (proxy by name, switcher by all), more entries to invalidate, no
  gain at ~40 clusters.
- **Caching the decrypted token in an L1-only entry**: saves a µs decrypt, adds a second cache entry with a secret and
  its own invalidation; revisit only if OPS-3 shows decryption matters.
- **Redis down → Unhealthy readiness**: would take every replica out of the Route for a cache outage the app survives.
