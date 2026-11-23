// Bundled Monaco for PF's CodeEditor (ADR-0024 §2). `@monaco-editor/react` would otherwise fetch Monaco from a CDN at
// runtime, which air-gapped clusters and the CSP (`script-src 'self'`) forbid. Imported first by the lazy YAML route
// module, so Monaco never reaches the main or list/details chunks. Included: the basic YAML tokenizer (syntax colours;
// `monaco-yaml` brings no tokenizer of its own), `monaco-yaml`'s language services (ADR-0038 §6) and the two workers —
// no JSON/TS language services.
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution.js';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker';
import { configureMonacoYaml } from 'monaco-yaml';
import YamlWorker from 'monaco-yaml/yaml.worker.js?worker';

// Same-origin module workers (CSP `worker-src 'self'`); monaco-yaml asks for its worker by the label 'yaml'.
self.MonacoEnvironment = {
  getWorker: (_moduleId, label) => (label === 'yaml' ? new YamlWorker() : new EditorWorker()),
};
loader.config({ monaco });

/**
 * The page's single `monaco-yaml` instance (OCP `registerYAMLinMonaco`; the library allows only one per Monaco).
 * Kubernetes mode, validation, hover and completion on; formatting off (OCP doesn't offer it). Schemas start empty:
 * the mounted `YamlEditor` sets its kind's schema through `update` and clears it on unmount.
 * `enableSchemaRequest: false` keeps the worker from fetching anything (CSP `connect-src`, no token leaks).
 */
export const monacoYaml = configureMonacoYaml(monaco, {
  isKubernetes: true,
  validate: true,
  hover: true,
  completion: true,
  format: { enable: false },
  enableSchemaRequest: false,
  schemas: [],
});
