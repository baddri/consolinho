---
id: T-0041
title: Audit log viewer (/admin/audit) — URL filters, keyset "Load more", expandable details
status: todo
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
- [ ] AUD-2: rows show time, actor (system label), action, target, cluster, summary; expanding shows details JSON
      and correlation id.
- [ ] AUD-4: each filter writes the URL and sends the matching query param; `/admin/audit?user=alice` and
      `?cluster=prod-eu-1` deep links pre-filter; presets send `from` ≈ now − range (`timeRange` unit tests with a
      fixed `now`); custom range sends both bounds.
- [ ] AUD-4: "Load more" appends the next page via `cursor` without duplicates (MSW fixture of 120 entries → 3
      pages); key does not change between pages.
- [ ] AUD-5: works for `ines`. QG-3 loading/empty/error. TSDoc. Build, lint, tests green.

## Work log

## Review

## Handover notes
