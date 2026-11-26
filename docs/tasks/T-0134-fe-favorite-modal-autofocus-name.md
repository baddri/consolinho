---
id: T-0134
title: Add-to-favorites modal focuses the Name field on open, as OCP
status: todo
owner: frontend-engineer
checkpoint: 6b
depends_on: []
paths: [web/src/features/preferences/favorites]
review_rounds: 0
---

## Goal
Minor keyboard/parity issue from CP3.6 verify: opening "Add to favorites" (star, Enter) puts focus on the modal's
Close button; OCP `packages/console-app/src/components/favorite/FavoriteButton.tsx` L156-163 `autoFocus`es the Name
`TextInput`, so a keyboard user can type/confirm at once.

Repro (mock UI, `?mockUser=admin`): `/c/dev-1/k8s/ns/shop/pods`, focus the star, Enter. Expected: focus in Name.
Actual: focus on "Close". Suspected location: `web/src/features/preferences/favorites/AddFavoriteModal.tsx`.

## Contract / design notes
Spec CP6 **A11Y-3** (size **S**). Pass `autoFocus` to the Name `TextField` (it spreads `...inputProps` onto the PF
`TextInput`, `web/src/shared/forms/TextField.tsx` L48). If the PF focus trap still wins, use `Modal`'s
`elementToFocus` (PF 6 `Modal.d.ts` L24) with the input's id; no DOM queries.

## Context pack
- Touch points: `web/src/features/preferences/favorites/AddFavoriteModal.tsx` (`Modal` L65, Name `TextField` L69).
- OCP reference: `/home/bad/works/openshift-console/frontend/packages/console-app/src/components/favorite/FavoriteButton.tsx` L156-163.

## Acceptance criteria
- [ ] Name input has focus when the modal opens (RTL test); Escape returns focus to the star (already works).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-26 frontend-architect: scheduled into CP6b (A11Y-3), design notes added.
- 2026-11-22 qa-engineer: filed from CP3.6 verify.

## Review

## Handover notes
