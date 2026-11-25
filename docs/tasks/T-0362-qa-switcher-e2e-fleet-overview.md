---
id: T-0362
title: Switcher e2e H4/H5 expect the old `/fleet` target; update them for the CP5c fleet overview
status: done
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
- [x] H4/H5 pass and assert the fleet overview target (2 runs in a row).
- [x] The other e2e specs are unchanged.

## Work log
- 2026-11-25 frontend-engineer: `web/e2e/switcher.e2e.ts` only. H4: grantless toggle reads "Select a cluster" and opens
  with "Fleet management" + "No clusters" (FLT-1). H5: `/fleet` → `/fleet/overview` (h1, Fleet + Fleet administration
  sections); alice reaches the overview from the switcher entry, sees her cluster's row, no Fleet administration.
  No fake changes needed (T-0341's cluster health fake serves the stream). Spec 3/3 twice on a fresh `aspire start`.

## Review
- Round 1 (frontend-architect, 2026-11-25): **APPROVE**. H4 now asserts "Select a cluster" opens with Fleet management +
  "No clusters". H5 asserts `/fleet` → `/fleet/overview`, the Fleet section, admin-only Fleet administration and alice's switcher path with
  her stream row. The doc comments match the tests. E2E not re-run (engineer ran it green twice).

## Handover notes
- H5 renamed "users switch to the fleet perspective" (alice now has the entry, FLT-1).
- Found, not fixed (out of paths): a user with no clusters gets "Could not check the clusters / response could not be
  read" on Fleet overview. `fetchFleetStatus` calls `unwrap`, which throws "Empty response" on the Api's empty 200
  before its `if (!body) return` runs. Needs a bug task. H5 doesn't assert on the alert.
- Run e2e outside the agent sandbox (localhost blocked); a parallel e2e run on the same stack deletes `e2e-smoke-*`.
