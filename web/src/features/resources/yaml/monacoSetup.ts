// Bundled Monaco for PF's CodeEditor (ADR-0024 §2). `@monaco-editor/react` would otherwise fetch Monaco from a CDN at
// runtime, which air-gapped clusters and the CSP (`script-src 'self'`) forbid. Imported first by the lazy YAML route
// module, so Monaco never reaches the main or list/details chunks. Included: the basic YAML tokenizer (syntax colours;
// `monaco-yaml` brings no tokenizer of its own), `monaco-yaml`'s language services (ADR-0038 §6) and the two workers —
// no JSON/TS language services.
import { loader } from '@monaco-editor/react';
import type { IWebWorkerOptions } from 'monaco-editor';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
// What `monaco-editor`'s full entry (`editor.main`) adds on top of the lean API, minus its JSON/TS/CSS/HTML services:
// the editor contributions (hover, suggest and folding widgets…) and the legacy `{ moduleId, label, createData }`
// worker factory, which Monaco 0.55 moved from `monaco.editor.createWebWorker` to the top-level `createWebWorker`.
import { createWebWorker } from 'monaco-editor/esm/vs/common/workers.js';
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution.js';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker';
import { configureMonacoYaml } from 'monaco-yaml';
import YamlWorker from './yaml.worker.ts?worker';

// Same-origin module workers (CSP `worker-src 'self'`); monaco-yaml asks for its worker by the label 'yaml'.
self.MonacoEnvironment = {
  getWorker: (_moduleId, label) => (label === 'yaml' ? new YamlWorker() : new EditorWorker()),
};
loader.config({ monaco });

/**
 * Monaco as `monaco-yaml` expects it. Its `monaco-worker-manager@2` still calls `monaco.editor.createWebWorker` with
 * the legacy options, which Monaco 0.55 rejects (the worker never starts: no hover, completion or markers — T-0239,
 * monaco-worker-manager#3). Route legacy calls to Monaco's own legacy factory, as Monaco 0.54's `editor.main` did,
 * without patching the shared global API. Drop this once a `monaco-yaml` release supports Monaco >= 0.55.
 */
function withLegacyWorkerFactory(): typeof monaco {
  const compatCreateWebWorker = <T extends object>(
    opts: monaco.editor.IInternalWebWorkerOptions | IWebWorkerOptions,
  ): monaco.editor.MonacoWebWorker<T> =>
    'worker' in opts ? monaco.editor.createWebWorker<T>(opts) : createWebWorker<T>(opts);
  return { ...monaco, editor: { ...monaco.editor, createWebWorker: compatCreateWebWorker } };
}

/**
 * The page's single `monaco-yaml` instance (OCP `registerYAMLinMonaco`; the library allows only one per Monaco).
 * Kubernetes mode, validation, hover and completion on; formatting off (OCP doesn't offer it). Schemas start empty:
 * the mounted `YamlEditor` sets its kind's schema through `update` and clears it on unmount.
 * `enableSchemaRequest: false` keeps the worker from fetching anything (CSP `connect-src`, no token leaks).
 */
export const monacoYaml = configureMonacoYaml(withLegacyWorkerFactory(), {
  isKubernetes: true,
  validate: true,
  hover: true,
  completion: true,
  format: { enable: false },
  enableSchemaRequest: false,
  schemas: [],
});
