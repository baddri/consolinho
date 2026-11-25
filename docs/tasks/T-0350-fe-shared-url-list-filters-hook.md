---
id: T-0350
title: Move the URL list-filters hook to shared/table (admin + fleet)
status: todo
owner: frontend-engineer
checkpoint: 5c
depends_on: [T-0342]
paths: [web/src/shared/table, web/src/shared/ui/data-view, web/src/features/admin, web/src/features/fleet/overview]
review_rounds: 0
---

## Goal
`features/fleet/overview/useFleetFilters.ts` copies `features/admin/useAdminListFilters.ts` (T-0342 Review) because
features can't import each other. Keep one copy, in `shared/table`, so every URL-filtered `ConsoleDataView` list uses it.

## Scope
- In: move `useAdminListFilters` to `web/src/shared/table/useListFilters.ts` as `useListFilters<D extends FilterDefs>(defs)`
  (same behaviour: one `setSearchParams` with replace, values outside the options dropped, unknown filter ids ignored),
  export it from `@/shared/table`, switch the 11 admin call sites and the fleet page to it, delete both old hooks.
- In (T-0342 UX review): rename the shared filter toolbar's clear button from "Clear filters" to OCP's "Clear all filters"
  (`console-app/locales/en/console-app.json:123`, PF `DataViewToolbar clearAllFilters`), and update the tests that match it.
- Out: other behaviour changes, other list pages.

## Contract / design notes
Result: `{ values, onFilterChange(filterId, value: DataViewFilterValue), clearAll, isFiltered }`, the same as `FleetFilters` today.
Move the hook's unit tests (if any) along with it. Don't create a new test file per call site.

## Context pack
- Exemplars: `web/src/features/admin/useAdminListFilters.ts:useAdminListFilters` (copy as is); `web/src/shared/table` `useUrlFilters`.
- Touch points: `grep -rn useAdminListFilters web/src/features/admin`; `web/src/features/fleet/overview/useFleetFilters.ts`, `FleetOverviewPage.tsx`.
- OCP reference: n/a (refactor, no UI change).

## Acceptance criteria
- [ ] One hook in `shared/table`; `useAdminListFilters` and `useFleetFilters` are gone; admin and fleet list tests pass unchanged.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
