---
id: T-0154
title: OpenAPI marks NamespaceRules.failureKind (and detectedDistribution) nullable
status: done
owner: backend-engineer
checkpoint: 3.7
depends_on: [T-0141, T-0142]
paths: [src/FleetConsole.Application/Credentials/ConnectionTesting/, src/FleetConsole.Api/OpenApi/, tests/FleetConsole.Api.Tests/Integration/OpenApiDocumentTests.cs]
review_rounds: 0
---

## Goal
Found in T-0146. `NamespaceRulesDto.FailureKind` is `ProbeFailureKind?`, and the API sends `null` for reviewed namespaces.
The OpenAPI document still marks `failureKind` non-nullable, so `schema.gen.ts` types it as non-null. The FE works around
this with the `NamespaceRulesResult` alias in `web/src/shared/api/types.ts` and a cast in `web/src/mocks/handlers/credentials.ts:testResultBody`.

## Scope
- In: make the schema say what the wire sends, using the same shape as `ConnectionTestSummary.failedStep`: a `oneOf` with the enum
  `$ref` plus `{type: null}`, and the enum component itself never nullable. Also check `ConnectionTestResult.detectedDistribution`.
- Out: FE changes. The orchestrator removes the FE workaround in a follow-up after gen:api.

## Acceptance criteria
- [x] `NullableEnumProperties_StayNullableAtTheReference` (or a sibling theory) covers `NamespaceRules.failureKind` and
      `detectedDistribution`, which are nullable at the reference. `EnumComponents_NeverContainNull` still passes.
- [x] `scripts/check-be.sh` passes; approved (orchestrator, small fix).

## Work log
- 2026-11-23 backend-engineer: root cause is ASP.NET Core 10 `ShouldApplyNullablePropertySchema`, which reads the `PropertyInfo`'s
  *write* nullability. A get-only property has none (`Unknown`), so no `oneOf` null wrapper. Positional records have `init` setters.
  Fix: `FailureKind { get; private init; }` + remarks; transformer remarks note the rule. `detectedDistribution` was already correct.
  Theory now takes the schema name and covers 5 nullable enum refs. check-be passes (792 Api tests).

## Review
- Round 1 (orchestrator, 2026-11-23): APPROVE. Root-cause fix in DTO, documented in both places; theory covers 5 refs.

## Handover notes
- Wire format unchanged; only the OpenAPI doc changes (`NamespaceRules.failureKind` is now `oneOf [null, $ref ProbeFailureKind]`).
- FE follow-up (orchestrator): run gen:api, then drop the `NamespaceRulesResult` alias and the `testResultBody` cast.
- Rule for future DTOs: a get-only nullable *enum* (componentized) property needs a setter (private `init` is fine) to be nullable in OpenAPI.
