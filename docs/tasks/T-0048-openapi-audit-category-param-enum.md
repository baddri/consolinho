---
id: T-0048
title: OpenAPI — document audit `category` query parameter as AuditCategory
status: done
owner: backend-engineer
checkpoint: 1
depends_on: [T-0021, T-0047]
paths: [src/FleetConsole.Api/Endpoints/Admin/AuditAdminEndpoints.cs, src/FleetConsole.Api/OpenApi/, tests/FleetConsole.Api.Tests/Integration/OpenApiDocumentTests.cs, web/src/shared/api/schema.gen.ts]
review_rounds: 0
---

## Goal
`GET /api/admin/audit?category=` is bound as `string` (so unknown values give a 400 keyed `category`, contract §10),
but OpenAPI therefore shows it as plain `string` and the generated FE types lose the allowed values. Document the
parameter as `$ref AuditCategory` (operation/parameter transformer) while keeping string binding + server validation.
Found in T-0047 review.

## Acceptance criteria
- [x] OpenAPI: `ListAuditEntries` `category` parameter schema references `AuditCategory`; test pins it.
- [x] Unknown category still returns 400 with `errors.category` (existing test stays green).
- [x] `schema.gen.ts` regenerated; `schema.test.ts` regains a `@ts-expect-error` for `category: 'everything'`.
- [ ] `scripts/check-be.sh` and `scripts/check-fe.sh` green. (BE green; FE lint/typecheck/build green, 3 failures only in
  concurrent `shared/forms/FileUploadField.test.tsx` work — not this task.)

## Work log
- 2026-11-20 backend-engineer: in_progress → in_review. Added `QueryParameterSchemaMetadata` + `WithQueryParameterSchema<T>()` and
  `QueryParameterSchemaOperationTransformer` (OpenApi/), applied to `category` on ListAuditEntries; binding unchanged.
  Pinned in OpenApiDocumentTests; regenerated schema.gen.ts (1-line diff); schema.test.ts regains the `everything` check
  (outside `paths`, as instructed). check-be green (595 Api tests).

## Handover notes
- Reusable: `.WithQueryParameterSchema<TEnum>("name")` on any endpoint documents a string-bound query param as
  `$ref` to the enum component; server validation must still enforce the values.
- Transformer creates the component via `GetOrCreateSchemaAsync` (so StringEnumSchemaTransformer applies) and
  `AddComponent` is a no-op if a DTO already registered it; a marker naming a missing parameter throws at generation.
- Component id = enum type name (enums never carry the stripped `Dto` suffix).

## Review
- 2026-11-20 backend-architect, round 1: **APPROVE**. Filtered Api tests (OpenApi|Audit) 78/78 green; web typecheck green.
  Transformer builds the schema via `GetOrCreateSchemaAsync` (enum transformer applies), `AddComponent` only if absent,
  binding/validation unchanged (`AuditEndpointsTests` `category=nope` → 400 still green). Throw on a misnamed parameter
  is acceptable: `/openapi/v1.json` is Development-only and `OpenApiDocumentTests` generates the document in CI.
  Reviewer added the convention line to BACKEND.md "HTTP API and OpenAPI".
  - nit (optional): src/FleetConsole.Api/Endpoints/Admin/AuditAdminEndpoints.cs:3 — `using FleetConsole.Api.OpenApi` sits between Application usings — move it after `FleetConsole.Api.Http`.
  - nit (optional): src/FleetConsole.Api/OpenApi/QueryParameterSchemaOperationTransformer.cs:77 — component id assumes the type has no `Dto` suffix — fine for enums; mention in the `T` typeparam doc if reused for non-enums.
