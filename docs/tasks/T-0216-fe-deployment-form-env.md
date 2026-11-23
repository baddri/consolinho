---
id: T-0216
title: Deployment form — Environment Variables section (values and ConfigMap/Secret refs)
status: todo
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
- [ ] FORM-2 (env): add/edit/remove a value, and add a ConfigMap key ref and a Secret key ref. YAML view and the PUT body show exactly those `env` entries; `envFrom` and fieldRef entries survive unchanged (tests).
- [ ] Secret values are never rendered or kept in form state: only key names (test).
- [ ] The form's YAML view passes `useOpenApiSchema(cluster, DeploymentModel)?.jsonSchema` to `YamlEditor` (T-0211 prop), the same as the YAML tab.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
