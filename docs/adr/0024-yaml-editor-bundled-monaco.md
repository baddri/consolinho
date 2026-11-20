# 0024 — YAML editor: PatternFly CodeEditor with a bundled, lazy-loaded Monaco
**Status:** Accepted (2026-11-20) · **Builds on:** 0001, 0006 · **Spec:** CP2 UI-6, UI-7; SECURITY.md "HTTP" (CSP)

## Context
UI-6/UI-7 need a YAML editor with highlighting, copy/download and read-only mode. The stack (ADR-0001, FRONTEND.md)
names `@patternfly/react-code-editor`, which wraps `@monaco-editor/react`. By default that wrapper **loads Monaco from
a CDN** (jsdelivr) at runtime — incompatible with the single-container deployment (ADR-0006, clusters may be
air-gapped) and with the planned CSP (`script-src 'self'`). Monaco is also several MB and does not run in jsdom.

## Decision
1. Use `@patternfly/react-code-editor` (`CodeEditor`, `Language.yaml`, `isCopyEnabled`, `isDownloadEnabled`,
   `isReadOnly`) and add `monaco-editor` as a direct dependency, pinned exactly like the rest.
2. **No CDN:** one module, `features/resources/yaml/monacoSetup.ts`, imports `monaco-editor/esm/vs/editor/editor.api`
   plus only the YAML basic-language contribution, sets `self.MonacoEnvironment.getWorker` to the editor worker
   imported with Vite's `?worker` suffix, and calls `loader.config({ monaco })` from `@monaco-editor/react`. No
   JSON/TS language workers.
3. **Lazy:** the YAML tab route is a React Router `lazy` module that imports `monacoSetup` first, so Monaco never
   lands in the main or list/details chunks. `vite.config.ts` gets a `vendor-monaco` code-splitting group; if Monaco
   alone exceeds the 500 kB warning, split it with the group's `maxSize` rather than raising the limit.
4. **One wrapper:** `YamlEditor` (`value`, `onChange`, `isReadOnly`, `downloadFileName`, `toolbar`) is the only
   component that renders `CodeEditor`. Component tests replace it with a `<textarea>` double via `vi.mock` of the
   wrapper module (Monaco can't run in jsdom); a build-level check (`npm run build`) proves the bundle.
5. YAML parse/stringify uses the `yaml` package; `metadata.managedFields` is removed from the editor text unless the
   user toggles it on, and is omitted from the `PUT` body (the API server keeps the existing value when omitted).

## Consequences
- The CSP (backend, SECURITY.md "HTTP") must allow `worker-src 'self'` and Monaco's runtime styles
  (`style-src 'self' 'unsafe-inline'`); scripts stay `'self'`. Recorded as a contract point for the backend.
- Editor behaviour inside Monaco (highlighting, keyboard) is covered by Playwright later, not by Vitest.
- Upgrading `@patternfly/react-code-editor` requires checking that `@monaco-editor/react` still honours `loader.config`.
