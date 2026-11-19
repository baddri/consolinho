---
id: T-0047
title: OpenAPI — shared enum component schemas must not include null
status: done
owner: backend-engineer
checkpoint: 1
depends_on: [T-0016, T-0017, T-0018]
paths: [src/FleetConsole.Api/OpenApi/, tests/FleetConsole.Api.Tests/Integration/OpenApiDocumentTests.cs, web/src/shared/api/schema.gen.ts]
review_rounds: 1
---

## Goal
After merging T-0016/17/18 the regenerated `schema.gen.ts` types the shared enum components `ConnectionTestStep` and
`CapabilityLevel` as `"…" | null`, because some DTO property uses the enum as nullable (e.g. a failed step / capability
level that may be absent). Nullability leaks from one property into the shared component, so every use becomes
nullable and the web mocks (`web/src/mocks/fixtures/connectionTests.ts`) fail typecheck (Record keys, index types).

## Scope
- In: make enum component schemas (`#/components/schemas/<Enum>`) never contain `null` in `enum`/`type`; express
  nullability at the referencing property (e.g. `oneOf: [{ $ref }, { type: 'null' }]` or the OpenAPI 3.1 form .NET 10
  emits), most likely in `StringEnumSchemaTransformer` / `OpenApiSetup`. Regenerate `schema.gen.ts`.
- Out: changing DTO nullability; frontend code changes.

## Acceptance criteria
- [x] `OpenApiDocumentTests`: no enum component schema contains `null`; nullable enum properties are still nullable.
- [x] Regenerated `schema.gen.ts` (`cd web && npm run gen:api`, Api running) has `ConnectionTestStep`/`CapabilityLevel`
      without `| null`; the nullable properties referencing them are `X | null`; `cd web && npm run typecheck` green.
- [x] `scripts/check-be.sh` and `scripts/check-fe.sh` green.

## Work log
- 2026-11-20 (backend-engineer): .NET 10 builds the shared enum component from `Nullable<TEnum>` and appends `null` (no `type`); property is already `oneOf [{type:null},{$ref}]`. `StringEnumSchemaTransformer` now unwraps `Nullable<T>`, strips null values, sets `type: string`. 2 new `OpenApiDocumentTests`. Regenerated `schema.gen.ts`.
- Outside paths (minimal): `web/src/shared/api/schema.test.ts` `@ts-expect-error` on audit `category: 'everything'` was obsolete (T-0021 binds `category` as string, contract §10) → now asserts `limit: 'fifty'` is rejected.

## Handover notes
- Enum components never contain `null`; nullability lives only on referencing properties (`failedStep`/`headline`: `null | components["schemas"][…]`).
- Components built from a nullable usage (`ConnectionTestStep`, `CapabilityLevel`) carry no `description` (framework takes it from the property); harmless, not fixed.
- `AuditEntry.details` generates as `null | components["schemas"]["JsonElement"]` with `JsonElement: unknown` → effectively `unknown`.
- `schema.gen.ts` regenerated from the full current Api (includes T-0016..T-0021 routes; large diff is expected).
- Gates: check-be 323/350/571, check-fe 413 tests, typecheck green incl. WIP audit/clusters folders.

## Review
- 2026-11-20 round 1 (backend-architect): **APPROVE**. Fix is in the right place (one schema transformer, no DTO changes); nullability stays on `failedStep`/`headline` (`null | components[…]`), enum components are plain `type: string`; both directions covered by tests. Ran OpenApi filter (32/32) + `npm run typecheck` green.
- `web/src/shared/api/schema.test.ts:185` — swapping to `limit: 'fifty'` is correct: §10 amendment binds `category` as string so an unknown value is a keyed `category` field error from `ListAuditEntriesValidator` (verified), which a typed enum binder could not give. Keep it.
- Follow-up (not this task): `AuditAdminEndpoints.cs:79` — the `category` query param is documented as plain `string`, so FE loses the `AuditCategory` union; add a parameter/operation transformer that sets its schema to `$ref AuditCategory` while keeping string binding + server validation. Orchestrator: file as a small BE task.
- Nit (optional): components built from a nullable usage lose their `description` (see Handover notes); acceptable.
