---
id: T-0273
title: Grant toasts say "read only"/"read write" instead of enum names
status: done
owner: frontend-engineer
checkpoint: 4.5b
depends_on: []
paths: [web/src/features/admin/grants, web/src/features/admin/credentials, web/e2e, docs/specs]
review_rounds: 0
---

## Goal
CP4.5a ACCEPT. Grant toasts read "Granted group sre ReadOnly on dev-1" because they expose the API enum names. The rest
of the UI uses "Read only"/"Read write", and OCP toasts use plain language.

## Scope
- In: `web/src/features/admin/grants/grantText.ts` `ACCESS_MODE_TOAST` → `read only` / `read write` (lower case mid-sentence:
  "Granted alice read only on prod-eu-1", "Granted group sre read write on 12 clusters"); fix the TSDoc examples.
  Align `DeleteCredentialModal.tsx` `ACCESS_MODE_LABELS` "Read-write" → "Read write". Update affected unit/e2e assertions
  (`groups.e2e.ts` toast). Update the toast examples in `docs/specs/CP1-identity-and-admin.md` (~L315) and the CP4.5 spec if present.
- Out: any other copy changes.

## Acceptance criteria
- [x] Single, bulk, user and group grant toasts use "read only"/"read write"; no "ReadOnly"/"ReadWrite" text in UI strings (`grep -rn "ReadOnly\|ReadWrite" web/src --include=*.tsx --include=*.ts` hits only types/API values).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-24 frontend-engineer: ACCESS_MODE_TOAST → read only/read write (+TSDoc), DeleteCredentialModal "Read write"; unit tests, groups.e2e.ts toast,
  CP1 spec L315 and CP4.5-acceptance L61 examples updated. check-fe.sh green. e2e not run (assertion-only change).

## Review
- 2026-11-24 frontend-architect, round 1: **APPROVE**. Diff matches scope: `grantText.ts` toast map + TSDoc, `DeleteCredentialModal.tsx`
  label now matches `grantText.ts` `ACCESS_MODE_LABELS`, unit/e2e assertions and spec examples updated. AC grep intent met:
  the remaining hits are API codes/types/enum members, MSW connection-test messages (backend-rendered text, so mocks correctly mirror the BE),
  and generic shared toast examples. Gate not re-run (assertion/copy-only; engineer reported green).
- Nit (optional): `web/src/shared/ui/useToast.ts:5` TSDoc and `web/src/shared/ui/uiKit.test.tsx:35-97` still cite "Granted alice ReadOnly on prod-eu-1", which is now stale copy; switch them to "read only" when that file is next touched.
- Follow-up (optional, BE): the connection-test warning "1 users have ReadWrite grants…" is rendered by the backend and shows enum names (and "1 users") in the UI; fixing it needs a BE copy task, with the MSW mock updated in step.

## Handover notes
- Toast copy now lower case mid-sentence: "Granted alice read only on prod-eu-1", "Granted group sre read write on 12 clusters".
- Remaining `ReadOnly`/`ReadWrite` hits under web/src are types, API codes, MSW connection-test messages mirroring the
  backend (`credentials.ts` L131/137), and generic example strings in `shared/ui/useToast.ts` / `uiKit.test.tsx` (out of
  scope: shared, not grant UI). Spec prose using ReadWrite/ReadOnly as mode names (CP1 L214/224/385) left as-is.
- No UI probe: copy-only change, no layout/style impact.
