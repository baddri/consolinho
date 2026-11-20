---
id: T-0026
title: Shared admin list kit — URL-backed filters, filter toolbar, client-side sort, table state rows
status: done
owner: frontend-engineer
checkpoint: 1
depends_on: []
paths: [web/src/shared/table/]
review_rounds: 2
---

## Goal
Five admin list pages (users, clusters, credentials, grants, audit) share the same toolbar/filter/sort/state
behaviour (spec §5, FRONTEND.md "Admin list pages"). Build it once, generic and API-agnostic. **Parallel group F1**
(with T-0022 — disjoint paths, no dependency on new packages).

## Scope
- In: `web/src/shared/table/` with `index.ts`.
- Out: any page.

## Contract / design notes
- ```ts
  type FilterDef = { kind: 'text' } | { kind: 'multi'; values: readonly string[] } | { kind: 'single'; values: readonly string[] };
  export function useUrlFilters<D extends Record<string, FilterDef>>(defs: D): {
    values: { [K in keyof D]: D[K] extends { kind: 'multi' } ? string[] : string | undefined };
    setText(key, value: string): void; toggle(key, value: string): void; setSingle(key, value?: string): void;
    clear(key): void; clearAll(): void; activeCount: number;
  };
  ```
  Backed by `useSearchParams` (`replace: true`, other params preserved); unknown values for `multi`/`single` are
  ignored (a hand-edited URL never crashes a page). Multi values are repeated params (`?env=production&env=staging`).
- `matchesText(query: string, ...fields: (string | null | undefined)[]): boolean` — case-insensitive substring.
- `FilterToolbar` props:
  `{ search?: { value: string; onChange(v: string): void; placeholder: string; ariaLabel: string };
     filters?: { key: string; label: string; options: { value: string; label: string }[]; selected: string[];
                 onToggle(v: string): void; onClear(): void }[];
     onClearAll?(): void; actions?: ReactNode; ariaLabel: string }`
  PF6 `Toolbar` with `clearAllFilters`, `ToolbarToggleGroup` (breakpoint `xl`), `SearchInput`, one checkbox `Select`
  (`SelectOption hasCheckbox`) per filter inside `ToolbarFilter labels=… deleteLabel deleteLabelGroup`, `actions`
  right-aligned (e.g. primary "Add user").
- `useClientSort<T, C extends string>(rows: T[], accessors: Record<C, (row: T) => string | number | null>,
  initial: { by: C; direction: 'asc' | 'desc' }): { sorted: T[]; sortProps(column: C, index: number): ThProps['sort'] }`
  — nulls last regardless of direction; `localeCompare` for strings.
- `TableSkeletonRows({ rows?: number; columns: number })` (PF `Skeleton` per cell, `screenreaderText` once);
  `TableEmptyRow({ colSpan; title; body?; actions? })` — `Tr > Td colSpan > Bullseye > EmptyState` (used for both
  "empty" and "no match" with "Clear filters").

## Acceptance criteria
- [x] Tests with a demo list in a memory router: typing filters and writes `?q=`; checkbox filter writes repeated
      params and shows a removable label; "Clear all filters" resets; reload (re-mount with the URL) restores
      filters; unknown URL values ignored; sort toggles direction and keeps nulls last.
- [x] Accessible names on toolbar, search and filter toggles. TSDoc. Build, lint and tests green (rule 4).

## Work log
- 2026-11-19 frontend-engineer: started; read CLAUDE.md, FRONTEND.md, ADR-0014/15/16, spec §5.
- 2026-11-19 frontend-engineer: implemented `web/src/shared/table/` (useUrlFilters, matchesText, FilterToolbar,
  useClientSort, TableSkeletonRows/TableEmptyRow, index.ts) + `tableKit.test.tsx` (demo list in a memory router,
  15 tests). lint / typecheck / test (85 passed) / build green. Status → in_review.
- 2026-11-19 frontend-engineer: review round 1 fixes. Added `filterItems?: ReactNode` slot to `FilterToolbar`
  (rendered in the filter group after checkbox filters) with a demo test: a page-supplied `ToolbarFilter` for the
  `status` single filter (via `setSingle`) shows its label and "Clear all filters" removes it from the URL. Added
  `web/src/test/viewport.ts` (`mockViewportWidth`, approved outside `paths`) and used it in `tableKit.test.tsx`.
  Rewrapped the long TSDoc line; reworded the memoisation note. lint / typecheck / test (86 passed) / build green.
  Status → in_review.

## Review
**Round 1 — 2026-11-19 frontend-architect: CHANGES_REQUESTED**

Checks (run by reviewer): `npm run lint` clean (0 warnings), `typecheck` clean, `npm test -- --run` 10 files /
85 tests passed, `build` OK (the >500 kB chunk warning is pre-existing and not caused by this kit).

The kit meets its contract and is clean, idiomatic PF6 (checkbox `Select role="menu"` + `SelectOption hasCheckbox`,
`ToolbarFilter` labels/`deleteLabel`/`deleteLabelGroup`, `clearAllFilters`, sortable `Th`). Tests use a realistic
demo list and cover every acceptance criterion. Two changes are needed before the list pages can use it. The first
comes from a gap in my contract, not from a mistake in the work.

Required:
1. `web/src/shared/table/FilterToolbar.tsx:50-59` — `FilterToolbar` owns the PF `Toolbar`, and the only filter
   controls it accepts are search plus checkbox filters. Two of the five consumers need other controls inside the
   *same* toolbar, sharing its label-collapse and "Clear all filters" context. T-0030 needs a `readOnly` single
   select. T-0041 needs actor/cluster typeaheads, a category single select, a time-range `Select` with
   `DatePicker`s, and a removable "User: alice" label. Neither task may edit `shared/table/`, and a page cannot add a
   second `ToolbarFilter` from outside, so both would have to rebuild the toolbar by hand. — Add a slot
   `filterItems?: ReactNode` (TSDoc: "extra PF `ToolbarFilter`/`ToolbarItem`s, e.g. single selects, typeaheads,
   date range") and render it inside the `ToolbarGroup variant="filter-group"` after the checkbox filters. Render
   that group when `filters.length > 0 || filterItems`. Add one demo test: a page-supplied `ToolbarFilter` for the
   `status` single filter (driven by `setSingle`) shows its label, and "Clear all filters" removes it from the URL.
2. `web/src/shared/table/tableKit.test.tsx:140-141` — the breakpoint workaround is right, but every list-page test
   (five tasks) will hit the same silent failure: labels are missing with no error. A note in the handover does not
   reach the people writing those tests. — Add `web/src/test/viewport.ts` exporting
   `mockViewportWidth(width: number): void` (TSDoc explaining the PF `xl` = 1200px collapse versus jsdom's 1024px;
   `restoreMocks: true` in `vite.config.ts` already undoes the spy). Use it here, and update the Gotchas note to
   point to it. Do not set a global width in `setup.ts`, because that would also change how PF `Page`/sidebar
   behaves in the existing shell tests. I approve this addition outside the task's `paths`.

Rulings on the deviations (all accepted):
- Callback props and setters as function-type properties instead of methods: accepted, and adopted as the
  convention for future task contracts (destructuring `{ toggle }` must not trip `unbound-method`).
- Kind-restricted setters (`KeysOfKind`): accepted. This is a stronger version of the contract, and calling
  `toggle('q', …)` now fails to compile.
- `NoInfer` on `initial`: accepted (TS 5.9). The column union comes from `accessors`, as intended.
- Optional `icon` on `TableEmptyRow`: accepted (PF `EmptyState` takes it; `SearchIcon` for no-match is standard).
- `Intl.Collator({ numeric, sensitivity: 'base' })`: accepted. It is `localeCompare` with options, gives
  `dev-2 < dev-10` for cluster names, and is hoisted once at module level.
- `numberOfFiltersText`: accepted (correct pluralisation; tested).
- `role="group"` + `aria-label` on `Toolbar`: accepted. PF gives the toolbar `div` no role, so without it the
  `aria-label` would name nothing.
- jsdom/PF breakpoint: the analysis is correct. A shared helper is required (see 2).
- Module-level defs/accessors: accepted as documented.

Ergonomics for the five pages (after fixes 1 and 2): users fits (q/role/status via the props, readOnly via
`filterItems`). Clusters and grants fit directly (grants is search-only). Credentials fits. Audit uses
`useUrlFilters` (text: actor/user/cluster/target/from/to; single: category/range) plus `filterItems`, and does not
use `useClientSort` (it is server-ordered). `cursor` stays out of the URL because it lives in the infinite-query
page params, so `clearAll` and filter writes never need a page reset.

Optional nits:
- `FilterToolbar.tsx:66` — the TSDoc line is longer than 120 characters; rewrap it.
- Handover "values and sorted are memoised": `sorted` only stays stable if the page also memoises the filtered
  `rows`. A typical page calls `rows.filter(…)` inline, so it re-sorts every render. That is harmless for bounded
  lists, but reword the note to say so, or suggest `useMemo` for the filtered rows.
- `FilterValues` types `multi` values as `string[]`. A later refinement could narrow them to
  `D[K]['values'][number][]`, so `values.env` would be `Environment[]`. Not needed now.

**Round 2 — 2026-11-19 frontend-architect: APPROVE**

Checks (run by reviewer, with T-0023's in-progress `web/src/mocks/` present and causing no failures): lint clean
(0 warnings), typecheck clean, tests 10 files / 86 passed, build OK (same pre-existing chunk-size warning).

- Required 1 is resolved. `FilterToolbar.tsx:53-57,104-110` adds a `filterItems?: ReactNode` slot with TSDoc. It
  renders inside the `filter-group` after the checkbox filters, and the group also renders when only `filterItems`
  is given. The demo's `StatusFilter` (a single `Select` in a `ToolbarFilter`, driven by `setSingle`) is the right
  template for the users page `readOnly` filter and the audit page `category`/`range` filters. The new test checks
  the URL write, row filtering, the "Status" label and "Clear all filters" (`?keep=1` kept, label gone).
- Required 2 is resolved. `web/src/test/viewport.ts` `mockViewportWidth` has clear TSDoc (the 1024 versus 1200
  breakpoint, why the failure is silent, call it before render, `restoreMocks`, no global width). It is used in the
  `beforeEach` and in the narrow-screen test. The Gotchas note points to it.
- Nits: the TSDoc is rewrapped, and the memoisation note is reworded correctly (`useMemo` for the filtered rows, or
  accept re-sorting). Leftover trivia: one handover markdown line is over 120 characters (not linted), and the
  narrowed `multi` value type is still open as a possible later refinement. Neither needs action.

## Handover notes
**Done:** everything in the contract plus the round-1 fixes, exported from `@/shared/table`. No new packages. The
only file outside `web/src/shared/table/` is `web/src/test/viewport.ts` (approved by the reviewer).

**Usage notes for the list-page tasks**
- Declare filter defs and sort accessors as **module-level constants** (`as const satisfies FilterDefs`): `values` is
  memoised on the defs and `sorted` on `rows` + accessors; an inline object recomputes every render. `sorted` is only
  stable if the page also memoises the filtered rows (`useMemo(() => rows.filter(…), [rows, values])`); an inline
  `rows.filter(…)` re-sorts every render, which is harmless for bounded admin lists. `useClientSort`'s column union is inferred
  from `accessors` (`initial` is `NoInfer`), so a typo in `initial.by` is a type error.
- `useUrlFilters` setters are key-kind-safe: `setText` only accepts `text` keys, `toggle` only `multi` keys,
  `setSingle` only `single` keys. `toggle`/`setSingle` ignore values not declared in the def; unknown URL values are
  ignored on read and dropped on the next write to that filter. `clearAll` only removes declared keys.
- `activeCount` = number of applied values (each multi value counts once); use `activeCount > 0` to choose between
  the "empty" and "no match" `TableEmptyRow`.
- `matchesText` trims the query; empty query matches everything.
- Controls other than search/checkbox filters (single selects, typeaheads, date range, "User: alice" labels) go in
  `filterItems`: pass your own PF `ToolbarFilter`s (with `labels`/`deleteLabel`/`deleteLabelGroup`) or
  `ToolbarItem`s. They share the toolbar's label collapse and "Clear all filters" (`onClearAll` should be
  `useUrlFilters().clearAll`, which clears every declared key). Example: `StatusFilter` in `tableKit.test.tsx`.
- `FilterToolbar` renders `role="group"` + `aria-label` on the PF `Toolbar` (PF sets no role, so `aria-label` alone
  would give no accessible name). Filter toggles are named "Filter by <label>". Label removal buttons are PF's
  "Close <option label>"; a category's labels are a `list` named by the category.

**Deviations / additions (small, additive)**
- Callback members are property-style function types (`onToggle: (v) => void`), not method syntax, so consumers can
  destructure them without tripping `@typescript-eslint/unbound-method`.
- `TableEmptyRow` takes an optional `icon` (e.g. `SearchIcon` for "no match").
- Strings sort with `Intl.Collator(numeric, sensitivity: base)` (= `localeCompare` with options), so `dev-2` <
  `dev-10`.
- `numberOfFiltersText` fixes PF's default "1 filters applied".

**Gotchas**
- PF collapses filter labels into "N filters applied" below `collapseListedFiltersBreakpoint` (`xl`, 1200px), and
  jsdom's `innerWidth` is 1024, so label queries fail **silently**. Page tests that assert on labels call
  `mockViewportWidth(1440)` from `@/test/viewport` before rendering (e.g. in `beforeEach`); `restoreMocks` undoes it.
  Don't set a global width in `setup.ts` (it would change PF `Page`/sidebar behaviour in the shell tests).
- The build's ">500 kB chunk" warning comes from the existing app bundle, not from this kit (nothing imports the
  kit yet). Splitting vendor chunks belongs to the routing/code-splitting work.
