---
id: T-0262
title: Grant access modal — Subject section (User/Group), group typeahead with free text, Priority (UIG-1/2/3/5)
status: todo
owner: frontend-engineer
checkpoint: 4.5a
depends_on: [T-0261]    # lane A (grants); serial after T-0261 (same folder, grantText.ts); runs on mocks, BE T-0252
paths: [web/src/features/admin/grants/GrantFormModal.tsx, web/src/features/admin/grants/grantForm.schema.ts, web/src/features/admin/grants/SubjectSection.tsx, web/src/features/admin/grants/GroupTypeahead.tsx, web/src/features/admin/grants/PriorityField.tsx, web/src/features/admin/grants/api.ts, web/src/features/admin/grants/grantText.ts, web/src/features/admin/grants/GrantFormModal.test.tsx, web/src/features/admin/grants/GrantsTab.test.tsx, web/src/features/admin/grants/TypeaheadSelectField.tsx]
review_rounds: 0
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
- [ ] UIG-1: Subject section with User (default) / Group radios and "Subject name"; switching kind clears the name.
- [ ] UIG-2: group typeahead lists mock host groups (no `system:*`), offers `Use "<typed>"`; with `setMockHostGroups('forbidden')` the info alert shows and a typed name can be granted.
- [ ] UIG-3: Priority NumberInput only for Group, helper text verbatim, used priorities listed; taken priority → GRP-4 message on the field (client and from the 409); 1–1000 enforced.
- [ ] GRP-3/GRP-6 messages show on Subject name (client check and server 400 mapping).
- [ ] Edit access on a group grant changes priority/mode/credential and saves with `version`; user edit unchanged.
- [ ] UIG-5: production read-write group warning names the group and cluster.
- [ ] UIG-6: read-only admins never reach the modal (button disabled, existing test still passes).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
