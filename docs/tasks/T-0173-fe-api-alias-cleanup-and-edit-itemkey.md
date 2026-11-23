---
id: T-0173
title: Regenerate the API schema, drop the NamespaceRulesResult alias; rename itemKey edit-yaml → edit
status: done
owner: frontend-engineer
checkpoint: 4a
depends_on: []
paths: [web/src/shared/api/schema.gen.ts, web/src/shared/api/types.ts, web/src/features/admin/connection-test, web/src/mocks/fixtures/connectionTests.ts, web/src/features/resources/actions/useResourceActions.tsx, web/src/features/resources/actions/ResourceActions.test.tsx]
review_rounds: 0
---

## Goal
FND-4 + FND-5: two CP3.7 leftovers, no user-visible change. T-0154 (BE, done) made `NamespaceRules.failureKind` /
`detectedDistribution` nullable in OpenAPI, so the FE alias and casts written around the old schema can go; and the
action key `'edit-yaml'` becomes `'edit'` (T-0135 nit; ADR-0037 §3 adds `edit-labels`/`edit-annotations` next to it).

## Scope
- In: `npm run gen:api` (Api running in Development); replace `NamespaceRulesResult` with the schema's own name
  (`NamespaceRules`) in `types.ts` and its 4 users; remove any `testResultBody`-style cast left over (grep
  `testResultBody\|as ConnectionTestResult` in `web/src` — currently none found; record that in the work log if still none);
  `itemKey: 'edit-yaml'` → `'edit'` + tests.
- Out: other generated-type changes (if `gen:api` brings unrelated diffs from parallel BE work, keep only what typechecks and note it).

## Context pack
- Touch points: `shared/api/types.ts:114` (`NamespaceRulesResult`), `features/admin/connection-test/ConnectionTestResultView.tsx:16,103`,
  `features/admin/connection-test/NamespaceRulesTable.tsx:3,18`, `mocks/fixtures/connectionTests.ts:8,135,157`,
  `features/resources/actions/useResourceActions.tsx:14,70`.
- Do not touch the unrelated `edit-yaml` strings in `yaml/` (OCP file names in comments).

## Acceptance criteria
- [x] FND-4: alias and cast gone; typecheck passes without them.
- [x] FND-5: itemKey `'edit'`; tests updated; no visible change.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23 frontend-engineer: gen:api against isolated Aspire Api — no diff (schema.gen.ts already had nullable `failureKind`).
  Alias `NamespaceRulesResult` → `NamespaceRules` in types.ts + 3 users; no `testResultBody`/`as ConnectionTestResult` cast exists.
  itemKey `'edit-yaml'` → `'edit'`; added a hook-key test. check-fe green: 78 files / 901 tests, build ok.

## Review
- Round 1 (orchestrator, 2026-11-23): APPROVE. Mechanical rename + itemKey test; gen:api had no diff.

## Handover notes
- `gen:api` produced no change; schema.gen.ts untouched.
- Type is now `NamespaceRules` (schema name) via `@/shared/api`; no alias left.
- `ResourceActionItem.itemKey` is `'edit' | 'delete'`; widen it there when ADR-0037 §3 adds `edit-labels`/`edit-annotations`.
- New test "keys the items edit and delete" in ResourceActions.test.tsx pins the keys (DropdownItem `value` is not in the DOM).
