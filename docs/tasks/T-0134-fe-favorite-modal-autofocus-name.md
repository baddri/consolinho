---
id: T-0134
title: Add-to-favorites modal focuses the Name field on open, as OCP
status: todo
owner: frontend-engineer
checkpoint: 6
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

## Acceptance criteria
- [ ] Name input has focus when the modal opens (RTL test); Escape returns focus to the star (already works).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-22 qa-engineer: filed from CP3.6 verify.

## Review

## Handover notes
