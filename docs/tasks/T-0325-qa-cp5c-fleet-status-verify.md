---
id: T-0325
title: QA — verify FBE / QG5C-1 and QG5C-4 for GET /api/fleet/status (isolation, bounds, leak sweep, performance smoke)
status: todo
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
- [ ] Matrix rows 1–7 automated and green; QG5C-4 measured with numbers in the work log.
- [ ] Each FBE-1..7 item mapped to a test or an explicit note in the Handover notes.
- [ ] Failures filed as bug tasks; `scripts/check-be.sh` green.

## Work log

## Review

## Handover notes
