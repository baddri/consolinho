---
id: T-0050
title: Connection tests — read grant mode counts via IGrantRepository; document TestCredential 409
status: todo
owner: backend-engineer
checkpoint: 1
depends_on: [T-0019, T-0020]
paths: [src/FleetConsole.Application/Credentials/ConnectionTesting/, src/FleetConsole.Application/Credentials/TestCredential/, src/FleetConsole.Application/Credentials/TestToken/, src/FleetConsole.Application/Abstractions/Persistence/, src/FleetConsole.Infrastructure/Persistence/, tests/, docs/specs/CP1-api-contract.md, docs/adr/0011-*.md]
review_rounds: 0
---

## Goal
From T-0020 review: the TestCredential/TestToken command handlers read grant counts through `IReadModel`. Move this to
`IGrantRepository.CountByModeAsync(CredentialId, ct)` so `GrantModeCounts` stays a plain value record. Also: contract §8.4
should list 409 `Concurrency.Conflict` for TestCredential (recording a test bumps the credential version if a rotation
commits concurrently), and ADR-0011 should record the four step rules T-0020 chose where it was silent (/version 401/403 →
warning; SelfSubjectReview 403 like 404; identity from JWT `sub` passes; failed namespace-rules review → capabilities warning).

## Acceptance criteria
- [ ] `IGrantRepository.CountByModeAsync` (single SQL statement); handlers use it; no `IReadModel` in these command handlers.
- [ ] Unit test for the SelfSubjectReview-403 branch.
- [ ] Contract §8.4 + ADR-0011 amended (orchestrator-amendment style, dated).
- [ ] `scripts/check-be.sh` green.

## Work log

## Handover notes
