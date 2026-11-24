---
id: T-0262
title: Grant access modal — Subject section (User/Group), group typeahead with free text, Priority (UIG-1/2/3/5)
status: done
owner: frontend-engineer
checkpoint: 4.5a
depends_on: [T-0261]    # lane A (grants); serial after T-0261 (same folder, grantText.ts); runs on mocks, BE T-0252
paths: [web/src/features/admin/grants/GrantFormModal.tsx, web/src/features/admin/grants/grantForm.schema.ts, web/src/features/admin/grants/SubjectSection.tsx, web/src/features/admin/grants/GroupTypeahead.tsx, web/src/features/admin/grants/PriorityField.tsx, web/src/features/admin/grants/api.ts, web/src/features/admin/grants/grantText.ts, web/src/features/admin/grants/GrantFormModal.test.tsx, web/src/features/admin/grants/GrantsTab.test.tsx, web/src/features/admin/grants/TypeaheadSelectField.tsx]
review_rounds: 1
---

## Goal
From a cluster's Access tab an admin can grant access to a **group** as easily as to a user, with OCP's RoleBinding
"Subject" wording, and set/edit the group's priority with the precedence rule spelled out in place.

## Scope
- In: create mode Subject section; group typeahead with "Use "<typed>"" free text and the host-listing alert; Priority
  field (create + edit of group grants); `useCreateGroupGrant`; server error mapping; production write warning copy for groups.
- Out: table/revoke (T-0261), bulk wizard (T-0264).

## Contract / design notes
- Schema (`grantFormSchema`): add `subjectKind: z.enum(['user','group'])` (default `'user'`), `priority:
  z.number().int().min(1).max(1000).optional()`; `superRefine` requires priority for groups ("Priority must be between 1
  and 1000." — same as the API) and a group name check mirroring GRP-3/GRP-6 (`system:` prefix any case →
  "System groups can't be granted access."; else "Enter a valid group name."). The Api stays authoritative.
- `SubjectSection({ control, granted })` = PF `FormSection title="Subject" titleElement="h2"` → `FormGroup
  role="radiogroup" isStack` with `Radio` "User" / "Group" (use `shared/forms:RadioGroupField` if it renders this
  shape, else PF `Radio`s via `useController`) → `FormGroup label="Subject name" isRequired`: `UserTypeahead` for user,
  `GroupTypeahead` for group. Changing kind clears `target` and `priority` (UIG-1). Shown only in create mode; edit
  mode shows the subject read-only in the title ("Edit access of group `X` to `C`").
- `GroupTypeahead({ control, granted })`: options from `useGroups()` (T-0260); free-text item `Use "<typed>"` (shared
  `TypeaheadSelect` already supports a custom item label — `shared/ui/TypeaheadSelect.tsx` L18); groups already granted on this
  cluster are disabled like users today. When `hostStatus !== 'ok'` or the query fails: inline PF `Alert variant="info"
  isInline isPlain` "Could not list groups on the host cluster. You can still type a group name." (UIG-2) and the
  field still works. Option description: `Not found on host cluster` for `foundOnHost === false`.
- `PriorityField({ control, usedPriorities })`: PF `NumberInput` (min 1, max 1000, no default value — Q3), label
  "Priority", helper "When a user is in several groups with access to this cluster, the highest priority wins. A direct
  user grant always wins." plus "Used on this cluster: 200 (platform), 50 (ghost-team)." built from the cluster's group
  grants (`existing` prop, excluding the edited grant); a used value shows the GRP-4 copy inline before submit.
  Exemplar for the NumberInput/`useController` pairing: `resources/workloads/deployments/form/AdvancedSection.tsx:ScalingSection`.
- Submit: user → `useCreateGrant` (unchanged); group → `useCreateGroupGrant()` = `POST
  /api/admin/groups/{groupName}/grants` (path param encoded by openapi-fetch), same invalidation as `useCreateGrant`.
  Edit group grant → `useUpdateGrant` with `priority`. `applyServerErrors` field map: `groupName` → `target`,
  `priority` → `priority`; 409 `Grants.PriorityTaken` → set on `priority` (contract §3 "FE shows it on Priority");
  409 `Grants.AlreadyExists` → on `target`; version 409 → `ConflictAlert` as today.
- UIG-5: read-write on a production cluster for a group: "Members of `X` will be able to change resources on `<cluster>`."
  (`grantText.ts:productionGroupWriteWarning`). Success toast names the group.
- Accessibility: the radio group has an accessible name "Subject kind"; focus moves to Subject name on kind change.

## Context pack
- Docs: `FRONTEND.md` § Forms (ADR-0015); `UX.md` § 8 Forms, § 9 Modals.
- Exemplars: `grants/GrantFormModal.tsx` (whole, 195 lines — you edit most of it), `grants/UserTypeahead.tsx` (52 lines, copy for `GroupTypeahead`), `grants/TypeaheadSelectField.tsx:TypeaheadSelectField`.
- Touch points: `grants/grantForm.schema.ts:grantFormSchema`, `grants/api.ts:useCreateGrant/useUpdateGrant/invalidateAfterSuccess`, `groups/api.ts:useGroups` (T-0260), `shared/forms/applyServerErrors.ts:applyServerErrors`, `grants/grantText.ts:productionWriteWarning`.
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/RBAC/bindings.tsx` L600-603 (subjectKinds) and L687-729 (`FormSection title="Subject"`, `Radio` stack, "Subject name"). OCP uses a TextInput; our typeahead is the fleet addition (UIG-2).

## Acceptance criteria
- [x] UIG-1: Subject section with User (default) / Group radios and "Subject name"; switching kind clears the name.
- [x] UIG-2: group typeahead lists mock host groups (no `system:*`), offers `Use "<typed>"`; with `setMockHostGroups('forbidden')` the info alert shows and a typed name can be granted.
- [x] UIG-3: Priority NumberInput only for Group, helper text verbatim, used priorities listed; taken priority → GRP-4 message on the field (client and from the 409); 1–1000 enforced.
- [x] GRP-3/GRP-6 messages show on Subject name (client check and server 400 mapping).
- [x] Edit access on a group grant changes priority/mode/credential and saves with `version`; user edit unchanged.
- [x] UIG-5: production read-write group warning names the group and cluster.
- [x] UIG-6: read-only admins never reach the modal (button disabled, existing test still passes).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-24 frontend-engineer: started; OCP ref `RBAC/bindings.tsx` L687-729 (Subject FormSection, Radio stack, "Subject name").
- 2026-11-24 frontend-engineer: SubjectSection/GroupTypeahead/PriorityField, `useCreateGroupGrant`, group toasts/title/
  UIG-5 copy, `subjectKind` now required in `grantText`; 7 tests in `GrantFormModal.test.tsx`, picker label in
  `GrantsTab.test.tsx` → "Subject name". Out-of-path: `UserTypeahead.tsx` (label + autofocus). Gate green.
- 2026-11-24 frontend-engineer: fix round 1 — Enter on free text closes the menu (`TypeaheadSelect`, +test); GRP-4 copy
  without backticks, 409 PriorityTaken shows client text (group parsed from detail); tests updated for `platform`@10;
  `requiredPriority` throws instead of sending 0; option facts joined with " · "; TSDoc rewrap. Gate green.

## Review
- 2026-11-24 frontend-architect, round 1: **CHANGES_REQUESTED**. The code is good, but the grants tests are red on the current tree (5 failures; lint and typecheck green). Cause: T-0265 (`a293717`) added a `platform` group grant on staging-eu-1 at priority 10 (`mocks/fixtures/grants.ts:90`) after your gate ran.
  - `GrantFormModal.test.tsx:54-74` — expects "Used on this cluster: 100 (sre), 50 (ghost-team)." — add `10 (platform)` (sorted highest first).
  - `GrantFormModal.test.tsx:83-88` — `platform` now holds a grant — expect `'platformalready has access'`.
  - `GrantFormModal.test.tsx:126` — priority 10 is now taken, so the submit is blocked on the client — pick a free value (e.g. 20).
  - `GrantFormModal.test.tsx:184+` (edit) — the used list now also contains `10 (platform)` — update the expected text.
  - `GrantsTab.test.tsx:495` (T-0261 UIG-4, in your paths) — expect `['ghost-team', 'platform', 'sre']`.
  - Judged choices, all accepted: (a) `priority: number | null` is a justified deviation from `.optional()` (it lets `applyServerErrors` map errors onto a leaf); (b) relabelling `UserTypeahead.tsx` to "Subject name" is the minimal out-of-path change OCP parity needs; (c) the edit title matches the contract; (d) the client-side taken check plus `codeToField` for `Grants.PriorityTaken` matches contract §3.
  - Parity is OK against `bindings.tsx` L687-729: `FormSection` "Subject" h2, `FormGroup role="radiogroup" isStack` with `Radio`s and "Subject name" isRequired. T-0261 note met: `subjectKind` is required in `grantText`.
  - Nit (optional): `UserTypeahead.tsx:32` — the TSDoc line is about 165 characters; rewrap it to 110.
  - Nit (optional): `GrantFormModal.tsx:191` — the schema already guarantees a value, so `priority ?? 0` silently sends an invalid 0; prefer a non-null narrowing or a comment.
- 2026-11-24 ux-designer round 1: **CHANGES_REQUESTED** (mock :5391, prod-eu-1 + staging-eu-1, 1280 light; OCP `public/components/RBAC/bindings.tsx` L687-729)
  - Matches OCP: `FormSection title="Subject" titleElement="h2"` (16px/600), `FormGroup role="radiogroup" isStack` User/Group, then required "Subject name"; section gap 24px. Focus moves to Subject name when the kind changes. Edit title, toasts and the UIG-5 group warning match the spec.
  - Subject name: after Enter on `Use "<typed>"` the value is applied, but the menu stays open and lists all 4 groups again. Picking an option by click or highlight closes it (`TypeaheadSelect` `choose()` → `close()`) — fix: close the menu after `onEnterWithoutHighlight` in `shared/ui/TypeaheadSelect.tsx` L138 (or move the free text through `choose`).
  - Priority — the taken error shows raw markdown backticks: "Priority 50 is already used by group \`ghost-team\` on this cluster." Users see the literal backticks, and no other copy in the UI uses them (UX.md copy style) — fix: drop the backticks from `priorityTakenText`, and on a 409 `Grants.PriorityTaken` set the client text instead of the Api detail.
  - Non-blocking: Priority/Credential/Access mode sit outside any FormSection, so PF adds 56px after the Subject section (24 + section margin). This is PF-native and reads as a deliberate break. OCP puts every field in a section; you can leave it as is.
  - Non-blocking: option facts "Not found on host cluster  already has access" mix sentence case and lowercase with no separator. The lowercase follows the existing `UserTypeahead`, so this is a follow-up only.

## Handover notes
- `priority` is `number | null` (default `null`), not `.optional()`: `applyServerErrors` only maps errors onto leaf
  values, so `undefined` would push a 400/409 on priority into the alert.
- Both pickers are labelled "Subject name" (OCP); the radiogroup has `aria-label="Subject kind"` (no visible label, as OCP).
- `TypeaheadSelectField` gained `allowFreeText` (`Use "<typed>"`, Enter applies it) and `isAutoFocus` (focus on kind change).
- Taken priority: shown live as the field error from the cluster's group grants; submit sets it via `setError` and
  sends nothing. Edit mode reads them with `useClusterGrants(cluster, { enabled })` (only for group grants).
- Edit title for groups: "Edit access of group X to C"; user title unchanged. Toasts: "Granted group X …",
  "Changed access of group X to C".
- PriorityTaken: field shows `priorityTakenText` (no backticks); the 409's group comes from the Api detail's `X`.
- Style probe not run: OCP ref (:9000) down and the probe never clicks, so it can't open the modal. UX review needed.
