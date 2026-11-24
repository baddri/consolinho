---
id: T-0273
title: Grant toasts say "read only"/"read write" instead of enum names
status: todo
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
- [ ] Single, bulk, user and group grant toasts use "read only"/"read write"; no "ReadOnly"/"ReadWrite" text in UI strings (`grep -rn "ReadOnly\|ReadWrite" web/src --include=*.tsx --include=*.ts` hits only types/API values).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
