---
id: T-0022
title: FE API foundations — contract types, ApiError/unwrap, new dependencies, DOM lint gap
status: done
owner: frontend-engineer
checkpoint: 1
depends_on: []
paths: [web/package.json, web/package-lock.json, web/eslint.config.js, web/src/shared/api/ (NOT schema.gen.ts), web/src/app/layout/SystemInfoFooter.tsx]
review_rounds: 0
---

## Goal
Give every CP1 frontend task typed access to the whole CP1 contract **before** the backend endpoints exist
(ADR-0016), one error type for all API failures (ADR-0015), the libraries the forms and mocks need, and close the CP0
lint gap for DOM access. **Parallel group F1** (with T-0026).

## Scope
- In: `schema.contract.ts`, `schema.ts` (merge), `types.ts` (aliases), `errors.ts`, typed `apiClient`, deps, lint.
- Out: MSW handlers (T-0023), QueryClient 401 handling (T-0027), any UI.

## Contract / design notes
**Dependencies** (exact versions, `npm install -E`): `react-hook-form@7.92.0`, `zod@4.6.7`,
`@hookform/resolvers@7.0.7`; dev: `openapi-msw@2.1.1` (peer `msw ^3`). Check `npm audit` for new advisories.

**`web/src/shared/api/schema.contract.ts`** — hand-written transcription of `docs/specs/CP1-api-contract.md` §3–§10
in **openapi-typescript output format** (copy the shape of `/api/system/info` in `schema.gen.ts`): `export interface
paths`, `export interface components { schemas: {...} }`, operations inline or in `operations`. Header comment:
"Provisional (ADR-0016). Deleted by T-0043. Do not import directly — use `./schema` / `./types`."
- Every route of contract §4.3, §4.4, §6, §7.2, §8.2, §8.4, §9.2, §10 (not `/api/auth/login`/`callback`: full-page
  navigations). Path params `{username}`, `{name}`, `{credentialId}`, `{grantId}`; audit query params typed.
- Schema names = C# record minus `Dto`: `CurrentUser`, `AccessibleCluster`, `UserListItem`, `UserDetail`,
  `ClusterListItem`, `ClusterDetail`, `CaCertificate`, `Credential`, `ConnectionTestSummary`, `ConnectionTestResult`,
  `ConnectionTestStepResult`, `ClusterIdentity`, `OpenShiftVersion`, `CapabilitySummary`, `CapabilityCheckResult`,
  `NamespaceRules`, `ResourceRule`, `ConnectionTestHint`, `Grant`, `AuditPage`, `AuditEntry`; requests
  `CreateUserRequest`, `ChangeUserRoleRequest`, `SetUserReadOnlyRequest`, `VersionRequest`, `RegisterClusterRequest`,
  `UpdateClusterRequest`, `AddCredentialRequest`, `RotateCredentialTokenRequest`, `TestCredentialRequest`,
  `TestTokenRequest`, `CreateGrantRequest`, `UpdateGrantRequest`, `BulkGrantRequest`, `BulkGrantItem`; enums of §3 as
  string-union schemas with the C# enum name (`UserRole`, `AccessMode`, `CredentialExpiryStatus`, …).
- Nullable fields as `null | T` (present, not optional), like the generated file. `version: number`. `details` of
  `AuditEntry`: `unknown`. Error responses `application/problem+json` → `ProblemDetails`/`HttpValidationProblemDetails`.
- Status codes per contract (201 for creates, 204 for deletes/logout).

**`schema.ts`**
```ts
import type * as Gen from './schema.gen';
import type * as Contract from './schema.contract';
/** Takes each key from G when present, else from C (ADR-0016). */
type PreferGenerated<G, C> = { [K in keyof G | keyof C]: K extends keyof G ? G[K] : K extends keyof C ? C[K] : never };
export type paths = PreferGenerated<Gen.paths, Contract.paths>;
export type schemas = PreferGenerated<Gen.components['schemas'], Contract.components['schemas']>;
```
`client.ts` switches to `createClient<paths>` from `./schema`.

**`types.ts`** — `export type UserDetail = schemas['UserDetail'];` etc. for every schema above + enums. `index.ts`
re-exports `types.ts`, `errors.ts`; stops exporting `components` (callers use aliases).

**`errors.ts`** (ADR-0015 §3)
```ts
export class ApiError extends Error {
  readonly status: number;            // 0 = network failure / no response
  readonly code: string | undefined;  // contract §2, e.g. 'Concurrency.Conflict'
  readonly title: string;
  readonly detail: string | undefined; // show verbatim
  readonly fieldErrors: Readonly<Record<string, readonly string[]>>;  // keys as sent ('items[2].credentialId', '')
  readonly traceId: string | undefined;
}
export function isApiError(error: unknown, code?: string): error is ApiError;
/** Awaits an openapi-fetch call; returns `data` on 2xx with a body, throws ApiError otherwise. */
export function unwrap<T>(call: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T>;
/** Same for 204 endpoints. */
export function unwrapNoContent(call: Promise<{ error?: unknown; response: Response }>): Promise<void>;
/** User-facing message: detail ?? title ?? generic text. */
export function errorMessage(error: unknown): string;
```
Parse the body defensively with a small zod schema (`code`, `traceId` are ProblemDetails extensions absent from the
generated type). A rejected `fetch` (network) → `ApiError` status 0, detail "The FleetConsole API could not be
reached." Refactor `useSystemInfo` to `unwrap` (existing tests must stay green).

**Lint (CP0 follow-up "DOM lint gap")** in `eslint.config.js`:
- `no-restricted-globals`: `document` (message: no direct DOM access, see FRONTEND.md);
- `no-restricted-properties`: `document` on objects `window`, `globalThis`, `self`; keep the existing selector bans;
- overrides allowing `document` only in `src/app/main.tsx`, `src/shared/theme/ThemeProvider.tsx`, `**/*.test.{ts,tsx}`
  and `src/test/**`;
- add boundary element `{ type: 'mocks', pattern: 'src/mocks' }`: mocks → shared; test → mocks; app → mocks
  (only used by `main.tsx` dynamic import in T-0042). Ignore `schema.contract.ts` in lint like `schema.gen.ts`.

## Acceptance criteria
- [x] QG-4 path: `apiClient.GET('/api/admin/users')`, `POST('/api/admin/users/{username}/grants/bulk', …)` etc.
      typecheck for every contract route; a type test (`expectTypeOf`, `schema.test-d.ts` or `*.test.ts`) shows that
      `/api/system/info` resolves from `schema.gen.ts` and `/api/auth/me` from the contract file.
- [x] `ApiError`/`unwrap` unit tests: 400 with `errors` (incl. `""` and `items[1].credentialId` keys), 409 with
      `code`, 401, non-JSON 502, network error (status 0), 204 via `unwrapNoContent`.
- [x] Lint fails on `globalThis.document.title`, `window.document.body` and bare `document.title` in a feature file
      (verify by temporarily adding them; record in work log), passes on the current code.
- [x] TSDoc on every export. Build, lint and tests green (CLAUDE.md rule 4).

## Work log
- 2026-11-18 frontend-engineer: started; read CLAUDE.md, FRONTEND.md, SECURITY.md, ADR-0014..0016, CP1 contract (incl. orchestrator amendments).
- 2026-11-19 frontend-engineer: implemented.
  - Deps pinned with `npm install -E`: `react-hook-form@7.92.0`, `zod@4.6.7`, `@hookform/resolvers@7.0.7`, dev
    `openapi-msw@2.1.1` (peer `msw ^2.10.5 || ^3` OK with msw 3.0.7). `npm audit`: the same 17 high findings before
    and after, all from the existing `picomatch` ReDoS chain in dev tooling (eslint-plugin-boundaries,
    typescript-eslint, vitest). No new advisories.
  - `schema.contract.ts`: 25 path items / 31 operations covering §4.3, §4.4, §6, §7.2, §8.2, §8.4, §9.2, §10, with
    all schemas, enums and request types from the task list, plus the orchestrator amendments
    (`UserListItem.adminConfigurationSource` + `version` + `isAdminByAssignment`, `ClusterListItem.version`,
    `Credential.expiryWarningDays`, `ProblemDetails`/`HttpValidationProblemDetails` `code`/`traceId`).
  - `schema.ts` (PreferGenerated merge), `types.ts` (aliases incl. `SystemInfo`, `ProblemDetails`), `errors.ts`,
    `client.ts` → `createClient<paths>` from `./schema`, `useSystemInfo` → `unwrap`, `index.ts` re-exports
    types/errors/`paths`/`schemas` (no more `components`).
  - Lint verification: temporarily added `src/features/home/LintProbe.tsx` with `globalThis.document.title`,
    `window.document.body.id`, bare `document.title` and `self.document.title`. Got 4 errors
    (`no-restricted-properties` ×3, `no-restricted-globals` ×1). A temporary `shared/ui` → `src/mocks` import got a
    `boundaries/dependencies` error. Probes deleted; `npm run lint` is clean on the real code.
  - Checks: lint ✓, typecheck ✓, tests 70/70 ✓, build ✓.

## Review
**2026-11-19 frontend-architect — round 1: APPROVE**

Checks run by the reviewer: `npm run lint` ✓, `npm run typecheck` ✓, `npm test -- --run` ✓, `npm run build` ✓
(chunk warning: `index-*.js` 658.89 kB / 195.45 kB gzip). `npm audit --omit=dev`: 0 vulnerabilities. DOM lint
re-probed with temporary files in `src/features/home/` (deleted afterwards). `globalThis.document`, `window.document`,
`self.document`, bare `document` and `const { document } = window` all error. `document.querySelector` still errors in
a `*.test.ts`.

Rulings on the points raised:
- **Bundle 574 → 659 kB (zod):** accepted. T-0028 owns vendor chunking ("no chunk-size warning" is in its acceptance
  criteria). Correction to the handover note: route splitting will **not** take zod off the initial load. `errors.ts`
  is on the boot path (`useSystemInfo` in the footer), so the vendor split only moves zod into a cacheable chunk. That
  is fine for CP1. If initial-load size becomes a goal later, switch `errors.ts` to `zod/mini`. Not required now.
- **Generated `ProblemDetails` wins (no `code`/`traceId` in the type):** accepted. This is exactly the ADR-0016
  behaviour. `ApiError` reads both fields from the raw body, and features use `ApiError`, never `ProblemDetails`.
  Generated `HttpValidationProblemDetails` also wins. The contract §1 amendment (declare the extensions) is tracked by
  T-0011. Nothing to do on the FE.
- **Hand-picked operation names:** accepted. Only `paths` and `components.schemas` keys take part in the merge.
  T-0023 must key handlers by path (openapi-msw does) and never by `operations['…']`, or it breaks when T-0043
  deletes the file.
- **Nullable request fields typed as present `null | T`:** accepted and preferred. It matches contract §1 ("present
  with `null`, not omitted") and stays forward-compatible: an object with the field present can still be assigned if
  the generated type later makes it optional. Defaulted C# parameters being optional is also correct.
- **ApiError for aborted / non-JSON 2xx:** accepted. Rethrowing `AbortError` unchanged is right because TanStack
  treats it as a cancellation, not an error state. Mapping a 2xx non-JSON body (e.g. `index.html` served for an
  `/api` path by a misrouted proxy) to status 0 with the "could not be read" detail is acceptable. The `Response` is
  gone once openapi-fetch rejects, and the user-facing text differs from the network case.
- **Lint allowlist scope:** accepted. Only `document` is allowed in the four globs, and DOM lookups stay banned
  everywhere except `main.tsx`. The `mocks` boundary matches the design. Colocated feature tests can't import
  `src/mocks` directly. That is intended: they go through `src/test/` helpers (T-0023 scope).
- **Contract fidelity:** I checked `schema.contract.ts` against `docs/specs/CP1-api-contract.md` §1–§10. I compared
  field by field: every enum, `ConnectionTestSummary`, `CurrentUser`, `AccessibleCluster`, `UserListItem` (amendments
  `isAdminByAssignment`, `adminConfigurationSource` and `version` are present), `UserDetail`, all user requests,
  `ClusterListItem` (amendment `version`), `ClusterDetail`, `CaCertificate`, the register/update requests,
  `Credential` (amendment `expiryWarningDays`), all credential requests, the §8.5 result records, `Grant`, the grant
  and bulk requests, `AuditPage`/`AuditEntry` and all audit query params. I also checked every route's method, path
  params, success status (201 creates, 204 deletes/logout, 200 bulk) and error statuses. No deviations found.

Nits (optional, no re-review needed):
- `web/src/shared/api/errors.ts` (`errorMessage`): `error.detail ?? …` returns `""` if the server sends an empty
  `detail`. `error.detail || error.title || GENERIC_MESSAGE` would cover that.
- `web/eslint.config.js`: `globalThis.window.document` is not caught because `no-restricted-properties` only matches
  identifier objects. This is contrived, so leave it unless it shows up.
- Handover note: fix the zod / route-splitting remark as described above.

## Handover notes
- **How callers use it:** `unwrap(apiClient.GET(...))` / `unwrapNoContent(apiClient.DELETE(...))` from
  `@/shared/api`. Both throw only `ApiError`; aborted requests (TanStack cancellation) are rethrown unchanged.
  `isApiError(e, 'Users.LastAdmin')` checks a code. `errorMessage(e)` gives the user-facing text (detail, then
  title, then generic) and never exposes a non-API error's message. `ApiError.message` is `HTTP <status>: <detail|title>`
  (status 0: `Network error: …`), which is for logs only.
- **Error mapping:** a rejected fetch gives status 0, "The FleetConsole API could not be reached.". A 2xx body that
  isn't valid JSON (openapi-fetch rejects with `SyntaxError`) also gives status 0, but with an "could not be read"
  detail. A 2xx with no body passed to `unwrap` gives an `ApiError` with that status. ProblemDetails fields are
  parsed one by one with zod `.catch`, so one malformed field doesn't hide the rest. A non-JSON error body falls
  back to `statusText` (or "Request failed with HTTP n") as the `title`.
- **Merged schemas:** generated `ProblemDetails` currently wins over the contract's, so `schemas['ProblemDetails']`
  has no `code`/`traceId` until the backend declares them (contract §1 amendment). `ApiError` reads them from the
  raw body regardless.
- **Contract file conventions (for T-0023 / T-0043):** operation names are my choice (`ListUsers`, `CreateUser`,
  `BulkCreateGrants`, …). The real Api may use different ones; only `paths` and `components.schemas` keys matter to
  the merge. Request fields that are nullable in C# are typed as present `null | T`. Fields with a C# default
  (`CreateUserRequest.role`/`isReadOnly`, `RegisterClusterRequest.isEnabled`, `CreateGrantRequest.accessMode`) are
  optional. `version` is `number`, `AuditEntry.details` is `unknown`. Private helper types (`JsonResponse<T>`,
  `ProblemResponse`, …) produce the same structure openapi-typescript writes out longhand. The file is
  lint-ignored like `schema.gen.ts` but still typechecked.
- **Lint:** the bare `document` global is banned, and so is `document` via `window`/`globalThis`/`self`. Both are
  allowed in `app/main.tsx`, `shared/theme/ThemeProvider.tsx`, `**/*.test.{ts,tsx}` and `src/test/**`. DOM lookups
  (`querySelector`, …) stay banned there too, except `main.tsx`, where the rule was already off. New boundary
  element `mocks` (`src/mocks`): mocks → shared, app → mocks, test → mocks. Colocated `*.test.tsx` files may still
  import only from `test/`, not from `mocks/` directly. If T-0023 needs that, add it there.
- **Follow-up (not in scope):** the main JS chunk was already over Vite's 500 kB warning at HEAD (574 kB). It's now
  659 kB because zod is in the main chunk (`errors.ts`). The vendor/route chunk split described in FRONTEND.md
  ("Route-level code splitting") should fix this. Whichever task owns `vite.config.ts` chunking should pick it up.
- `SystemInfoFooter.tsx` needed no change: it only reads `isError`. Its tests and `system.test.tsx` pass unchanged.
