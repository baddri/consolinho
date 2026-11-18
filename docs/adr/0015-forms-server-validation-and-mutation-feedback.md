# 0015 — Forms, server validation errors, version conflicts and mutation feedback
**Status:** Accepted (2026-11-18) · **Builds on:** 0013 (API conventions), 0001 (stack: react-hook-form + zod)

## Context
CP1 has ~10 forms and ~15 confirm dialogs (users, clusters, credentials, grants, bulk grant). The contract
(CP1-api-contract §1, §2) fixes the error shape: RFC 9457 ProblemDetails with a stable `code`, a human `detail` to show
verbatim, and for 400s `errors` keyed by camelCase JSON path (`items[2].credentialId`, `""` = whole request).
Edits carry `version`; a stale one is 409 `Concurrency.Conflict` and the spec (ADM-4) requires an inline danger alert
**without losing form input**. Without a shared approach each form would parse errors differently.

## Decision
1. **react-hook-form + zod** for every form. The zod schema mirrors the contract's validation rules for fast feedback
   only; **the server is authoritative**. Schemas live next to the form (`<Thing>Form.schema.ts`), not in `shared/`.
   Messages copy the contract's wording where it gives one.
2. **PatternFly field adapters** in `shared/forms` bind RHF to PF (`useController`): `TextField`, `TextAreaField`,
   `SelectField`, `SwitchField`, `CheckboxField`, `RadioGroupField`. Each renders `FormGroup` + control +
   `FormHelperText`/`HelperText variant="error"`, sets `validated="error"` and `aria-invalid`. No form renders its own
   error markup.
3. **`ApiError`** (`shared/api/errors.ts`) is the only error type thrown by API hooks: `status`, `code?`, `title`,
   `detail?`, `fieldErrors: Record<string, string[]>`, `traceId?`. It is parsed defensively from the raw body (the
   generated `ProblemDetails` type has no `code`/`traceId` — they are extensions). Non-JSON/network failures become an
   `ApiError` with status 0 and a generic detail.
4. **Mapping server errors onto a form:** `applyServerErrors(error, form, options?)` (`shared/forms`)
   - converts keys from JSON path to RHF path (`items[2].credentialId` → `items.2.credentialId`);
   - calls `setError` for keys the form registered (optionally renamed via `options.fieldMap`, e.g. when a request
     field is shown under another input); focuses the first one;
   - returns everything else (`""`, unknown keys, non-400 errors) as a **form-level problem** rendered by
     `<FormProblemAlert>` (inline `Alert variant="danger"` with `detail`, plus the remaining field messages as a list).
   409 codes that belong to one field are mapped explicitly by the form (e.g. `Users.UsernameTaken` → `username`,
   `Clusters.NameTaken` → `name`, `Credentials.NameTaken` → `name`).
5. **Version conflicts (ADM-4).** Forms keep `version` from the loaded representation in RHF state (not a visible
   field). On `Concurrency.Conflict` the form shows `<ConflictAlert>`: the server `detail` + action "Reload latest
   values" (refetches and `reset()`s the form to server values — the user's choice, never automatic). Input is never
   cleared on error. Transition dialogs (deactivate, disable, …) show the `detail` inline, invalidate the entity
   query, and let the user confirm again (the retry uses the fresh `version`).
6. **Mutation side effects.** Mutation hooks live with their feature (`useCreateUser`, …) and on success:
   `setQueryData` for the returned representation (fresh `version`, ADR-0013 §5) and
   `invalidateQueries({ queryKey: ['api','admin'] })` (admin lists are small; one broad, obviously-correct rule beats
   per-mutation key bookkeeping); grant/cluster mutations also invalidate `['api','clusters']` (switcher).
   Success feedback is a toast via `useToast()` (`shared/ui`, PF `AlertGroup isToast isLiveRegion`), worded like the
   spec ("Granted alice ReadOnly on prod-eu-1"). Failures in dialogs stay inline in the dialog; failures of one-click
   actions (no dialog) become a danger toast with `detail`.
7. **Confirmations** use `ConfirmModal` (`shared/ui`): `Modal variant="small"`, title naming object **and** cluster,
   optional environment label, `variant: 'danger'` for destructive/production actions, optional
   `typeToConfirm` text (CLU-6), `isPending` spinner, inline error slot.

## Consequences
- A new form = zod schema + adapters + one `applyServerErrors` call; server-side rules added later show up inline
  without UI changes when the key matches a field.
- Duplicated validation rules (zod vs FluentValidation) can drift; acceptable because the server message wins and
  `applyServerErrors` displays it.
- New dependencies: `react-hook-form`, `zod`, `@hookform/resolvers` (pinned exact).
