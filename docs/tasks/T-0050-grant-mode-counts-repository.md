---
id: T-0050
title: Connection tests — read grant mode counts via IGrantRepository; document TestCredential 409
status: done
owner: backend-engineer
checkpoint: 1
depends_on: [T-0019, T-0020]
paths: [src/FleetConsole.Application/Credentials/ConnectionTesting/, src/FleetConsole.Application/Credentials/TestCredential/, src/FleetConsole.Application/Credentials/TestToken/, src/FleetConsole.Application/Abstractions/Persistence/, src/FleetConsole.Infrastructure/Persistence/, tests/, docs/specs/CP1-api-contract.md, docs/adr/0011-*.md]
review_rounds: 2
---

## Goal
From T-0020 review: the TestCredential/TestToken command handlers read grant counts through `IReadModel`. Move this to
`IGrantRepository.CountByModeAsync(CredentialId, ct)` so `GrantModeCounts` stays a plain value record. Also: contract §8.4
should list 409 `Concurrency.Conflict` for TestCredential (recording a test bumps the credential version if a rotation
commits concurrently), and ADR-0011 should record the four step rules T-0020 chose where it was silent (/version 401/403 →
warning; SelfSubjectReview 403 like 404; identity from JWT `sub` passes; failed namespace-rules review → capabilities warning).

## Acceptance criteria
- [x] `IGrantRepository.CountByModeAsync` (single SQL statement); handlers use it; no `IReadModel` in these command handlers.
- [x] Unit test for the SelfSubjectReview-403 branch.
- [x] Contract §8.4 + ADR-0011 amended (orchestrator-amendment style, dated).
- [x] `scripts/check-be.sh` green.

## Work log
- 2026-11-20 backend-engineer: added `IGrantRepository.CountByModeAsync` (one GROUP BY access_mode query, no tracking);
  TestCredential/TestToken handlers use it, `IReadModel` dropped; `GrantModeCounts` is now a plain record. Tests: handler
  fakes switched to substituted repo (+2 tests), SelfSubjectReview-403 tester test, repo integration assert. Contract §8.4
  and ADR-0011 amended inline (dated). `scripts/check-be.sh` green (323/402/604).
- 2026-11-20 backend-engineer (review round 1): moved `GrantModeCounts` to `Abstractions/Persistence` (port value type next
  to its port; doc kept), dropped the `ConnectionTesting` usings, added the `Abstractions.Persistence` using in
  `ConnectionTester`/its tests; handler test now asserts the exact ReadWrite hint. `scripts/check-be.sh` green.

## Handover notes
- `GrantModeCounts` lives next to its port in `Application/Abstractions/Persistence` (like `Kubernetes/ProbeResults.cs`);
  no Domain change. Signature: `Task<GrantModeCounts> CountByModeAsync(CredentialId, CancellationToken)`.
- Handler ctor param renamed `readModel` → `grantRepository` (both handlers resolve via DI; no registration change).
- Integration coverage: `RepositoryAndReadModelTests.CredentialAndGrantFacts_*` now has one ReadOnly + one ReadWrite grant.
- No public API shape change; OpenAPI tests green, no schema regen needed. Contract 409 note is docs-only (behaviour existed).

## Review
**Round 1 — CHANGES_REQUESTED** (backend-architect, 2026-11-20). Build -warnaserror clean; ConnectionTesting (32) + RepositoryAndReadModel/ConnectionTest integration (15) green. Single grouped untracked query, handlers free of `IReadModel`, contract §8.4 and ADR-0011 amendments dated and match `ConnectionTester` (L179, L201, L231, L305).
1. src/FleetConsole.Application/Abstractions/Persistence/IGrantRepository.cs:1 — the port now depends on a feature namespace (`Credentials.ConnectionTesting`), making it the only `Abstractions` → feature edge and a namespace cycle (the feature already uses `Abstractions`). The existing pattern keeps port value types next to the port (`Abstractions/Kubernetes/ProbeResults.cs`) — required: move `GrantModeCounts.cs` to `Application/Abstractions/Persistence/` (namespace `FleetConsole.Application.Abstractions.Persistence`), keep its XML doc including the `null` = "no credential known" note, and drop the `using …ConnectionTesting` lines it no longer needs (IGrantRepository, GrantRepository, RepositoryAndReadModelTests).
2. (nit, optional) tests/FleetConsole.Application.Tests/Credentials/ConnectionTesting/ConnectionTestHandlerTests.cs:71 — `Hints.ShouldNotBeEmpty()` is weak; you could assert that the ReadWrite-grant hint is the one present.

**Round 2 — APPROVE** (backend-architect, 2026-11-20). `GrantModeCounts` moved to `Abstractions/Persistence` (doc kept, old file deleted, no `ConnectionTesting` using left in the port, repository or repo test); hints assertion now exact. Build -warnaserror clean; ConnectionTesting tests 32/32 green. No findings.
