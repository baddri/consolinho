---
id: T-0363
title: e2e QGC-1/OAPI-3 YAML tab completion shows "No suggestions" (CP4c regression?)
status: todo
owner: frontend-engineer
checkpoint: 5a
depends_on: []
paths: [web/e2e/workloads.e2e.ts, web/src/shared/yaml]
review_rounds: 0
---

## Goal
T-0311 (2026-11-25): `workloads.e2e.ts` "QGC-1/OAPI-3: the YAML tab hovers a field description, completes spec children
and flags a wrong type" fails even when run alone, with completion showing "No suggestions". It passed at cp-4c (T-0223,
T-0239 fixed the monaco-yaml worker). Find the cause: a product regression (schema not loaded, worker, a CP5 change)
or a test/fake issue. Fix it at the root and add a guard if a unit test can catch it.

## Acceptance criteria
- [ ] The root cause is recorded in the Work log.
- [ ] QGC-1/OAPI-3 passes 2 runs in a row. The rest of `workloads.e2e.ts` stays green.

## Work log

## Review

## Handover notes
