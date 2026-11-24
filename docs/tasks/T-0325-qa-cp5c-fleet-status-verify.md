---
id: T-0325
title: QA — verify FBE / QG5C-1 and QG5C-4 for GET /api/fleet/status (isolation, bounds, leak sweep, performance smoke)
status: done
owner: qa-engineer
checkpoint: 5c
depends_on: [T-0323]
paths: [tests/FleetConsole.Api.Tests/Integration/Fleet/FleetStatusAcceptanceTests.cs, tests/FleetConsole.Api.Tests/Integration/Fleet/FleetStatusPerformanceTests.cs, tests/FleetConsole.Api.Tests/Integration/Proxy/ProxyTokenLeakSweepTests.cs]
review_rounds: 0
---

## Goal
Independent acceptance of the fleet backend against spec §5c.2 FBE-1..7 and QG5C-1/QG5C-4, end-to-end through
`ApiFactory` with real `FakeKubeApiServer`s (no Application substitutes except where noted). QG5C-2 (Playwright) is
covered by the FE fleet task.

## Scope
- In: Api acceptance tests, extension of the token-leak sweep, performance smoke; bug tasks for failures.
- Out: production code changes (file a bug task instead).

## Contract / design notes
Contract `docs/specs/CP5-api-contract.md` §2–§3; ADR-0041. Matrix (QG5C-1):
1. Granted-only: user with direct grant on A, group grant on B, none on C, C disabled-but-granted D → lines exactly A, B.
2. RO credential: user whose winning grant is RO → the fake records the **RO** token on its requests; RW user on the
   same cluster → RW token (different fake token values).
3. Cache isolation: users U1 (credential X) and U2 (credential Y) on one cluster; U1 calls, fake changes node data,
   U2 calls → U2 sees new data (no reuse of X's entry); U1 again within 30 s → cached (`checkedAt` unchanged, no new
   upstream request). Two users sharing credential X → one upstream probe.
4. Partial failure: one fake delayed beyond `Fleet:ClusterTimeout` (set 1 s) → `timeout`; one closed port →
   `unreachable`; one 401 → `tokenInvalid`; the others full facts; HTTP 200 throughout.
5. Concurrency: `Fleet:MaxClusterConcurrency=3`, 12 delayed fakes, in-flight counter on the fakes ≤ 3.
6. Invalidation: rotate the credential (admin API) → next call probes again.
7. Token-leak sweep: add the fleet endpoint (and a probe failure log) to the existing sweep
   (`TokenLeakScanner.AssertAbsent` over response body, captured logs, activities).
QG5C-4 smoke: 40 fakes (5 delayed 4 s, 2 unreachable, rest instant), default options → first line < 1 s, stream
complete < 6 s, in-flight ≤ 10; mark `[Trait("Category","Performance")]` if it is too slow for every run (state the
decision in the work log).

## Context pack
- `tests/FleetConsole.Api.Tests/Integration/Fleet/` (T-0323's tests — reuse their NDJSON reading helper).
- `tests/FleetConsole.Api.Tests/Integration/Proxy/ProxyTokenLeakSweepTests.cs` (L38, sweep pattern).
- `ApiFactory.LoginAsAsync` (L237), `ConfigureTestServices` (L356); `TestData.UserAsync` (L44), `GrantAsync` (L163),
  `ProxyClusterAsync` (L193); `FakeKubeApiServer` `Delay` (L223), `MapVersion` (L240), Table helpers (T-0322).

## Acceptance criteria
- [x] Matrix rows 1–7 automated and green; QG5C-4 measured with numbers in the work log.
- [x] Each FBE-1..7 item mapped to a test or an explicit note in the Handover notes.
- [x] Failures filed as bug tasks (none found); `scripts/check-be.sh` green.

## Work log
- 2026-11-25 qa-engineer: added `FleetStatusAcceptanceTests` (rows 1–6 + client-abort cancels upstream probe, variant
  ClusterTimeout 1 s / MaxClusterConcurrency 3, `InFlightGauge` helper), `FleetStatusPerformanceTests` (QG5C-4),
  `FleetStatusLimiterTests.CompletedStream_FreesItsSlot`, sweep `NoToken_InFleetStatusLines_ProbeLogs_Activities_OrDatabase`.
- QG5C-4 measured (2 runs): first line 54/63 ms, complete 4058/4069 ms, max in-flight clusters 7 (≤ 10). Kept in the
  normal gate (no Performance trait): ~10 s incl. seeding 38 fakes, deterministic margins (1 s / 6 s budgets).
- 2026-11-25 re-run after the usage-limit break: the editor's CS0103 `FleetStatusEndpointTests` was a stale IDE
  diagnostic (same namespace, `internal StatusUri`). `scripts/check-be.sh` passed: build ok, 431 + 882 + 1046 tests, 0 failed.

## Review

## Handover notes
Traceability (all `tests/FleetConsole.Api.Tests/...` unless Application.Tests is named):
- FBE-1 lines per granted cluster + typed failures, 200 on partial failure: Acceptance `Lines_are_exactly_…`,
  `Timeout_unreachable_and_rejected_token_…`; Endpoint `TwoClusters_…`; sweep (tlsError, upstreamError).
- FBE-2 winning grant token, proxy pool/TLS, one access resolve: Acceptance `Each_user_is_probed_with_their_own_…`;
  sweep (wrong CA → tlsError); Application `GetFleetStatusHandlerTests.Access_is_resolved_once_per_query_…`.
- FBE-3 fan-out bound, budget, abort, pod limiter: Acceptance `Never_more_than_MaxClusterConcurrency_…`, `Timeout_…`,
  `Client_abort_cancels_the_upstream_probe`; Limiter tests (503 Fleet.Busy, aborted + completed free slot); Perf test.
- FBE-4 cache per (cluster, credential), shared per credential, rotation invalidates, checkedAt: Acceptance
  `Cache_entries_are_per_credential_…`, `Rotating_the_credential_…`; Application `ClusterHealthProbeTests.Miss_…`.
- FBE-5 progressive NDJSON (ADR-0041): Endpoint `FirstLine_IsReadable_BeforeASlowClusterFinishes`; Perf first line.
- FBE-6 no token/upstream text in lines, logs, activities, DB; log+metric per probe: sweep `NoToken_InFleetStatus…`
  (upstream 403/500/401 bodies echo the token); Application `ClusterHealthProbeTests.EachLoad_RecordsOneMeasurement_…`.
  Not persisted/no poller: by construction (no table, no hosted service) — not separately tested.
- FBE-7 any active user; deactivated 401; disabled excluded: Endpoint `Anonymous_Is401`, `DeactivatedUser_Is401`;
  Acceptance `Lines_are_exactly_…` (disabled D, ungranted C).
- Defects: none. Risk (no bug): fleet probe facts for a credential are cached across all its users by design
  (SECURITY.md); gauge under-counts instant probes, so the perf in-flight figure is a lower bound, row 5 asserts == 3.
