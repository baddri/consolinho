---
id: T-0031
title: Admin user actions — create user, promote/demote, read-only, deactivate/reactivate
status: done
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0030, T-0025]
paths: [web/src/features/admin/users/]
review_rounds: 0
---

## Goal
All user mutations (USR-2..6) with confirmations, read-only gating (ADM-2), conflict and last-admin errors (ADM-4/5),
reusable from the list kebab and (T-0032) the detail page's Actions dropdown. Backend counterpart: T-0016; MSW until
then. **Parallel group F6** (with T-0035).

## Scope
- In: mutation hooks, `CreateUserModal`, transition dialogs, `useUserActions`, wiring into `UsersListPage` (toolbar
  "Add user", row `ActionsColumn`).
- Out: "Grant cluster access now" after create (T-0040), single grants (T-0039).

## Contract / design notes
Endpoints (contract §7.2): `POST /api/admin/users` (`CreateUserRequest` → 201 `UserDetail`),
`PUT …/{username}/role` (`ChangeUserRoleRequest`), `PUT …/{username}/read-only` (`SetUserReadOnlyRequest`),
`POST …/{username}/deactivate|reactivate` (`VersionRequest`); all return `UserDetail`. Usernames URL-encoded.
- Hooks in `users/api.ts`: `useUser(username)` (`adminKeys.user`), `useCreateUser`, `useChangeUserRole`,
  `useSetUserReadOnly`, `useDeactivateUser`, `useReactivateUser` — on success `setQueryData(adminKeys.user(u), dto)`
  + invalidate `adminKeys.all` (ADR-0015 §6); 403 `Auth.ReadOnly`/`Auth.Forbidden` also invalidate `me`.
- **`version` source:** `UserListItem` carries `version` (contract §7.1 amendment 2026-11-18), so dialogs send the
  `version` of the row (list) or of the loaded `UserDetail` (detail page) — no extra fetch of the detail when
  confirming. A stale version yields 409 `Concurrency.Conflict` (handled below). (Architect 2026-11-19, superseding
  the earlier "fetch detail for version" note.)
- `CreateUserModal` (RHF + zod, `users/CreateUserForm.schema.ts`): `username` (required, ≤ 253, no `/`, `%`,
  whitespace or control chars, not `.`, `..`, `~`; helper "Exact OpenShift username, case-sensitive."), `role`
  radio User/Admin (default User), `isReadOnly` checkbox. `applyServerErrors` with
  `codeToField: { 'Users.UsernameTaken': 'username' }`. Success → toast "User alice created" + navigate to detail.
- `useUserActions(user: UserListItem | UserDetail): ActionItem[]` builds the kebab/dropdown items with reasons
  (`disabledActionProps`):
  - **Promote** — shown when `!user.isAdminByAssignment` (also for config-only admins; ADR-0017, contract §7.2). For
    a config admin the confirm text explains: "`x` is admin via configuration (`<source>`). Promoting records the
    role so it is kept if they leave that group."
  - **Demote** — shown when `role === 'admin'`. Enabled only when `!isAdminViaConfiguration`; otherwise visible but
    aria-disabled with USR-6 tooltip "Admin granted by configuration (`<adminConfigurationSource>`). Change the
    configuration to remove." — list items carry `adminConfigurationSource` too (contract §7.1), so list and
    detail show the same text; build it from T-0030's `adminViaConfigurationText(source)` in `UserRoleLabels.tsx`
    (generic wording only when the source is `null`). Self → disabled "You can't demote or deactivate yourself."
  - **Set read-only / Remove read-only** — confirm with USR-5 text "Read-only applies on every cluster regardless of
    grant mode (enforced by the proxy from CP2) and blocks admin changes for admins."
  - **Deactivate** (status ≠ deactivated; self disabled) — danger `ConfirmModal`: "Deactivate `alice`? They will be
    logged out within a minute and lose access to all N clusters. Their grants are kept and return if reactivated."
    (N = `grantCount`; spec USR-4 text with neutral pronoun).
  - **Reactivate** (status deactivated).
  - **Grant access to clusters** — placeholder item wired by T-0040 (hidden until then).
  - All items aria-disabled with `useAdminAccess().readOnlyReason` for read-only admins (ADM-2).
- Dialog errors: `Users.LastAdmin`, `Users.SelfChange`, `Users.AdminViaConfiguration`, `Concurrency.Conflict` →
  `ErrorState` inside the `ConfirmModal` with `detail` verbatim; conflict also invalidates the user so "Confirm"
  retries with the fresh version. Success toasts: "alice is now an administrator", "alice deactivated", …

## Acceptance criteria
- [x] USR-2: create `newbie` → POST with CSRF header → toast + detail page; duplicate `alice` → inline field error with
      the 409 detail; invalid `a/b` → client error; server 400 on `username` shown inline.
- [x] USR-3 + ADR-0017: `admin` (config only) offers Promote and a disabled Demote with the USR-6 tooltip naming the
      group (list and detail); `carol` (assigned) offers Demote, no Promote; `alice` offers Promote only.
- [x] USR-4: deactivate dialog text names user and N; reactivate restores Active.
- [x] USR-5: read-only toggle with explanation. ADM-5: self actions disabled; MSW `Users.LastAdmin` shown in dialog.
- [x] ADM-4: a 409 `Concurrency.Conflict` shows the detail inline and a second confirm succeeds.
- [x] ADM-2/QG-3: as `ines` every action and "Add user" is visible, aria-disabled, tooltip "Your account is
      read-only", and no request is sent.
- [x] TSDoc. Build, lint, tests green.

## Work log
- 2026-11-19 frontend-engineer: started; MSW user handlers already exist (T-0042), wiring hooks/dialogs/list.
- 2026-11-20 frontend-engineer: hooks, CreateUserModal, UserActionDialogs, useUserActions, list wiring + 9 tests;
  check-fe green (359 tests). Detail-page half of the list/detail ACs is ready for T-0032 (same hook).

## Review
- 2026-11-20 frontend-architect, round 1: **APPROVE**. check-fe green (30 files / 359 tests). Deviations accepted:
  `{ items, dialog }` (hook owns the confirm, T-0032 reuses it); detail-page ACs verified via T-0032; reason
  precedence read-only > config admin > self matches USR-6/ADM-5. Invalidation (users prefix on 409, `me` on 403
  ReadOnly/Forbidden), row `version`, CSRF via middleware, aria-disabled + tooltips, TSDoc, no `any`: all good.
- Nit (optional): `web/src/features/admin/users/CreateUserModal.tsx:74-75` — `ConflictAlert` can never show on a
  create; drop it rather than keep dead UI with an explanatory comment.
- Nit (optional): `web/src/features/admin/users/UserActionDialogs.tsx:108` — config-source formatting duplicates
  `UserRoleLabels`; consider a shared helper if a third caller appears.

## Handover notes
- `useUserActions(user)` returns `{ items, dialog }` (not bare `ActionItem[]`): the hook owns the confirmation, so
  callers render `{dialog}` next to their menu. `items` are `IAction`-compatible (row `ActionsColumn`); T-0032 maps
  them to `DropdownItem`s (`itemKey`, `title`, `onClick`, `isDanger`, `isAriaDisabled`, `tooltipProps`).
- Disabled-reason precedence: read-only admin (all items) > config admin (Demote, USR-6 text) > self (Demote,
  Deactivate). Disabled `onClick` is a no-op, so no request even if PF lets the click through.
- Each dialog (`UserActionDialogs.tsx`) mounts only while open and sends the passed user's `version`; any 409
  invalidates `adminKeys.users()` so the retry uses the refetched version; 403 ReadOnly/Forbidden refetches `me`.
- `useUser(username)` added for T-0032. "Grant access to clusters" item intentionally absent until T-0040.
- MSW user handlers already existed (T-0042); no mock changes needed. Create submit button is labelled "Create".
