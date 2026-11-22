---
id: T-0153
title: Keyboard navigation from the switcher search into its menu items
status: todo
owner: frontend-engineer   # frontend-architect designs it first (Contract section) against PF Menu + OCP
checkpoint: 3.7
depends_on: [T-0145]
paths: [web/src/features/cluster-context/]
review_rounds: 0
---

## Goal
From the T-0145 reviews. When the switcher menu opens, focus is in the search box. ArrowDown does nothing, and Tab leaves
the menu, so keyboard users can't reach "Fleet management" or any cluster except by typing and pressing Enter. In
T-0145 round 1 the engineer built a hand-rolled typeahead (`useTypeaheadFocus`). It was removed in round 3, because no
AC or design covered it and it duplicated the row order by hand. This task does it properly. It must be done before
CP3.7 VERIFY, because it is the keyboard route to the fleet perspective.

## Contract / design notes (frontend-architect fills in before build)
- Check what PF6 `Menu`/`MenuSearch` and the PF typeahead `Select` example provide (`focusedItemIndex`, `isFocused`,
  `onKeyDown`), and how OCP's cluster/perspective switcher handles the keyboard. Prefer PF's built-in behaviour.
- The focus order must come from the same model that renders the rows (one source), not a parallel list.
- A11y, from the UX round 2: if the input drives the focus, it needs `role="combobox"`, `aria-expanded`,
  `aria-controls` → the listbox id, `aria-autocomplete="list"`, and `aria-activedescendant`.

## Acceptance criteria
- [ ] From the search box, the keyboard reaches every row (Fleet management first), and Enter or Space selects the
      focused row; Escape closes the menu and returns focus to the toggle.
- [ ] Screen readers announce the focused row (verified via accessibility attributes in the probe).
- [ ] Unit tests cover arrow movement, wrap or stop at the ends (as the design decides), and Enter.
- [ ] `scripts/check-fe.sh` passes; frontend-architect and ux-designer approve.

## Work log

## Handover notes
