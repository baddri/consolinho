---
id: T-0423
title: Fix serious and critical axe findings (light and dark)
status: todo
owner: frontend-engineer
checkpoint: 6b
depends_on: [T-0422]
paths: [web/src, web/e2e/a11y.e2e.ts]
review_rounds: 0
---

## Goal
Zero serious/critical axe violations on the A11Y-1 pages in both themes. Spec CP6 **A11Y-1, A11Y-4** (size **TBD by
T-0422**: if the list touches more than ~3 screens or more than one shared component, the architect splits it into
T-0431+ siblings before work starts — SDLC "Task size").

## Scope
- In: the findings T-0422 lists here; fixes in shared components first (one fix, many pages).
- Out: moderate/minor findings (backlog tasks), visual changes beyond what a fix needs (OCP look stays; no theme rebuild).

## Contract / design notes
- Prefer PF props (`aria-label`, `headingLevel`, `isPlain`) over custom markup; colour-contrast fixes use PF tokens
  (`--pf-t--global--*`), never hex. Prod colouring fixes stay in its existing module CSS.
- Remove the matching `test.fail()` markers in `a11y.e2e.ts` as each finding is fixed.
- Findings (filled by T-0422): _pending_.

## Context pack
- Docs: `docs/architecture/UX.md` (tokens), `FRONTEND.md` § UI conventions.
- Report: `web/e2e/.results/a11y-report.md` (regenerate with `scripts/check-e2e.sh a11y.e2e.ts`).

## Acceptance criteria
- [ ] No `test.fail()` left in `a11y.e2e.ts`; zero serious/critical in the report, light and dark.
- [ ] Unit tests updated for changed components. `scripts/check-fe.sh` and `scripts/check-e2e.sh a11y.e2e.ts` green.

## Work log

## Review

## Handover notes
