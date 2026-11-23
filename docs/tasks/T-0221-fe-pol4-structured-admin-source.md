---
id: T-0221
title: Admin source from the structured API field; delete adminSource string parsing (POL-4, FE)
status: todo
owner: frontend-engineer
checkpoint: CP4c
depends_on: [T-0232]
paths: [web/src/shared/api/, web/src/features/admin/users/, web/src/mocks/admin/]
review_rounds: 0
---

## Goal
Frontend half of POL-4. After T-0232 serves `adminConfigurationSource` as `{ kind: 'userList' | 'group', group: string | null } | null`, regenerate the API types and replace the `"group <name>"` string parsing in `users/adminSource.ts` with a switch on `kind`. The user-visible copy does not change.

## Scope
- In: `npm run gen:api` (Api running, or regenerate from T-0232's OpenAPI document), `adminSource.ts` rewrite (or deletion with the helpers inlined), the MSW admin fixtures/handlers, and the tests.
- Out: any copy change; backend.

## Contract / design notes
- `adminSourceText(source: AdminConfigurationSource): string` → "user list" / "group <name>", and `adminSourceReason(...)` with the same output as today.
- Delete the prefix parsing and its tests; keep tests for the copy.
- Callers: `useUserActions.tsx:71`, `UserActionDialogs.tsx:109`, `UserRoleLabels.tsx`, `UserDetailsTab.tsx`, `UserDetailHeader.tsx`.

## Context pack
- Contract: `docs/tasks/T-0232-be-pol4-structured-admin-source.md` § Contract (wire shape).
- Touch points: `web/src/features/admin/users/adminSource.ts` (+ `.test.ts`); `grep -rn adminConfigurationSource web/src/mocks web/src/features/admin`.
- Exemplar: the earlier gen:api update in the git log (`git log --oneline -- web/src/shared/api/schema.d.ts | head -3`).

## Acceptance criteria
- [ ] No string parsing of the admin source remains (`grep -n "'group '" web/src/features/admin` returns nothing). The copy is identical in the existing user tests.
- [ ] `schema.test.ts` (or the equivalent) shows the new nullable object type.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
