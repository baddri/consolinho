---
id: T-0045
title: Frontend session follow-ups — ApiError as default query error type, test timeout in setup, shared login-path check
status: done
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0027]
paths: [web/src/app/, web/src/test/setup.ts, web/src/test/render.tsx, web/src/features/auth/, web/src/shared/api/]
review_rounds: 0
---

## Goal
Small cleanups from the T-0027 review (see its Review section).

## Scope
- Register `ApiError` as TanStack Query's default error type (`declare module '@tanstack/react-query' { interface Register { defaultError: ApiError } }`) and remove the casts/loose typings this makes unnecessary (e.g. `useLogout`).
- Move the Testing Library `configure({ asyncUtilTimeout: 3000 })` from `test/render.tsx` to `test/setup.ts`.
- One shared, case-insensitive login-path check used by `app/session.ts` and `features/auth/returnUrl.ts`.

## Acceptance criteria
- [x] Hooks see `error: ApiError | null` without casts; no behaviour change
- [x] Timeout configured once in setup
- [x] Single login-path predicate, tested (`/login`, `/LOGIN`, `/login/`)
- [x] Lint, typecheck, tests, build green

## Work log
- 2026-11-19 frontend-engineer: started.
- 2026-11-19 frontend-engineer: `Register.defaultError = ApiError` in `shared/api/queryRegister.ts` (+ compile-time
  test); dropped explicit generics in `useCurrentUser` and the typing comment in `useLogout`; moved
  `asyncUtilTimeout` to `test/setup.ts`; added `features/auth/loginPath.ts` (`isLoginPath`, exported from the feature)
  used by `app/session.ts` and `returnUrl.ts`; TSDoc note on pending-navigation `returnUrl` (review nit 3).
  lint/typecheck/test (320)/build green.

## Review
**2026-11-19 frontend-architect — round 1: APPROVE**

Checks (run by reviewer): lint, typecheck, test (27 files / 320 tests), build — all green.

- `Register.defaultError = ApiError` (`shared/api/queryRegister.ts`) is the idiomatic TanStack v5 mechanism. It is in
  the program via `tsconfig.app.json` `include: ["src"]`, and `queryRegister.test.ts` is typechecked by `tsc -b`, so
  the `expectTypeOf` assertions really guard it. The claim holds today: `unwrap`/`unwrapNoContent` only throw
  `ApiError` (aborts are rethrown, but TanStack treats them as cancellations, not errors), and all current
  `useQuery`/`useMutation` callers (`useCurrentUser`, `useLogout`, `useSystemInfo`) go through them. I recorded the
  rule in FRONTEND.md "Data fetching rules": a future client with another error shape (CP2 k8s client) must map to
  `ApiError` or widen the registered type in the same change.
- `isLoginPath` (`features/auth/loginPath.ts`): one case-insensitive rule, exported from the feature's public API,
  used by `app/session.ts` and `returnUrl.ts`; positive and negative cases tested (`//login`, `/c/prod/login`,
  `/loginx`). The guard becoming case-insensitive is the intended behaviour change.
- The timeout now lives in `test/setup.ts`, configured once, with the reason kept.
- `useCurrentUser`/`useLogout` lose their generics and comment with no runtime change. The pending-navigation TSDoc
  note (T-0027 nit 3) is accurate.

Nits (optional):
1. `web/src/shared/api/queryRegister.ts` is not referenced from anywhere. A one-line comment in
   `shared/api/index.ts` ("module augmentation: see queryRegister.ts") would make it findable from the public entry point.

## Handover notes
**Done:** all criteria.
- `web/src/shared/api/queryRegister.ts` holds the module augmentation. It is picked up through `tsconfig.app.json`
  `include: ["src"]`; it has no runtime code and is intentionally not imported anywhere. `queryRegister.test.ts`
  asserts with `expectTypeOf` that `DefaultError`, `useQuery`'s and `useMutation`'s `error` are `ApiError(| null)`
  (enforced by `npm run typecheck`).
- `isLoginPath` (`web/src/features/auth/loginPath.ts`) is the single rule: `/^\/login(?:[/?#]|$)/i`, so it accepts
  pathnames and paths with query/hash. Behaviour change in the 401 guard: it is now case-insensitive (`/LOGIN` is
  treated as the login page), as the review asked. Tested: `/login`, `/LOGIN`, `/login/`, query/hash, negatives
  (`/loginx`, `/c/prod/login`, `//login`, ...).
- No other casts existed in this task's paths. T-0028's admin code (not touched) can now drop any explicit
  `ApiError` generics; typecheck passes with it as is.
- Note: the default error type is a compile-time promise. Any query function that does not go through
  `unwrap`/`unwrapNoContent` must still throw `ApiError` only.
