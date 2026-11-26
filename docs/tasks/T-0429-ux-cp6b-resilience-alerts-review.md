---
id: T-0429
title: UX review — discovery warning and new-version alert match OCP copy/style
status: todo
owner: ux-designer
checkpoint: 6b
depends_on: [T-0390, T-0420]
paths: [docs/tasks]
review_rounds: 0
---

## Goal
Spec CP6 **QG6B-2** (size **S**): check the DR nav warning and the CL alert against the UX notes (§5) and OCP's inline
alerts; file fix tasks for gaps.

## Contract / design notes
- DR: PF `Alert` warning `isInline isPlain`, one line at the top of the nav, light + dark, collapsed and expanded nav;
  last-good kinds stay clickable. CL: page-level inline warning with "Reload" action link, no modal.
- Use `scripts/ui-probe.mjs` (T-0138) for spacing/colour first; screenshots clipped to the element only.
- Reproduce in mock mode: DR via an MSW override of `/apis` → 503 (`?mockUser=admin`); CL via a dev-only failing import
  is not available — review CL from the e2e trace of T-0426 or the RTL render.

## Context pack
- `docs/architecture/UX.md` (alerts, spacing); OCP inline alert exemplar:
  `/home/bad/works/openshift-console/frontend/public/components/utils/` (grep `isInline` + `variant="warning"`).

## Acceptance criteria
- [ ] Verdict written here; any gap filed as a task.

## Work log

## Review

## Handover notes
