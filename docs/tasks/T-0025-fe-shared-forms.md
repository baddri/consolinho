---
id: T-0025
title: Shared forms — RHF ⇄ PatternFly field adapters, server error mapping, conflict alert
status: todo
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0022]
paths: [web/src/shared/forms/]
review_rounds: 0
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
- [ ] Tests with a demo form (in the test file): client zod error shown inline; server 400 mapped onto a nested
      array field (`items[1].credentialId`) and focused; `''` key and unknown key end up in `FormProblemAlert`;
      `codeToField` maps a 409 to a field; `Concurrency.Conflict` keeps all typed values and `onReload` is called
      from the alert; password field toggles visibility and has `autoComplete="off"`.
- [ ] Fields are labelled (`getByLabelText`) and errors are linked (`toHaveAccessibleDescription`).
- [ ] TSDoc. Build, lint and tests green (rule 4).

## Work log

## Review

## Handover notes
