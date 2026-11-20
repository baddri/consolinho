---
id: T-0023
title: MSW mock backend for the CP1 contract — fixtures, stateful in-memory db, typed handlers
status: done
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0022]
paths: [web/src/mocks/, web/src/test/]
review_rounds: 2
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
- [x] Every contract route of T-0022's list has a handler; unhandled requests still fail tests.
- [x] Handler tests (`web/src/mocks/*.test.ts`, via `apiClient`) cover: CSRF 403, 401 with no user, 403 for `alice`
      on admin, 403 `Auth.ReadOnly` for `ines` on a command, a 409 version conflict, bulk all-or-nothing with item
      errors keyed `items[i].…`, audit pagination (two pages, no duplicates) and two filters.
- [x] Existing 51 tests stay green. TSDoc on exports. Build, lint and tests green (rule 4).

## Work log
- 2026-11-19 frontend-engineer: started; read CLAUDE.md, FRONTEND.md, ADR-0016/0017, CP1 contract (incl. amendments, §7.2), T-0022 review notes (handlers keyed by path only).
- 2026-11-19 frontend-engineer: implemented.
  - `src/mocks/`: `fixtures/` (users, clusters, credentials, grants, canned connection tests, 132 generated audit
    entries, system info; storage record types in `fixtures/types.ts`), `db.ts` (store, `resetMockDb`, lookups,
    `recordAudit`), `session.ts`, `problem.ts`, `handlers/` (one file per contract section plus `http.ts` access
    guard, `body.ts` field validation, `representations.ts` DTO derivation), `index.ts` public API.
  - Handlers are keyed by path through `createOpenApiHttp<paths>({ baseUrl: '*' })` (verified: openapi-msw just
    prefixes the base, so `*/api/...` matches like the existing tests' handlers). No `operations[...]` anywhere.
  - Found during testing: MSW treats a request as handled once any handler *matched* it, even if that handler
    returned nothing. The central access guard (`http.untyped.all('*/api/*')`, falls through when allowed) would
    therefore have sent unknown `/api` routes to the real network instead of failing. Added a terminal catch-all
    `unhandledApiRoute` that logs and answers `HttpResponse.error()` (a thrown error becomes a 500 in msw 3, which an
    error-state test could mistake for a real response). Covered by a test.
  - `test/handlers.ts` re-exports the whole `@/mocks` API (colocated tests may only import from `test/`);
    `test/setup.ts` resets db and persona after each test; new `test/apiError.ts` (`expectApiError`).
  - 42 handler tests in `src/mocks/*.test.ts` (access, users, grants + switcher, clusters + credentials, audit).
  - Checks: lint ✓, typecheck ✓, tests 128/128 ✓ (15 files), build ✓ (main chunk unchanged at 658.89 kB, mocks
    are not in the production bundle).
- 2026-11-19 frontend-engineer: review round 1 fixes (contract amended at 9701141).
  - Required 1: `handlers/body.ts` rewritten around `bindBody(request, bind)` + `BodyBinder`. Binding failures (malformed
    JSON, a property present with the wrong JSON type, quoted/fractional/negative `version`, unknown enum value or
    `null` for a value type, `items` not an array, a non-object bulk item) throw internally and answer
    `malformedBodyProblem()` (400 without `code`). Absent/blank required values and rule violations stay
    `Validation.Failed`. All JSON-body routes use it; `bindVersion` serves every version-only transition (replaces
    `readVersioned`/`loadForTransition`; `loadUser`/`loadCluster` do 404 + 409). Test: `binding.test.ts` (8 binding
    cases expecting 400 with no `code`/`errors`, plus required-value cases still `Validation.Failed`).
  - Required 2: `isLastWritableAdmin` counts admins with `status !== 'deactivated'` (pending included), TSDoc
    updated. Test: pre-create a pending admin, then the last active writable admin can make herself read-only.
  - Ruling: test that a read-only admin with an invalid body gets `Auth.ReadOnly` and no field errors.
  - Optional nits done: shared `actorName()` in `db.ts`; test-token and bulk now validate the body before the route
    404 (bulk's "already has access" check uses the route username; grant update checks the credential against the
    grant's cluster during validation); one version-only transition helper.
  - Checks: lint ✓, typecheck ✓, tests 182/182 ✓ (18 files; includes T-0024's in-progress tests), build ✓.

## Review

### Round 1 — 2026-11-19 frontend-architect: CHANGES_REQUESTED

Checks (run by the reviewer): `npm run lint` ✓, `npm run typecheck` ✓, `npm test -- --run` ✓ (15 files, 128 tests),
`npm run build` ✓. Bundle check: `dist/assets/*.js` contains no mock strings (`No mock handler`, `pending-paul`,
`fleetconsole-admins`, `openapi-msw`, `HttpResponse`, `Auth.CsrfHeaderMissing`), and nothing outside `src/mocks` and
`src/test` imports `@/mocks`. msw and openapi-msw are devDependencies, and the boundaries lint rule limits `mocks` to `shared`.

Overall the work is strong. The codes, details and statuses match contract §2 and the backend's `AuthErrors` and
`CsrfHeaderMiddleware.MissingHeader` exactly. ADR-0017 promote and demote are right: promote records the assignment for
config admins and is a no-op only when already assigned; demote checks AdminViaConfiguration, then SelfChange, then
LastAdmin, and is a no-op for users. Derived fields are computed per request in `representations.ts`. The
`unhandledApiRoute` approach is sound, documented and tested (details under "Assessed, no change"). Two fidelity
issues must be fixed:

**Required**
1. `web/src/mocks/handlers/body.ts:33-85` (`requiredString`, `optionalString`, `booleanField`, `enumField`,
   `versionField`), plus `grants.ts:112` and `grants.ts:225`. Problem: a wrong JSON type (number or bool where a
   string is expected, a quoted number such as `"version": "3"`, an unknown enum value, a non-object bulk item, or
   `items` that is not an array) returns `Validation.Failed` with field errors. Contract §1 says these are framework
   400s *without* `code` ("malformed JSON, unknown enum, quoted number"). The backend does the same:
   `JsonNumberHandling.Strict` plus `JsonStringEnumConverter(allowIntegerValues: false)` raise a
   `BadHttpRequestException`, and `GlobalExceptionHandler` turns it into a code-less 400. The contract covers this
   case, so the handover note "the contract leaves it open" is wrong. Required fix: when a property is **present with
   the wrong JSON type**, or an enum value is not in the allowed set, answer `malformedBodyProblem()`. For example,
   let the helpers return a sentinel or throw a small `MalformedBody` error that each route catches once. Keep
   `Validation.Failed` for absent or blank required values and for rule violations (regex, length, mutual
   exclusion). Add one test with a quoted `version` or an unknown `accessMode` that expects 400 with no `code`.
   Correct the handover note.
2. `web/src/mocks/handlers/users.ts:43`. Problem: ADM-5 counts only `status === 'active'` admins. The domain
   (`User.IsActiveWritableAdmin` = admin and not deactivated and not read-only) also counts **pending** admins.
   Example: create a pending admin, then make yourself read-only. The real backend allows it; the mock returns
   `Users.LastAdmin`. Required fix: filter with `u.status !== 'deactivated'` and update the TSDoc. Add a test:
   pre-create an admin, then setting the actor read-only succeeds.

**Assessed, no change required**
- **Access order** (`http.ts`): CSRF, then 401, then Forbidden, then ReadOnly. This matches contract §1/§2 and
  T-0011 for valid requests. One known difference: the backend runs `ValidationBehavior` *before*
  `ReadOnlyGuardBehavior`, so a read-only admin who sends an invalid body gets 400 from the API but 403 from the mock.
  Raised as a contract decision (see the report). The mock keeps its order unless the orchestrator rules otherwise.
- **`unhandledApiRoute`**: it is needed because the fall-through guard marks every `/api` request as handled. It
  matches the `onUnhandledFrame: 'error'` behaviour (logs, and the fetch rejects instead of returning a fake 500).
  In the T-0042 browser worker it also beats a pass-through to Vite's HTML 404. It is fine as is.
- **Rotate clears `lastTest`**: matches `Credential.Rotate` in the domain. **Read-only has no SelfChange check**:
  matches `User.SetReadOnly`.
- **Audit `user` filter also matches grant targets**: this is a product improvement over the contract text (actor
  or target user). It is acceptable in the mock and is raised as a contract amendment.
- **Size and structure**: one handler file per contract section, every file ≤ 361 lines, fixtures typed and
  deterministic, and all access goes through `@/test/handlers`. Ready for page tests and for T-0042.

**Optional nits**
- `currentMockUser()?.username ?? 'unknown'` appears 9 times, and as `actorName` in `grants.ts:36` and
  `credentials.ts:155`. Export one `actorName()` from `db.ts`.
- Check order is inconsistent. `credentials.ts:327` (test-token) and `grants.ts:220` (bulk) resolve the route key
  (404) before body validation; every other handler validates first, as the backend pipeline does
  (validation behavior, then handler). Align them.
- `users.ts` `readVersioned` and `adminClusters.ts` `loadForTransition` do almost the same thing. They could share one
  helper in `body.ts`.

### Round 2 — 2026-11-19 frontend-architect: APPROVE

Checks (run by the reviewer): `npm run lint` ✓, `npm run typecheck` ✓, `npm test -- --run` ✓ (18 files, 182 tests),
`npm run build` ✓. The bundle check is still clean: no mock strings in `dist/assets/*.js`; the main chunk grew to
667.67 kB, which comes from T-0024's `shared/ui`, not from the mocks.

- Required 1 is fixed. In `handlers/body.ts`, `BodyBinder` throws `MalformedBodyError` for a present property with
  the wrong JSON type, a quoted, fractional or out-of-range `version`, an unknown enum value, `null` for a value
  type, `items` that is not an array, or a non-object item; `bindBody` turns it into the code-less 400. Absent or
  blank values and rule violations stay `Validation.Failed`. This matches contract §1 and the backend's strict JSON
  options. `binding.test.ts` covers eight binding cases plus the validation cases.
- Required 2 is fixed. `handlers/users.ts:33-35` now counts admins that are not deactivated and not read-only,
  matching `User.IsActiveWritableAdmin` and the amended §7.2. A test with a pending admin covers it.
- The mock follows the contract amendments at 9701141: ReadOnly is checked before validation (test: a read-only
  admin with an invalid body gets `Auth.ReadOnly` and no `errors`), the audit `user` filter includes grant targets,
  and rotate clears `lastTest`. The backend side of the check order is tracked in T-0044.
- The optional cleanups are done: one shared `actorName()` in `db.ts`; test-token and bulk validate before their
  404s; `bindVersion` handles the version-only transitions. Handlers stay small (≤ 340 lines), and the handover
  notes are accurate.
- I accept the remaining difference as documented in the handover notes. For a read-only admin with a malformed or
  wrong-typed body, the API returns the code-less 400 from model binding and the mock returns 403 `Auth.ReadOnly`.
  The typed `apiClient` can't send such bodies, and both answers are errors the UI shows the same way, so no UI test
  depends on which one wins. Copying model binding into the guard would add complexity for no test value.

No open findings.

## Handover notes
- **Using it in tests:** import from `@/test/handlers` (`mockDb`, `setMockUser`, `credentialIds`, `grantIds`,
  fixtures, `connectionTest*`, `AUDIT_FIXTURE_COUNT`, `systemInfoFixture`). Personas: `admin` (config admin, one
  grant on dev-1), `carol` (admin by assignment), `alice` (prod-eu-1 readOnly, staging-eu-1 readWrite), `bob` (no
  grants), `ines` (read-only admin), `pending-paul`, `dave` (deactivated: behaves like an ended session, 401).
  `setMockUser(null)` = signed out. Error cases not reachable through data: `server.use(...)` overrides win over
  the mock (they bypass the access guard too). `expectApiError(promise)` from `@/test/apiError`.
- **Pipeline order** (`handlers/http.ts`): CSRF (any non-GET, also logout) → 401 → `/api/admin/**` non-admin 403
  `Auth.Forbidden` → non-GET admin by read-only user 403 `Auth.ReadOnly`. Then the route handler: body 400 → route
  404 → version 409 → domain 409s. `accessGuard` must stay first and `unhandledApiRoute` last in `handlers/index.ts`.
  Any future `/api/...` mock (k8s proxy in CP2) must be added to `handlers` or overridden, otherwise it fails as
  unhandled (logged `[mocks] No mock handler for …`, fetch rejects).
- **Derived fields** are computed per request in `handlers/representations.ts` from the stored records (role, grant
  counts, worst expiry, tls mode, CA certificates, last-test roll-up, `isStale`), so lists stay consistent after
  mutations. Expiry statuses use the real clock; fixture timestamps are relative to module load
  (`fixtures/time.ts`), so they stay meaningful in long dev sessions. Successful changes bump `version` and write an
  audit entry (`recordAudit`); idempotent transitions do neither.
- **Connection tests:** `…/test` returns the credential's canned scenario (`testScenario` on the record:
  view/edit/admin pass, prod-us-1 fleet-view fails at authentication, dev-1 fleet-edit at reachability/TLS),
  stores it as `lastTest`, adds namespace rules when `inspectNamespace` is given, and computes the TEST-4 hints
  from grants. `test-token`: `bad-…` → authentication failure, `tls-…` → TLS failure, else pass. New credentials
  get their scenario from the same prefixes. JWTs are decoded (`sub`/`iat`/`exp`, no signature), anything else is
  opaque.
- **Binding vs validation** (contract §1): wrong JSON types, quoted numbers, unknown enum values, `null` for value
  types, `items` not an array or non-object items give a 400 **without** `code` (as ASP.NET model binding does);
  absent/blank required values and rule violations give `Validation.Failed` with `errors`. New JSON-body routes
  must use `bindBody` (`handlers/body.ts`); body validation (including checks against the store) runs before route
  404s, as the Api's validators run before handlers.
- **Contract-backed behaviours** (amended at 9701141): rotate clears `lastTest` (§8.4); setting read-only has no
  `Users.SelfChange` check and `Users.LastAdmin` counts every non-deactivated, writable admin, pending ones included
  (§7.2); the audit `user` filter matches actor, target user and grant targets `"<user> → …"` (§10).
- **Known remaining difference:** the guard answers `Auth.ReadOnly` before the body is read. The Api binds the body
  first, so a read-only admin who sends a *malformed/wrong-typed* body gets the code-less 400 from the Api but 403
  from the mock. Invalid-but-well-typed bodies match (§7: `Auth.ReadOnly`, never field errors). UI code never sends
  wrong JSON types, so this was left as is.
- **For T-0042 (browser worker):** `handlers` from `@/mocks` is ready for `setupWorker`; `setMockUser` can be
  driven from `VITE_MOCK_USER`. `fixtures/time.ts` and `problem.ts` hold module state (clock, trace counter) — fine
  in the browser.
- **Not in scope / follow-ups:** none required. The shared `CSRF_HEADER` import makes `src/mocks` load
  `shared/api/client.ts` (reads `globalThis.location.origin`), which is fine in jsdom and the browser.
