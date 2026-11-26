---
id: T-0128
title: A11y follow-ups from CP3.6 — favourites button outside the nav link, label-filter suggestions keyboard support
status: todo
owner: frontend-engineer
checkpoint: 6b
depends_on: []
paths: [web/src/features/preferences/favorites, web/src/shared/ui/data-view]
review_rounds: 0
---

## Goal
`FavoritesNavSection.tsx` nests the remove-favourite button inside the nav link, as OCP does (`FavoriteNavItems.tsx`).
That is invalid HTML (interactive inside interactive) and confusing for screen readers. Keep OCP's look (button on
the right of the item, shown on hover/focus) but make the button a sibling of the link.

Also (T-0121 review): the label-filter suggestion panel (`web/src/shared/ui/data-view/DataViewLabelFilter.tsx` ~L104)
has no arrow-key / listbox semantics; add them (PF `Menu`/`Popper` pattern as in OCP `AutocompleteInput`).

## Contract / design notes
Spec CP6 **A11Y-2** (size **S/M**, one shared component + one nav section).
- Favourites: `NavItem` children become `<Flex>` with the `Link` and the remove `Button` as **siblings** (button outside
  the `<a>`); keep classes/CSS so the look (button right, shown on hover/focus) is identical. If PF `NavItem` only
  wraps its child in the `<a>`-styled slot, use `NavItem` `component`/custom children per the PF 6 Nav docs; no DOM queries.
- Label filter: keep OCP's look (purple outline `Label`s in a panel). Add the ARIA combobox pattern: input gets
  `role="combobox" aria-expanded aria-controls aria-activedescendant aria-autocomplete="list"` (extend
  `FilterTextInputProps` with these), panel `role="listbox"`, each item `role="option" aria-selected id`;
  `activeIndex` state; ArrowDown/ArrowUp move (wrap), Enter applies the active option (else the typed text, as now),
  Escape closes. Reset `activeIndex` when suggestions change.

## Context pack
- Touch points: `web/src/features/preferences/favorites/FavoritesNavSection.tsx:FavoriteNavItem` (L7-44; Link L18,
  Button L29) + `FavoritesNavSection.module.css`; `web/src/shared/ui/data-view/DataViewLabelFilter.tsx:DataViewLabelFilter`
  (`onKeyDown` ~L76, suggestions panel ~L112-120); `web/src/shared/ui/data-view/FilterTextInput.tsx:FilterTextInputProps` (L6-).
- OCP reference: `/home/bad/works/openshift-console/frontend/packages/console-app/src/components/favorite/FavoriteNavItem.tsx`,
  `FavoriteNavItems.tsx`; `packages/console-app/src/components/data-view/DataViewLabelFilter.tsx`.

## Acceptance criteria
- [ ] Label suggestions: arrow keys move, Enter picks, Escape closes; role=listbox/option.
- [ ] Button is not a descendant of the `<a>`; keyboard: Tab reaches link then button; looks identical to OCP.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-26 frontend-architect: scheduled into CP6b (A11Y-2), design notes + context pack added.

## Review

## Handover notes
