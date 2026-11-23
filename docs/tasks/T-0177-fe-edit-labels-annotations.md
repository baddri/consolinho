---
id: T-0177
title: Edit labels and Edit annotations modals (common actions)
status: todo
owner: frontend-engineer
checkpoint: 4a
depends_on: [T-0176]
paths: [web/src/features/resources/actions/EditLabelsModal.tsx, web/src/features/resources/actions/EditAnnotationsModal.tsx, web/src/features/resources/actions/labelValidation.ts, web/src/features/resources/actions/useResourceActions.tsx, web/src/features/resources/actions/EditMetadataModals.test.tsx, web/src/features/resources/actions/ResourceActions.test.tsx]
review_rounds: 0
---

## Goal
ACT-1..4: "Edit labels" and "Edit annotations" for every kind with actions (Event has none; Projects keep them, as
OCP `project-provider.ts` L53), wired as the common items of `useResourceActions`.

## Scope
- In: both modals on `ResourceMutationModal`, zod validation, JSON Patch, gating `patch <plural>`, tests.
- Out: kind actions.

## Contract / design notes
- Edit labels (OCP `labels-modal.tsx` + `SelectorInput`): title "Edit labels"; help text "Labels help you organize and
  select resources. Adding labels below will let you query for objects that have similar, overlapping or dissimilar
  labels." (OCP copy); input = PF `LabelGroup isEditable` with `addLabelControl` (a `TextInputGroup` that accepts
  `key=value` on Enter/comma/space and Backspace removes the last label — OCP `SelectorInput` behaviour); each label
  editable (`onEditComplete`) and removable. Invalid `key=value` (k8s qualified-name / value rules in
  `labelValidation.ts`) shows the input in error state with helper text; Save disabled while invalid.
- Patch: `[{ op: obj.metadata.labels ? 'replace' : 'add', path: '/metadata/labels', value }]`. Success message
  "Labels of <name> updated".
- Edit annotations (OCP `modals/tags.tsx` `TagsModal`/`AnnotationsModal` L28-148): title "Edit annotations"; rows of
  Key + Value `TextInput`s with a remove (minus-circle, aria-label "Remove") button; "Add more" link button with
  plus icon; empty rows ignored on save; duplicate keys → field error. Patch `/metadata/annotations` like labels.
- Use react-hook-form `useFieldArray` + zod for annotations (ADR-0015 adapters in `shared/forms`).

## Context pack
- Docs: `FRONTEND.md` § Forms (ADR-0015); `UX.md` §8-9.
- Exemplars: `shared/forms` field adapters + `applyServerErrors`; T-0176 `ResourceMutationModal`.
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/modals/labels-modal.tsx`,
  `public/components/modals/tags.tsx` L28-148, `packages/console-app/src/actions/hooks/useCommonActions.ts` L99-120.

## Acceptance criteria
- [ ] ACT-2: modal titled "Edit labels", prefilled, names object + cluster + env (SAFE-1); Save sends one JSON Patch to `/metadata/labels`; details show new labels without reload (MSW test).
- [ ] ACT-3: key/value rows, "Add more", remove row; Save patches `/metadata/annotations`.
- [ ] ACT-4: RO → both items aria-disabled with reason; no PATCH sent. ACT-6: success toast / inline `Status.message` on 422.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
