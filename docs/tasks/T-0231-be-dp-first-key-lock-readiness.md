---
id: T-0231
title: Data Protection — create the first key under an advisory lock, keyring readiness check
status: todo
owner: backend-engineer
checkpoint: 4c
depends_on: []          # parallel with T-0230/T-0232
paths: [src/FleetConsole.Infrastructure/Crypto, src/FleetConsole.Infrastructure/DependencyInjection.cs, tests/FleetConsole.Api.Tests/Persistence, tests/FleetConsole.Api.Tests/Integration/Hosting, docs/architecture/BACKEND.md, docs/architecture/SECURITY.md]
review_rounds: 0
---

## Goal
With ≥ 3 replicas (T-0230) a fresh install starts 3 pods at once against an empty `DataProtectionKeys` table. Each
pod's warm-up creates its own *active* key and caches only that one until the 24 h ring refresh, so a session cookie
or SA token protected on pod A cannot be unprotected on pod B ("key not found" → logouts, unusable credentials).
Serialise first-key creation across pods and keep a pod unready until its key ring is loaded
(ADR-0030 § Amendment 2026-11-24, replica-safety; ADR-0028 §6).

## Scope
- In: advisory lock around the warm-up's key-ring load; warm-up retries until success; `keyring` readiness check;
  integration test reproducing concurrent cold starts; doc lines.
- Out: key rotation (safe: successor keys are created 2 days before activation); the migrate init container (has no
  DP certificate by design, ADR-0027 §2); manifests (T-0230).

## Contract / design notes
- `KeyRingWarmupService.ExecuteAsync`: open an **unpooled** Npgsql connection (same way as
  `DatabaseMigrator.AcquireLockAsync`), `select pg_advisory_lock(@key)` with a new constant
  `DataProtectionSetup.KeyRingLockKey` (≠ `DatabaseMigrator.AdvisoryLockKey`; e.g. ASCII "FleetDPK"), then do the
  existing protect round-trip (loads the ring; creates the first key if empty), then unlock/close. A second pod blocks
  on the lock and then reads the committed key → no second key. Keep it off the startup path (still a
  `BackgroundService`, Kestrel binds immediately; ADR-0028).
- On failure (DB down): log as today, then **retry** with capped backoff (2 s doubling to 30 s) until success or
  shutdown — previously the ring was loaded lazily on first use, which is exactly the unserialised path.
- Readiness: a `KeyRingHealthCheck` (Infrastructure/Crypto, `internal`) registered untagged (like the database check: `/health` runs
  all checks, `/alive` only `live`-tagged ones — `ServiceDefaults/Extensions.cs:AddDefaultHealthChecks` ~L121–135); Unhealthy ("Key ring not loaded yet") until the warm-up succeeded once,
  Healthy forever after. Share the state via a small singleton (e.g. `KeyRingWarmupState` with a
  `volatile bool IsLoaded`) — no static mutable state. `/alive` is unaffected (PRB-2: a DB outage must never restart).
- Name constants/check `"keyring"`; status word only in the probe response (existing convention).
- Docs: BACKEND.md § Hosting & deployment — one clause in the "≥ 3 replicas" bullet is already there; add the check name
  to the `/health` bullet. SECURITY.md § Token handling: one line "the first DP key is created under an advisory lock
  so all replicas share one ring (ADR-0030 amendment)".

## Context pack
- Docs: ADR-0030 § Amendment (2026-11-24) (replica-safety bullet); ADR-0028 §6; ADR-0027 §4 (advisory-lock pattern).
- Exemplars: `src/FleetConsole.Infrastructure/Persistence/DatabaseMigrator.cs:AcquireLockAsync` (L91–100) + how
  `MigrateAsync` builds its unpooled connection; `tests/FleetConsole.Api.Tests/Persistence/DataProtectionKeyRingTests.cs:SessionTicket_IssuedByOneHost_IsAcceptedByAnotherHostOverTheSameDatabase_Only`
  (two hosts over one DB — copy its host setup).
- Touch points: `src/FleetConsole.Infrastructure/Crypto/KeyRingWarmupService.cs:ExecuteAsync`;
  `Crypto/DataProtectionSetup.cs` (L25 `ApplicationName`, L102 `AddHostedService<KeyRingWarmupService>`);
  `Infrastructure/DependencyInjection.cs` L33–39 (`DatabaseHealthCheckName`/timeout pattern), L70–78;
  `tests/FleetConsole.Api.Tests/Integration/Hosting/ProductionProbeTests.cs` (readiness assertions to extend).

## Acceptance criteria
- [ ] Integration test: N=3 hosts with separate DP caches start concurrently on one database with an **empty** key
      table → exactly one key row; a payload protected by each host unprotects on every other host.
- [ ] Probe test: `/health` is 503 until the warm-up has loaded the ring, 200 after; `/alive` 200 throughout.
- [ ] Warm-up retries after a DB failure and the pod turns ready once the DB is back (unit/integration test with a
      failing first attempt; no real sleeps > 1 s — inject the delay/`TimeProvider`).
- [ ] XML docs on new types explain the multi-replica reason; BACKEND.md/SECURITY.md lines added.
- [ ] Build, lint and tests green (CLAUDE.md rule 4): `scripts/check-be.sh`.

## Work log

## Review

## Handover notes
