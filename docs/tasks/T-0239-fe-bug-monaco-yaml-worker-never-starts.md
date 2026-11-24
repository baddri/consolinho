---
id: T-0239
title: "bug: monaco-yaml worker never starts — YAML hover, completion and validation are dead (OAPI-3, QGC-1)"
status: done
owner: frontend-engineer
checkpoint: 4c
depends_on: []
paths: [web/package.json, web/package-lock.json, web/src/features/resources/yaml/monacoSetup.ts, web/e2e/workloads.e2e.ts, web/src/features/resources/yaml/monacoWorkers.d.ts, web/src/features/resources/yaml/yaml.worker.ts, web/src/shared/k8s/openapi.ts, docs/adr/0038-fe-cluster-openapi-schema.md]
review_rounds: 1
---

## Goal
The schema-aware YAML editor from T-0211 (ADR-0038) does nothing in a real browser, either in dev or in the production
build. Make the `yaml` language worker start so that hover, completion and validation work. Then remove
`test.fail` from the `QGC-1/OAPI-3` e2e in `web/e2e/workloads.e2e.ts`.

## Repro
Run `aspire start --launch-profile http`, then `cd web && npx playwright test e2e/workloads.e2e.ts -g "QGC-1/OAPI-3"`
without the `test.fail` line. You can also open any Deployment's YAML tab and hover over `replicas`.
- Expected: hover shows the field description, Ctrl+Space lists the `spec` children, and `paused: notABoolean` is
  squiggled.
- Actual: the hover is empty, there are no suggestions from the schema and no markers. The console warns
  "Could not create web worker(s). Falling back to loading web worker code in main thread" and logs
  "Cannot use 'in' operator to search for 'then' in undefined". Page errors follow: "Missing requestHandler or
  method: doValidation / doHover / getFoldingRanges / findDocumentSymbols / findLinks". No `yaml.worker-*.js` worker
  is created (checked against `web/dist` under the Api CSP); only `editor.worker` starts.

## Suspected location
The installed versions are incompatible:
- `monaco-editor@0.55.1` changed `monaco.editor.createWebWorker` to take `{ worker: Worker | Promise<Worker> }`
  (`IInternalWebWorkerOptions` in `editor.api.d.ts`).
- `monaco-yaml@5.5.1` relies on `monaco-worker-manager@2.0.1`, which still calls
  `createWebWorker({ moduleId, label, createData })`. `index.js:43` in that package shows this call.
- As a result, `MonacoEnvironment.getWorker(_, 'yaml')` in `monacoSetup.ts` is never reached.

Options:
- Pin `monaco-editor` to a version that monaco-yaml supports. Check that PF `CodeEditor` and `@monaco-editor/react`
  still work with it.
- Or upgrade to a monaco-yaml/worker-manager release that supports the 0.55 API.

The Vitest tests passed because jsdom never starts workers. Add a browser-level guard, namely the e2e named above.

## Work log
- 2026-11-24 frontend-engineer: root cause = monaco 0.55 moved the legacy `{moduleId,label,createData}` worker factory
  out of `editor.createWebWorker` (now `{worker}` only) into `vs/common/workers.js`; monaco-worker-manager@2.0.1 still uses
  it. Pinning 0.54 doesn't help (lean `editor.api` lacks the shim there too). Two more blockers found once the worker ran:
  dev-only CJS crash (path-browserify) and root `$ref` siblings dropped by the LS (draft-07). All three fixed; e2e green.

## Handover notes
- Fix: `monacoSetup.ts` passes monaco-yaml a monaco copy whose `editor.createWebWorker` dispatches `{worker}` to the
  native API and legacy options to `createWebWorker` from `monaco-editor/esm/vs/common/workers.js` (typed in new
  `yaml/monacoWorkers.d.ts`; that module also registers the editor contributions editor.main would). Drop the shim
  when monaco-yaml/monaco-worker-manager support Monaco >= 0.55 (monaco-worker-manager#3). No package changes.
- `yaml/yaml.worker.ts` (new): local worker entry per monaco-yaml README; Vite dev otherwise serves the worker
  unbundled and path-browserify throws "module is not defined".
- Outside listed paths: `shared/k8s/openapi.ts` (+test) now emits `{ allOf: [{ $ref }], components }`, because the
  YAML LS strips root `$ref` siblings (all refs were "cannot be resolved"); ADR-0038 §7 amended.
- e2e: `test.fail` removed from QGC-1/OAPI-3; it now moves the mouse off the hover before clicking.
- Verified: QGC-1/OAPI-3 + POL-2 pass on dev (Vite); QGC-1/OAPI-3 passes 3/3 consecutive runs against web/dist served
  by the Api (CSP `script-src 'self'; worker-src 'self'`) via a temporary wwwroot symlink + temp origin hop, both removed.
- Gate: scripts/check-fe.sh green (1223/1223).
- Cosmetic follow-up: hover shows a "Source: …/apps/v1/Deployment" line derived from the schema URI.

## Review
- 2026-11-24 frontend-architect, round 1: **APPROVE**. Shim is minimal, local (no global patch), typed (no `any`),
  names its removal condition and upstream issue (monaco-worker-manager#3, open; 2.0.1 is latest, monaco-yaml 5.5.1 is
  latest, so there is no supported upgrade). `dist` emits `yaml.worker-*.js` as a same-origin `new Worker('/assets/…')`,
  which `worker-src 'self'` allows. Wrapping the root in `allOf` is correct for draft-07 `$ref` sibling semantics and is
  covered by `openapi.test.ts`. The ADR-0038 §7 amendment reads right. Scoped vitest 96/96, eslint, tsc, prettier and build are green.
- Nit (optional): frontmatter `paths` should also list `web/src/shared/k8s/openapi{,.test}.ts`, `yaml/monacoWorkers.d.ts`,
  `yaml/yaml.worker.ts`, `docs/adr/0038-…`. The engineer ran prettier over `workloads.e2e.ts`/`openapi*.ts`, so most of
  those diffs are format-only churn. It conforms to `.prettierrc`, so keep it, but mention it in the commit message.
- Nit (optional): `vs/common/workers.js` also pulls in all editor contributions (the intended hover/suggest widgets), so
  vendor-monaco grows. Acceptable, but record the size in the follow-up if the bundle budget becomes a concern.
