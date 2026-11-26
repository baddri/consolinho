---
id: T-0404
title: Discovery cache building blocks — ProxyPath.IsDiscovery, ProxyTarget.CredentialId, IDiscoveryResponseCache
status: todo
owner: backend-engineer
checkpoint: 6a
depends_on: []
paths: [src/FleetConsole.Application/Proxy, src/FleetConsole.Application/Abstractions/Caching, src/FleetConsole.Infrastructure/Caching, tests/FleetConsole.Application.Tests/Proxy, tests/FleetConsole.Api.Tests/Caching]
review_rounds: 0
size: S (0.5 d)
---

## Goal
Prepare the pure/infra pieces of ADR-0044 so T-0405 only wires the proxy endpoint (spec DC-1..3).

## Scope
- In: `ProxyPath.IsDiscovery`, `ProxyTarget.CredentialId`, port + FusionCache implementation (memory-only, tagged),
  `Proxy:DiscoveryCacheSeconds`/`Proxy:DiscoveryCacheMaxBytes` options + validation, unit/replica tests.
- Out: endpoint tee/hit path, metric (T-0405).

## Contract / design notes
ADR-0044 §1–4.
- `ProxyPath.IsDiscovery` (bool): raw path exactly `/api`, `/apis` or `/version` (no trailing slash, no sub-path).
  Callers also require `GET`, empty query, not upgrade — put that in `ProxyRequest.IsCacheableDiscovery` (computed in
  `Create`, doc why HEAD is excluded: no body to cache).
- `ProxyTarget` (`Application/Proxy/ProxyTarget.cs` L19) appends `CredentialId CredentialId` — filled in
  `AuthorizeProxyRequestHandler` from the resolved winner (same source as `ClusterHealthProbe`, `access.Resolution.Winner.CredentialId`).
- Port `Application/Abstractions/Caching/IDiscoveryResponseCache.cs`:
  ```csharp
  public sealed record CachedDiscoveryResponse(int StatusCode, string? ContentType, string? ContentEncoding, byte[] Body);
  public interface IDiscoveryResponseCache {
      ValueTask<CachedDiscoveryResponse?> TryGetAsync(string key, CancellationToken ct);
      ValueTask SetAsync(string key, CachedDiscoveryResponse value, ClusterId cluster, CredentialId credential, CancellationToken ct);
      static string Key(ClusterId c, CredentialId cr, string path, string? accept, string? acceptEncoding); // ADR-0044 §2
  }
  ```
  `Key`: normalise Accept (trim, collapse whitespace around `;`/`,`, case kept for params) — document; hash is
  SHA-256 hex first 16 chars. Prefix `discovery:v1:`.
- Infrastructure `Caching/FusionDiscoveryResponseCache.cs`: same `IFusionCache` as `FusionQueryCache`, entry options
  `Duration = Proxy:DiscoveryCacheSeconds`, `SkipDistributedCacheRead/Write = true`, tags `CacheTags.Cluster/Credential`.
  TTL 0 → no-op implementation semantics (TryGet null, Set ignored). Registered in `CachingSetup`.
- `ProxyOptions` gains `DiscoveryCacheSeconds` (int, 0–600, default 60) and `DiscoveryCacheMaxBytes` (long, 1 KiB–32 MiB,
  default 4 MiB); `ProxyOptionsValidator` (Api/Proxy/ProxySetup.cs L45+) messages name keys.
- Invalidation: nothing new — `AccessCacheInvalidation` already removes `cluster:`/`credential:` tags for
  ClusterUpdated/Disabled/Deleted, CredentialRotated/Tested/Deleted (L28-42). Grant revoke needs none (authz first; ADR-0044 Consequences).

## Context pack
- Exemplars: `src/FleetConsole.Infrastructure/Caching/FusionQueryCache.cs` (entry options, tags); `src/FleetConsole.Application/Fleet/ClusterHealthProbe.cs:ProbeAsync` (L55-75, key + tags);
  `src/FleetConsole.Application/Abstractions/Caching/CacheTags.cs`.
- Touch points: `ProxyPath.cs:TryParse` (L40), `ProxyRequest.cs:Create` (L67), `ProxyTarget.cs` (L19),
  `Application/Proxy/AuthorizeProxyRequest/AuthorizeProxyRequestHandler.cs`, `ProxyOptions.cs`, `Infrastructure/Caching/CachingSetup.cs` (L66-120).
- Tests: `tests/FleetConsole.Api.Tests/Caching/AccessCacheReplicaTests.cs` (two-replica + Redis fixture) — prove a tag
  removal on replica A evicts the memory-only entry on replica B; Application tests for `IsDiscovery`/`Key` (v2 vs legacy
  Accept → different keys; whitespace variants → same key).

## Acceptance criteria
- [ ] DC-1 (part): only GET `/api`, `/apis`, `/version` without query are cacheable (table test incl. `/apis/apps`, `/api/v1`, HEAD, `?timeout=`).
- [ ] DC-3: cluster edit/credential rotate tags evict entries across replicas; entries never written to Redis L2 (test).
- [ ] Keys differ per credential and per Accept; options validated; build + tests green.

## Work log

## Review

## Handover notes
