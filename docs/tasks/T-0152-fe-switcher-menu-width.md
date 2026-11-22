---
id: T-0152
title: Keep the cluster switcher menu within the sidebar width while searching
status: todo
owner: frontend-engineer
checkpoint: 3.7
depends_on: [T-0147]
paths: [web/src/features/cluster-context/]
review_rounds: 0
---

## Goal
Found in the T-0145 UX review. When search text is typed, the switcher menu grows to 299px, wider than the 256px
toggle, and spills past the sidebar edge. OCP's perspective/cluster menu keeps the toggle width. Pin the menu width to
the toggle width (PF `Menu`/`Select` width prop or `popperProps`) and let long names truncate with a tooltip.

## Scope
- In: switcher menu width while searching and with long cluster names; a unit test where it can be asserted.
- Out: switcher content (T-0147).

## Acceptance criteria
- [ ] With search text and with a 60-character display name, the menu is no wider than the toggle (probe measurement).
- [ ] Long names truncate; the full name is shown in a tooltip and the accessible name.
- [ ] `scripts/check-fe.sh` passes; the ux-designer approves.

## Work log

## Handover notes
