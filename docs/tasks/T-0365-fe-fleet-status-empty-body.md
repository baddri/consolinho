---
id: T-0365
title: Fleet overview shows an error for a user with no clusters (empty 200 from /api/fleet/status)
status: done
owner: frontend-engineer
checkpoint: 5c
depends_on: [T-0361]
paths: [web/src/features/fleet/api/fleetStatus.ts, web/src/features/fleet/api/useFleetStatus.test.tsx]
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
1. [x] Empty 200 → the generator yields nothing and doesn't throw; the overview shows its empty state with no danger alert.
2. [x] Non-2xx still throws an `ApiError` (existing tests stay green).
3. [x] `scripts/check-fe.sh src/features/fleet` passes.

## Work log
- 2026-11-25 frontend-engineer: `fetchFleetStatus` no longer uses `unwrap`; it maps rejections via `apiErrorFromRejection`,
  non-2xx via `apiErrorFromProblemBody`, and returns early on a 2xx without body. Tests added to the existing
  `useFleetStatus.test.tsx` (null body + `Content-Length: 0`); 503 test still green. `check-fe.sh src/features/fleet
  src/shared/api` passes. `fleetStatus.test.ts` not created (existing file was the better home).

## Review
- Round 1 (frontend-architect, 2026-11-25): **APPROVE**. `fetchFleetStatus` follows `unwrap` step for step (rejection
  mapping, non-2xx → `apiErrorFromProblemBody`, which keeps `Fleet.Busy`), minus the empty-2xx rejection. The TSDoc says why.
  The `it.each` (no body, zero-length body) in `useFleetStatus.test.tsx` is the right place. Targeted test is green (7/7).
  Note: the task file had no Review section; I added it after the Work log.
