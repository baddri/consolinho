---
id: T-0362
title: Switcher e2e H4/H5 expect the old `/fleet` target; update them for the CP5c fleet overview
status: todo
owner: frontend-engineer
checkpoint: 5c
depends_on: [T-0361]
paths: [web/e2e]
review_rounds: 0
---

## Goal
T-0311 found that the switcher e2e scenarios H4/H5 fail since CP5c: `/fleet` and the switcher's "Fleet management"
entry now go to `/fleet/overview` (T-0342/T-0343, UX.md §2). Update the scenarios (and their fakes, if they need the fleet
status stream) to the new, approved behaviour. Don't change the product.

## Acceptance criteria
- [ ] H4/H5 pass and assert the fleet overview target (2 runs in a row).
- [ ] The other e2e specs are unchanged.

## Work log

## Review

## Handover notes
