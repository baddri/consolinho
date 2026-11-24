// The `monaco-yaml` worker entry, imported from our own file as its README advises for Vite: imported straight from
// `node_modules`, the dev server serves the worker unbundled and its CommonJS dependency (`path-browserify`) throws
// "module is not defined", so Monaco falls back to the main thread without the YAML services (T-0239).
import 'monaco-yaml/yaml.worker.js';
