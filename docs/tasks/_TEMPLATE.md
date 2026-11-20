---
id: T-0000
title: Short imperative title
status: todo            # todo | in_progress | in_review | done | blocked
owner: backend-engineer # backend-engineer | frontend-engineer | qa-engineer | ...
checkpoint: 0
depends_on: []          # [T-0001, ...]
paths: [src/...]        # directories this task may touch
review_rounds: 0
---

## Goal
One paragraph: what and why.

## Scope
- In: ...
- Out: ...

## Contract / design notes
Routes, types, interfaces, ADR links. Enough that the engineer doesn't have to guess.

## Context pack
<!-- architect: what to read and copy — keeps the engineer from reading whole docs/codebase -->
- Docs: `BACKEND.md` § <heading>, ADR-00xx
- Exemplars: `src/.../SomeUseCase/` (pattern to copy)

## Acceptance criteria
- [ ] ...
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
<!-- engineer/QA/reviewer append dated entries, ≤ 5 lines each: what was done, check results -->

## Review
<!-- architect: APPROVE / CHANGES_REQUESTED + findings (file:line — issue — fix) -->

## Handover notes
<!-- ≤ 15 lines: what is left, gotchas, where to look next -->
