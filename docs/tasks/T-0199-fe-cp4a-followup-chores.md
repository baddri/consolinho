---
id: T-0199
title: CP4a follow-ups — shared TogglePlay, xterm import boundary
status: todo
owner: frontend-engineer
checkpoint: 4b
depends_on: []
paths: [web/src/shared/ui/TogglePlay.tsx, web/src/shared/ui/index.ts, web/src/features/resources/events/EventStreamView.tsx, web/src/features/resources/workloads/logs/LogToolbar.tsx, web/eslint.config.js]
review_rounds: 0
---

## Goal
Two §4a.9 follow-ups that need no CP4b code: deduplicate `TogglePlay` and enforce that only `shared/ui/terminal`
imports `@xterm/*`. Can run in parallel with T-0189.

## Contract / design notes
- `shared/ui/TogglePlay.tsx` — the PF play/pause toggle copied by T-0179: move the events version
  (`features/resources/events/EventStreamView.tsx` L14-15) to `shared/ui`, export from `shared/ui/index.ts`, use it in both
  places (the logs copy is `workloads/logs/LogToolbar.tsx:TogglePlay` L64-65); TSDoc; a small test (aria-label switches, `onClick`).
- ESLint: `no-restricted-imports` pattern `@xterm/*` with message "Use shared/ui/terminal (ADR on terminal)"; an
  override re-allows it for `src/shared/ui/terminal/**`. Verify `npm run lint` fails on a scratch import, then remove it.

## Context pack
- Touch points: `resources/events/EventStreamView.tsx` L14-15, `workloads/logs/LogToolbar.tsx` L64-65, `web/eslint.config.js`
  (existing `no-restricted-imports`/`no-restricted-syntax` blocks), `shared/ui/terminal/`.

## Acceptance criteria
- [ ] One `TogglePlay` in `shared/ui`, used by Events and Pod logs; existing Events/logs tests pass.
- [ ] Lint rejects `@xterm/*` imports outside `shared/ui/terminal`.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
