---
id: T-0177
title: Edit labels and Edit annotations modals (common actions)
status: done
owner: frontend-engineer
checkpoint: 4a
depends_on: [T-0176]
paths: [web/src/features/resources/actions/EditLabelsModal.tsx, web/src/features/resources/actions/EditLabelsModal.module.css, web/src/features/resources/actions/ResourceMutationModal.tsx, web/src/features/resources/actions/EditAnnotationsModal.tsx, web/src/features/resources/actions/labelValidation.ts, web/src/features/resources/actions/useResourceActions.tsx, web/src/features/resources/actions/EditMetadataModals.test.tsx, web/src/features/resources/actions/ResourceActions.test.tsx]
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
- [x] ACT-2: modal titled "Edit labels", prefilled, names object + cluster + env (SAFE-1); Save sends one JSON Patch to `/metadata/labels`; details show new labels without reload (MSW test).
- [x] ACT-3: key/value rows, "Add more", remove row; Save patches `/metadata/annotations`.
- [x] ACT-4: RO → both items aria-disabled with reason; no PATCH sent. ACT-6: success toast / inline `Status.message` on 422.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23 frontend-engineer: started; modals on ResourceMutationModal, labelValidation, common items in useResourceActions.
- 2026-11-23 frontend-engineer: done; 19 tests in EditMetadataModals.test.tsx, KindActions/ResourceActions expectations updated; gate green.
- 2026-11-23 frontend-engineer: fix round 1. Added `variant` and `isSaveDisabled` to ResourceMutationModal. Labels modal is medium with an OCP `.co-tags-input` box
  and plain closable labels; annotations modal is large with a "Remove" tooltip; added a 422 test for annotations.

## Review
### Round 1 UX (ux-designer, 2026-11-23): CHANGES_REQUESTED
Checked on mock dev-1 `shop/deployments/web` (admin) + prod-eu-1 (alice), light theme, 1280. OK: menu order (Edit labels, Edit annotations, Edit Deployment, Delete Deployment = OCP `useCommonActions.ts`); title, OCP help copy, "Labels for <icon> name"; `app=frontend` placeholder; add/remove/Backspace; invalid-key red state; Key/Value 5/6/1 grid + "Add more" with add-circle icon; blank first row; toast "Labels of web updated on Development 1"; RO alice: both items aria-disabled with "Your access to prod-eu-1 is read-only.".
- U1 Labels modal — `small` (560px); OCP `LabelsModalOverlay` uses `ModalVariant.medium` (`public/components/modals/labels-modal.tsx`) — add a `variant` prop to `ResourceMutationModal` (extend `paths`) and pass `medium`.
- U2 Annotations modal — `small` (560px), so keys truncate ("deployment.kubernetes.i…"); OCP `AnnotationsModalOverlay` uses `ModalVariant.large` (`public/components/modals/tags.tsx`) — pass `large`.
- U3 Labels input — single-line 37px box; OCP `.co-tags-input` is a multi-line area: padding `--pf-t--global--spacer--sm`, `.tags` flex-wrap, gap `spacer--xs`, `min-height: 120px`, `align-content: flex-start` (`public/components/utils/_label.scss` L30-45) — give the box that min-height/padding (comment citing OCP), labels wrap from the top-left.
- U4 Labels Save — enabled while input is invalid; OCP `isDisabled={stale || !isInputValid}` (labels-modal.tsx footer) — add `isSaveDisabled` to `ResourceMutationModal` now (same file as U1), not as a follow-up.
- U5 Labels chips — rendered as PF editable labels (dashed underline, click-to-edit); OCP `SelectorInput` `renderTag` is a plain closable `Label` (`public/components/utils/selector-input.tsx` L204-212) — drop `isEditable`/`onEditComplete` (contract asked for them; OCP parity wins per UX.md §0).
- U6 Annotations remove button — no tooltip; OCP wraps it in `<Tooltip content="Remove">` (`public/components/utils/name-value-editor.tsx` L150) — add the tooltip.
- Note (not this task): Edit Deployment stays enabled for read-only alice by T-0176 design (opens YAML); inner input focus ring inside the bordered box is the global focus style, also on plain TextInputs.

### Round 1 architect (frontend-architect, 2026-11-23): CHANGES_REQUESTED
- F1 `EditLabelsModal.tsx:236`, `ResourceMutationModal.tsx` — Save enabled while invalid (deviation 1) — required now, not a follow-up: UX U1/U2 already open `ResourceMutationModal` for `variant`, so add optional `isSaveDisabled` in the same change (extend `paths`), pass `entryErrors.size > 0` (OCP `isDisabled={!isInputValid}`); annotations may keep rhf submit-time errors. T-0182's `description` prop is additive: whichever lands second rebases (trivial merge).
- Deviation 2 (TextInputGroup + editable LabelGroup instead of `addLabelControl`): accepted — matches OCP `SelectorInput`'s single bordered box and is idiomatic PF; apply UX U3 sizing.
- Deviation 3 (KindActions.test.tsx outside paths): accepted; the semantic change is the two expectation arrays, the rest is prettier churn (nit: keep reformatting out of unrelated hunks next time).
- Deviation 4 (access checks): OK — `useActionAccess` drops `name` when `reviewByName` is false and `k8sQueryKeys.access` dedupes, so a list does one review per verb per namespace (test asserts exactly 2: patch, delete). No N+1.
- JSON Patch: OK — the whole map is the `value` at `/metadata/labels|annotations`, so keys never enter a JSON Pointer and `/`/`~` need no escaping; `add` vs `replace` from `metadata.<map> !== undefined` is correct.
- Validation: OK — `metadataKeyError` (DNS-subdomain prefix ≤253, name ≤63) and `labelValueError` mirror apimachinery; duplicates flagged; annotation values unconstrained (correct).
- 422: OK — inline `Status.message`, dialog stays open (labels test). Nit: no annotations 422 test (same `useMetadataPatch` path).
- Gate: lint/typecheck/build ok; full run 9 unrelated failures (AppShell, preferences, AuditLogPage, … 5 s timeouts under parallel load); actions/ + those files rerun alone: 92/92 pass.
### Round 2 UX (ux-designer, 2026-11-23): APPROVE
- U1 fixed: labels modal 840px (`medium`). U2 fixed: annotations modal 1120px (`large`), keys no longer truncated.
- U3 fixed: box padding 8px (`spacer--sm`), main min-height 120px, gap 4px, wrap, align-content flex-start = OCP `_label.scss` L30-45.
- U4 fixed: Save disabled while `Bad!` is invalid, re-enabled when cleared. U5 fixed: 0 `pf-m-editable` labels, plain closable chips.
- U6 fixed: remove button shows tooltip "Remove". No regressions seen.

### Round 2 architect (frontend-architect, 2026-11-23): APPROVE
- F1 fixed: `ResourceMutationModal` gains optional `variant` (default `small`) and `isSaveDisabled` (Button `isDisabled`, submit guarded); labels pass `medium` + `isInvalid`, annotations `large`; test asserts Save disabled.
- U5 deviation accepted: plain closable labels (OCP `SelectorInput` `renderTag`); with only valid entries addable, only typed text can be invalid, which simplifies validation correctly.
- `EditLabelsModal.module.css`: OCP `.co-tags-input` values with source cited; `:global(.pf-v6-c-…)` has precedent (ProjectBar, FavoriteButton). OK.
- Annotations 422 test added (inline message, dialog stays open). Gate: lint/typecheck/build ok, 957/957 tests, no timeouts.
- Rebase onto cp/4-workloads 894fbd8 (T-0182): `ResourceMutationModal.tsx` conflicts in 3 hunks (props interface, destructuring, `<Modal>` JSX); keep both sides, `variant={variant}` replacing `"small"` beside T-0182's `aria-describedby`/`elementToFocus`. KindActions.test.tsx merges cleanly. Nit: T-0182 notes the focus trap beats `autoFocus`, so pass `elementToFocus` for the labels input after the rebase.

## Handover notes
- Common items are now Edit labels, Edit annotations, Edit <Kind>, Delete <Kind> (OCP order). Both new items are gated by `patch`
  (a list does one access review per verb per namespace). One `open` state holds the single common dialog.
- `useMetadataPatch` and `metadataTarget` (in EditLabelsModal.tsx) send one JSON Patch `add|replace` with the whole map as value.
- `ResourceMutationModal` gained the optional `variant` prop (default `small`) and `isSaveDisabled`, each on its own prop line
  next to T-0182's `description` and `elementToFocus` props, which are also additive.
- Labels (medium): TextInputGroup with a LabelGroup of plain closable labels. A CSS module copies OCP `.co-tags-input` (sm
  padding, 120px min-height). Enter, comma, space and blur add a label; `key` alone means an empty value. Invalid or duplicate
  typed text turns the box red with helper text and disables Save.
- Deviation (UX U5, OCP parity wins): no in-place label editing, although the contract asked for `isEditable`/`onEditComplete`.
  The architect accepted the TextInputGroup structure in place of `addLabelControl`.
- Annotations (large): react-hook-form `useFieldArray` + zod `annotationsSchema`; blank-key rows are dropped; keys must be
  qualified names and unique. Removing the only row leaves a blank row. The remove button has a "Remove" tooltip.
- Not done: OCP details "Labels"/"Annotations" pencil links (MetadataSection is outside `paths`). Possible follow-up.
