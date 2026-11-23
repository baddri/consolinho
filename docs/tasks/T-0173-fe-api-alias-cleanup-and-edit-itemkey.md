---
id: T-0173
title: Regenerate the API schema, drop the NamespaceRulesResult alias; rename itemKey edit-yaml → edit
status: todo
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
- [ ] FND-4: alias and cast gone; typecheck passes without them.
- [ ] FND-5: itemKey `'edit'`; tests updated; no visible change.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
