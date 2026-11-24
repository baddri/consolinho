// Monaco ships `vs/common/workers.js` without a declaration file; its export is the top-level `createWebWorker` that
// the full `monaco-editor` entry re-exports (typed in `editor.main.d.ts`). Used by `monacoSetup.ts` (T-0239).
declare module 'monaco-editor/esm/vs/common/workers.js' {
  export { createWebWorker } from 'monaco-editor';
}
