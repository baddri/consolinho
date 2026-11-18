---
id: T-0043
title: FE/BE integration — regenerate schema.gen.ts from the real Api, remove contract types, fix drift, run the CP1 demo
status: todo
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0015, T-0016, T-0017, T-0018, T-0019, T-0020, T-0021, T-0022, T-0023, T-0024, T-0025, T-0026, T-0027, T-0028, T-0029, T-0030, T-0031, T-0032, T-0033, T-0034, T-0035, T-0036, T-0037, T-0038, T-0039, T-0040, T-0041, T-0042]
paths: [web/src/shared/api/, web/src/mocks/, web/src/features/, web/src/app/, web/src/test/]
review_rounds: 0
---

## Goal
Close ADR-0016's temporary part and satisfy QG-4: the SPA's API types come only from the running Api's OpenAPI
document, every drift between contract, backend and UI is fixed, and the spec's demo runs against the real backend
with the DevOAuth emulator. **Parallel group F10** (last FE task of CP1; precedes QA VERIFY).

## Scope
- In: `npm run gen:api` against the Api (all CP1 endpoints), delete `schema.contract.ts` and `PreferGenerated`
  (`schema.ts` re-exports generated `paths`/`schemas`), fix type errors in features/mocks/fixtures, verify runtime
  behaviour end-to-end.
- Out: backend changes. If the Api deviates from the contract, **do not** adapt the UI silently: record each deviation
  in the work log and NOTES; the orchestrator decides (backend fix task vs. accepted contract change).

## Contract / design notes
- Start the backend: `aspire start --launch-profile http && aspire wait web`; `cd web && npm run gen:api`.
- Expected friction to check explicitly: nullable enum refs (`failedStep`, `headline`) shape; `version` integer
  format; `details` (`JsonElement?`) type → keep `unknown` at the alias; ProblemDetails extensions (`code`,
  `traceId`) absent from the generated type — `ApiError` parsing stays defensive; request records with defaults
  (`CreateUserRequest.role`, `CreateGrantRequest.accessMode`) may become optional; operation status codes (201/204).
- After removal, `openapi-msw` handlers type-check against the real schema — fixtures that no longer fit are drift.
- Demo (spec §1) against the real backend via the browser, results in the work log: log in as `admin` (DevOAuth) →
  register a cluster (fake/unreachable API URL is fine) → add a token → test connection (expect a categorized
  failure) → grant `alice` ReadOnly → log in as `alice` → switcher shows the cluster with "Read only" → log in as
  `bob` → "No clusters assigned yet" → audit log shows all of it. Also: deep link survives login (AUTH-2), logout
  page (AUTH-10), CSRF header present on every mutation (browser devtools / Api logs).

## Acceptance criteria
- [ ] `schema.contract.ts` and the merge type are gone; no hand-written API types remain (QG-4, grep for
      `schema.contract`).
- [ ] `schema.gen.ts` regenerated from the Api with all CP1 endpoints; typecheck, lint, tests, build green.
- [ ] Every contract deviation found is listed (field, expected, actual, resolution).
- [ ] Demo steps above pass against `aspire run`; any failure is filed as a bug task.
- [ ] HANDOVER-relevant gotchas recorded in Handover notes. Build, lint and tests green (rule 4).

## Work log

## Review

## Handover notes
