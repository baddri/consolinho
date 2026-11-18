---
id: T-0027
title: SPA session — login page, session guard, global 401 handling, user menu, logout
status: todo
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0022, T-0023, T-0024]
paths: [web/src/features/auth/, web/src/app/ (App.tsx, router.tsx, queryClient.ts, session.ts, layout/AppMasthead.tsx, layout/UserMenu.tsx → removed), web/src/test/render.tsx, web/src/app/**/*.test.tsx]
review_rounds: 0
---

## Goal
Implement ADR-0014: the SPA knows who is logged in from `GET /api/auth/me`, sends unauthenticated users to `/login`
and back to their deep link, explains every login outcome, and logs out cleanly. Backend counterpart: T-0015
(contract §4); until it lands, MSW (T-0023). **Parallel group F3.**

## Scope
- In: feature `auth` (public API below), QueryClient 401 hook, router wiring, masthead user menu, test helpers.
- Out: admin guard and nav visibility (T-0028), cluster switcher data (T-0029), auto-redirect into OAuth from deep
  links (spec Q2 — button-only in CP1).

## Contract / design notes
Endpoints: `GET /api/auth/me` (200 `CurrentUser` / 401), `POST /api/auth/logout` (204), full-page link
`/api/auth/login?returnUrl=…`, `GET /api/system/info` (login footer). Query key `['api','auth','me']`.

`features/auth/index.ts` exports:
- `useCurrentUser(): UseQueryResult<CurrentUser, ApiError>` — `staleTime: 60_000`, `refetchOnWindowFocus: true`,
  `retry: false` for 401. `currentUserQueryKey`.
- `RequireSession` — layout route element: pending → `Bullseye > Spinner` ("Loading session"); success → `<Outlet/>`;
  401 → render nothing (global handler navigates); other error → `ErrorState` with retry.
- `LoginPage` — PF `LoginPage` (brand "FleetConsole", `loginTitle` "Log in to FleetConsole", footer with the version
  from `useSystemInfo`). One primary `Button component="a" href={buildLoginUrl(returnUrl)}` "Log in with OpenShift".
  Message `Alert` (inline) from query params:

  | Param | Variant | Text (spec) |
  |---|---|---|
  | `loggedOut=1` | info | "You have been logged out." (AUTH-10) |
  | `reason=session_ended` | warning | "Your session ended. Log in again to continue." (AUTH-11) |
  | `error=not_registered&username=x` | danger | "Your OpenShift account `x` is not registered in FleetConsole. Ask a FleetConsole administrator to add you." (AUTH-6) |
  | `error=deactivated` | danger | "Your FleetConsole account is deactivated." (AUTH-7) |
  | `error=cancelled` | info | "Login was cancelled." (AUTH-14) |
  | `error=unavailable` | danger | "OpenShift login is currently unavailable (host cluster OAuth server did not respond). Existing sessions are not affected." (AUTH-14) |
  | `error=failed` or unknown | danger | "Login failed. Please try again." |
- `sanitizeReturnUrl(value: string | null): string` — contract §4.1 rule (single leading `/`, no `//`, `\`, scheme,
  control chars) **plus** never `/login…` → else `/`. `buildLoginUrl(returnUrl?: string): string`.
- `UserMenu` (moved from `app/layout`, old file deleted): toggle shows `displayName ?? username`; `Label`s "Admin"
  (role admin) and "Read only" (`isReadOnly`) next to it; dropdown: a non-interactive header with username and
  groups count, "Log out".
- `useLogout()` — mutation `POST /api/auth/logout` → `navigate('/login?loggedOut=1', { replace: true })` →
  `queryClient.clear()`.

App wiring (`app/`):
- `createQueryClient({ retry?, onUnauthenticated? })` installs `QueryCache`/`MutationCache` `onError`; 401
  `ApiError` → `onUnauthenticated()`. Default `retry` must not retry 4xx `ApiError`s.
- `app/session.ts`: `handleUnauthenticated(router, queryClient)` — no-op on `/login`; otherwise
  `reason=session_ended` iff `queryClient.getQueryData(currentUserQueryKey)` was defined; navigate
  `/login?returnUrl=<sanitized current path+search+hash>[&reason=session_ended]` (replace), then `clear()`.
- Router: `/login` stays top-level; the shell route becomes `element: <RequireSession/>` → child `<AppShell/>`.
- `test/render.tsx`: `renderApp` wires the same 401 handling (shared factory in `app/` so tests and app can't drift);
  `setMockUser` from mocks for persona.

## Acceptance criteria
- [ ] AUTH-1/AUTH-12/QG-3: with `setMockUser(null)`, opening `/c/prod-eu-1/ns/default/pods?x=1` lands on `/login`
      whose button `href` is `/api/auth/login?returnUrl=%2Fc%2Fprod-eu-1%2Fns%2Fdefault%2Fpods%3Fx%3D1`; no loop
      (login page makes no `me` call — assert with an MSW spy).
- [ ] AUTH-2 (client side): `sanitizeReturnUrl` unit tests with ≥ 6 malicious values (`https://evil`, `//evil`,
      `/\evil`, `\\evil`, `javascript:alert(1)`, `/%0d%0aSet-Cookie`, `/login?x`) → `/`; valid deep links kept.
- [ ] AUTH-11: after a successful page load, a later 401 (MSW override on any query) navigates to `/login` with
      `reason=session_ended` and the "Your session ended" alert; cached data is gone (`queryClient` empty).
- [ ] AUTH-6/7/10/14: each message row of the table renders from its query params (parametrized test); `username`
      is rendered as text (no HTML injection).
- [ ] AUTH-9: user menu shows display name, Admin and Read only labels for `ines`; only the name for `alice`.
- [ ] AUTH-10: "Log out" sends `POST /api/auth/logout` **with** `X-Console-Request: 1`, lands on
      `/login?loggedOut=1`, no automatic redirect into OAuth.
- [ ] Existing AppShell/router tests updated to the default mock user and green. TSDoc. Build, lint, tests green.

## Work log

## Review

## Handover notes
