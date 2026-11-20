---
id: T-0053
title: Rename the admin sidebar section and admin-area wording to "Fleet administration"
status: done
owner: frontend-engineer
checkpoint: 2
depends_on: []
paths: [web/src/app/layout/, web/src/features/admin/, web/src/features/cluster-context/, web/src/mocks/]
review_rounds: 0
---

## Goal
CP1 ships the FleetConsole admin sidebar section as "Admin" while spec ADM-3 says "Administration". The cluster nav
already has an OCP-faithful "Administration" section (Namespaces now, more in CP2/CP5), and on a cluster page both
sections are in the same sidebar. Two "Administration" headings would be ambiguous, and "Admin" is easy to read as
"cluster admin". Product-owner decision at CP1 ACCEPT (`docs/specs/CP1-acceptance.md` D1): the FleetConsole admin area
is called **"Fleet administration"** everywhere in the UI. The cluster's "Administration" section keeps its OCP name.

## Scope
- In: sidebar section title (`buildAdminNav` in `web/src/app/layout/navigation.ts`); user-facing prose that names the
  FleetConsole admin area: `AdminNoAccessPage` ("You don't have access to Fleet administration"), `NoClustersPage`
  ("Go to Fleet administration"), `CreateUserModal` role/read-only helper texts, `UserActionDialogs` promote/demote
  bodies; MSW handler 403 detail; tests that assert these strings.
- Out: the cluster nav "Administration" section (unchanged); role labels "Admin" on users/badges (that is the role
  name, unchanged); URL paths (`/admin/...` stay); backend `AuthErrors.Forbidden` text (API-only; the UI shows the
  no-access page, not that detail — rename only if the backend architect wants consistency, separate task).

## Contract / design notes
- Section order unchanged: cluster sections first, Fleet administration last (Users, Clusters, Credentials, Audit log).
- Visibility rules (ADM-3) unchanged.

## Context pack
- Spec: `docs/specs/CP1-identity-and-admin.md` ADM-3; `docs/specs/CP1-acceptance.md` D1.
- Exemplars: `web/src/features/admin/admin.test.tsx` (sidebar assertions), `web/src/app/layout/AppShell.test.tsx`.

## Acceptance criteria
- [x] An admin on a cluster page sees two distinct sidebar sections: cluster "Administration" and "Fleet administration".
- [x] A non-admin does not see "Fleet administration"; `/admin/...` shows "You don't have access to Fleet administration".
- [x] No UI text refers to the FleetConsole admin area as plain "Administration" or "Admin" (role labels excepted).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-20 frontend-engineer: in_progress → renamed sidebar section `Admin` → "Fleet administration" and admin-area prose
  (no-access page, NoClustersPage link, CreateUserModal helpers, promote/demote bodies, MSW 403 detail) + tests.
  `scripts/check-fe.sh` green (504 tests). → in_review.

## Review
- 2026-11-20 frontend-architect: **APPROVE** (round 1). `scripts/check-fe.sh` green (504/46). All ACs met; grep of
  `web/src` finds no remaining UI text calling the admin area "Administration"/"Admin" (only role labels and the
  cluster "Administration" section, both in scope-out). Section `id`, URLs and visibility untouched.
- Nit (optional): `web/src/features/cluster-context/NoClustersPage.tsx:20` — TSDoc line now ~120 chars; rewrap if touched again.

## Handover notes
- Only UI strings changed; nav section `id: 'admin'` and `/admin/...` URLs unchanged. Cluster "Administration" untouched.
- Role labels "Admin" (badges, filter, create-user radio) intentionally kept (role name).
- Not changed: `shared/api/schema.gen.ts` OpenAPI descriptions say "Administration user list/detail" — they come from
  backend XML docs; fix in a backend task if wanted (with `AuthErrors.Forbidden` text, see Scope Out).
- Code comments saying "admin area" left as-is (internal wording, not UI).
