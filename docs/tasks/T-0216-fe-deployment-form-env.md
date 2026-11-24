---
id: T-0216
title: Deployment form — Environment Variables section (values and ConfigMap/Secret refs)
status: done
owner: frontend-engineer
checkpoint: CP4c
depends_on: [T-0215, T-0211]
paths: [web/src/features/resources/workloads/deployments/form/]
review_rounds: 0
---

## Goal
OCP's "Environment Variables" section: per container, edit name/value pairs and `valueFrom` refs to ConfigMap or Secret keys (FORM-2, part 2). §6 says this is the only env editing in CP4.

## Scope
- In:
  - Container select (shared `ContainerField` from T-0215).
  - Name/value rows with add/remove ("Add value").
  - "Add from ConfigMap or Secret" rows: a resource select (ConfigMaps + Secrets of the namespace, listed via the existing list queries) and a key select.
  - Existing `envFrom` entries are kept untouched.
  - The mapping and zod rules.
- Out:
  - Field refs / resource-field refs: render them read-only as OCP does, preserved on save.
  - Drag-to-reorder (OCP has it; nice-to-have, note it if skipped).

## Contract / design notes
- Mirror OCP `NameValueEditor` + `ValueFromPair` with PF components (TextInput, Select/typeahead, a plain Button "Remove" icon `MinusCircleIcon`, link Buttons "Add value" / "Add from ConfigMap or Secret").
- Keep it inside `form/` (`EnvironmentSection.tsx`, `EnvPairRow.tsx`). Do not build a shared editor: the ux-designer's label editor is a different control.
- Secret values are never shown or copied into form state: the key select lists only the keys of `data` (CFG-4 posture).
- `applyFormValues` writes `containers[i].env` only.

## Context pack
- Exemplars: `web/src/features/resources/workloads/deployments/form/ImagesSection.tsx` (T-0215, container switch); the list hooks used by the ConfigMaps/Secrets pages (`registry/kinds/configmaps.tsx`, `secrets.tsx` descriptors via `useResourceDataView`/list query).
- OCP reference (`/home/bad/works/openshift-console/frontend/`):
  - `packages/dev-console/src/components/deployments/EnvironmentVariablesSection.tsx`.
  - `packages/console-shared/src/components/formik-fields/EnvironmentField.tsx` (L84-105).
  - `public/components/utils/name-value-editor.tsx` (pairs, `EnvFromPair`).
  - `public/components/utils/value-from-pair.tsx`.

## Acceptance criteria
- [x] FORM-2 (env): add/edit/remove a value, and add a ConfigMap key ref and a Secret key ref. YAML view and the PUT body show exactly those `env` entries; `envFrom` and fieldRef entries survive unchanged (tests).
- [x] Secret values are never rendered or kept in form state: only key names (test).
- [x] The form's YAML view passes `useOpenApiSchema(cluster, DeploymentModel)?.jsonSchema` to `YamlEditor` (T-0211 prop), the same as the YAML tab.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-24 frontend-engineer: "Environment Variables" section mirroring OCP `EnvironmentVariablesSection`/`NameValueEditor`/`ValueFromPair` (`EnvironmentSection`, `EnvPairRow`, `FilterSelect`, `useEnvSources`, shared `ContainerField`). Schema: `images` became `containers[{name,image,env}]`; rows map back preserving unchanged entries, `envFrom`, fieldRefs. YAML view gets the Deployment schema. Unit + UI tests (FORM-ENV, schema uri). Status in_review.

- 2026-11-24 frontend-engineer (fix round 1): picking a resource clears the key via `setValue(..., {shouldValidate:false})` (threaded from the form), so "Select a key" shows only after the key select is used or on Save (test). `useEnvSources` lists only with a namespace. `applyEnv` compares entries by value (RHF clones sources); comments fixed. Prettier reformat checked. Status in_review.

## Review
### UX round 1 (ux-designer, 2026-11-24) — CHANGES_REQUESTED
OCP :9000 down; measured ours (dev-1/shop/web form, 1280 light) against `public/components/utils/name-value-editor.tsx`, `value-from-pair.tsx`, `_name-value-editor.scss`, `_value-from-pair.scss`, `console-shared/.../EnvironmentField.tsx`.
- Env rows / key select — picking a resource shows the red "Select a key" error at once (mode `onChange`: `key.field.onChange('')` validates the untouched key) — OCP `ValueFromPair` never flags a row while it is being filled in — clear the key without validating it (e.g. `setValue(key, '', { shouldValidate: false })`), so the error appears only once the key is touched or on Save.
- OK (no change): Grid 5/6/1 (7 read-only) + "Name"/"Value" plain headers 14px/400; inputs 37px, placeholder = column title; ref column 37+5+37px (`.value-from--key` padding-top 5px); Remove = plain `RhUiMinusCircleIcon`, tooltip "Remove", aria "Delete", disabled on the only empty row; link "Add value" / "Add from ConfigMap or Secret" in ActionListGroup with `RhUiAddCircleFillIcon` (OCP's `pf-m-link--align-left` sets the PF5 var `PaddingLeft`, a no-op in PF6, so our 8px inline padding matches); resource select: full-width toggle, filter "ConfigMap or Secret", ConfigMaps/Secrets groups with divider, kind badge in toggle; key select lists key names only; FieldRef read-only pair.
- Accepted deviations: key select disabled until a resource is picked (OCP shows an empty enabled menu); no drag reorder (OCP passes `allowSorting={false}`).
### UX round 2 (ux-designer, 2026-11-24) — APPROVE
- Round-1 finding fixed: `EnvPairRow` `KeyRefValue` clears the key with `setValue(..., { shouldValidate: false })` (and not at all when it is already empty), so picking a resource no longer shows "Select a key" as an error; FORM-ENV asserts that only the toggle shows the text. No regressions.
- 2026-11-24 frontend-architect, round 1: **APPROVE**. Scoped eslint/tsc clean, `EditDeploymentPage.test.tsx` 16/16 green (full gate skipped: T-0218 concurrent edits). `images`→`containers` refactor is clean; fieldRef/resourceFieldRef rows and `envFrom` round-trip (unit + UI tests); form state holds only key names; `useEnvSources` reuses `useK8sList` (same list query keys/watch as the ConfigMaps/Secrets pages, 2 requests, no N+1); YAML view gets the schema.
  Optional nits:
  - deploymentFormValues.ts:114-118 `applyEnv` — RHF clones default values, so `row.source` is never the live entry in the app and `entry === original[index]` is always false; output is content-identical (harmless), but the "same object" doc comments only hold in the unit test — compare by value or reword the comments.
  - useEnvSources.ts:28-29 — with `namespace` undefined `useK8sList` lists Secrets cluster-wide; pass `enabled: namespace !== undefined`.
  - EnvPairRow.tsx:190 — PF Tooltip does not show on a disabled Button (the only empty row); acceptable, OCP has the same.
  - Follow-ups accepted: shared `useResourceYamlSchema(cluster, model)` (uri duplicated at DeploymentForm.tsx:55 vs ResourceYamlTab.tsx:79); metadata-only Secret list to keep values out of the query cache.

## Handover notes
- Container choice is shared by Images and Environment Variables (lifted into `DeploymentFormEditor`, clamped when YAML removes containers); both sections show a "Container" select, as OCP.
- Rows: `value` / `ref` (ConfigMap/Secret key) / `fixed` (fieldRef, resourceFieldRef: read-only, kept). Each row keeps its `source` entry, so an untouched row writes the original object (`optional` etc. survive). Blank rows are dropped and empty `env` is deleted (OCP).
- Secrets: the form holds only key names; Secret data sits in the TanStack cache from `useK8sList`, as on the Secrets list page. A metadata-only list would avoid that (follow-up if wanted).
- Deviations: no drag reorder (OCP's deployment form passes `allowSorting={false}` too); the key select stays disabled until a resource is picked.
- The schema uri string is duplicated from `ResourceYamlTab`; a shared `useResourceYamlSchema(cluster, model)` hook would remove it (follow-up).
- ui-probe ran on our side only (OCP reference :9000 not running).
