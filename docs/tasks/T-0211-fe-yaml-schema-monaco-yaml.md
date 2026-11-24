---
id: T-0211
title: YAML editor schema validation, completion and hover (monaco-yaml)
status: done
owner: frontend-engineer
checkpoint: CP4c
depends_on: [T-0210]
paths: [web/package.json, web/package-lock.json, web/vite.config.ts, web/src/features/resources/yaml/monacoSetup.ts, web/src/features/resources/yaml/YamlEditor.tsx, web/src/features/resources/yaml/__mocks__/YamlEditor.tsx, web/src/features/resources/yaml/ResourceYamlTab.tsx, web/src/features/resources/yaml/ResourceYamlTab.test.tsx]
review_rounds: 1
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
- [x] Without a schema (403 cluster), the editor works exactly as before, and the console shows no error.
- [x] `ResourceYamlTab.test.tsx`: the schema URI for the object's cluster and kind is passed once the schema loads, and no schema is passed for the 403 cluster.
- [x] `vendor-monaco` holds monaco-yaml; the entry chunk size does not change (±2 KB; give the numbers in the Work log).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-24 frontend-engineer: started. Added `monaco-yaml` 5.5.1 (exact; `yaml`/`prettier` dedupe to ours). Kept the
  basic YAML contribution: monaco-yaml has no tokenizer (OCP also runs both); probe shows key/value colours intact.
- 2026-11-24: entry graph 1,538,463 → 1,541,170 B (+2.7 KB): k8s chunk +2.0 KB = `useOpenApiSchema` (T-0210) first
  reached; web +0.65 KB = lazy-route preload list. monaco-yaml itself only in `vendor-monaco` + `yaml.worker` (1.0 MB).
- CSP: build emits `new Worker('/assets/yaml.worker-*.js')` (same origin, no blob:) → fits `worker-src 'self'`. Probe:
  dev-1 Deployment and alice/prod-eu-1 (403) YAML tabs render. Interactive hover/warning/completion NOT verified (probe
  can't type/hover; no ad-hoc Playwright allowed) → AC1 left for QA.
- 2026-11-24: `scripts/check-fe.sh` green (112 files, 1181 tests, build ok). Status in_review.

## Review
- 2026-11-24 frontend-architect, round 1: **APPROVE**. Scoped eslint clean; vitest `resources/yaml` 27/27.
  - Accepted: basic `yaml.contribution` kept (ADR-0038 §6 amended); `format: { enable: false }`; entry +2.7 KB accepted —
    the +2.0 KB is `useOpenApiSchema` (T-0210) first reached, the criterion's intent (monaco-yaml stays out of the
    entry, only `vendor-monaco` + `yaml.worker`) holds; same-origin worker fits `worker-src 'self'`.
  - AC1 handed off: T-0223 QGC-1 now asserts hover, the unknown-field warning and `spec` completion. AC1 stays unchecked
    here until T-0223 passes.
  - Nit (optional): `ResourceYamlTab.test.tsx:366` — the `server.events.on` listener is never removed; use the returned
    unsubscribe or `server.events.removeAllListeners('response:mocked')` in a `finally`.

## Handover notes
- `monacoSetup.ts` exports the `monacoYaml` singleton; `YamlEditor`'s `schema` prop (memoised by the caller) is pushed
  via `update` and cleared on unmount. ResourceYamlTab URI: `fleetconsole://schema/<cluster>/<group|core>/<v>/<kind>`.
- Deviation: the basic `yaml.contribution` import stays (removing it loses syntax colours; monaco-yaml has none).
- `format: { enable: false }` (the option is an object in 5.5.1, not a boolean).
- Our `JSONSchema` has readonly arrays; YamlEditor casts it to monaco-yaml's type (worker only reads it).
- AC1 (warning/hover/completion in the browser + hover screenshot) still needs a manual/QA check.
