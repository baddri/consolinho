# 0014 — SPA session handling, route guards and permission-aware UI
**Status:** Accepted (2026-11-18) · **Builds on:** 0007, 0009, 0012

## Context
CP1 adds a real session (ADR-0007/0009). The SPA must:
- send unauthenticated users to `/login` and back to the deep link afterwards (AUTH-1/2/12), without redirect loops;
- tell "session ended" (AUTH-11: deactivated, revalidated → 401) apart from a first visit;
- show/hide Administration by role (ADM-3) and disable every mutating control for read-only admins with the reason
  (ADM-2), while still handling the server's 403s because claims may be up to 60 s old (ADR-0009);
- never keep another user's cached admin data after logout or session loss.

The cookie is HttpOnly, so the SPA cannot inspect it. React Router loaders and a client-side auth store were
considered; both duplicate what TanStack Query already does for server state.

## Decision
1. **`GET /api/auth/me` is the session source.** `useCurrentUser()` (feature `auth`) wraps one query, key
   `['api','auth','me']`, `staleTime` 60 s (= revalidation interval), `refetchOnWindowFocus: true`. There is no
   separate auth store or React context; role/read-only changes made by another admin appear on the next refetch.
2. **One place reacts to 401.** `createQueryClient({ onUnauthenticated })` installs `QueryCache`/`MutationCache`
   `onError` handlers; any `ApiError` with status 401 calls `onUnauthenticated`. The app wires it to the data router:
   `router.navigate('/login?returnUrl=<current path+search+hash>[&reason=session_ended]')`, then
   `queryClient.clear()`. `reason=session_ended` is added when a `me` result was cached before (the user *had* a
   session). The handler is a no-op when the router is already on `/login` (loop guard). Components never handle 401.
3. **Route guards are layout routes, not loaders.** `RequireSession` (feature `auth`) wraps the app shell: pending →
   full-page `Spinner`; success → `<Outlet/>`; 401 → nothing (rule 2 navigates); other errors → `ErrorState` with retry.
   `/login` is outside the guard. `RequireAdmin` (feature `admin`) wraps `/admin/*`: non-admins see the
   "You don't have access to Administration" page (ADM-3), never a raw 403. The sidebar hides the Admin section for
   non-admins.
4. **Login is full-page navigation.** The login button is `<Button component="a" href="/api/auth/login?returnUrl=…">`;
   the SPA never `fetch`es `/api/auth/login` or `/callback`. The `returnUrl` is computed client-side with the same
   rule as the backend (single leading `/`, no `//`, `\`, scheme, control chars, never `/login…`; else `/`) so the SPA
   never builds a link the backend would rewrite. CP1 ships **button-only** (spec Q2 allows it); auto-redirect for
   message-less deep links is a later enhancement.
5. **Logout** = `POST /api/auth/logout` → `navigate('/login?loggedOut=1', { replace: true })` → `queryClient.clear()`
   (navigate first so no guarded query re-fires).
6. **Permission-aware actions.** `useAdminAccess()` (feature `admin`) returns
   `{ canMutate: boolean; readOnlyReason?: string }` derived from `me` (`isReadOnly` → "Your account is read-only").
   Every mutating control in admin pages takes the reason and renders **visible but disabled with a tooltip** using
   PatternFly's `isAriaDisabled` (+ `Tooltip` for buttons, `tooltipProps` for `DropdownItem`/`ActionsColumn` items) —
   `isDisabled` is not used for permission states because it removes focus and suppresses the tooltip. Row/action-
   specific reasons (self-demote, config-sourced admin, delete enabled cluster) use the same mechanism.
7. **Server 403s still handled.** `Auth.ReadOnly` / `Auth.Forbidden` from a mutation show the ProblemDetails `detail`
   in the dialog/toast and invalidate `['api','auth','me']`, so the UI catches up with the server.

## Consequences
- Adding a page never adds auth code: being inside the guarded route tree is enough.
- One extra `me` request per minute of focus; negligible.
- Tests cover the redirect once (router-level, MSW 401) instead of per page.
- The read-only pattern is uniform and lint-reviewable: grep for `canMutate`/`readOnlyReason`.

## Amendment (2026-11-19, T-0027 review)
- **Cache clearing is `clearSessionCache(queryClient)`, not `queryClient.clear()`** (§2 and §5). Sequence: navigate
  to `/login` with `{ replace: true, flushSync: true }`, then call `clearSessionCache`, which removes every query
  **without observers** and clears the mutation cache. Why: React Router commits navigations in a transition, so after
  the navigate promise resolves the guarded tree may still be mounted and would refetch `me` (a second request, i.e. a
  potential loop) if the cache were cleared then; with `flushSync` the login page is already mounted and `clear()`
  would orphan its in-flight anonymous `system/info` query (its observer never receives data). Removing only
  unobserved queries after the committed navigation drops the whole guarded tree's data and keeps the login page
  working.
- **Invariant this relies on (review rule):** nothing outside `RequireSession` may observe a query holding
  user- or cluster-specific data. Only anonymous data (today `['api','system','info']`) may be observed by the login
  page, providers or other unguarded components. Tests assert the cache after logout/session end is exactly
  `[['api','system','info']]`; extend that assertion, don't weaken it, when the login page gains a query.
- The loop guard also ignores a 401 while a navigation **to** `/login` is pending, so several requests failing
  together redirect once.
