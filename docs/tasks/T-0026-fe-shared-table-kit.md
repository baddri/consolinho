---
id: T-0026
title: Shared admin list kit — URL-backed filters, filter toolbar, client-side sort, table state rows
status: todo
owner: frontend-engineer
checkpoint: 1
depends_on: []
paths: [web/src/shared/table/]
review_rounds: 0
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
- [ ] Tests with a demo list in a memory router: typing filters and writes `?q=`; checkbox filter writes repeated
      params and shows a removable label; "Clear all filters" resets; reload (re-mount with the URL) restores
      filters; unknown URL values ignored; sort toggles direction and keeps nulls last.
- [ ] Accessible names on toolbar, search and filter toggles. TSDoc. Build, lint and tests green (rule 4).

## Work log

## Review

## Handover notes
