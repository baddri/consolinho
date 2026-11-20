---
id: T-0025
title: Shared forms — RHF ⇄ PatternFly field adapters, server error mapping, conflict alert
status: done
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0022]
paths: [web/src/shared/forms/]
review_rounds: 1
---

## Goal
Implement ADR-0015 once so every CP1 form (user create, cluster register/edit, credential add/rotate, grant, bulk
grant) shows client and server validation inline the same way and survives 409 version conflicts without losing
input (ADM-4). **Parallel group F2** (with T-0023, T-0024).

## Scope
- In: `web/src/shared/forms/` with `index.ts`.
- Out: concrete forms (feature tasks).

## Contract / design notes
- Field adapters (each `{ control, name, label, isRequired?, helperText?, ...controlProps }`, built on
  `useController`, rendering `FormGroup` + control + `FormHelperText > HelperText > HelperTextItem
  variant="error"` when invalid, `validated="error"`, `aria-invalid`, stable `fieldId` from `name`):
  `TextField` (incl. `type="password"` with a show/hide `Button` in an `InputGroup`), `TextAreaField`,
  `SelectField` (`FormSelect` options `{ value, label, isDisabled? }`), `SwitchField`, `CheckboxField`,
  `RadioGroupField` (`options: { value, label, description? }[]`).
- `toFormPath(jsonPath: string): string` — `items[2].credentialId` → `items.2.credentialId`; `''` stays `''`.
- ```ts
  export interface FormProblem { title: string; detail?: string; messages: string[]; isConflict: boolean }
  export function applyServerErrors<T extends FieldValues>(
    error: unknown, form: UseFormReturn<T>,
    options?: { fieldMap?: Record<string, Path<T>>; codeToField?: Record<string, Path<T>> },
  ): FormProblem | null;
  ```
  Field errors for registered fields → `form.setError(path, { type: 'server', message })` (first message;
  `shouldFocus` on the first); `codeToField` maps a 409 `code` (e.g. `Users.UsernameTaken`) to a field with `detail`
  as message; everything else (`''` key, unknown keys, non-field statuses) → returned `FormProblem`.
  `isConflict` = `code === 'Concurrency.Conflict'`. A server key counts as a field when its RHF path resolves in
  `form.getValues()` (`get(values, path) !== undefined`, RHF's exported `get`) — no private RHF internals, no
  hand-maintained field lists. Forms must therefore give every field a default value. Document the rule in TSDoc.
- `FormProblemAlert({ problem: FormProblem | null })` — inline danger `Alert` with `detail` and messages list.
- `ConflictAlert({ problem, onReload, isReloading })` — inline danger `Alert` with the server `detail` and action
  "Reload latest values" (caller refetches and `reset()`s; never automatic).
- zod: use `zodResolver` from `@hookform/resolvers/zod` (zod 4). Export a tiny helper
  `dnsLabel(max: number)` (regex `^[a-z0-9]([-a-z0-9]*[a-z0-9])?$`) reused by cluster/credential/namespace fields.

## Acceptance criteria
- [x] Tests with a demo form (in the test file): client zod error shown inline; server 400 mapped onto a nested
      array field (`items[1].credentialId`) and focused; `''` key and unknown key end up in `FormProblemAlert`;
      `codeToField` maps a 409 to a field; `Concurrency.Conflict` keeps all typed values and `onReload` is called
      from the alert; password field toggles visibility and has `autoComplete="off"`.
- [x] Fields are labelled (`getByLabelText`) and errors are linked (`toHaveAccessibleDescription`).
- [x] TSDoc. Build, lint and tests green (rule 4).

## Work log
- 2026-11-19 frontend-engineer: started; read ADR-0015/0016, FRONTEND.md, contract §1/§2, shared/api errors.
- 2026-11-19 frontend-engineer: resumed after rate limit. Fixed `react-hooks/refs` lint errors in TextField/TextAreaField
  (the compiler lint treats the whole `field` object as a ref when `field.ref` is passed; `field` is now destructured).
  Added applyServerErrors/toFormPath, FormProblemAlert, ConflictAlert, dnsLabel, index and `forms.test.tsx` (26 tests).
  lint, typecheck, test (210) and build all green → in_review.
- 2026-11-19 frontend-engineer: round 1 changes.
  - Required 1: only leaf values count as fields (`isLeafField`). Arrays/objects (bulk grant `items`) and the hidden
    `version` go to the alert. Tested in the demo form and directly (result is not `null`).
  - Required 2: added `useFormProblem` (`useFormProblem.ts`, exported). Options are read at submit time through a ref
    updated in an effect. The problem is cleared at the start of every submit, before client validation. `DemoForm`
    now uses the hook. New tests cover resubmit clearing the alert, a client-invalid resubmit also clearing it, and
    `clearProblem` after "Reload latest values".
  - Required 3: the `<Form noValidate>` rule is in the `index.ts`, `useFormProblem` and `types.ts` TSDoc, and the
    `CheckboxField` docs note that it sets native `required`.
  - Nits done: `version` is never a field; focus goes to the checked radio first; `RadioGroupFieldOption.label` is a
    `ReactNode`; the test asserts the alert by heading role instead of a PF class name; `dnsLabel(max,
    { requiredMessage })`.
  - The public API only gained additions (`useFormProblem`, `FormProblemState`, `DnsLabelOptions`); the radio label
    type was widened.
  - Checks: lint 0, typecheck 0, build 0. Tests: 31 in shared/forms pass. The full run has 2 failures, both in
    `src/app/session.test.tsx`, which is T-0027's in-progress work and doesn't import shared/forms.

## Review
**2026-11-19 frontend-architect: CHANGES_REQUESTED (round 1).**
Checks: `npm run lint` clean (no `eslint-disable` anywhere in `shared/forms`), `typecheck` clean, `npm test -- --run`
19 files / 210 tests pass, `npm run build` OK (only the existing >500 kB chunk warning, already a separate follow-up).
The task stayed in scope (`web/src/shared/forms/` only) and the shared boundaries are respected. TSDoc is good, the
adapters use PatternFly idiomatically, and the tests cover every acceptance criterion. The server-key mapping matches
contract §1 and ADR-0015 §4. camelCase JSON paths become RHF paths, `""` goes to the alert, `fieldMap` and
`codeToField` work as ADR-0015 describes, `Concurrency.Conflict` sets `isConflict`, and input is never reset.

Rulings on the engineer's decisions:
- **`useWrapperFocusRef`: accepted.** The lookup starts from a ref the adapter owns, not from the document. It only
  reads and calls `focus()`, and it is documented. Calling `focus()` imperatively through a ref is normal React. Lint
  allows it without any disable: the ban covers `document.*` lookups and `document` globals, not
  `Element.querySelector` on a ref. I added this exception to FRONTEND.md "UI conventions" so later code can't stretch
  it to document-wide lookups or DOM mutation.
- **Every field needs a default value: accepted.** It avoids RHF internals and hand-kept field lists. If a form forgets
  a default, the error shows in the alert instead of under the field, so it is still visible. The leaf-value fix in
  required change 1 is needed to keep that guarantee.
- **Render `ConflictAlert` and `FormProblemAlert` together: accepted.** Each one renders only its own kind, which
  matches ADR-0015 §4/§5. Required change 2 puts both behind a single pattern.
- **`isRequired` without the native `required` attribute: accepted**, but the rule only holds with `<Form noValidate>`.
  See required change 3.
- **Path-derived ids: accepted.** I checked T-0031/0034/0036/0039/0040. Page forms and modal forms never show the same
  field names at the same time in CP1. Add an `idPrefix` (form-level context) only when two forms with shared names
  can be on screen together.
- **Dropping the `$.` prefix: accepted.** ASP.NET's JSON-binding 400s use `$.path` keys, and a bare `$` maps to `''`,
  which goes to the alert.
- **Only the first message per field: accepted.** This is the PF single-HelperTextItem pattern. The next submit shows
  the next problem.
- **Unmatched keys go into the alert without their key: accepted.** Contract messages read on their own. An
  unmatched indexed key means the form has no such row, which is a client bug.
- **`dnsLabel` messages: accepted.** The text matches contract §8.2 exactly. "Required." for empty input is fine
  (optional nit below).
- **`useFormProblem`: add it now, in this task** (required change 2). About 10 forms are about to be written. Without
  the hook, each one would copy `useState`, `setProblem(null)` and the try/catch, and forgetting the reset leaves a
  stale alert on resubmit. It is cheap to add before the feature tasks start and expensive to retrofit afterwards.

Required:
1. `web/src/shared/forms/applyServerErrors.ts:67`: `isField` also accepts arrays and objects. Contract §9.4 has a
   collection-level key: bulk grant `items` ("1–100 entries"). Here `get(values, 'items')` is an array, so `setError('items')`
   runs, no adapter renders that path, `hasFieldErrors` becomes true, and the function returns `null`. The server error
   silently disappears. **Fix:** a key counts as a field only when it resolves to a leaf value
   (`v !== undefined && (v === null || typeof v !== 'object')`). Arrays and objects go to the `FormProblem`. Update the
   TSDoc rule ("…resolves to a non-object value…"), and add a test where an `items` key lands in `FormProblemAlert`
   and the result is not `null`.
2. Add `useFormProblem` to `web/src/shared/forms/useFormProblem.ts` and export it from `index.ts`:
   ```ts
   export function useFormProblem<T extends FieldValues, TTransformed = T>(
     form: UseFormReturn<T, unknown, TTransformed>,
     options?: ApplyServerErrorsOptions<T>,
   ): {
     /** What applyServerErrors left over; pass to ConflictAlert and FormProblemAlert. */
     problem: FormProblem | null;
     /** Like form.handleSubmit: clears the previous problem, awaits onValid, maps a rejection with applyServerErrors
      *  (never rethrows — the error is shown). */
     handleSubmit: (onValid: (values: TTransformed) => Promise<unknown>) => (event?: BaseSyntheticEvent) => Promise<void>;
     /** Clears the alert, e.g. after "Reload latest values" has reset the form. */
     clearProblem: () => void;
   };
   ```
   Read `options` when the submit runs, not at render, so inline object literals don't need memoising. Switch
   `DemoForm` in `forms.test.tsx` to the hook. Add tests that a resubmit clears the previous alert and that
   `clearProblem` removes it. Update the Handover notes usage example.
3. `web/src/shared/forms/types.ts:14` / `CheckboxField.tsx:53`: the TSDoc says `isRequired` never sets native
   `required`. PF `Checkbox` does set `required={isRequired}` on its `<input>`. Text inputs with `type="url"` or
   `"email"` also trigger browser validation that would pre-empt zod. **Fix:** document the real rule. Forms render
   `<Form noValidate>` (state it in `index.ts` and in the `useFormProblem` TSDoc, and in the usage notes), and the
   `isRequired` TSDoc mentions that the checkbox gets native `required`, which `noValidate` neutralises. No code change
   in the adapters.

Optional nits:
- `applyServerErrors.ts:67`: hidden state values such as `version` are leaves too. A 400 on `version`, which would
  be a client bug, would be set on a field nobody renders. Consider treating `version` as never-a-field, since it is a
  contract-wide concurrency token, or add an `ignoreFields` option.
- `fieldA11y.tsx:74`: for radios, focus the checked radio before the first one (try `input:checked`, then fall back).
  A selector list returns elements in document order, not in priority order.
- `RadioGroupField.tsx:10`: T-0034 wants `EnvironmentLabel` next to the environment choices, so consider typing
  `label: ReactNode`. The `description` slot works too.
- `forms.test.tsx:227`: `alert.closest('.pf-v6-c-alert')` depends on PF class names. Prefer a role/name query, for
  example the alert heading, with `within`.
- `dnsLabel.ts:10`: an optional `{ requiredMessage }` would allow "Name is required." in the style of the contract
  §7 examples.

**2026-11-19 frontend-architect: APPROVE (round 2).**
Checks: `npm run lint` clean, `npm run typecheck` clean, `npm run build` OK (only the known chunk-size warning).
`npm test -- --run` 22 files / 263 tests: 262 pass. The 1 failure is
`src/app/session.test.tsx` ("ends the session on a later 401…"), which belongs to T-0027 (in progress in parallel)
and is outside this task's scope. Checked on its own scope: `eslint src/shared/forms` is clean and
`vitest run src/shared/forms` gives 31/31 tests passing.

Required changes from round 1, all resolved:
1. `applyServerErrors.ts` `isLeafField`: only a string, number, boolean or `null` counts as a field. Collections such
   as bulk `items` go to the alert, and the result is a `FormProblem`, not `null`. Covered by a rendered test and a
   `renderHook` test (no error is set on `items`).
2. `useFormProblem.ts`: matches the requested signature. `options` is read at submit time through a ref updated in an
   effect. It never rethrows. The demo form uses it with an inline options literal, and there are tests for clearing
   on resubmit and `clearProblem` after reload.
3. `noValidate` rule: documented in `index.ts`, in the `useFormProblem` TSDoc, in `FieldBaseProps.isRequired`, and in
   `CheckboxField`.

All optional nits from round 1 were done.

Confirmations requested by the orchestrator:
- **Clearing before client validation: confirmed correct.** An old server alert sitting next to fresh zod errors would
  be about a request the user has already moved past. With a resolver, RHF's `handleSubmit` replaces field errors,
  including `server`-type ones, with the resolver result anyway, so clearing the form-level alert at the same moment
  keeps the two in step. A side effect is accepted: if a resubmit after a conflict fails zod, the `ConflictAlert` and
  its "Reload latest values" action disappear until the next valid submit. Typed input is never lost, and the server
  reports the conflict again on that submit.
- **A `version` 400 always goes to the alert: confirmed correct.** `version` is the contract-wide concurrency token
  (contract §1). It is never a visible field, and a 400 on it can only be a client bug, which must stay visible. Only
  the top-level `version` path is excluded. CP1 has no nested versions (bulk grant items carry none).

Optional nit (no action needed):
- `fieldA11y.tsx` `useWrapperFocusRef` TSDoc has an odd line break ("…inside that wrapper. The / lookup is scoped…").
  Reflow it when the file is next touched.

## Handover notes
- Files: `web/src/shared/forms/` — `TextField`, `TextAreaField`, `SelectField`, `SwitchField`, `CheckboxField`,
  `RadioGroupField`, `fieldA11y.tsx` (ids, helper text, focus helper), `types.ts` (`FieldBaseProps`),
  `applyServerErrors.ts` (`applyServerErrors`, `toFormPath`, `FormProblem`, `CONCURRENCY_CONFLICT_CODE`),
  `useFormProblem.ts`, `FormProblemAlert.tsx`, `ConflictAlert.tsx`, `dnsLabel.ts`, `index.ts`, `forms.test.tsx`.
- Usage:
  ```tsx
  const form = useForm<V>({ resolver: zodResolver(schema), defaultValues });
  const { problem, handleSubmit, clearProblem } = useFormProblem(form, { codeToField: { 'Clusters.NameTaken': 'name' } });
  <Form noValidate onSubmit={(e) => void handleSubmit((v) => mutation.mutateAsync(v))(e)}>
    <ConflictAlert problem={problem} isReloading={q.isFetching}
      onReload={async () => { const r = await q.refetch(); if (r.data) form.reset(toValues(r.data)); clearProblem(); }} />
    <FormProblemAlert problem={problem} />
  ```
  - **`<Form noValidate>` is mandatory.** PF `Checkbox` sets native `required`, and `type="url"`/`"email"` inputs
    validate natively. Without `noValidate` the browser would block the submit before zod and server errors show.
  - **Every field needs a default value.** A server key counts as a field only when `get(form.getValues(), path)` is
    a leaf value (not an array or object), and `version` never counts. Everything else goes to FormProblemAlert.
  - `ConflictAlert` and `FormProblemAlert` each render only their own kind, so render both.
- Adapter types: `name` is restricted by value type through `FieldPathByValue`. Text, select and radio fields take
  string paths (string | null | undefined); switch and checkbox fields take boolean paths. `control` accepts the
  resolver's transformed type, so zod transforms need no casts.
- `isRequired` shows the asterisk and sets `aria-required`. Text-like adapters don't set native `required`;
  `CheckboxField` does (PF). `<Form noValidate>` neutralises both. Tests must query required fields with `getByLabelText(/^Name/)` or by role and
  name, because the asterisk is in the label text even though it is aria-hidden.
- Decisions for the reviewer:
  - Focus on server errors works for `FormSelect`, `Checkbox`, `Radio` and `Switch` through `useWrapperFocusRef`.
    These PF controls are class components that don't forward refs, so the adapter wraps them in its own `<div ref>`
    and gives RHF a `{ focus }` that focuses the first input/select inside that div. The lookup never searches the
    whole document. This is tested with the select in an array.
  - Field ids are `field-<path>` (`items.1.credentialId` → `field-items-1-credentialId`). Two forms on one page
    that use the same field names would get the same ids. That doesn't happen in CP1, where a form is either a page
    or a modal. Add an id prefix if it ever does.
  - `toFormPath` also drops a leading `$`/`$.` (System.Text.Json-style keys).
  - Only the first message per key goes on the field. Messages for unknown keys go into FormProblemAlert without
    their key.
  - Radio focus prefers the checked radio. Radio option labels are `ReactNode` (for an `EnvironmentLabel`).
  - Password toggle: the button's aria-label is "Show <label>" / "Hide <label>".
  - `dnsLabel(max, { requiredMessage? })`: an empty value gives "Required." by default; other failures use the contract's wording. For optional
    fields use `.or(z.literal(''))`.
- The build's >500 kB chunk warning is not caused by this task (shared/forms isn't imported by the app yet). It is
  the known code-splitting follow-up in HANDOVER.
