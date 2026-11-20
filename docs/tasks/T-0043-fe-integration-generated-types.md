---
id: T-0043
title: FE/BE integration — regenerate schema.gen.ts from the real Api, remove contract types, fix drift, run the CP1 demo
status: done
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
- [x] `schema.contract.ts` and the merge type are gone; no hand-written API types remain (QG-4, grep for
      `schema.contract`).
- [x] `schema.gen.ts` regenerated from the Api with all CP1 endpoints; typecheck, lint, tests, build green.
- [x] Every contract deviation found is listed (field, expected, actual, resolution).
- [x] Demo steps above pass against `aspire run`; any failure is filed as a bug task.
- [x] HANDOVER-relevant gotchas recorded in Handover notes. Build, lint and tests green (rule 4).

## Work log
- 2026-11-20 frontend-engineer: in_progress. `aspire start` + `npm run gen:api` → **no diff** in `schema.gen.ts`. Deleted
  `schema.contract.ts`, `PreferGenerated` (`schema.ts` = `Gen.paths` / `Gen.components['schemas']`), its eslint ignore;
  rewrote `schema.test.ts` type block. Only fallout was that test: features/mocks/fixtures already type-checked against
  generated types. Comments in `client.ts`, `mocks/handlers/http.ts`, `types.ts` updated.
- Friction points checked: nullable enum refs `failedStep`/`headline` = `X | null` (ConnectionTestSummary);
  `version` = `number`; `details` = `JsonElement` = `unknown`; ProblemDetails `code`/`traceId` **are** generated
  (`string | undefined`; `ApiError` parsing stays defensive); `CreateUserRequest.role`, `CreateGrantRequest.accessMode`
  optional (defaults) — UI always sends them, fine; 201/204 status codes typecheck.
- Demo (curl vs web :34701 + DevOAuth :5190, cookie jar per user): admin login OK → register cluster `.invalid` URL
  201 → add fake JWT 201 → rotate 200 (`jwt`, SA `fleet-demo/fake-viewer`, expiry `ok`) → stored test 200
  `succeeded:false`, reachability `failed/dnsFailure`, rest `skipped`, lastTest stored → grant alice readOnly 201 →
  alice `GET /api/clusters` = cluster with `accessMode:readOnly`; alice `/api/admin/*` 403 → bob `[]` → audit
  (cluster filter) lists registered/added/rotated/tested/grant.created + auth.login/logout entries → logout 204, `/me`
  401. No CSRF header: POST clusters 403 `Auth.CsrfHeaderMissing`, logout 403. Login returnUrl deep link →
  302 to `/c/<name>/projects?q=1`; absolute returnUrl → `/`. No failures, no bug tasks filed.
- Checks: `check-fe.sh` green (504 tests), `check-be.sh` green. → in_review.

## Review
- 2026-11-20 frontend-architect, round 1: **APPROVE**. QG-4 holds: `schema.contract`/`PreferGenerated` only in ADR-0016
  history; `types.ts` = 55 pure `schemas[...]` aliases; `schema.test.ts` pins `paths`/`schemas` to `Gen` plus the
  relied-on shapes. Deviation list complete; optional `role`/`accessMode` fine (UI always sends both). check-fe green
  (46/504); typecheck, `vitest src/shared/api` (34), eslint clean.
- Architect doc edits: ADR-0016 status line "temporary part closed by T-0043"; FRONTEND.md tree lines 23/37 no longer
  say "merged"/"contract types".
- Nit (optional): `web/src/mocks/handlers/http.ts:9` — rewrapped comment line ~200 chars (prettier doesn't wrap
  comments) — rewrap at 110.

## Handover notes
- QG-4: API types come only from `schema.gen.ts`; `schema.ts` is a thin re-export. After a backend contract change run
  `npm run gen:api` and fix the type errors — there is no fallback any more.
- Deviation list (all resolved/accepted earlier, none new): enum components never nullable (T-0047); audit `category`
  typed `AuditCategory` (T-0048); create grant is `POST /api/admin/grants` (contract table was wrong); credential expiry
  value `ok` not `valid`; TestCredential may 409 (T-0050); missing `environment` → framework 400 without `errors`;
  ProblemDetails `code`/`traceId` present in the generated type (task expected absent — better than planned).
- Gotcha for demos: a fake JWT's signature segment must be canonical base64url (zero trailing bits), else the Api
  stores it as `opaque` — correct behaviour, generate it with `base64 | tr '+/' '-_' | tr -d '='`.
- The dev Postgres keeps state across runs: the demo left cluster `demo-t0043-081142` + an alice grant in it.
- **For QA/human (browser):** AUTH-2 deep link survives login (server side verified via curl), AUTH-10 logout page,
  bob sees "No clusters assigned yet", switcher shows "Read only" for alice.
