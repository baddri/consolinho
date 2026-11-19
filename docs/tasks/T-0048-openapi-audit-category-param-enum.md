---
id: T-0048
title: OpenAPI — document audit `category` query parameter as AuditCategory
status: todo
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
- [ ] OpenAPI: `ListAuditEntries` `category` parameter schema references `AuditCategory`; test pins it.
- [ ] Unknown category still returns 400 with `errors.category` (existing test stays green).
- [ ] `schema.gen.ts` regenerated; `schema.test.ts` regains a `@ts-expect-error` for `category: 'everything'`.
- [ ] `scripts/check-be.sh` and `scripts/check-fe.sh` green.

## Work log

## Handover notes
