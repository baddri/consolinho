---
id: T-0150
title: "Inspect namespaces" chip input in the test, add and rotate credential dialogs
status: done
owner: frontend-engineer
checkpoint: 3.7
depends_on: [T-0146]
paths: [web/src/shared/forms, web/src/features/admin/connection-test, web/src/features/admin/credentials]
review_rounds: 0
---

## Goal
NST-1, NST-2 (client), NST-5/6 (prefill): every connection-test entry point takes up to 10 namespaces as chips;
stored-credential and rotate tests are prefilled from the credential's saved `inspectNamespaces`.

## Scope
- In: a shared RHF chip-input adapter; zod schema; `TestConnectionModal`, `RotateCredentialModal` (unsaved-token
  test), `AddCredentialModal` (saved with the credential if the BE create request has `inspectNamespaces` — check the
  generated `AddCredentialRequest`; if absent, omit the field there and note it in the work log).
- Out: result rendering (T-0151); server validation (BE + MSW in T-0146).

## Contract / design notes
- `shared/forms/ChipInputField.tsx` (export from `shared/forms/index.ts`), RHF adapter for `string[]` built from PF
  `TextInputGroup` > `TextInputGroupMain` > `LabelGroup` of `Label`s (`onClose`, `closeBtnAriaLabel="Remove <value>"`)
  + `TextInputGroupUtilities` clear button (PF "Text input group — with filters/labels" example; check patternfly.org):
  ```ts
  export interface ChipInputFieldProps<T extends FieldValues> extends FieldBaseProps<T> {
    helperText?: string;      // static part
    maxItems?: number;        // renders "N of max" in helper text when ≥ 1 entry (spec §5)
    normalize?: (raw: string) => string;   // default trim
  }
  ```
  Enter or `,` adds the typed text (trimmed, empty ignored, duplicate ignored); Backspace on empty input removes the
  last chip; per-entry field errors from zod (`path: [name, index]`) are shown on the field, naming the entry. Follow
  `fieldA11y` (label `for`, `aria-describedby`, `aria-invalid`).
- `connection-test/testConnection.schema.ts`: `inspectNamespacesSchema = z.array(dnsLabel(63)).max(10, 'Up to 10 namespaces.')`
  with entry message "Not a valid namespace name: <value>." and dedupe in a `transform`. Replaces `inspectNamespaceSchema`.
- Field: label "Inspect namespaces", helper "Optional. Up to 10. Lists what the token may do in each namespace." (NST-1).
- `TestConnectionModal`: default `inspectNamespaces` = the selected credential's saved list; re-prefill when the
  credential select changes (NST-6). After a stored test, invalidate the credential queries so the saved list
  refreshes (NST-5) — reuse the keys the current test mutation already invalidates.
- `RotateCredentialModal`/`useTokenTest`: `run(token, inspectNamespaces)`; prefilled from `credential.inspectNamespaces`;
  rotation itself doesn't send the list (NST-5 "Rotation keeps the saved list").
- `AddCredentialModal`: optional field, empty default, sent on create (if in contract).
- Server 400 on `inspectNamespaces` maps via `applyServerErrors` (check it handles an array-field name).

## Context pack
- Docs: `FRONTEND.md` § Forms (ADR-0015); `UX.md` §8 (forms), §9 (modals); spec §5 "Namespace input".
- Exemplars: `web/src/shared/forms/TextField.tsx` (adapter shape + `fieldA11y`); `shared/forms/dnsLabel.ts:dnsLabel`;
  `web/src/shared/ui/TypeaheadSelect.tsx` (existing `TextInputGroup` use).
- Touch points: `connection-test/testConnection.schema.ts` L5-21; `TestConnectionModal.tsx:TestConnectionForm` L108-175
  (defaults L123, submit L128-132, field L165-170); `useTokenTest.ts:useTokenTest` L26-45; `credentials/RotateCredentialModal.tsx`
  L82-111, L151-188; `credentials/AddCredentialModal.tsx:AddCredentialForm` L45-80; `credentials/credentialForm.schema.ts`
  L24-44; tests `connection-test/TestConnection.test.tsx`, `credentials/ClusterCredentialsTab.test.tsx`, `shared/forms/forms.test.tsx`.
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/utils/selector-input.tsx:SelectorInput`
  (labels-as-chips input of Edit labels; OCP uses react-tagsinput — we use PF `TextInputGroup` + `LabelGroup` per spec §5).

## Acceptance criteria
- [x] All three dialogs show "Inspect namespaces" with the NST-1 helper text; Enter/comma add, chip remove buttons
      `aria-label="Remove team-a"`, "3 of 10" counter (NST-1, spec §5).
- [x] 11 entries or an invalid name ⇒ field error naming the entry, no request sent; whitespace trimmed, duplicates dropped (NST-2).
- [x] Stored test dialog prefills the selected credential's saved list; rotate's token test prefills it too (NST-5/6).
- [x] Requests carry `inspectNamespaces` in entry order (MSW assertions). Build, lint and tests green (CLAUDE.md rule 4).
- [x] Probe pages (ux review): test dialog on `/fleet/admin/clusters/prod-eu-1/credentials` with 3 chips + an error;
      OCP counterpart: Edit labels modal on any `/k8s/ns/default/deployments/<name>` (label chips spacing).

## Work log
- 2026-11-23 frontend-engineer: in_progress → in_review. `ChipInputField` (PF TextInputGroup + LabelGroup), `inspectNamespacesSchema`,
  `applyServerErrors` `listFields` option (whole-list 400 key lands on the field); wired into test, add and rotate
  dialogs. `AddCredentialRequest` has `inspectNamespaces`, so Add sends it. Probe not run: it only navigates, so it
  can't open a modal or type chips (left for the ux review, see AC 5).

## Review
- 2026-11-23 ux-designer, round 1: **APPROVE** (mock UI :5231, Playwright script, 1280 light; test + add dialogs, 3 chips + `Bad_NS`, 11 entries).
  - OK: chips are default PF `Label`s (filled grey), 26px high, 4px gap = OCP `public/components/utils/_label.scss` `.co-tags-input .tags { gap: spacer--xs }`; OCP `utils/selector-input.tsx` renders the same plain `PfLabel` with `onClose`.
  - OK: invalid entry turns `pf-m-red`, group gets `pf-m-error` + status icon, helper "Not a valid namespace name: Bad_NS." names the entry; 11 entries → "Up to 10 namespaces.", group wraps (75px), no overflow "N more" collapse.
  - OK: `aria-invalid`, `aria-describedby=field-inspectNamespaces-helper`, Backspace removes the last chip, Shift+Tab from input reaches "Remove <last>"; modal `pf-m-md`, one close control (UX.md §9).
  - Nit (non-blocking, follow-up if wanted): counter reads as a run-on, "…in each namespace. 2 of 10"; "2 of 10 added." or a second `HelperTextItem` would read better (spec §5 only fixes "3 of 10").
  - Nit (non-blocking): when the chips wrap, the clear X sits at the top and the error icon at the bottom right (PF `TextInputGroup` default alignment); acceptable, no custom CSS.
  - Not checked visually: prefill (no mock credential has a saved `inspectNamespaces`; covered by unit tests). OCP reference console not shot (Edit labels modal needs an action click; compared against source instead).
- 2026-11-23 frontend-architect, round 1: **APPROVE**. `check-fe.sh` green (873 tests). `RadioGroupField.tsx` untouched, so no T-0148 conflict.
  - Extras accepted: (a) splitting a pasted `a,b` and adding text on blur keeps the "Enter/`,` adds" contract and stops a submit click from dropping typed text; (b) `listFields` is opt-in, default behaviour is unchanged and it is tested in forms.test; (c) an invalid chip blocking Rotate shows a field error, so it is consistent form UX (OCP validates every visible field).
  - Nit (optional): `TestConnectionModal.tsx` subscribe callback — `setValue` on a credential switch leaves the old list's errors; pass `{ shouldValidate: form.formState.isSubmitted }` or `clearErrors('inspectNamespaces')`.
  - Nit (optional): `ChipInputField.tsx` `aria-label={label}` on `TextInputGroupMain` repeats the `<label for>`, so drop it if the tests still find the textbox by its label.
  - Nit (optional): TSDoc lines in `AddCredentialModal.tsx` (component doc) and `RotateCredentialModal.tsx` (component doc) run past 120 columns, so rewrap them.
  - AC 5 (probe) is left for the ux review as noted.

## Handover notes
- `shared/forms/ChipInputField.tsx`: Enter/`,` add, a pasted `a,b` is split, blur adds pending text (so clicking submit never
  drops it), Backspace on an empty input removes the last chip, clear button `Clear <label>`, chip list `aria-label="<label> entries"`,
  invalid entries turn red. Errors: `message`, `root` (zod puts the list error there when entries also fail) and
  numeric entries are joined into one helper line.
- `applyServerErrors(..., { listFields: ['inspectNamespaces'] })`: explicit opt-in (bulk `items` stays a collection).
- Shared copy/constants in `connection-test/testConnection.schema.ts` (`INSPECT_NAMESPACES_*`, `MAX_INSPECT_NAMESPACES`).
- The rotate form validates `inspectNamespaces` too, so an invalid typed chip blocks Rotate with a visible field error.
  Rotate sends only the token.
- The test dialog re-prefills when the user picks a credential (`form.subscribe`, `type: 'change'`). The saved list refreshes
  via the existing `adminKeys.all` invalidation.
- Counter renders as "<helper> 3 of 10" (hidden while an error replaces the helper).
- `ConnectionTestResultView`/`NamespaceRulesTable` untouched (T-0151).

## Orchestrator reconciliation (2026-11-23)
Backend contract is final in `T-0139` §Contract A/B/C plus `T-0140`/`T-0141`/`T-0142`. Differences from the design brief:
request `distribution` is nullable (`distribution?: ClusterDistribution | null`, missing → field error), responses non-null;
`ConnectionTestStep` gains `distribution` (between `identity` and `openShiftVersion`, 6 steps — needs a label);
`namespaceRules` is always an array of `{namespace, incomplete, evaluationError, rules|null, error|null, failureKind|null}`
(exactly one of rules/error); `AddCredentialRequest` **does** carry optional `inspectNamespaces` (field keys
`inspectNamespaces`, `inspectNamespaces[i]`).
