---
id: T-0365
title: Fleet overview shows an error for a user with no clusters (empty 200 from /api/fleet/status)
status: todo
owner: frontend-engineer
checkpoint: 5c
depends_on: [T-0361]
paths: [web/src/features/fleet/api/fleetStatus.ts, web/src/features/fleet/api/fleetStatus.test.ts]
review_rounds: 0
---

## Goal
Found in T-0362. A user with no granted clusters opens Fleet overview and sees "Could not check the clusters… could
not be read". The Api answers `GET /api/fleet/status` with 200 and an empty body. `fetchFleetStatus` calls `unwrap`,
which throws "Empty response" when `data === undefined`, so the `if (!body) return;` guard never runs.

## Scope
- In: `fetchFleetStatus` treats a 200 with no body as zero clusters. It must not call `unwrap` on that path; reuse
  `fromErrorResponse`/`fromRejection` semantics for non-2xx. Add a unit test for the empty 200 (MSW). Fleet overview
  then shows its empty state.
- Out: Api changes.

## Acceptance criteria
1. Empty 200 → the generator yields nothing and doesn't throw; the overview shows its empty state with no danger alert.
2. Non-2xx still throws an `ApiError` (existing tests stay green).
3. `scripts/check-fe.sh src/features/fleet` passes.

## Work log
