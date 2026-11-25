---
id: T-0380
title: Login page shows the mark with the two-line wordmark (brand lockup)
status: todo
owner: frontend-engineer
checkpoint: backlog
depends_on: [T-0372]
paths: [web/src/features/auth, web/src/shared/branding.ts]
review_rounds: 0
---

## Goal
After T-0372 the masthead shows the mark with "Consolinho / Fleet Console", but the Login page still shows only the
bare 24×24 mark (pre-existing). Show the same mark + wordmark lockup on Login (ux-designer T-0372 review, deferred).

## Scope
- In: Login brand area only. Out: masthead, About.

## Contract / design notes
Reuse `PRODUCT_LINE`/product name from `shared/branding.ts` and `useMarkSrc()`; mirror OCP's login brand placement
(grep openshift-console for the login template's brand). Light + dark.

## Acceptance criteria
- [ ] Login shows the mark and the two-line wordmark, centred, legible in light and dark.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
