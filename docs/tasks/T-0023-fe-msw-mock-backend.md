---
id: T-0023
title: MSW mock backend for the CP1 contract — fixtures, stateful in-memory db, typed handlers
status: todo
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0022]
paths: [web/src/mocks/, web/src/test/]
review_rounds: 0
---

## Goal
A contract-faithful mock of every CP1 endpoint so all frontend work and tests run without the backend (ADR-0016),
including the error paths the UI must handle (400 field errors, 403 read-only, 404, 409 conflicts). **Parallel group F2**
(with T-0024, T-0025).

## Scope
- In: `web/src/mocks/{fixtures/,db.ts,session.ts,problem.ts,handlers/}`, `web/src/test/{handlers.ts,server.ts,setup.ts}`.
- Out: browser worker / `dev:mock` (T-0042); any UI.

## Contract / design notes
- Typed with `openapi-msw`: `export const http = createOpenApiHttp<paths>({ baseUrl: '*' })` (check that `'*'` as
  base works with msw 3 path matching; otherwise use the page origin and keep tests origin-agnostic). Types from
  `@/shared/api` only.
- `problem.ts`: `problem(status, { code?, detail, title?, errors? })` → `HttpResponse.json(body, { status, headers:
  { 'Content-Type': 'application/problem+json' } })`, `traceId` filled.
- `session.ts`: `setMockUser(username: string | null)`, `getMockUser()`; default `'admin'`. `null` → every
  authenticated endpoint returns 401 `Auth.Unauthenticated`; non-admin on `/api/admin/**` → 403 `Auth.Forbidden`;
  read-only admin on admin commands (POST/PUT/DELETE, incl. test endpoints) → 403 `Auth.ReadOnly`.
- Non-GET without `X-Console-Request: 1` → 403 `Auth.CsrfHeaderMissing` (checked first, contract §1).
- `fixtures/`: users `admin` (admin via config `group fleetconsole-admins`, `isAdminByAssignment: false`), `carol`
  (admin by assignment only), `alice` (sre), `bob` (no groups, no
  grants), `ines` (admin, read-only), `pending-paul` (status pending), `dave` (deactivated); clusters `prod-eu-1`,
  `prod-us-1` (production), `staging-eu-1` (skipVerify TLS), `dev-1`, `dev-2` (disabled), `lab-1` (no credentials);
  credentials covering `ok`, `expiringSoon`, `expired`, `noExpiry`, `unknown` (opaque), with and without `lastTest`
  (one stale, one failed); grants incl. ones on the disabled cluster, the deactivated user and the expired
  credential (GRANT-5); one canned `ConnectionTestResult` passed, one failed at `reachability`
  (`tlsUnknownAuthority`), one failed at `authentication`, one with `namespaceRules`; ≥ 120 generated audit entries
  across all categories (deterministic, no `Math.random`). `alice` has grants on `prod-eu-1` (readOnly) and
  `staging-eu-1` (readWrite); `admin` has one grant (GRANT-6 demo).
- `db.ts`: in-memory copy of fixtures, `resetMockDb()`, `mockDb` for test assertions. Handlers derive list DTOs
  (counts, worst expiry, `lastTest` roll-up, `isStale`) from the db so lists stay consistent after mutations.
- `handlers/`: `auth.ts` (`me`, `logout` → clears mock user), `system.ts`, `clusters.ts` (`GET /api/clusters`:
  enabled + granted + active user, effective `accessMode`, sorted env then name), `users.ts`, `adminClusters.ts`,
  `credentials.ts` (incl. `test` → canned result by credential, stored as `lastTest`; `test-token` → result by token
  prefix: `bad-`/`tls-` → failures, else passed), `grants.ts` (single + bulk all-or-nothing with per-index field
  errors), `audit.ts` (all filters of §10, keyset cursor = opaque base64 of last id, `limit`).
- Rules enforced (each returns the contract code/message): version mismatch → 409 `Concurrency.Conflict`;
  `Users.UsernameTaken`, `Users.LastAdmin`, `Users.SelfChange`, `Users.AdminViaConfiguration`;
  `Clusters.NameTaken`, `Clusters.NotDisabled`; `Credentials.NameTaken`, `Credentials.InUse`;
  `Grants.AlreadyExists`; 404s for unknown route keys; a minimal subset of 400 field validation (required fields,
  name regexes, skipTls + caBundle, token whitespace) — enough to exercise `applyServerErrors`, not a full validator.
- Role changes follow contract §7.2 semantics / ADR-0017 (promote sets `isAdminByAssignment` even for config
  admins; no-op only when already assigned; demote refused while admin via configuration).
- Successful edits bump `version` and return the fresh representation (201/200/204 as per contract).
- `test/handlers.ts` re-exports the mock handlers (keep `systemInfoFixture` export for existing tests);
  `setup.ts` `afterEach`: `resetMockDb()`, `setMockUser('admin')`.

## Acceptance criteria
- [ ] Every contract route of T-0022's list has a handler; unhandled requests still fail tests.
- [ ] Handler tests (`web/src/mocks/*.test.ts`, via `apiClient`) cover: CSRF 403, 401 with no user, 403 for `alice`
      on admin, 403 `Auth.ReadOnly` for `ines` on a command, a 409 version conflict, bulk all-or-nothing with item
      errors keyed `items[i].…`, audit pagination (two pages, no duplicates) and two filters.
- [ ] Existing 51 tests stay green. TSDoc on exports. Build, lint and tests green (rule 4).

## Work log

## Review

## Handover notes
