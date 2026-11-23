---
id: T-0199
title: CP4a follow-ups — shared TogglePlay, xterm import boundary
status: done
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
- [x] One `TogglePlay` in `shared/ui`, used by Events and Pod logs; existing Events/logs tests pass.
- [x] Lint rejects `@xterm/*` imports outside `shared/ui/terminal`.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23 frontend-engineer: `shared/ui/TogglePlay` (+ module CSS = OCP `_toggle-play.scss`, + test) replaces both copies;
  logs keeps its `justify-content: center; margin-right: 0` as a `className` override. ESLint `no-restricted-imports`
  `@xterm/*` with an override for `src/shared/ui/terminal/**`; a scratch import in `features/` failed lint, then removed.
  Gate green (one unrelated BulkGrantWizard timeout under load; passes alone).

## Review
- 2026-11-23 frontend-architect, round 1: **APPROVE**. One `shared/ui/TogglePlay` with TSDoc and a test; both callers
  use it, and the labels and icons are unchanged. The CSS cascade is unchanged: Events `.timelineButton` (0,1,0) still
  loses `margin-right` to the shared rule (0,2,0), as it did before, and the logs override (0,3,0) wins regardless of
  load order. Removing the CSS outside `paths` is justified (it would be dead code). The `@xterm/*` rule fires on a
  scratch `features/` import, the `shared/ui/terminal/**` files lint clean, and no `@xterm` import or mock exists
  elsewhere. Gate: lint, typecheck and build ok. The tests had 2 failures under load (AuditLogPage timeout, PodLogsTab
  LOG-2 height), and both files pass alone.
**ux-designer (visual, TogglePlay): APPROVE**
- Shared `TogglePlay.module.css` matches OCP `public/components/_toggle-play.scss` rule for rule (37px circle, extra-strong border, 50% radius, margin-right 15px, padding 0, success ring when active).
- Computed styles measured on 5243 (worktree) and 5244 (cp/4-workloads), 1280 wide, light and dark, on pod Events, namespace Events and pod Logs: no differences at all (size, margin, border, colour, bg, transform, flex alignment, icon offset 11.5/10.8, position).
- Events keeps `0 15px 0 -2px` margin and the `translate(-50%,-100%)` timeline offset. Logs keeps centred icon, margin 0, `display:flex`.

## Handover notes
- `TogglePlay` (`web/src/shared/ui/TogglePlay.tsx`) takes an optional `className` for placement (Events: `timelineButton`; logs:
  `PodLogsTab.module.css .togglePlay`, which uses `.pf-v6-c-button.pf-m-plain` to outrank the shared rule regardless of CSS order).
- Toggle CSS was removed from `EventStream.module.css` and `PodLogsTab.module.css` (outside `paths`, but it would have been dead code).
- The style probe was not run: it is pinned to :5199, which this task was told not to use. Computed values are unchanged
  (the same declarations, just moved), so a probe of Events and Pod logs at review is enough.
