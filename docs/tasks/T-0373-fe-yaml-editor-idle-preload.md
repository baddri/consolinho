---
id: T-0373
title: Preload the YAML editor (Monaco) at idle time on details and edit pages
status: todo
owner: frontend-engineer
checkpoint: 5.5
depends_on: []
paths: [web/src/features/resources/yaml, web/src/features/resources/details/ResourceDetailsPage.tsx, web/src/features/resources/workloads/deployments/form, web/src/shared/ui/page]
review_rounds: 0
---

## Goal
The first open of a YAML tab is slow. The lazy route `yaml: () => import('./yaml/ResourceYamlTab')`
(`resources/routes.tsx` L74) only starts downloading the `vendor-monaco` chunk (several MB), monaco-yaml and the
workers when the user clicks the tab. We want to warm that chunk while the browser is idle on pages where YAML is one
click away, and immediately when the user signals intent (hover or focus on the YAML tab).

## Scope
- In:
  - An idle-time preload on resource details pages and the Deployment edit form.
  - Preload on hover or focus of the YAML tab.
- Out:
  - App-wide preloading (list-only users must not download Monaco).
  - Changing the Monaco setup or the chunking in `vite.config.ts`.
  - Service worker.

## Contract / design notes
- New `features/resources/yaml/preloadYamlEditor.ts`:
  - `preloadYamlEditor(): Promise<unknown>` is memoised at module level (one promise, so it runs once per session). It calls `import('./ResourceYamlTab')`, the **same module** as the route, so Vite reuses one chunk graph. This pulls in `YamlEditor`, `monacoSetup` (worker env, `loader.config`, `configureMonacoYaml`) and `vendor-monaco`.
  - Swallow rejections (`.catch(() => undefined)`) and clear the memo on failure, so a later real navigation retries and shows the normal route error.
  - Optional, only if the probe shows worker start-up dominating: warm the worker scripts with `import editorWorkerUrl from 'monaco-editor/esm/vs/editor/editor.worker?worker&url'` (and the yaml worker) plus `fetch(url, { priority: 'low' })`. CSP `connect-src 'self'` allows this.
- `usePreloadYamlEditor(enabled = true): void` in the same file:
  - Uses `requestIdleCallback(preloadYamlEditor, { timeout: 5000 })`, or `setTimeout(…, 2000)` where that is missing (Safari).
  - Cancels on unmount.
  - No DOM access.
- Call sites:
  - `ResourceDetailsPage` (only when the descriptor has a YAML tab).
  - The Deployment edit page / `DeploymentForm` (YAML view switch).
- Intent: the YAML tab item in `PageTabs` (`ResourceDetailsPage.tsx` L240–247) gets `onMouseEnter`/`onFocus={preloadYamlEditor}`. If `PageTabs` doesn't forward those props, add an optional `onTabIntent?: (key: string) => void` prop to `shared/ui/page/PageTabs` (generic, with no YAML knowledge in shared).
- Optional and cheap: on intent, also `queryClient.prefetchQuery` the kind's OpenAPI GV document using the same key as `shared/k8s/openapi.ts:useOpenApiSchema` (L301). Skip it if this needs new exports beyond the query-options factory.

## Context pack
- Docs: `FRONTEND.md` § code splitting / lazy routes (grep `lazy`), `SECURITY.md` CSP section (grep `worker-src`).
- Touch points:
  - `features/resources/routes.tsx` L74 (lazy YAML route).
  - `yaml/monacoSetup.ts`, `yaml/YamlEditor.tsx`, `yaml/ResourceYamlTab.tsx`.
  - `details/ResourceDetailsPage.tsx` (`TAB_TITLES` L29, `PageTabs` L240–247).
  - `workloads/deployments/form/DeploymentForm.tsx` L13, L101.
  - `vite.config.ts` L41–48 (`vendor-monaco` manual chunk).
- OCP reference:
  - `/home/bad/works/openshift-console/frontend/packages/console-shared/src/components/actions/LazyActionMenu.tsx:LazyActionMenu` (the same intent-on-hover pattern: load on `onToggleHover`).
  - OCP's YAML editor is `packages/console-shared/src/components/editor/CodeEditor.tsx`.

## Acceptance criteria
- [ ] On a details page, the `vendor-monaco` chunk is requested during idle without clicking YAML (network check in the Work log). On a list page it is not requested.
- [ ] Hover or focus on the YAML tab triggers the preload immediately. A later click reuses it (no second download), and the first YAML render is measurably faster (before/after ms in the Work log).
- [ ] Unit tests: mock the dynamic import. The preload runs once across multiple calls, the idle callback is cancelled on unmount, and a failure resets the memo.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
