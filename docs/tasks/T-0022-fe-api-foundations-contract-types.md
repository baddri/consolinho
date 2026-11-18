---
id: T-0022
title: FE API foundations — contract types, ApiError/unwrap, new dependencies, DOM lint gap
status: todo
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
- [ ] QG-4 path: `apiClient.GET('/api/admin/users')`, `POST('/api/admin/users/{username}/grants/bulk', …)` etc.
      typecheck for every contract route; a type test (`expectTypeOf`, `schema.test-d.ts` or `*.test.ts`) shows that
      `/api/system/info` resolves from `schema.gen.ts` and `/api/auth/me` from the contract file.
- [ ] `ApiError`/`unwrap` unit tests: 400 with `errors` (incl. `""` and `items[1].credentialId` keys), 409 with
      `code`, 401, non-JSON 502, network error (status 0), 204 via `unwrapNoContent`.
- [ ] Lint fails on `globalThis.document.title`, `window.document.body` and bare `document.title` in a feature file
      (verify by temporarily adding them; record in work log), passes on the current code.
- [ ] TSDoc on every export. Build, lint and tests green (CLAUDE.md rule 4).

## Work log

## Review

## Handover notes
