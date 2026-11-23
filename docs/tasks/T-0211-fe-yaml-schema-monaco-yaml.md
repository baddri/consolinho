---
id: T-0211
title: YAML editor schema validation, completion and hover (monaco-yaml)
status: todo
owner: frontend-engineer
checkpoint: CP4c
depends_on: [T-0210]
paths: [web/package.json, web/package-lock.json, web/vite.config.ts, web/src/features/resources/yaml/monacoSetup.ts, web/src/features/resources/yaml/YamlEditor.tsx, web/src/features/resources/yaml/__mocks__/YamlEditor.tsx, web/src/features/resources/yaml/ResourceYamlTab.tsx, web/src/features/resources/yaml/ResourceYamlTab.test.tsx]
review_rounds: 0
---

## Goal
The YAML tab validates the object against its kind's cluster schema, and offers completion and hover descriptions, as OCP does via `monaco-yaml` (OAPI-3, first half).

## Scope
- In: add `monaco-yaml` (exact version, peer `monaco-editor >= 0.36`; we ship 0.55.1); worker + `configureMonacoYaml` singleton; a `schema` prop on `YamlEditor`; `ResourceYamlTab` passes `useOpenApiSchema(cluster, model)?.jsonSchema`.
- Out: the sidebar (T-0212); the Deployment form's YAML view only gets the same prop for free.

## Contract / design notes
ADR-0038 §6-7.
- `monacoSetup.ts`:
  - Import `YamlWorker from 'monaco-yaml/yaml.worker.js?worker'`.
  - `MonacoEnvironment.getWorker(_, label)` returns the YAML worker for `label === 'yaml'` and the editor worker otherwise.
  - Export `monacoYaml = configureMonacoYaml(monaco, { isKubernetes: true, validate: true, hover: true, completion: true, format: false, enableSchemaRequest: false, schemas: [] })` (once, module scope).
  - Remove the basic YAML contribution import, because monaco-yaml registers the language.
- `YamlEditor` gets a new optional prop `schema?: { uri: string; schema: JSONSchema }`.
  - An effect calls `monacoYaml.update({ schemas: schema ? [{ uri, fileMatch: ['*'], schema }] : [] })` and clears the schemas on unmount.
  - Use `uri = fleetconsole://schema/<cluster>/<group>/<version>/<kind>`.
  - No DOM work.
- `vite.config.ts:47`: the `vendor-monaco` test must also match `monaco-yaml` (and its deps `monaco-languageserver-types`, `monaco-marker-data-provider`, `monaco-worker-manager`, `yaml` only if used solely by it; check the build report).
- Check the CSP: the worker is a same-origin module (`worker-src 'self'`). Start `npm run build && npm run preview`, open a YAML tab, and confirm no CSP violation in the console (note this in the Work log).

## Context pack
- Docs: ADR-0038 §6-7, ADR-0024 (bundled Monaco).
- Touch points:
  - `web/src/features/resources/yaml/monacoSetup.ts` (11 lines).
  - `web/src/features/resources/yaml/YamlEditor.tsx:YamlEditor` (L53 `onEditorDidMount`).
  - `web/src/features/resources/yaml/ResourceYamlTab.tsx:ResourceYamlTab` L116-122.
  - `web/src/features/resources/yaml/__mocks__/YamlEditor.tsx` (accept and ignore `schema`; expose it as `data-schema-uri` for the test).
- OCP reference: `/home/bad/works/openshift-console/frontend/packages/console-shared/src/components/editor/yaml-editor-utils.ts:registerYAMLinMonaco` (L96-170, the `configureMonacoYaml` options) and `getConsoleYamlSchemas`.

## Acceptance criteria
- [ ] OAPI-3 (validation part): in the browser (dev + MSW), an unknown field on a Deployment shows a Monaco warning; hovering `replicas` shows its description; completion lists `spec` children. Record this in the Work log, plus one screenshot clipped to the hover.
- [ ] Without a schema (403 cluster), the editor works exactly as before, and the console shows no error.
- [ ] `ResourceYamlTab.test.tsx`: the schema URI for the object's cluster and kind is passed once the schema loads, and no schema is passed for the 403 cluster.
- [ ] `vendor-monaco` holds monaco-yaml; the entry chunk size does not change (±2 KB; give the numbers in the Work log).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
