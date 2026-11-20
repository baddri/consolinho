---
id: T-0041
title: Audit log viewer (/admin/audit) — URL filters, keyset "Load more", expandable details
status: done
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0028, T-0026, T-0024]
paths: [web/src/features/admin/audit/, web/src/shared/table/, web/src/features/admin/users/UsersListPage.tsx, web/src/features/admin/users/ReadOnlyFilter.tsx]
review_rounds: 0
---

## Goal
Give the auditor and admins a filterable, linkable history of admin and auth events (AUD-2, AUD-4, AUD-5), the
target of the "View audit entries" links on user and cluster pages. Backend counterpart: T-0021; MSW until then.
**Parallel group F5.**

## Scope
- In: `audit/api.ts` (`useAuditLog` infinite query), `AuditLogPage.tsx`, `AuditFilters.tsx`, `AuditEntryRow.tsx`,
  `timeRange.ts` (pure).
- Out: export, retention (backlog).

## Contract / design notes
Endpoint `GET /api/admin/audit?actor&user&category&cluster&target&from&to&cursor&limit` → `AuditPage { items,
nextCursor }` (newest first; keyset). Key `adminKeys.audit(filters)` where `filters` is the **resolved** request
(incl. computed `from`/`to`), `useInfiniteQuery` with `initialPageParam: undefined`, `getNextPageParam: p =>
p.nextCursor ?? undefined`, `limit` 50.
- URL params (`useUrlFilters` + plain search params): `actor`, `user`, `category` (single: auth/users/clusters/
  credentials/grants), `cluster`, `target`, `range` (`1h`,`24h`,`7d`,`30d`,`custom`), `from`, `to` (ISO, custom only).
  `timeRange.ts`: `resolveRange(range, from, to, now) → { from?: string; to?: string }`; `now` is captured when the
  filters change (not every render), so the query key is stable and "Load more" stays consistent while new entries
  arrive (AUD-4).
- Toolbar: actor typeahead (options: admin users list + "system (config)", free text allowed), category select,
  cluster typeahead (admin clusters + free text — deleted clusters still searchable), target `SearchInput`
  (debounced 300 ms), time range `Select` with presets; "Custom" shows `DatePicker` + `TimePicker` for from/to. A
  `user=` deep link (USR-7) shows as a removable filter label "User: alice". Clear all filters.
- Table (composable, expandable rows): Time (`RelativeTime`, absolute in tooltip), Actor (`Label` "system" when
  `actorIsSystem`), Action (monospace `action`), Target (`targetType` + `targetName`), Cluster (link to admin cluster
  when present), Summary. Expanded row: `details` as `CodeBlock` (`JSON.stringify(details, null, 2)`, nothing when
  null) and `correlationId` in `ClipboardCopy`.
- Footer: "Load more" button (spinner while fetching next page) while `nextCursor` exists; "End of audit log" text
  otherwise. Count "Showing N entries".
- States: skeleton rows; 400 on bad filter (e.g. hand-edited `from`) → `ErrorState` with the detail + Clear filters;
  empty → "No audit entries match these filters" + Clear filters (spec §5).
- Read-only admins have full access (AUD-5); no mutating controls exist (AUD-3).
- **Single-select filter extraction (architect 2026-11-19, from T-0030 review):** T-0030 built
  `features/admin/users/ReadOnlyFilter.tsx` (PF `ToolbarFilter` + `Select`, removable label, picking the selected
  option again clears it). The category select is its second consumer: move it to
  `shared/table/SingleSelectFilter.tsx` (`{ categoryName: string; options: FilterOption[]; value?: string;
  onChange: (value?: string) => void }`, exported from `@/shared/table`), switch `UsersListPage` to it, delete
  `ReadOnlyFilter.tsx`, and move its behaviour test into `tableKit.test.tsx` (replacing the demo `StatusFilter`).
  The users page tests must stay green unchanged. This task's paths therefore also include
  `web/src/shared/table/` and `web/src/features/admin/users/{UsersListPage.tsx,ReadOnlyFilter.tsx}`.

## Acceptance criteria
- [x] AUD-2: rows show time, actor (system label), action, target, cluster, summary; expanding shows details JSON
      and correlation id.
- [x] AUD-4: each filter writes the URL and sends the matching query param; `/admin/audit?user=alice` and
      `?cluster=prod-eu-1` deep links pre-filter; presets send `from` ≈ now − range (`timeRange` unit tests with a
      fixed `now`); custom range sends both bounds.
- [x] AUD-4: "Load more" appends the next page via `cursor` without duplicates (MSW fixture of 120 entries → 3
      pages); key does not change between pages.
- [x] AUD-5: works for `ines`. QG-3 loading/empty/error. TSDoc. Build, lint, tests green.

## Work log
- 2026-11-20 frontend-engineer: started; users-page switch to SingleSelectFilter deferred (orchestrator: users/ owned by concurrent agents).
- 2026-11-20 frontend-engineer: audit page, filters (typeaheads, category, debounced target, presets/custom), keyset
  "Load more", expandable rows; `shared/table/SingleSelectFilter` + kit test. check-fe.sh green (413 tests).
- 2026-11-20 frontend-engineer: UsersListPage → SingleSelectFilter, ReadOnlyFilter.tsx deleted; typeahead arrow-key
  nav; filter test split per filter (timeout under load). Audit file 3x in a row + full gate 2x green (416).

## Review
- 2026-11-20 frontend-architect, round 1: **APPROVE**. `scripts/check-fe.sh` green (36 files / 416 tests).
  URL is the source of truth (single `setTimeRange` update is correct); key = resolved request with `now` captured
  per filter-set mount, 1 cache entry across 3 pages verified by test; dedupe in `flattenPages` is harmless belt-and-braces.
  `SingleSelectFilter` API matches the design; users page switched, `ReadOnlyFilter.tsx` deleted. Typeahead a11y checked
  against PF source (caret-only `onClick`, `id` lands on the `role="option"` element). No `any`, TSDoc complete.
  Optional nits:
  - `audit/TypeaheadFilter.tsx:109` — combobox lacks `aria-controls` → give `SelectList` an `id` and reference it (PF typeahead example does).
  - `audit/AuditFilters.tsx:100,104` — `effectiveRange(values)` computed twice; hoist to a const.
  - `audit/DateTimeField.tsx:54` — a new "To" date defaults to 00:00, excluding that day; consider 23:59 for the upper bound.
  - `audit/AuditLogPage.test.tsx:231` — "shows skeleton rows" test never asserts the skeleton; assert it before the error appears or rename.

## Handover notes
- Files: `audit/{api.ts,auditFilters.ts,timeRange.ts,AuditLogPage.tsx,AuditFilters.tsx,AuditEntryRow.tsx,
  TypeaheadFilter.tsx,DateTimeField.tsx}` + tests; `shared/table/SingleSelectFilter.tsx` (exported, demo test uses it).
- `UsersListPage` uses `SingleSelectFilter`; `ReadOnlyFilter.tsx` deleted; users tests unchanged and green.
- Stable key: `AuditResults` is keyed by `auditFiltersKey(values)`; `useAuditRequest` captures `now` in a `useState`
  initializer on mount (react-hooks/purity forbids `Date.now()` in render), so a filter change = fresh `now`.
- `from`/`to` without `range` are treated as custom (hand-written links still apply → server 400 shown with field errors).
- Range changes go through `setTimeRange` (one `setSearchParams`), since two `useUrlFilters` setters in one event clobber.
- Typeahead: Select `variant="typeahead"` (else PF moves focus into the menu on ArrowDown); Up/Down highlight via
  `isFocused` + `aria-activedescendant`, Enter applies highlight or free text.
- `details` rendered via `formatDetails` (null → nothing, objects pretty-printed, scalars JSON-quoted).
