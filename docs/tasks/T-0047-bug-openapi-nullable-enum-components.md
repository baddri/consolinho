---
id: T-0047
title: OpenAPI — shared enum component schemas must not include null
status: todo
owner: backend-engineer
checkpoint: 1
depends_on: [T-0016, T-0017, T-0018]
paths: [src/FleetConsole.Api/OpenApi/, tests/FleetConsole.Api.Tests/Integration/OpenApiDocumentTests.cs, web/src/shared/api/schema.gen.ts]
review_rounds: 0
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
- [ ] `OpenApiDocumentTests`: no enum component schema contains `null`; nullable enum properties are still nullable.
- [ ] Regenerated `schema.gen.ts` (`cd web && npm run gen:api`, Api running) has `ConnectionTestStep`/`CapabilityLevel`
      without `| null`; the nullable properties referencing them are `X | null`; `cd web && npm run typecheck` green.
- [ ] `scripts/check-be.sh` and `scripts/check-fe.sh` green.

## Work log

## Handover notes
