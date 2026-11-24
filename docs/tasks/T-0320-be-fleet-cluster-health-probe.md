---
id: T-0320
title: Fleet core — IClusterHealthReader port, FleetOptions, cached per-(cluster, credential) ClusterHealthProbe, fleet DTOs, probe metric
status: todo
owner: backend-engineer
checkpoint: 5c
depends_on: []
paths: [src/FleetConsole.Application/Fleet/, src/FleetConsole.Application/Abstractions/Kubernetes/IClusterHealthReader.cs, src/FleetConsole.Application/Abstractions/Kubernetes/ClusterHealthReading.cs, src/FleetConsole.Application/Abstractions/Caching/IQueryCache.cs, src/FleetConsole.Infrastructure/Caching/FusionQueryCache.cs, src/FleetConsole.Application/ApplicationDiagnostics.cs, src/FleetConsole.Application/DependencyInjection.cs, tests/FleetConsole.Application.Tests/Fleet/, tests/FleetConsole.Api.Tests/Caching/]
review_rounds: 0
---

## Goal
The per-cluster building block of the fleet overview (FBE-2/3/4/6, ADR-0041 §2–§6): given one resolved access, produce
that cluster's health facts with the user's winning grant credential, cached 30 s per (cluster, credential), bounded by
a per-cluster timeout, passing the proxy policy chain first, logging + measuring each upstream probe. No HTTP code here
(port only; adapter = T-0322), no streaming (T-0321).

## Scope
- In: port + reading types, `FleetOptions`, fleet DTOs (contract §2), `IClusterHealthProbe`/`ClusterHealthProbe`, pure
  `ClusterHealthFactsMapper`, `IQueryCache` per-call duration overload (+ FusionCache impl), `Meter`, unit tests.
- Out: query/handler/stream (T-0321), Infrastructure reader (T-0322), endpoint/options binding/limiter/AddMeter (T-0323).

## Contract / design notes
ADR-0041; contract `docs/specs/CP5-api-contract.md` §2 (DTO shapes are binding — names below → OpenAPI schema names).

**Port** (`Application/Abstractions/Kubernetes/`):
```csharp
public interface IClusterHealthReader
{
    // Runs the distribution's probes concurrently (OpenShift: clusterVersion, clusterOperators, nodes; Kubernetes:
    // version, nodes) through the cluster's forwarding-pool invoker. Expected failures are data (ProbeResponse.Fail);
    // cancellation of cancellationToken throws OperationCanceledException (the caller's budget is a linked token).
    Task<ClusterHealthReading> ReadAsync(ClusterId clusterId, ClusterConnection connection,
        ClusterDistribution distribution, SensitiveString token, CancellationToken cancellationToken);
}
public sealed record ClusterHealthReading(
    ProbeResponse<KubernetesVersionFacts>? KubernetesVersion,   // null = not probed (OpenShift)
    ProbeResponse<ClusterVersionFacts>? ClusterVersion,         // null = not probed (Kubernetes)
    ProbeResponse<ClusterOperatorCounts>? ClusterOperators,     // null = not probed (Kubernetes)
    ProbeResponse<NodeCounts> Nodes);
public sealed record KubernetesVersionFacts(string GitVersion);
public sealed record ClusterVersionFacts(string? CurrentVersion, string? DesiredVersion, bool? Available,
    bool? Progressing, bool? Failing, int AvailableUpdates);
public sealed record ClusterOperatorCounts(int Total, int Degraded, int Unavailable, int Progressing);
public sealed record NodeCounts(int Total, int Ready, int Unschedulable);
```
Also a `public static class FleetProbePaths` (Application/Fleet) with the four raw paths of contract §3 and
`For(ClusterDistribution)`; T-0322 uses the same constants.

**Options** `Application/Fleet/FleetOptions` (section `Fleet`): `MaxClusterConcurrency` 10 (1..32), `ClusterTimeout`
5 s (1..30 s), `CacheDuration` 30 s (1..60 s, same bounds as `Cache:Duration`), `MaxConcurrentRequests` 16 (1..256),
`RequestQueueLimit` 64 (0..1024); `IsValid()` + message constant like `Infrastructure/Caching/CacheOptions`. Binding
and start-up validation are T-0323.

**DTOs** (`Application/Fleet/`, public sealed records, XML docs written for API consumers): `FleetClusterStatusDto(
AccessibleClusterDto Cluster, DateTimeOffset CheckedAt, FleetClusterFailure? Failure, FleetKubernetesVersionDto?
KubernetesVersion, FleetClusterVersionDto? ClusterVersion, FleetClusterOperatorsDto? ClusterOperators, FleetNodesDto?
Nodes)`; enums `FleetClusterFailure {Unreachable, Timeout, TlsError, TokenInvalid, UpstreamError, BlockedByPolicy}`,
`FleetProbeOutcome {Ok, Forbidden, NotFound}`; section records exactly as contract §2 (counts null unless Ok).

**Cached value** `ClusterHealthFacts(DateTimeOffset CheckedAt, FleetClusterFailure? Failure, …the four section DTOs)`
— primitives only, System.Text.Json round-trip test. Never contains identity, access mode, token or upstream text.

**Mapper** `internal static ClusterHealthFactsMapper.Map(ClusterHealthReading, DateTimeOffset now)`: cluster-level
failure from the probes' `ProbeFailureKind`s, most severe first: Dns/ConnectionRefused → `Unreachable`; Tls* →
`TlsError`; Timeout → `Timeout`; Unauthorized → `TokenInvalid`; UnexpectedStatus/InvalidResponse → `UpstreamError`.
If any → all sections null. Otherwise per section: Ok → counts; Forbidden → `Forbidden`; NotFound → `NotFound`.
`notReady = Total − Ready`.

**Probe** `internal interface IClusterHealthProbe { Task<ClusterHealthFacts> ProbeAsync(ResolvedClusterAccess access,
UserId userId, bool sessionIsReadOnly, CancellationToken ct); }`, `ClusterHealthProbe` registered scoped, **stateless and
safe for concurrent calls** (T-0321 calls it in parallel within one request):
1. Policy chain (`IEnumerable<IProxyPolicy>`) for each path of `FleetProbePaths.For(distribution)`: build
   `ProxyRequest.Create("GET", path, query, isUpgrade: false, contentLength: null)` and a `ProxyRequestContext` exactly as
   `AuthorizeProxyRequestHandler` does (grant mode = winner's own mode, read-only = stored ∨ session). Any refusal →
   return `Failure = BlockedByPolicy` facts, **uncached, no decrypt, no upstream call**.
2. `IQueryCache.GetOrLoadAsync(key, load, tagsFor, options.CacheDuration, ct)` with key
   `fleet-health:v1:cluster:{clusterId:D}:credential:{credentialId:D}` (credential = `access.Resolution.Winner.CredentialId`),
   tags `CacheTags.Cluster` + `CacheTags.Credential`.
3. Loader: `tokenProtector.Unprotect(access.WinnerToken)` (inside the loader only — a hit decrypts nothing),
   linked CTS `CancelAfter(ClusterTimeout)`, `reader.ReadAsync(...)`; `OperationCanceledException` when the caller's
   `ct` is **not** cancelled → `Failure = Timeout` facts (cached). Map via the mapper; `CheckedAt = TimeProvider/IClock now`.
4. Per load: one log (`LoggerMessage`, Debug when no failure/forbidden, Information otherwise; cluster id, outcome
   category, elapsed ms; never token/URL query/body) and one histogram record on `fleetconsole.fleet.probe.duration`
   (unit `ms`, tag `outcome` = failure enum or `ok`/`restricted`). Meter: `ApplicationDiagnostics.MeterName =
   "FleetConsole.Application"`, created via `IMeterFactory` in a small `FleetMetrics` singleton.
5. Non-cancellation exceptions propagate (T-0321 isolates them per cluster).

**`IQueryCache` overload:** `GetOrLoadAsync<TValue>(string key, Func<CancellationToken, Task<TValue>> load,
Func<TValue, IReadOnlyCollection<string>> tagsFor, TimeSpan duration, CancellationToken ct)`; FusionCache impl passes
entry options derived from the defaults with only `Duration` changed (e.g. `cache.CreateEntryOptions(duration: …)` —
verify the member in the FusionCache XML docs); fail-safe stays off. Add one test next to the existing cache tests.

## Context pack
- Docs: `BACKEND.md` §Recipes › Caching a query, §The proxy; ADR-0041; ADR-0040 §2–§4.
- Exemplars: `src/FleetConsole.Application/Proxy/AuthorizeProxyRequest/AuthorizeProxyRequestHandler.cs:L64-84` (context +
  policy loop, decrypt only after policies); `src/FleetConsole.Application/Access/LoadAccessSnapshot/LoadAccessSnapshotQuery.cs:L25-40`
  (versioned key + tags); `src/FleetConsole.Infrastructure/Caching/CacheOptions.cs` (bounds + IsValid pattern);
  `src/FleetConsole.Application/Abstractions/Kubernetes/IClusterProbeSession.cs` (port doc style, linked-budget rule).
- Touch points: `Application/Access/ResolvedClusterAccess.cs` (input; `Resolution.Winner.CredentialId` per
  `Domain/Access/Resolution/AccessCandidate.cs:L15-21`); `Application/Proxy/Requests/ProxyPath.cs:TryParse` (L40),
  `ProxyRequest.cs:Create` (L67); `Application/Abstractions/Caching/CacheTags.cs`; `IQueryCache.cs`;
  `Infrastructure/Caching/FusionQueryCache.cs:L19-38`; `Application/DependencyInjection.cs:L66-84` (register probe,
  metrics, options type); `ApplicationDiagnostics.cs` (add `MeterName`); `Application/Clusters/ListAccessibleClusters/AccessibleClusterDto.cs`.
- Invalidation needs **no new handler**: `Application/Access/AccessCacheInvalidation.cs` already removes `cluster:`/`credential:` tags.

## Acceptance criteria
- [ ] Port, reading types, `FleetProbePaths`, `FleetOptions`, DTOs, enums, `ClusterHealthFacts` exist with XML docs (why/how).
- [ ] Mapper table-driven tests: each `ProbeFailureKind` → failure, precedence with mixed kinds, forbidden/notFound
      sections, notReady arithmetic, Kubernetes (null CV/CO) vs OpenShift (null version).
- [ ] Probe tests (NSubstitute reader/protector/cache-pass-through): key + tags contain cluster and **winner credential**;
      policy refusal → BlockedByPolicy, reader and `Unprotect` never called, cache not called; timeout (reader awaits
      cancellation, budget 50 ms) → Timeout facts; caller cancellation → throws OCE; `CacheDuration` passed through.
- [ ] Facts JSON round-trip test; metric recorded once per load (`MetricCollector<double>`); no token in captured logs.
- [ ] `IQueryCache` duration overload implemented and tested (entry expires after the given duration).
- [ ] `scripts/check-be.sh` green.

## Work log

## Review

## Handover notes
