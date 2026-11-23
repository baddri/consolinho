---
id: T-0221
title: Admin source from the structured API field; delete adminSource string parsing (POL-4, FE)
status: done
owner: frontend-engineer
checkpoint: CP4c
depends_on: [T-0232]
paths: [web/src/shared/api/, web/src/features/admin/users/, web/src/mocks/admin/]
review_rounds: 1
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
- [x] No string parsing of the admin source remains (`grep -n "'group '" web/src/features/admin` returns nothing). The copy is identical in the existing user tests.
- [x] `schema.test.ts` (or the equivalent) shows the new nullable object type.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-24 frontend-engineer: Api not running and not started (shared tree, T-0231 mid-edit in `src/`), so
  `schema.gen.ts` was **hand-edited** to T-0232's schema (`AdminConfigurationSource{kind,group}`, enum
  `AdminConfigurationSourceKind`, 3 owners `null | ref`), matching `OpenApiDocumentTests`. `adminSource.ts` switches on
  `kind`; aliases in `shared/api/types.ts`; mocks (`mocks/fixtures`, `mocks/handlers/users.ts`, not `mocks/admin/`) store the object.

## Review
- 2026-11-24 frontend-architect, round 1: **APPROVE**. Hand-edited `schema.gen.ts` matches `OpenApiDocumentTests`
  L171-190 (nullable `$ref` on 3 owners, required kind+group, enum userList|group). No `'group '` parsing is left, and the copy is unchanged.
  - Nit (optional): `shared/api/schema.test.ts:6-9` the import block is mis-formatted. Run prettier on it.
  - Nit (optional): front-matter `paths` lists `web/src/mocks/admin/`, but the work touched `mocks/fixtures` + `mocks/handlers/users.ts` + `mocks/users.test.ts`.
  - Follow-up (already in the handover notes): re-run `npm run gen:api` against a running Api to confirm the hand-edit.

## Handover notes
- Re-run `npm run gen:api` against a running Api when convenient; the diff should be descriptions only (if any).
- Mock audit/problem text uses `adminSourceAuditText` (= backend `ToString()`: "user list" / "group <name>").
- Copy unchanged; `UserDetailPage.test.tsx` USR-6 fixture now sets `{ kind: 'userList', group: null }`.
