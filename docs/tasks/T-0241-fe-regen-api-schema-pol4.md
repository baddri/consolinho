---
id: T-0241
title: Regenerate admin API types with gen:api — replaces the POL-4 and CP4.5a hand edits (EFF-6)
status: done
owner: frontend-engineer
checkpoint: 4.5a
depends_on: [T-0260, T-0252, T-0256, T-0257]   # folded into the CP4.5a FE lane: runs once the BE serves the new shapes
paths: [web/src/shared/api/, web/src/mocks/, web/src/features/admin/]
review_rounds: 0
---

## Goal
T-0221 hand-edited the generated admin API types for the structured admin source (POL-4, BE T-0232), because no Api
was running. CLAUDE.md says admin API types are *generated* from the backend OpenAPI document. Regenerate them so that
the checked-in file matches what the backend actually serves.

## Scope
- In: `aspire start` (or Api alone, Development) → `cd web && npm run gen:api`. Commit only the regenerated output and
  fix any fallout in types or tests.
- In (CP4.5a, EFF-6): the same run replaces the CP4.5a shapes T-0260 hand-wrote (marker comment
  `HAND-EDITED CP4.5a (T-0260)` must be gone). Any difference between the contract-based hand edit and the real
  OpenAPI document is fixed in the FE (types, mocks, call sites), never by editing `schema.gen.ts`.
- Out: API changes (a contract mismatch that needs a BE change → file a BE task and note it here).

## Acceptance criteria
- [x] `npm run gen:api` was run against the running Api; `schema.gen.ts` is pure generator output (no hand-edit marker).
- [x] Every diff beyond descriptions is listed in the Work log with the FE fix (POL-4 and CP4.5a shapes).
- [x] `scripts/check-fe.sh` green.

## Work log
- 2026-11-24 frontend-engineer: `npm run gen:api` against the Api (aspire, http profile); marker gone, file is pure generator output.
  Normalized diff (comments stripped, blocks compared as sets): POL-4 shapes identical; CP4.5a paths/ops identical (order only).
  Only drift: schema `AccessCandidateOutcome` is served as `CandidateOutcome` (same union) → `types.ts` alias
  `AccessCandidateOutcome` now points at `schemas['CandidateOutcome']`; call sites/mocks unchanged. No BE mismatch.
  `scripts/check-fe.sh` green (124 files, 1303 tests).

## Review

## Handover notes
- Changed: `web/src/shared/api/schema.gen.ts` (regenerated), `web/src/shared/api/types.ts` (one alias target).
- All other `types.ts` aliases resolve against generated names (typecheck green). No BE task needed.

## Follow-ups from T-0260 review
- After regenerating, check the generated schema names against the aliases in `web/src/shared/api/types.ts`; drop the hand-written marker in `schema.gen.ts`.
