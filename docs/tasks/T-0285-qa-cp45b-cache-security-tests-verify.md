---
id: T-0285
title: CP4.5b QG-4 security tests (Testcontainers Redis, two app instances) + VERIFY
status: done
owner: qa-engineer
checkpoint: 4.5b
depends_on: [T-0282, T-0284]
paths: [tests/FleetConsole.Api.Tests/Caching/, tests/FleetConsole.Api.Tests/Integration/ApiFactory.cs, tests/FleetConsole.Api.Tests/Integration/RedisFixture.cs, docs/specs/CP4.5-access-at-scale.md]
review_rounds: 0
---

## Goal
Prove the security properties of the access cache end to end (QG-4: CACHE-3, CACHE-5, CACHE-6; plus CACHE-7) with real
Redis and two app instances sharing one database, then verify every CP4.5b AC and record the result in the spec.

## Scope
- In: an `ApiFactory` sibling helper, the QG-4 tests, a Redis-down test at Api level, VERIFY summary.
- Out: production code changes (file bug tasks instead); live cluster checks (T-0286).

## Contract / design notes
- Add `ApiFactory.CreateSiblingAsync(overrides)` (internal): a second host on the **same** database (and therefore the
  same Data Protection key ring, so a session cookie from A is valid on B) and the same overrides; both get
  `ConnectionStrings:redis` from one `RedisFixture` (T-0281). Variants today always get a fresh database
  (`CreateVariantAsync`), so this is new.
- **CACHE-3**: user with a grant, `Cache:Duration` = 60 s; proxy GET on B succeeds (warms B's L1); revoke on A via the
  admin API; proxy GET on B with the same cookie → refused (PRX-2 404 / not available) within 2 s (poll ≤ 2 s, no sleep
  ≥ TTL). Repeat for a group-grant revoke and a `UserReadOnlyChanged` (mutation refused on B).
- **CACHE-6**: after a run that warms both instances with the fixture SA token, `SCAN` every key in Redis and `GET`/
  `HGETALL` each value (FusionCache stores strings/hashes — handle both); assert neither the plaintext fixture token nor
  its base64/UTF-8-escaped forms occur (reuse `TokenLeakScanner` patterns); also assert at least one value contains the
  user id (proves the scan saw access entries).
- **CACHE-5**: warm an entry, let it expire (`Cache:Duration` 1 s), make the database unreachable (stop routing: point
  the sibling's `ConnectionStrings:consoledb` at a stopped/paused Postgres, or `configureServices` failing `IReadModel`
  throwing `NpgsqlException`) → proxy request answers **503** `Persistence.Unavailable`, never 200.
- **CACHE-7**: Redis stopped (`RedisFixture` pause/stop) → login + proxy keep working on one instance, `/health` 200 with
  `redis` Degraded, a Warning logged; revoke still takes effect on that instance immediately.
- Testcontainers via podman: `DOCKER_HOST`, `TESTCONTAINERS_RYUK_DISABLED=true` (CLAUDE.md).

## Context pack
- Docs: spec §4.6 CACHE-1..8, §4.8 QG-4; ADR-0040 §4–8; BACKEND.md §Testing (L308+).
- Exemplars: `tests/.../Integration/ApiFactory.cs:CreateVariantAsync` (L125–150), `TokenLeakScanner.cs`,
  `tests/.../Integration/Hosting/Readiness.cs` (health assertions), T-0282's `tests/FleetConsole.Api.Tests/Caching/`.
- Touch points: `ApiFactory` private ctor (L59–75: postgres/database/overrides), `RedisFixture`, `TestData` (seeding
  grants/credentials through `factory.Services.CreateSignedInScope()`).

## Acceptance criteria
- [x] CACHE-3, CACHE-5, CACHE-6, CACHE-7 tests green and non-flaky (3 consecutive local runs noted in Work log).
- [x] VERIFY: every CACHE-1..8, OPS-1, QG-1, QG-4 marked pass/fail with evidence in a "CP4.5b VERIFY" block in the spec
      (OPS-2/OPS-3 are verified by T-0286). Failures → bug task files, not fixes.
- [x] `scripts/check-be.sh` and `scripts/check-fe.sh` green (QG-1)

## Work log
- 2026-11-25 qa: added `ApiFactory.CreateSiblingAsync` (same DB, optional overrides), `RedisFixture.StopAsync`, and
  `Caching/AccessCacheReplicaTests` (CACHE-3 ×3: direct revoke, group revoke, set read-only; CACHE-6 Redis scan) plus
  `Caching/AccessCacheFailureTests` (CACHE-5 expired entry + DB down → 503; CACHE-7 Redis stopped).
- Negative control: B without Redis made all 3 CACHE-3 tests fail. Cache tests (18) green 3 consecutive runs.
- Gates: check-be 431/840/992, check-fe 1304/1304, check-deploy ok. VERIFY in `docs/specs/CP4.5-acceptance.md`.

## Review
- 2026-11-25 backend-architect, round 1: **APPROVE**. CACHE-3 ×3 poll ≤2 s with a 60 s TTL; the negative control and
  the backplane handshake rule out the subscription race. CACHE-5 works because `AddDbContext` re-reads the connection
  string per scope, and the fresh-entry check rules out a 503 from upstream. CACHE-6 scans strings and hashes, checks
  that access entries were seen and also checks OAuth tokens. CACHE-7 uses its own Redis container per test. A sibling
  never drops the shared DB (`ownsPostgres: false`, no drop on dispose). AccessCache filter: 14/14 green.
- Optional: `AccessCacheFailureTests.cs:115` could check only log entries written after `StopAsync` (stronger CACHE-7
  evidence). CACHE-5 uses a 3 s duration plus a fixed wait, not the 1 s the contract suggests. Expiry needs the wait,
  and the margin makes the test less flaky, so this is acceptable.

## Handover notes
- Replica fixture does a backplane handshake (tag removed on A until B reloads) before tests, because the subscription
  is established lazily; without it the first CACHE-3 test could race the subscription. Production pods have the
  same cold-start window (risk R1 in the VERIFY block).
- Usernames for sibling hosts must come from the original host (the emulators' pool counters are independent).
- OPS-2/OPS-3 are open for T-0286 (live).
