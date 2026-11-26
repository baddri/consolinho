---
id: T-0408
title: Readiness — keyring cold start Degraded with grace period; backplane subscribed before ready
status: todo
owner: backend-engineer
checkpoint: 6a
depends_on: []
paths: [src/FleetConsole.Infrastructure/Crypto, src/FleetConsole.Infrastructure/Caching/CachingSetup.cs, src/FleetConsole.Api/Hosting, tests/FleetConsole.Api.Tests/Integration/Hosting, tests/FleetConsole.Api.Tests/Caching, docs/ops/RUNBOOK.md]
review_rounds: 0
size: M (0.5–1 d)
---

## Goal
Stop "Key ring not loaded yet" flapping readiness during normal start, but still fail readiness when the keyring really
cannot load (spec OBS-5); never route traffic to a replica that would miss cache invalidations (SRV-4).

## Scope
- In: `KeyRingHealthCheck` grace logic, one-shot Warning, `DataProtection:KeyRingGracePeriod`, backplane readiness, tests, RUNBOOK §9.
- Out: metrics of health (T-0407).

## Contract / design notes
- `KeyRingHealthCheck` (L18-21) + `KeyRingWarmupState`: record process start (`TimeProvider`). Not loaded and
  `elapsed < KeyRingGracePeriod` (default 60 s, 5 s–10 min, validated, names key) → **Degraded** "Key ring warming up"
  (readiness stays 200: no custom `ResultStatusCodes` exist, so the ASP.NET default maps Degraded → 200; add a test that pins this).
  Not loaded after grace → **Unhealthy** + one Warning log "Data Protection key ring not loaded after {Grace}" (once per process).
  Loaded → Healthy. Warmup failure reason (exception type, no message values) is included in the description.
- SRV-4: in `CachingSetup` (backplane L117, redis check L92) add a check `cache-backplane` (tag `ready`): Healthy once
  the FusionCache backplane reports subscribed (use FusionCache `Events.Backplane` / `IFusionCacheBackplane` connection
  events — confirm the API via XML docs); before that and within `Cache:BackplaneReadyTimeout` (default 30 s) → Unhealthy
  (not ready); after timeout → Degraded (ready, so a Redis outage does not take the fleet down; matches the existing
  Degraded redis check). Only registered when Redis is configured.
- RUNBOOK §9: both messages and what to do.

## Context pack
- `src/FleetConsole.Infrastructure/Crypto/KeyRingHealthCheck.cs` L18-21, `KeyRingWarmupState`, `KeyRingWarmupService` L60-68.
- `src/FleetConsole.Infrastructure/Caching/CachingSetup.cs` L66-120.
- Tests: `tests/FleetConsole.Api.Tests/Integration/Hosting/Readiness.cs`, `ProductionProbeTests.cs`; `Caching/AccessCacheReplicaTests.cs` (Redis fixture). Use `FakeTimeProvider`.

## Acceptance criteria
- [ ] OBS-5: cold start within grace → ready not failing, no Warning; after grace without keyring → readiness 503 + exactly one Warning (tests).
- [ ] SRV-4: with Redis configured, readiness fails until the backplane is subscribed; after timeout Degraded (tests).
- [ ] Build + tests green; RUNBOOK updated.

## Work log

## Review

## Handover notes
