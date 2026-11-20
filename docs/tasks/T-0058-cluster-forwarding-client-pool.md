---
id: T-0058
title: Per-cluster forwarding client pool with value-keyed invalidation
status: done
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
- [x] Corrupt CA bundle → `TryGetInvoker` false, Warning logged, no CA text in logs.
- [x] Same cluster + equal connection → same invoker instance; changed URL, CA PEM or skip flag → new invoker (PRX-7 "next request uses the new settings").
- [x] Two fake servers with two CAs: cluster A's invoker trusts A and fails with `HttpRequestError.SecureConnectionError` against B (PRX-7 isolation); skip-TLS works only for the cluster that has it.
- [x] Retired handler disposed after the grace period (fake `TimeProvider`), not before; `Dispose()` disposes all.
- [x] Probe tests unchanged and green.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-20 backend-engineer: worktree fast-forwarded main→cp/2-proxy-browser (was created from main). Added port,
  `ClusterForwardingClientPool`, `CreateForwarding` + shared `BuildSslOptions`/`ParseTrust`, DI (+`TryAddSingleton(TimeProvider.System)`),
  doc updates on `TlsValidationRecord`/`ClusterTlsHandler`. 7 pool tests with an in-file timer-capable fake `TimeProvider`
  (`ManualTimeProvider` has no timers; no new package). check-be.sh green (Testcontainers via podman ran).

## Review
- 2026-11-20 backend-architect: **APPROVE**. check-be.sh green (323/402/619). Matches ADR-0020 §1–3 and the contract;
  lock-free fast path + per-cluster build lock, exactly-once retire/dispose via `_retired.TryRemove`, `_disposed` races
  covered, no URL/CA in logs (tested), EventIds 3400/3401 unique.
  Optional (no change required):
  - `ClusterForwardingClientPool.cs:L18-19` — the grace period bounds *total* stream age, but `StreamIdleTimeout` is an
    idle timeout, so a followed log stream older than 6 min is cut after an admin edit; acceptable (new trust applies),
    T-0059 may note it in the ADR/BACKEND.md when wiring the options.
  - `ClusterForwardingClientPool.cs:L56` — requests that loaded the connection before vs. after an admin edit can
    alternate rebuilds briefly (A→B→A); transient and harmless, worth a one-line remark if touched again.

## Handover notes
- `ClusterTlsHandler.Tls` kept non-nullable: `CreateForwarding` passes a fresh, never-written record (smaller change);
  `BuildSslOptions` takes `(connection, trustedCertificates, record?)` — certs parsed separately by `ParseTrust`.
- Pool: lock-free fast path on `ClusterConnection` equality; per-cluster `Lock` for builds; replaced entries tracked in
  `_retired` with an unarmed timer armed after registration (zero grace can't leak). Removal from `_retired` is the
  single-dispose claim (timer vs `Dispose()`). `TryGetInvoker` after `Dispose()` throws `ObjectDisposedException`.
- `RetiredHandlerGracePeriod` is an `init` property (default `DefaultRetiredHandlerGracePeriod` = 6 min); DI uses the
  default — T-0059 can register via factory to tie it to `StreamIdleTimeout` if wanted.
- A failed rebuild (corrupt CA) leaves the previous entry in place but returns false; nothing cached for the bad bundle.
- Log EventIds 3400 (Information rebuild) / 3401 (Warning invalid CA); cluster id only.
- Test-only `TimerTimeProvider` lives in the pool test file (internal); move to `Fakes/` if T-0059+ need it.
