---
id: T-0077
title: YAML tab — bundled Monaco editor, read-only gating, save with conflict/validation handling
status: done
owner: frontend-engineer
checkpoint: 2
depends_on: [T-0076]
paths: [web/src/features/resources/yaml/, web/src/features/resources/routes.tsx, web/vite.config.ts, web/package.json, web/package-lock.json]
review_rounds: 0
---

## Goal
Replace the interim read-only YAML view with the real editor (UI-6, UI-7, US-7, ADR-0024): PatternFly `CodeEditor`
on a locally bundled, lazy Monaco; read-only with the reason when the user can't update; Save via PUT with no silent
overwrite, clear conflict/validation feedback, live-change banner and an unsaved-edits guard.

## Scope
- In: deps `@patternfly/react-code-editor` and `monaco-editor` (exact versions); `yaml/monacoSetup.ts`,
  `yaml/YamlEditor.tsx` (the only `CodeEditor` user), `yaml/ResourceYamlTab.tsx`, `yaml/yamlObject.ts` (parse/
  stringify/validate helpers), `useUpdateResource`; `vendor-monaco` code-splitting group in `vite.config.ts`.
  Delete the interim `ResourceYamlView` from T-0075.
- Out: create-from-YAML (CP4), server dry-run "Validate" (backlog, Q7), diff view.

## Contract / design notes
- BE: `PUT /api/clusters/{c}/k8s/<object path>` with the object as JSON (`Content-Type: application/json`, CSRF header)
  — contract §1–2. Responses: 200 object; 409 `Kubernetes.Conflict`; 422/400 `Kubernetes.Invalid`/`BadRequest`
  (`message` verbatim); 403 `Proxy.ReadOnlyGrant`/`Proxy.UserReadOnly`/`Kubernetes.Forbidden`; 413 `Proxy.BodyTooLarge`.
- ADR-0024: `monacoSetup.ts` imports `monaco-editor/esm/vs/editor/editor.api` + the YAML basic-language contribution,
  sets `self.MonacoEnvironment = { getWorker: () => new EditorWorker() }` (`…/editor.worker?worker`) and calls
  `loader.config({ monaco })` — **no CDN request**. The YAML route's lazy module imports it first.
- `YamlEditor({ value, onChange, isReadOnly, downloadFileName, toolbar }: YamlEditorProps)` → `CodeEditor` with
  `language={Language.yaml}`, `isCopyEnabled`, `isDownloadEnabled`, `height="sizeToFit"` or a fixed viewport height.
  Tests `vi.mock('./YamlEditor')` with a labelled `<textarea>` double (one shared double in `yaml/__mocks__/` or
  inline per test file).
- `yamlObject.ts`: `toEditorText(obj, { showManagedFields })` (strip `metadata.managedFields` unless shown, `yaml`
  `stringify`); `parseEdited(text, original): { ok: true; obj } | { ok: false; message }` — invalid YAML, not an
  object, or changed `apiVersion`/`kind`/`metadata.name`/`metadata.namespace` → client-side error, **no request**.
  The PUT body omits `managedFields` (API server keeps them) and carries the `resourceVersion` the editor was loaded from.
- `ResourceYamlTab` state: base object (rv at load) + editor text + dirty flag. Live updates from `useK8sGet` (T-0071):
  not dirty → editor follows the latest object; dirty and rv changed → warning banner "This object changed on the
  cluster" (edits untouched) with "Reload" (discard). Save success → toast "`<name>` saved on `<cluster>`", editor
  reloads the returned object, `setQueryData` on the `get` key. 409 → danger inline alert "This object has been updated
  since you opened it" with **Reload** (discard my edits) — never retries or overwrites. 400/422/403/413 → inline
  danger alert with `errorMessage(error)`, edits kept.
- Read-only: `useResourceAccess(cluster, { verb: 'update', model, namespace, name })` (T-0076) reason → inline info alert
  with the reason, `isReadOnly` editor, Save not rendered; while checking, Save disabled.
- Next to Save (SW-10): "Saving to `<cluster>`" + `EnvironmentLabel`. Buttons: Save (primary), Reload, "Show managed
  fields" `Switch`.
- Unsaved edits guard: React Router `useBlocker(dirty)` → `ConfirmModal` "Discard unsaved changes?"; `useBeforeUnload`
  for reload/close.
- Build: Monaco lands only in the YAML route's chunks (`vendor-monaco`); if > 500 kB, use the group's `maxSize`
  (ADR-0024 §3) — never raise `chunkSizeWarningLimit`.

## Context pack
- Docs: ADR-0024 (all), spec §4.8 UI-6, UI-7, UI-9, §4.5 SW-10; SECURITY.md § "HTTP" (CSP note — backend owns headers).
- Exemplars: `web/vite.config.ts:L19-L31,L80-L81` (`vendorChunks` + `codeSplitting.groups`),
  `web/src/shared/forms/ConflictAlert.tsx:ConflictAlert` (conflict alert style — write the resource variant, don't
  reuse its FormProblem input), `web/src/shared/ui/ConfirmModal.tsx` (discard confirm).
- Touch points: `web/src/features/resources/routes.tsx` (yaml route lazy module),
  `web/src/features/resources/yaml/ResourceYamlView.tsx` (delete), `web/src/features/resources/actions/useResourceAccess.ts`
  (T-0076), `web/src/shared/k8s:k8sUpdate|useK8sGet|k8sQueryKeys`, `web/src/shared/ui:useToast|EnvironmentLabel`,
  `web/src/shared/api:errorMessage|isApiError`. `@monaco-editor/react` `loader` — grep its `.d.ts` for `config`.

## Acceptance criteria
- [x] UI-6: YAML shown without managedFields, toggle shows them; Copy/Download present; alice on prod-eu-1 sees a
      read-only editor and "Your access to `prod-eu-1` is read-only."
- [x] UI-7 (QG-3): edit + Save → PUT sent, toast "`web-config` saved on `dev-1`", editor shows new rv; stale edit after
      `mockK8s.upsert` → 409 alert with Reload, edits not lost until Reload; 422 → server message, edits kept; changed
      `metadata.name` or broken YAML → client error and no request (assert via MSW request spy).
- [x] Out-of-band change while dirty → "This object changed on the cluster" banner, text unchanged; while clean →
      editor updates.
- [x] Navigating away with unsaved edits asks for confirmation.
- [x] `npm run build`: Monaco only in YAML-route chunks, no CDN URL in the bundle (`grep -r jsdelivr dist` empty), no
      chunk-size warning.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-20 frontend-engineer: started.
- 2026-11-20 frontend-engineer: Monaco editor + save/conflict/guard done; `monaco-editor` pinned 0.55.1 (= `@monaco-editor/loader`'s
  version; 0.57 changed the ESM layout). Outside `paths`: `src/test/setup.ts` (global YamlEditor mock), `e2e/browse.e2e.ts`
  locator, `ResourceDetailsPage.test.tsx` YAML assertion. No backend change: the Api sends no CSP yet. check-fe green;
  e2e 6/6 green against Aspire.
- 2026-11-20 frontend-engineer: round 1 — declared `@monaco-editor/react` 4.7.0; editing clears a stale non-409 save error.

## Review
- 2026-11-20 frontend-architect: **CHANGES_REQUESTED** (round 1). `scripts/check-fe.sh` green (683), with no chunk
  warning and no `jsdelivr` in `dist/`. Monaco is only in the lazy preload map, not `index.html` modulepreloads.
  UI-6/7/9/SW-10 behaviour is correct:
  - managedFields toggle; identity and YAML checks on the client with no request; PUT carries the base `resourceVersion`.
  - 409 alert with Reload and no overwrite; 422/403/413 show the server message with edits kept.
  - The dirty banner keeps the text, and the clean editor follows the live object.
  - Navigation guard (`useBlocker`) plus `useBeforeUnload`; "Saving to `<cluster>`" + env label.
  - `web/package.json:21` — `monacoSetup.ts:5` imports `loader` from `@monaco-editor/react`, which is only a
    transitive dependency of `@patternfly/react-code-editor`, so it resolves only through npm hoisting. Declare it with
    an exact version (`"@monaco-editor/react": "4.7.0"`, the one in the lockfile) and refresh the lockfile.
- Judgements on the coordinator's questions:
  - (1) I amended ADR-0024 myself: the 0.55.1 pin and why, plus the ordering of the chunk groups.
  - (2) `vendor-patternfly` `maxSize` is acceptable: ADR-0024 §3 sanctions `maxSize`, and the 522 kB PF chunk predates
    this task; it is not a raised limit.
  - (3) The CDN-strip plugin is fine as a backstop: `loader.config({ monaco })` is still the mechanism, and the build
    fails if the loader's default changes.
  - (5) The global `vi.mock` of `YamlEditor` is what ADR-0024 §4 decided; real-editor coverage belongs to e2e.
  - (4) CSP: SECURITY.md "HTTP" requires SPA security headers (CSP with `worker-src 'self'`,
    `style-src 'self' 'unsafe-inline'`, nosniff, Referrer-Policy, `frame-ancestors 'none'`), and the Api sends none.
    It doesn't block this task, but the orchestrator should file a **backend task in CP2** now that Monaco ships, with
    an e2e that loads the YAML tab under the CSP.
- Nits (optional):
  - `yaml/ResourceYamlTab.tsx:64` — editing after a failed save keeps the stale server-error alert until Reload; call
    `update.reset()` in `onChange`.
  - `web/e2e/browse.e2e.ts` — also assert that the YAML tab makes no request to a foreign origin (page `request`
    listener), to prove "no CDN" at runtime.
- Round 2 (orchestrator): the single required fix (declare `@monaco-editor/react` 4.7.0) is mechanical; verified in package.json and check-fe.sh green (683) → APPROVE.

## Handover notes
- `YamlEditor.tsx` imports `monacoSetup` first; every Vitest file gets the `__mocks__/YamlEditor.tsx` textarea double via
  `vi.mock` in `src/test/setup.ts`, so no test (incl. `preloadLazyRoutes`) ever loads Monaco.
- `vite.config.ts`: `vendor-monaco` is **last** (groups capture dependencies recursively; first it stole React/PF/preload
  helper into Monaco chunks the main bundle imported); `vite-preload` group isolates Vite's helper; `vendor-patternfly`
  got `maxSize` — it was already 522 kB with a warning before this task. `stripMonacoCdnDefault` plugin removes the
  loader's jsdelivr default at build and fails the build if the pattern changes (upgrade check).
- Editor is read-only while the update access check runs; Save disabled when clean; "Show managed fields" disabled while
  dirty (toggling re-renders text). Save always sends the rv the edit started from, even if the user deleted it.
- Follow-up (backend, SECURITY.md "HTTP"): when CSP is added it needs `worker-src 'self'` and `style-src 'unsafe-inline'`.
