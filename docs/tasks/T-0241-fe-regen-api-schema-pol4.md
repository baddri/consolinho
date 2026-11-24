---
id: T-0241
title: Re-run gen:api against a running Api to confirm the hand-edited POL-4 schema
status: todo
owner: frontend-engineer
checkpoint: 4.5
depends_on: []
paths: [web/src/shared/api/]
review_rounds: 0
---

## Goal
T-0221 hand-edited the generated admin API types for the structured admin source (POL-4, BE T-0232), because no Api
was running. CLAUDE.md says admin API types are *generated* from the backend OpenAPI document. Regenerate them so that
the checked-in file matches what the backend actually serves.

## Scope
- In: `aspire start` (or Api alone, Development) → `cd web && npm run gen:api`. Commit only the regenerated output and
  fix any fallout in types or tests.
- Out: API changes.

## Acceptance criteria
- [ ] `npm run gen:api` was run against the running Api; the diff is empty or descriptions only (if it is more, explain it in the Work log).
- [ ] `scripts/check-fe.sh` green.

## Work log

## Review

## Handover notes
