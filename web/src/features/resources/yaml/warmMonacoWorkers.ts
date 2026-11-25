// URLs of the two Monaco worker scripts `monacoSetup.ts` starts (`?worker&url` resolves to the same emitted file as its
// `?worker` imports). Kept apart from `preloadYamlEditor.ts` and loaded lazily with it, so the details page chunk
// carries no worker URLs and unit tests can mock the warm-up.
import editorWorkerUrl from 'monaco-editor/esm/vs/editor/editor.worker.js?worker&url';
import yamlWorkerUrl from './yaml.worker.ts?worker&url';

/**
 * Fetches the worker scripts at low priority into the HTTP cache, so the YAML editor's `new Worker(…)` starts from
 * cache instead of the network (same-origin: CSP `connect-src 'self'` allows it). Failures are ignored: the editor
 * still fetches the workers itself.
 */
export function warmMonacoWorkers(): Promise<unknown> {
  return Promise.all(
    [editorWorkerUrl, yamlWorkerUrl].map((url) => fetch(url, { priority: 'low' }).catch(() => undefined)),
  );
}
