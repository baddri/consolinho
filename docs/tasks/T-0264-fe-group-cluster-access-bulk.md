---
id: T-0264
title: Group detail › Cluster access tab and bulk grant wizard for a group with one priority (GPG-2, GPG-3)
status: todo
owner: frontend-engineer
checkpoint: 4.5a
depends_on: [T-0261, T-0263]   # lane B tail; needs the `group` table perspective (T-0261) and the group page (T-0263); BE T-0252
paths: [web/src/features/admin/groups/, web/src/features/admin/grants/GrantsTab.tsx, web/src/features/admin/grants/bulk/, web/src/features/admin/grants/grantText.ts, web/src/features/admin/adminTabs.ts, web/src/features/admin/routes.tsx]
review_rounds: 0
---

## Goal
"One team → many clusters" in one step: from a group's Cluster access tab the admin grants the group access to several
clusters with one access mode and one priority, and sees per cluster why a priority can't be used.

## Scope
- In: `access` tab of the group page; `GroupGrantsTab`; bulk wizard generalised to a subject `{ kind, name }`;
  Priority in the wizard; `useBulkGroupGrant`; review-step per-cluster flags.
- Out: changes to the single-grant modal (T-0262).

## Contract / design notes
- `adminTabs.ts`: `GROUP_DETAIL_TABS = ['details', 'access']`, `access: 'Cluster access'`; route
  `groups/:groupName/access` with `handle: tab('access')` (same lazy module as the detail page).
- `GroupGrantsTab({ group, onGrantAccess })` in `grants/GrantsTab.tsx` next to `UserGrantsTab`: `useGroupGrants`
  (T-0260), perspective `group` (T-0261), empty "No cluster access yet" / "Members of `X` can't reach any cluster
  through this group until you grant access."; Edit/Revoke via the existing dialogs (group-aware after T-0261/T-0262).
- `BulkGrantWizard` props become `{ subject: { kind: 'user' | 'group'; name: string }; isOpen; onClose }` (update
  the one user call site `users/UserDetailPage.tsx`). Title: "Grant `alice` access to clusters" / "Grant group `X`
  access to clusters". Already-granted clusters come from `useUserGrants` / `useGroupGrants` by kind.
- Access mode step: for groups add the Priority field (reuse `grants/PriorityField.tsx` from T-0262; one priority for
  all selected clusters, required 1–1000). `bulkGrantSchema` gains `priority` (optional, required by `superRefine` for groups).
- Review step flags come from the **server answer**, not a client pre-check: knowing other groups' priorities would
  need one grants request per selected cluster (N+1). Submit → 400 with `items[i].clusterName` / `items[i].credentialId`
  errors ("Priority N is already used by group `Y` on this cluster.", already granted, cluster not found) lands on
  row `i` through the existing `ReviewStep` mapping; the alert above the table says "Nothing was granted. Deselect the
  flagged clusters or change the priority, then submit again." Each flagged row gets a "Remove" link button that
  deselects it, so the admin can resubmit (GPG-3, all-or-nothing contract §3).
- `useBulkGroupGrant()` in `grants/bulk/api.ts` = `POST /api/admin/groups/{groupName}/grants/bulk`, same invalidation
  as `useBulkGrant`. Production read-write warning for groups: "Members of `X` will be able to change production
  clusters: a, b." (`grantText.ts`).

## Context pack
- Docs: `UX.md` § 9 Modals and wizards; `FRONTEND.md` § UI conventions (wizard-in-modal close rule).
- Exemplars: `grants/bulk/BulkGrantWizard.tsx` (whole, 193 lines), `grants/bulk/ReviewStep.tsx` L39-133 (row errors from `items[i]`), `grants/bulk/bulkGrant.schema.ts`, `grants/bulk/BulkGrantWizard.test.tsx` (server per-item error test to copy).
- Touch points: `grants/GrantsTab.tsx:UserGrantsTab` (pattern for `GroupGrantsTab`), `grants/bulk/AccessModeStep.tsx`, `grants/bulk/api.ts:useBulkGrant`, `users/UserDetailPage.tsx` L162-163 (wizard call site), `groups/GroupDetailPage.tsx` (T-0263), mocks `setMockHostGroups` / bulk group handler (T-0260).
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/group.tsx:RoleBindingsTab` (L220-227: the group's bindings tab = the bindings list filtered to the group).

## Acceptance criteria
- [ ] GPG-2: group page has Details | Cluster access tabs (URL segments); Cluster access lists the group's grants with Cluster, Access mode, Priority, Credential, Granted and Edit/Revoke.
- [ ] GPG-3: "Grant access" opens the wizard for the group with a Priority input; success grants all clusters with that priority and toasts the count.
- [ ] GPG-3: a 400 naming taken priority on some clusters flags exactly those review rows with the server message, writes nothing, and resubmitting after deselecting succeeds (mock test).
- [ ] User bulk wizard unchanged in behaviour (existing tests pass with the new `subject` prop).
- [ ] Read-only admins: Grant access/Edit/Revoke disabled with tooltip (UIG-6 parity).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
