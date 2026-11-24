---
id: T-0321
title: Fleet query — GetFleetStatusQuery streams one FleetClusterStatusDto per accessible cluster, bounded and isolated
status: todo
owner: backend-engineer
checkpoint: 5c
depends_on: [T-0320]
paths: [src/FleetConsole.Application/Fleet/GetFleetStatus/, src/FleetConsole.Application/Clusters/ListAccessibleClusters/, tests/FleetConsole.Application.Tests/Fleet/GetFleetStatus/]
review_rounds: 0
---

## Goal
The use case behind `GET /api/fleet/status` (FBE-1/2/3/7, ADR-0041 §1 and §5): resolve the caller's effective access
once, then probe every accessible cluster through `IClusterHealthProbe` with bounded parallelism, yielding each
cluster's line as soon as it completes.

## Scope
- In: query, handler, `FleetStatusStream`, per-cluster isolation, cancellation, unit tests.
- Out: HTTP/NDJSON writing and the pod-wide limiter (T-0323), probing itself (T-0320), the upstream adapter (T-0322).

## Contract / design notes
- `public sealed record GetFleetStatusQuery : IQuery<FleetStatusStream>, IRequireAuthenticated` (no cache marker:
  caching is per cluster inside the probe). The handler resolves access with `ClusterAccessReader.LoadAsync(userId,
  cluster: null, session read-only, ct)` exactly like `ListAccessibleClustersHandler` (one cached snapshot, no SQL
  per cluster; disabled clusters are already excluded). `Persistence.Unavailable` surfaces before streaming as today.
- `public sealed class FleetStatusStream { public int ClusterCount { get; } public IAsyncEnumerable<FleetClusterStatusDto>
  ReadAllAsync(CancellationToken ct); }` — returned as `Result<FleetStatusStream>`. The handler does **not** start
  probing; `ReadAllAsync` does (so the endpoint decides when work begins and the request token governs it).
- `ReadAllAsync`: bounded `Channel<FleetClusterStatusDto>` (capacity = cluster count), a producer task running
  `Parallel.ForEachAsync(accesses, new ParallelOptions { MaxDegreeOfParallelism = options.MaxClusterConcurrency,
  CancellationToken = ct }, …)`, writer completed in `finally`; consumer yields `ReadAllAsync(ct)` from the reader.
  Await the producer at the end so its exceptions are observed; when the consumer stops early (client gone) cancel a
  linked CTS so no probe outlives the request.
- Line = `new FleetClusterStatusDto(<AccessibleClusterDto built exactly as ListAccessibleClustersHandler L39 does — extract a shared `AccessibleClusterDto.From(ResolvedClusterAccess)` factory and use it in both>,
  facts.CheckedAt, facts.Failure, …sections)`. Identity/access-mode come from the current resolution, never the cache.
- Isolation: a non-`OperationCanceledException` from one cluster's probe → `LogError` (cluster id, exception) and
  a line with `Failure = UpstreamError`, `CheckedAt = now`; other clusters continue. OCE from `ct` propagates.
- `IClusterHealthProbe` is scoped and concurrency-safe by contract (T-0320); the handler resolves it once and shares
  it — **do not** dispatch further queries from inside the parallel loop (shared request scope, ADR-0041 §3).

## Context pack
- Docs: `BACKEND.md` §CQRS (query recipe), ADR-0041 §1, §3 (last paragraph), §5.
- Exemplar: `src/FleetConsole.Application/Clusters/ListAccessibleClusters/` (query + handler + DTO projection; copy the
  access-loading and DTO mapping, reuse `AccessibleClusterDto` — do not duplicate it).
- Touch points: `Application/Access/ClusterAccessReader.cs:LoadAsync` (L42); `Application/Fleet/IClusterHealthProbe`
  + `FleetOptions` + DTOs (T-0320); `ICurrentUser` / session read-only flag as used by the exemplar.
- Tests: Application.Tests with a fake `IClusterHealthProbe` (TaskCompletionSource per cluster to control completion
  order; an `Interlocked` in-flight counter with a max-seen value).

## Acceptance criteria
- [ ] Lines arrive in completion order (cluster B completing before A is yielded first).
- [ ] Max in-flight probes never exceeds `MaxClusterConcurrency` (fake counting in-flight, 25 clusters, limit 3).
- [ ] One cluster throwing → that line has `UpstreamError`, others ok, error logged once; no exception escapes.
- [ ] Cancelling the consumer token cancels in-flight probes (fake observes cancellation) and ends enumeration.
- [ ] No access → `ClusterCount == 0`, empty stream; access resolved exactly once per query (substitute call count).
- [ ] XML docs on public types; `scripts/check-be.sh` green.

## Work log

## Review

## Handover notes
