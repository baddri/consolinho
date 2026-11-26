---
id: T-0405
title: Serve discovery from the cache in the proxy endpoint (tee on miss, byte-identical hit) + metric
status: todo
owner: backend-engineer
checkpoint: 6a
depends_on: [T-0404, T-0403]
paths: [src/FleetConsole.Api/Proxy, src/FleetConsole.Api/Diagnostics, src/FleetConsole.Api/Program.cs, tests/FleetConsole.Api.Tests/Integration/Proxy, tests/FleetConsole.Api.Tests/Proxy, docs/architecture/BACKEND.md]
review_rounds: 0
size: M (1 d)
---

## Goal
First load on ~40 clusters × every user hits discovery; serve it from a per-(cluster, credential, Accept) cache after
normal authorization (spec DC-1, DC-2, DC-4, DC-5). Depends on T-0403 only because both edit `KubernetesProxyEndpoint`.

## Scope
- In: hit path, tee-on-miss stream wrapper, metric, `ApiDiagnostics` meter class, tests, BACKEND.md § The proxy.
- Out: other paths; FE (DR tasks).

## Contract / design notes
ADR-0044 §3, §5.
- In `HandleAsync`, after authorize succeeds and before forwarding, when `request.IsCacheableDiscovery` and
  `DiscoveryCacheSeconds > 0`: key = `IDiscoveryResponseCache.Key(target.ClusterId, target.CredentialId, path, Accept, Accept-Encoding)`.
  - **Hit:** status, `Content-Type`, `Content-Encoding` (if any), `Content-Length`, the body; plus `Vary: Accept` and the
    security headers that already apply (middleware). No upstream call, no audit (GET).
  - **Miss:** wrap `context.Response.Body` with `DiscoveryTeeStream` (`Api/Proxy/DiscoveryTeeStream.cs`, internal:
    passes every write through, copies into a `MemoryStream` until `DiscoveryCacheMaxBytes`, then stops copying and marks
    overflow), forward normally, restore the body stream in `finally`; store only if `forwardError == None`, 2xx,
    not overflowed. Store failures are logged at Warning and never affect the response.
- Metric: `src/FleetConsole.Api/Diagnostics/ApiDiagnostics.cs` — `MeterName = "FleetConsole.Api"`, created via
  `IMeterFactory` (copy the Application pattern), counter `fleetconsole.proxy.discovery_cache` (unit `{lookup}`), tags
  `cluster` (cluster **name**), `result` = `hit|miss|bypass` (bypass = cacheable but TTL 0 or overflow/non-2xx on store).
  Register `metrics.AddMeter(ApiDiagnostics.MeterName)` in `Program.cs` next to the Application meter (L58-60).
  T-0407 adds the remaining API instruments to this class.
- BACKEND.md § The proxy: add `DiscoveryTeeStream` + cache line to the tree and amend "Never add response buffering…"
  with the single bounded exception (ADR-0044).

## Context pack
- Touch points: `src/FleetConsole.Api/Proxy/KubernetesProxyEndpoint.cs:HandleAsync` (authorize result ~L100-145, forward
  L147-190), `src/FleetConsole.Application/ApplicationDiagnostics.cs` (meter pattern), `src/FleetConsole.Api/Program.cs` L58-60.
- Tests: `tests/FleetConsole.Api.Tests/Integration/Proxy/KubernetesProxyForwardingTests.cs` + `Fakes/FakeKubeApiServer.cs`
  (count upstream hits). Metric assertions: `MetricCollector<long>` (Microsoft.Extensions.Diagnostics.Testing) if
  referenced, else a `MeterListener`.

## Acceptance criteria
- [ ] DC-1: 2nd identical discovery GET by a user with the same credential → no upstream call; other credential → upstream call; revoked grant → 403 before cache (tests).
- [ ] DC-2: TTL honoured (FakeTimeProvider or short TTL); 503/401 upstream not cached (next request goes upstream).
- [ ] DC-4: hit body + `Content-Type` byte-identical to the miss for legacy `/apis` and aggregated v2 `Accept`; the two
      are separate entries (test). Oversize body forwarded fine and not cached.
- [ ] DC-5: `fleetconsole.proxy.discovery_cache` hit/miss by cluster observable (test); watches/logs unaffected (existing stream tests green).
- [ ] Build + tests green; BACKEND.md updated.

## Work log

## Review

## Handover notes
