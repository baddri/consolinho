---
id: T-0264
title: Group detail › Cluster access tab and bulk grant wizard for a group with one priority (GPG-2, GPG-3)
status: done
owner: frontend-engineer
checkpoint: 4.5a
depends_on: [T-0261, T-0263]   # lane B tail; needs the `group` table perspective (T-0261) and the group page (T-0263); BE T-0252
paths: [web/src/features/admin/groups/, web/src/features/admin/grants/GrantsTab.tsx, web/src/features/admin/grants/bulk/, web/src/features/admin/grants/grantText.ts, web/src/features/admin/adminTabs.ts, web/src/features/admin/routes.tsx]
review_rounds: 1
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
- [x] GPG-2: group page has Details | Cluster access tabs (URL segments); Cluster access lists the group's grants with Cluster, Access mode, Priority, Credential, Granted and Edit/Revoke.
- [x] GPG-3: "Grant access" opens the wizard for the group with a Priority input; success grants all clusters with that priority and toasts the count.
- [x] GPG-3: a 400 naming taken priority on some clusters flags exactly those review rows with the server message, writes nothing, and resubmitting after deselecting succeeds (mock test).
- [x] User bulk wizard unchanged in behaviour (existing tests pass with the new `subject` prop).
- [x] Read-only admins: Grant access/Edit/Revoke disabled with tooltip (UIG-6 parity).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-24 frontend-engineer: group `access` tab + `GroupGrantsTab`; `BulkGrantWizard` takes `subject`, user/group
  wrappers pick grants query + mutation (`useBulkGroupGrant`); Priority on the mode step (`PriorityField` made generic
  over the form); review shows the "Nothing was granted" alert and a per-row "Remove" for flagged rows (both kinds).
  Tests: `groups/GroupGrants.test.tsx` (7). UI probe: OCP ref not running on :9000, our side only.

## Review
- 2026-11-24 ux-designer, round 1: **CHANGES_REQUESTED** (mock UI 1280 light; OCP ref console not run, source only)
  - OK: group Cluster access tab = same `GrantsTabContent` as the user tab (toolbar, Priority column, empty state), OCP `public/components/group.tsx:RoleBindingsTab` L220-227 (bindings filtered to the subject); wizard title, one close control, Priority on step 2 with range error and Next disabled (UX.md §9).
  - Review, flagged alert — the danger `Alert` has margin-bottom 0 and touches "Read only access to 2 clusters." — UX.md §10 (inline alerts keep `--pf-t--global--spacer--md`) — give the alert `pf-v6-u-mb-md` (or put the step body in a `Stack hasGutter`).
  - Review, flagged alert copy — says "Deselect the flagged clusters … then submit again" but the row control is "Remove" and the button is "Grant access" — OCP names the control the user clicks (UX.md §11) — "Nothing was granted. Remove the flagged clusters or change the priority, then select Grant access again." (user variant without the priority clause); update the test string.
  - Review, flagged row — a priority / already-granted / cluster-not-found error (`items[i].clusterName`) turns the Credential select red with an error icon, so the admin is pointed at the credential, which is not the problem — PF form validation marks only the field the error is about — pass `isInvalid`/`describedBy` to `CredentialSelect` only for `items[i].credentialId` errors; keep row-level messages as error `HelperText` in the cell.
  - Access mode step, Priority helper (nit) — "…groups with access to this cluster…" while several clusters are selected — reads wrong in the bulk flow — "to a cluster" in the wizard (keep UIG-3 verbatim in the single-grant modal), or accept as is if the spec copy must stay verbatim.
  - Review, Remove (nit, no change required) — OCP removes editable rows with a plain `RhUiMinusCircleIcon` button in a trailing cell (`packages/console-shared/src/components/formik-fields/multi-column-field/MultiColumnFieldRow.tsx` L60, `public/components/utils/name-value-editor.tsx` L152); the inline "Remove" link under the error is acceptable as specified.
- 2026-11-24 frontend-architect, round 1: **APPROVE**. Scoped check-fe (grants, groups, users) green: 12 files, 90 tests.
  Structure, boundaries (all within `features/admin`), types, query invalidation (shared `useInvalidateAfterBulkGrant`)
  and TSDoc are fine; out-of-paths edits (`PriorityField` generic, `GrantFormModal`, `useUserActions`) are justified.
  Optional nits:
  - `grants/bulk/BulkGrantWizard.tsx:153-156` — `useEffect` + `trigger('priority')` on a watched value; triggering from the field's change (or a per-kind schema factory with `mode: 'onChange'`) would avoid the effect.
  - `grants/bulk/bulkGrant.schema.ts:689` — `subjectKind` lives in form state only to drive `superRefine`; a `bulkGrantSchema(kind)` factory like `grantFormSchema()` would keep it out of the values.
  - `groups/GroupGrants.test.tsx` — no test for Remove with two flagged rows (RHF shifting the remaining row's error) or for Back → change priority → resubmit clearing the stale row errors.
- 2026-11-24 frontend-engineer, fix round 1: alert mb-md and new copy; credential select invalid only on credentialId errors; plural priority helper; Remove keeps other rows' server errors (was wiped by RHF revalidation); +2 tests; admin checks 270/270.

## Handover notes
- Touched outside `paths` (needed for reuse): `grants/PriorityField.tsx` (generic `control` + `name`),
  `GrantFormModal.tsx` (passes `name="priority"`), `users/useUserActions.tsx` (second wizard call site).
- Row server messages drop markdown backticks (`withoutBackticks` in `grantText.ts`), like the single-grant 409.
- The flagged-rows alert and "Remove" also apply to the user wizard (same all-or-nothing contract; copy without
  "change the priority"). Existing user wizard tests unchanged and green.
- Bulk wizard shows no "Used on this cluster" priorities (would be N+1); taken priorities come from the 400.
- Style probe not compared against OCP (reference console down); rerun when it is up.
