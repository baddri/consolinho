---
id: T-0128
title: A11y follow-ups from CP3.6 — favourites button outside the nav link, label-filter suggestions keyboard support
status: todo
owner: frontend-engineer
checkpoint: 6
depends_on: [T-0120]
paths: [web/src/features/preferences/favorites, web/src/shared/ui/data-view]
review_rounds: 0
---

## Goal
`FavoritesNavSection.tsx` nests the remove-favourite button inside the nav link, as OCP does (`FavoriteNavItems.tsx`).
That is invalid HTML (interactive inside interactive) and confusing for screen readers. Keep OCP's look (button on
the right of the item, shown on hover/focus) but make the button a sibling of the link.

Also (T-0121 review): the label-filter suggestion panel (`web/src/shared/ui/data-view/DataViewLabelFilter.tsx` ~L104)
has no arrow-key / listbox semantics; add them (PF `Menu`/`Popper` pattern as in OCP `AutocompleteInput`).

## Acceptance criteria
- [ ] Label suggestions: arrow keys move, Enter picks, Escape closes; role=listbox/option.
- [ ] Button is not a descendant of the `<a>`; keyboard: Tab reaches link then button; looks identical to OCP.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
