---
id: T-0045
title: Frontend session follow-ups — ApiError as default query error type, test timeout in setup, shared login-path check
status: todo
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
- [ ] Hooks see `error: ApiError | null` without casts; no behaviour change
- [ ] Timeout configured once in setup
- [ ] Single login-path predicate, tested (`/login`, `/LOGIN`, `/login/`)
- [ ] Lint, typecheck, tests, build green

## Work log

## Review

## Handover notes
