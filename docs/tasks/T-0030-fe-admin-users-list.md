---
id: T-0030
title: Admin users list page (/admin/users)
status: done
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0028, T-0026, T-0024]
paths: [web/src/features/admin/users/]
review_rounds: 0
---

## Goal
The fleet admin's and auditor's overview of all FleetConsole users (USR-1), filterable and linkable. Backend
counterpart: T-0016 (`GET /api/admin/users`); MSW until then. **Parallel group F5.**

## Scope
- In: `users/api.ts` (list query), `UsersListPage.tsx`, `UserStatusLabel`, `UserRoleLabels` (reused by T-0032).
- Out: "Add user" and row actions (T-0031 adds them to this page), user detail (T-0032).

## Contract / design notes
Endpoint `GET /api/admin/users` → `UserListItem[]` (sorted by username). Query key `adminKeys.users()`.
- `useUsers()` in `users/api.ts`.
- Columns (USR-1): Username (link `/admin/users/${encodeURIComponent(username)}`), Display name, Role (`Label`
  "Admin"; plus compact "via config" label when `isAdminViaConfiguration`), Status (`UserStatusLabel`: Active green /
  Pending blue "Pending — never logged in" tooltip / Deactivated grey), Read only (`Label` "Read only" or —), Clusters
  (`grantCount`), Last login (`RelativeTime`, "Never" when null), Groups (`LabelList` max 3).
- Filters (`useUrlFilters`): `q` text over username/displayName/groups; `role` multi (`admin`,`user`); `status`
  multi (`active`,`pending`,`deactivated`); `readOnly` single (`yes`/`no`).
- Sort: username (default asc), last login (`useClientSort`, nulls last).
- States: `TableSkeletonRows`; `ErrorState` with retry above the table; no-match → "No users match" + Clear filters;
  (true empty is theoretical — same row with "No users yet").
- Leave a slot in the toolbar `actions` and an `ActionsColumn` cell placeholder (empty) for T-0031.

## Acceptance criteria
- [x] USR-1: all columns render from fixtures; `pending-paul` shows Pending, `dave` Deactivated, `ines` Read only,
      `admin` Admin + via config; groups beyond 3 collapse to "+N".
- [x] Filters: text filter over group name; role/status chips; `?status=deactivated` deep link pre-filters; clear.
- [x] Sort by last login toggles and keeps never-logged-in users last.
- [x] QG-3: loading skeleton, error state with retry (MSW 500), no-match state.
- [x] AUD-5/ADM-2: page works for `ines` (read-only admin). TSDoc. Build, lint, tests green.

## Work log
- 2026-11-19 frontend-engineer: started. Read FRONTEND.md, ADR-0014/0015, USR-1/ADM-2, contract §7.
- 2026-11-19 frontend-engineer: implemented `useUsers`, `UsersListPage`, `UserRow`, `UserStatusLabel`,
  `UserRoleLabels`, `ReadOnlyFilter`, `userFilters`; 11 page tests via `renderApp` + MSW. lint, typecheck,
  tests (350) and build green. → in_review.

## Review
**2026-11-19 frontend-architect — round 1: APPROVE**

Checks (run by reviewer): `npm run lint` (0 warnings), `typecheck`, `test -- --run` (29 files / 350 tests), `build`
all green. The full suite ran 3 more times in sequence, all green; `UsersListPage.test.tsx` passed in every run.
A load run (two suites at once) reproduced a flaky failure, but it is in
`src/app/router.test.tsx > redirects / to the overview of the user's first granted cluster` (T-0029, heading
"Overview" not found after 3312 ms, cold lazy-route load on the first test of the file vs the 3000 ms
`asyncUtilTimeout`). It is not in this task's paths, so I filed bug **T-0046** (required before CP1 VERIFY). It is
most likely the unidentified failure the engineer saw.

Verified against spec USR-1 / ADM-2 / contract §7.1:
- Columns: all 8 USR-1 columns plus an empty action column for T-0031 (`UserRow.tsx:22-61`). Username link encodes
  the name, display name falls back to "—", grant count, `RelativeTime` with "Never" and absolute time on hover,
  `LabelList max={3}` with "+N". The sort `columnIndex` values (0, 6) match the header order. OK.
- Labels: status colours green/blue/grey with the "Pending — never logged in" tooltip; "Admin" plus an outlined
  "via config" label whose tooltip names `adminConfigurationSource` (USR-6 wording, falls back when the source is null);
  "Read only" label. All are display-only and have no mutating affordance. OK.
- Filters in the URL: `q` (username/display name/groups), `role`/`status` multi, `readOnly` single, all through
  `useUrlFilters` with the shared `matchesText`. Deep link `?status=deactivated` and "Clear all filters" are tested. OK.
- Sorting: username asc by default; last login uses `Date.parse` and keeps nulls last in both directions (tested). OK.
- States: skeleton while pending, `ErrorState` with Retry above the table (500 then recovery is tested), "No users
  match" with Clear filters, and the theoretical "No users yet". There is no double state: no-match requires
  `users.length > 0`. OK.
- ADM-2/AUD-5: `ines` sees the full list. The page has no mutating controls yet; T-0031 owns the gating. OK.
- Layering: only `@/shared/*` and `../queryKeys` imports, no DOM access, TSDoc on every component and hook,
  `adminKeys.users()` key per ADR-0015.

Rulings on the engineer's choices:
1. **Non-admins show plain "User"**: approved. USR-1 asks for an "Admin badge". A badge on every row would add noise,
   and a plain word keeps admins easy to spot. The role filter options read the same.
2. **Read-only filter, picking the selected option again clears it**: approved. It matches the checkbox filters'
   toggle behaviour and the removable label, and "Clear all" stay the primary ways out. Keep this behaviour when the
   component is generalised (see 5).
3. **Keyboard-focusable labels (`tabIndex={0}`) as tooltip triggers**: approved. This is the same pattern as
   `RelativeTime`, and PF `Tooltip` adds `aria-describedby` and opens on focus. Only labels that carry a tooltip get
   focus ("via config", Pending), so tab stops stay limited.
4. **Per-test `mockDb` mutation for the ">3 groups" case**: approved. `resetMockDb()` runs in the global `afterEach`
   (`test/setup.ts`), and changing the shared fixtures to give someone 5 groups would affect every other suite. The
   test is explicit about what it sets up.
5. **`ReadOnlyFilter` location**: keep it in `features/admin/users/` for now. A second CP1 consumer does exist: T-0041
   needs a category single select (and a time-range select). So the extraction is a planned step, not an open
   follow-up: I added it to T-0041's design notes and paths (`shared/table/SingleSelectFilter.tsx`, users page
   switches to it, `ReadOnlyFilter.tsx` deleted). We extract on the second use, with the two real call sites in
   front of us.

Nits (optional, no new round):
- `ReadOnlyFilter.tsx:35-36`: the "select again clears" behaviour has no test. It can be covered when T-0041 moves
  the component.
- `UsersListPage.test.tsx:79`: "42 minutes ago" depends on `FIXTURE_NOW` captured at module load, with the value
  truncated toward zero. It only breaks if the first test starts more than 60 s after the import, so this is fine
  today. Keep it in mind if anything slow is added before it.

T-0031 updated by the architect: list rows carry `version` and `adminConfigurationSource`, so the "fetch detail for
version" step and the generic list tooltip are dropped (§7.1 amendment).

## Handover notes
- Files (all in `web/src/features/admin/users/`): `api.ts` (`useUsers`, key `adminKeys.users()`),
  `UsersListPage.tsx` (page, toolbar, table, states), `UserRow.tsx` (one row, `userDetailPath`, `USER_COLUMN_COUNT`),
  `UserStatusLabel.tsx` (+ `USER_STATUS_TEXT`), `UserRoleLabels.tsx` (+ `adminViaConfigurationText(source)`, the
  USR-6 wording "Admin granted by configuration (group fleetconsole-admins)"), `ReadOnlyFilter.tsx` (single-select
  `ToolbarFilter` in `filterItems`), `userFilters.ts` (`USER_FILTERS`, options, `matchesUserFilters`),
  `UsersListPage.test.tsx`.
- **For T-0031:** the toolbar `actions` prop is left out with a `// T-0031` comment in `UsersListPage.tsx`; the
  last cell of `UserRow` is an empty `<Td isActionCell />` with a comment (header is `<Th screenReaderText="Actions"/>`),
  so the column count stays 9. `UserListItem` now has `version` (contract §7.1 amendment), so the T-0031 note about
  fetching the detail for the version may be obsolete. `adminViaConfigurationText` can feed the Demote tooltip.
- **For T-0032:** `UserStatusLabel` and `UserRoleLabels` accept `UserDetail` fields directly.
- Choices: Role column shows plain "User" for non-admins; "via config" is an outline compact label with a focusable
  tooltip naming `adminConfigurationSource`; read-only filter chips read "Read only: Yes/No"; picking the selected
  read-only option again clears it. Last login sort uses `Date.parse` (nulls last via `useClientSort`).
- Test notes: PF `Table` has `role="grid"`, query it as such. The ">3 groups" case mutates `mockDb` in the test
  (fixtures have at most one group; db resets after each test). Checkbox filter options are `checkbox` roles.
- One full-suite run had a single failing test I could not identify (before lint fixes); the next 4 full runs and 3
  isolated runs of this file were green. Worth watching for flakiness under load.
