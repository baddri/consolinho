---
id: T-0231
title: Data Protection — create the first key under an advisory lock, keyring readiness check
status: done
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
- [x] Integration test: N=3 hosts with separate DP caches start concurrently on one database with an **empty** key
      table → exactly one key row; a payload protected by each host unprotects on every other host.
- [x] Probe test: `/health` is 503 until the warm-up has loaded the ring, 200 after; `/alive` 200 throughout.
- [x] Warm-up retries after a DB failure and the pod turns ready once the DB is back (unit/integration test with a
      failing first attempt; no real sleeps > 1 s — inject the delay/`TimeProvider`).
- [x] XML docs on new types explain the multi-replica reason; BACKEND.md/SECURITY.md lines added.
- [x] Build, lint and tests green (CLAUDE.md rule 4): `scripts/check-be.sh`.

## Work log
- 2026-11-24 backend-engineer: warm-up loads the ring under `pg_advisory_lock(KeyRingLockKey "FleetDPK")` on an unpooled
  connection, retries 2→30 s via injected `TimeProvider`; `KeyRingWarmupState` + `keyring` check (registered with the
  warm-up). Tests: 3 concurrent cold starts (fails 2/3 with the lock removed), lock-held 503→200, retry after DB back.
  Outside paths: `SystemEndpointsTests` polls `/health` via new `Hosting/Readiness` helper (warm-up race). Gate green.
- 2026-11-24 backend-engineer (review round 1): lock session sets server TCP keepalives 30/10×3 + `lock_timeout`
  (`KeyRingWarmupOptions.LockTimeout`, 60 s); failures log EventId 3510 and retry. New test: never-released lock →
  55P03 Warning logged → ready after release. Probe-test lock holder is unpooled. Optionals skipped. Gate green.

## Review
**Round 1 — backend-architect, 2026-11-24: CHANGES_REQUESTED**
Lock design, unpooled connection, commit-before-release, retry/backoff, `/alive` isolation, docs and the 3-replica test are good. HPA (T-0230): no problem. Unready pods get no traffic and HPA ignores them, rollouts serialise for milliseconds only, and the check never resets, so a later DB outage is reported only by the DB check.
1. `src/FleetConsole.Infrastructure/Crypto/KeyRingWarmupService.cs:106/121` — if the lock holder's node dies or is partitioned (its connection stays half-open), Postgres keeps the session, and so the lock, until server TCP keepalive notices: about 2 h+ with Linux defaults. Until then every new or rescheduled pod waits in `pg_advisory_lock` with no timeout and no log, unready. A plain pod kill/OOM is fine, because the kernel sends RST. — Required: after `OpenAsync` set session GUCs `tcp_keepalives_idle=30, tcp_keepalives_interval=10, tcp_keepalives_count=3` (or `client_connection_check_interval`) **and** `lock_timeout` (e.g. 60 s), so a blocked waiter fails, logs through the existing retry Warning and tries again. Add one sentence to the class remarks. Add a test: lock held elsewhere plus a short `lock_timeout` leads to a logged attempt and then readiness after release.
2. `tests/FleetConsole.Api.Tests/Integration/Hosting/ProductionProbeTests.cs:109` — `lockHolder` uses the *pooled* shared connection string. If an assertion fails before the explicit unlock, the session goes back to the pool still holding `FleetDPK` (Npgsql resets lazily). Every later host's warm-up in the collection then blocks, and those tests fail with 30 s `Readiness` timeouts, which hides the real failure. — Required: use `Pooling=false` for `lockHolder` (disposing it then releases the lock) or unlock in `finally`.
Optional: `:87` `ShortTimers` replaces the app-wide `TimeProvider`, so the proxy and client-pool timers also run at 20 ms in that host. That is harmless for this test, but a dedicated option or keyed clock for the warm-up would be tighter. The lock-acquire helper is duplicated from `DatabaseMigrator`, so a follow-up could share it, and the half-open-connection issue in finding 1 applies there too.

**Round 2 — backend-architect, 2026-11-24: CHANGES_REQUESTED** (one-line fix)
Finding 2 fixed (unpooled `HoldKeyRingLockAsync`). Finding 1: keepalive GUCs, `KeyRingWarmupOptions`, event 3510 + retry, remarks and the new test are good; filtered tests green (11/11).
1. `src/FleetConsole.Infrastructure/Crypto/KeyRingWarmupService.cs:146` (`AcquireLockAsync`) — the lock command keeps Npgsql's default `CommandTimeout` (30 s), so in production a waiter aborts after 30 s with an Npgsql timeout, never via the 60 s `lock_timeout`, which makes `KeyRingWarmupOptions.LockTimeout` and its docs untrue (the test passes only because it uses 200 ms). — Required: set `command.CommandTimeout = 0` on the lock command (`lock_timeout` bounds the wait, the token handles shutdown) and add a one-line comment saying why.

## Handover notes
- `/health` now also waits for the key ring: tests probing `/health` right after host start must use
  `Readiness.GetWhenReadyAsync` (tests/.../Integration/Hosting/Readiness.cs).
- `ProductionHost.Create` gained an optional `configureServices` hook (used for a short-timer `TimeProvider`).
- Warm-up failures now log once per attempt (Warning, attempt number + next delay; max one per 30 s while DB is down).
- The lock is per database (Postgres advisory locks are database-scoped); the migrate init container is untouched.
- Follow-up: `DatabaseMigrator`'s lock has the same half-open-holder issue (no keepalives/`lock_timeout`), and its
  lock-acquire SQL is duplicated here — share one hardened advisory-lock helper.

- 2026-11-24 orchestrator (round 3): applied the round-2 one-liner `command.CommandTimeout = 0` + comment in `AcquireLockAsync`; ProductionProbeTests + DataProtectionKeyRingTests 11/11 green. APPROVE.
