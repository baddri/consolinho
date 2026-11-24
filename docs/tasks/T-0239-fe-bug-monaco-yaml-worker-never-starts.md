---
id: T-0239
title: "bug: monaco-yaml worker never starts — YAML hover, completion and validation are dead (OAPI-3, QGC-1)"
status: todo
owner: frontend-engineer
checkpoint: 4c
depends_on: []
paths: [web/package.json, web/package-lock.json, web/src/features/resources/yaml/monacoSetup.ts, web/e2e/workloads.e2e.ts]
review_rounds: 0
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
