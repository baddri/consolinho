---
id: T-0128
title: Favorites nav — move the remove-favourite button out of the nav link (a11y)
status: todo
owner: frontend-engineer
checkpoint: 6
depends_on: [T-0120]
paths: [web/src/features/preferences/favorites]
review_rounds: 0
---

## Goal
`FavoritesNavSection.tsx` nests the remove-favourite button inside the nav link, as OCP does (`FavoriteNavItems.tsx`).
That is invalid HTML (interactive inside interactive) and confusing for screen readers. Keep OCP's look (button on
the right of the item, shown on hover/focus) but make the button a sibling of the link.

## Acceptance criteria
- [ ] Button is not a descendant of the `<a>`; keyboard: Tab reaches link then button; looks identical to OCP.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
