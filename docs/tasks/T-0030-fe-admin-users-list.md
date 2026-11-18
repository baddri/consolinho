---
id: T-0030
title: Admin users list page (/admin/users)
status: todo
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
- [ ] USR-1: all columns render from fixtures; `pending-paul` shows Pending, `dave` Deactivated, `ines` Read only,
      `admin` Admin + via config; groups beyond 3 collapse to "+N".
- [ ] Filters: text filter over group name; role/status chips; `?status=deactivated` deep link pre-filters; clear.
- [ ] Sort by last login toggles and keeps never-logged-in users last.
- [ ] QG-3: loading skeleton, error state with retry (MSW 500), no-match state.
- [ ] AUD-5/ADM-2: page works for `ines` (read-only admin). TSDoc. Build, lint, tests green.

## Work log

## Review

## Handover notes
