---
id: T-0058
title: Per-cluster forwarding client pool with value-keyed invalidation
status: todo
owner: backend-engineer
checkpoint: 2
depends_on: []
paths: [src/FleetConsole.Application/Abstractions/Kubernetes/IClusterForwardingClients.cs, src/FleetConsole.Infrastructure/Kubernetes/, src/FleetConsole.Infrastructure/DependencyInjection.cs, tests/FleetConsole.Api.Tests/Kubernetes/ClusterForwardingClientPoolTests.cs]
review_rounds: 0
---

## Goal
Give the proxy one long-lived `HttpMessageInvoker` per cluster that validates TLS against that cluster's own trust
(PRX-7) and picks up admin edits on the next request, without an invalidation bus. Resolves the HANDOVER follow-up
"pooled handlers need a fresh `TlsValidationRecord` per connection" by not recording at all (ADR-0020 §2–3).
Lane C — parallel with T-0056/T-0057.

## Scope
- In: port, pool, factory refactor, DI registration, tests against `FakeKubeApiServer`.
- Out: YARP, error mapping (T-0061). Do not change probe behaviour.

## Contract / design notes
ADR-0020 §1–3.
```csharp
// Application/Abstractions/Kubernetes
public interface IClusterForwardingClients
{
    /// Gets the invoker for clusterId built from exactly `connection`; rebuilds when the stored connection differs
    /// (record value equality). Never returns a disposed invoker. Returns false (and logs a Warning without CA content)
    /// when the stored CA bundle can't be parsed — the proxy answers 502 Proxy.UpstreamTls.
    bool TryGetInvoker(ClusterId clusterId, ClusterConnection connection, [NotNullWhen(true)] out HttpMessageInvoker? invoker);
}
// Infrastructure/Kubernetes
internal sealed class ClusterForwardingClientPool(ClusterTlsHandlerFactory factory, TimeProvider time, ILogger<...>)
    : IClusterForwardingClients, IDisposable   // ConcurrentDictionary<ClusterId, Entry(ClusterConnection, ClusterTlsHandler, HttpMessageInvoker)>
// ClusterTlsHandlerFactory
public ClusterTlsHandler CreateForwarding(ClusterConnection connection); // same trust as Create, no TlsValidationRecord writes
```
- Extract `BuildSslOptions(ClusterConnection, TlsValidationRecord? record)`; `Create` passes its record, `CreateForwarding`
  passes null (callback still rejects; just records nothing). `ClusterTlsHandler.Tls` becomes nullable or gets a no-op
  record — pick the smaller change, keep probes compiling.
- Forwarding handler settings: `AllowAutoRedirect=false`, `UseCookies=false`, `AutomaticDecompression=None`,
  `EnableMultipleHttp2Connections=true`, `ConnectTimeout` from the factory (10 s).
- Replacement: `AddOrUpdate`-style swap under a per-cluster lock so concurrent first requests build one handler; the
  replaced entry is disposed after `RetiredHandlerGracePeriod` (ctor parameter / property, default 6 min = watch cap +
  idle margin; the proxy options come in T-0059, do not depend on them) using `TimeProvider` timers; `Dispose()`
  disposes everything. Log at Information "Rebuilt forwarding client for cluster {ClusterId}" (no URL, no CA).
- `InvalidCaBundleException` (internal) is caught inside the pool → `false`; nothing is cached for it.
- `TimeProvider`: register `services.TryAddSingleton(TimeProvider.System)` in Infrastructure DI (DevOAuth also TryAdds it).
- Register: `services.AddSingleton<IClusterForwardingClients, ClusterForwardingClientPool>()` next to the probe client
  (update the comment there). Update `TlsValidationRecord` remarks: CP2 caveat resolved by ADR-0020.

## Context pack
- `src/FleetConsole.Infrastructure/Kubernetes/ClusterTlsHandlerFactory.cs:L42-94` (`Create` — split it), `ClusterTlsHandler.cs` (ctor/Dispose), `TlsValidationRecord.cs:L8-13` remarks.
- `src/FleetConsole.Infrastructure/DependencyInjection.cs:L73-80` registration site.
- `src/FleetConsole.Application/Abstractions/Kubernetes/ClusterConnection.cs` (record; value equality is the key).
- Tests exemplar: `tests/FleetConsole.Api.Tests/Kubernetes/ClusterProbeClientTests.cs:L26-50` (fake server + CA); Infrastructure internals are visible to `FleetConsole.Api.Tests`.

## Acceptance criteria
- [ ] Corrupt CA bundle → `TryGetInvoker` false, Warning logged, no CA text in logs.
- [ ] Same cluster + equal connection → same invoker instance; changed URL, CA PEM or skip flag → new invoker (PRX-7 "next request uses the new settings").
- [ ] Two fake servers with two CAs: cluster A's invoker trusts A and fails with `HttpRequestError.SecureConnectionError` against B (PRX-7 isolation); skip-TLS works only for the cluster that has it.
- [ ] Retired handler disposed after the grace period (fake `TimeProvider`), not before; `Dispose()` disposes all.
- [ ] Probe tests unchanged and green.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
