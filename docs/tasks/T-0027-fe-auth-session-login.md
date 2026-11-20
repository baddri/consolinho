---
id: T-0027
title: SPA session — login page, session guard, global 401 handling, user menu, logout
status: done
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
- [x] AUTH-1/AUTH-12/QG-3: with `setMockUser(null)`, opening `/c/prod-eu-1/ns/default/pods?x=1` lands on `/login`
      whose button `href` is `/api/auth/login?returnUrl=%2Fc%2Fprod-eu-1%2Fns%2Fdefault%2Fpods%3Fx%3D1`; no loop
      (login page makes no `me` call — assert with an MSW spy).
- [x] AUTH-2 (client side): `sanitizeReturnUrl` unit tests with ≥ 6 malicious values (`https://evil`, `//evil`,
      `/\evil`, `\\evil`, `javascript:alert(1)`, `/%0d%0aSet-Cookie`, `/login?x`) → `/`; valid deep links kept.
- [x] AUTH-11: after a successful page load, a later 401 (MSW override on any query) navigates to `/login` with
      `reason=session_ended` and the "Your session ended" alert; cached data is gone (`queryClient` empty).
- [x] AUTH-6/7/10/14: each message row of the table renders from its query params (parametrized test); `username`
      is rendered as text (no HTML injection).
- [x] AUTH-9: user menu shows display name, Admin and Read only labels for `ines`; only the name for `alice`.
- [x] AUTH-10: "Log out" sends `POST /api/auth/logout` **with** `X-Console-Request: 1`, lands on
      `/login?loggedOut=1`, no automatic redirect into OAuth.
- [x] Existing AppShell/router tests updated to the default mock user and green. TSDoc. Build, lint, tests green.

## Work log
- 2026-11-19 frontend-engineer: started; read ADR-0007/0014, contract §4–5, spec AUTH-*.
- 2026-11-19 frontend-engineer: implemented feature `auth` (useCurrentUser, RequireSession, LoginPage + loginMessage,
  sanitizeReturnUrl/buildLoginUrl, UserMenu, useLogout, clearSessionCache), `app/queryClient.ts` (401 hook, no 4xx
  retries), `app/session.ts` (handleUnauthenticated + createAppRuntime shared by App and test helpers), router wiring,
  masthead; deleted `app/layout/UserMenu.tsx`. Tests: returnUrl (28 cases), queryClient, session (AUTH-1/11/12, loop
  guard), LoginPage message table + HTML injection, UserMenu personas + logout. lint/typecheck/test (281)/build green;
  suite also green under concurrent-load reruns.

## Review
**2026-11-19 frontend-architect — round 1: APPROVE**

Checks (run by reviewer): `npm run lint`, `typecheck`, `test -- --run` (24 files / 281 tests), `build` all green;
full test suite run twice: 281/281 both times, no flakes. Bundle 683 kB (existing code-splitting follow-up).

Security:
- returnUrl (AUTH-2): `returnUrl.ts:24-48` checks the raw **and** percent-decoded value (single leading `/`, no `//`,
  no `\`, no C0/DEL, never `/login…` case-insensitive; malformed `%` rejected). Covered: `//evil`, `///evil`,
  `/\evil`, `\\evil`, `/%5Cevil`, `/%2F%2Fevil`, `/%0d%0a…`, `javascript:`, `https://`, `/login` variants. Also
  reasoned through `/%09/evil` (browsers strip tabs → `//evil`; rejected as control char) and double-encoded
  `/%252F%252Fevil` (stays a literal local path in `Location`, not a redirect). Stricter than the Api is fine.
- 401 → once: single `QueryCache`/`MutationCache` `onError` hook; loop guard covers current location **and** a pending
  navigation to `/login`; 4xx never retried. Tested (two simultaneous calls → one `navigate`; login page makes no `me`
  call; 401 on `/login` ignored).
- Cache: after logout and session end the cache is exactly `[['api','system','info']]` and mutations are empty
  (asserted in `UserMenu.test.tsx` and `session.test.tsx`).
- CSRF: logout goes through `apiClient`; test asserts `X-Console-Request: 1`.
- Login codes match contract §4.2 (`not_registered`/`deactivated`/`cancelled`/`unavailable`/`failed`, unknown →
  failed); `username` rendered as React text (injection test present).

Rulings:
- **`clearSessionCache` deviation: accepted.** The reasoning holds (`clear()` orphans observers of the mounted login
  page; clearing before commit lets the guarded tree refetch). ADR-0014 amended (Amendment 2026-11-19) with the
  invariant it depends on: nothing outside `RequireSession` may observe user/cluster data. FRONTEND.md "Session and
  permissions" updated.
- **3 s async timeout:** yes, it belongs in `test/setup.ts` (global test config, not an import side effect of a helper).
  Non-blocking; see nit 1.
- **`useLogout` error typing:** accepted as is for this task. The idiomatic fix is app-wide: TanStack v5
  `declare module '@tanstack/react-query' { interface Register { defaultError: ApiError } }` in `shared/api`, which
  types every query/mutation error without per-hook generics. Follow-up task (also lets `useCurrentUser` drop its
  explicit generics).
- **No logo:** accepted. Text title/footer is enough for CP1; brand asset waits for the product-name confirmation
  (CP3 follow-up).
- **User-menu accessible name with badges:** accepted. The name equals the visible text (WCAG 2.5.3 "label in name"),
  and screen-reader users learn role/read-only state the same way sighted users do. Don't add an `aria-label` that
  would drop the badges.

Nits (optional):
1. `web/src/test/render.tsx:191` — `configure({ asyncUtilTimeout: 3000 })` is a module side effect; move it to
   `web/src/test/setup.ts` (one-line move; may be done at commit time).
2. `web/src/app/session.ts:10-12` — `isLoginPath` is case-sensitive while React Router matches `/LOGIN` to the login
   route and `returnUrl.ts` treats it case-insensitively. Not a loop (the login page has no authenticated queries),
   but reuse one predicate (e.g. export a `isLoginPath` from `features/auth`) to keep the rule in one place.
3. `web/src/app/session.ts:31` — while a navigation is pending to another guarded page, `returnUrl` is the current
   location, not the target. Acceptable; mention it in the TSDoc if you touch the file.

Follow-ups for the orchestrator: (a) `Register.defaultError = ApiError` (FE, small); (b) commit history: 6c2262f
deletes `app/layout/UserMenu.tsx` without the masthead change, so it does not build on its own; this task's commit
completes it — do not rewrite history, just note it in the commit message.

## Handover notes
**Done:** all acceptance criteria; public API in `web/src/features/auth/index.ts` as specified, plus
`clearSessionCache`. `renderApp`/`renderWithProviders` now return `queryClient` and use `createAppRuntime` (same 401
wiring as the app) and `RouterProvider` from `react-router/dom` (as the app does).

**Deviations (please review):**
- **`clearSessionCache` instead of `queryClient.clear()`** (ADR-0014 §2/§5). Without it there were two races:
  (1) RR commits route changes in a transition, so clearing after `navigate()` resolved still left `RequireSession`
  mounted, and it refetched `me` (a second `me` call, which failed the AUTH-1 "no loop" spy); (2) with
  `flushSync: true` the login page is already mounted, so `clear()` discarded its in-flight `system/info` query and the
  footer never loaded. Fix: navigate with `flushSync: true`, then remove every query **without observers** (the whole
  unmounted guarded tree) and clear the mutation cache. Only queries the login page observes survive (today just the
  anonymous `system/info`). Tests assert the remaining cache is exactly `[['api','system','info']]`. Suggest an ADR-0014
  amendment note.
- `useCurrentUser` sets no `retry` itself. The 401/4xx no-retry rule is the QueryClient default
  (`retryTransientFailures`: 4xx never retried, network/5xx retried once).
- `useLogout` relies on inferred mutation types (error typed `Error`, always an `ApiError` at runtime). `void` as a
  generic type argument trips `no-invalid-void-type`.
- No brand logo asset exists, so `LoginPage` has no brand image. "FleetConsole" appears in the title, footer text and
  version line.
- User-menu toggle has no `aria-label`. Its accessible name is its content (e.g. "Ines Auditor Admin Read only") so
  screen readers hear the badges. AppShell test updated accordingly.
- `test/render.tsx` sets `configure({ asyncUtilTimeout: 3000 })`. The extra `me` round trip made the first full-app
  render of a file occasionally exceed 1 s under load (`router.test` flaked about 1 in 15 runs, 3 of 3 under
  concurrent load; 0 after the change). Belongs in `test/setup.ts` (outside this task's paths); move it there if
  preferred.

**Gotchas:**
- With the real backend before T-0015 lands, `GET /api/auth/me` does not exist, so the guard shows "Could not load
  your session". Use the mock backend (T-0042) until then.
- PF alert headings have the accessible name `"<Variant> alert:<title>"` with no space.
- Commit hygiene: an early `git rm web/src/app/layout/UserMenu.tsx` staged the deletion, which ended up inside the
  T-0025 commit 6c2262f, while `AppMasthead.tsx` there still imports it. That commit does not build on its own; this
  task's diff completes the change.
