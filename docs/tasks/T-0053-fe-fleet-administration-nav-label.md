---
id: T-0053
title: Rename the admin sidebar section and admin-area wording to "Fleet administration"
status: todo
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
- [ ] An admin on a cluster page sees two distinct sidebar sections: cluster "Administration" and "Fleet administration".
- [ ] A non-admin does not see "Fleet administration"; `/admin/...` shows "You don't have access to Fleet administration".
- [ ] No UI text refers to the FleetConsole admin area as plain "Administration" or "Admin" (role labels excepted).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
