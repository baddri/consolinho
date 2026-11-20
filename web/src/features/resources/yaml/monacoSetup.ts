// Bundled Monaco for PF's CodeEditor (ADR-0024 §2). `@monaco-editor/react` would otherwise fetch Monaco from a CDN at
// runtime, which air-gapped clusters and the CSP (`script-src 'self'`) forbid. Imported first by the lazy YAML route
// module, so Monaco never reaches the main or list/details chunks. Only the YAML tokenizer and the base editor worker
// are included — no JSON/TS language services.
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution.js';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker';

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });
