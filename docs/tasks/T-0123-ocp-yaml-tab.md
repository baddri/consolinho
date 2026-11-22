---
id: T-0123
title: OCP parity — YAML tab (editor toolbar, auto-folded managedFields, button bar)
status: done
owner: frontend-engineer
checkpoint: 3.6
depends_on: [T-0119]
paths: [web/src/features/resources/yaml]
review_rounds: 2
---

## Goal
The YAML tab must look and work like OCP's `EditYAML` so editing a resource feels identical.

## OCP reference
- Route: `/k8s/ns/openshift-console/pods/<pod>/yaml`.
- Source: `public/components/edit-yaml.tsx` (button bar L895-980), `packages/console-shared/src/components/editor/
  CodeEditor.tsx`, `CodeEditorToolbar.tsx`, `ShortcutsPopover.tsx`, `CodeEditor.scss`, `yaml-editor-utils.ts`
  (`registerAutoFold` L71), `yaml-download-utils.ts`.

## Differences to fix
1. "Show managed fields" switch above the editor — OCP has none; `metadata.managedFields` stays in the document but is
   folded on load (`registerAutoFold`) — remove the switch, fold via the Monaco editor API.
2. Editor toolbar — copy + download icons and a "YAML" language label — OCP: copy, settings (font size / tooltips),
   fullscreen ("Toggle fullscreen mode"), then right-aligned "Shortcuts" link button (popover) — mirror; no language label.
3. Editor frame — mirror OCP inset and toolbar background (`CodeEditor.scss`) so the editor sits in the content area
   like the screenshot (rounded frame, toolbar band, full remaining height).
4. Button bar — disabled Save/Reload, no Cancel, no Download — OCP `ActionGroup`: Save (primary), Reload (secondary),
   Cancel (secondary, returns to Details), Download (secondary, `RhUiDownloadIcon`, right-aligned, hidden on xs).
   Keep the fleet cue "Saving to <cluster> <env>" next to the buttons (fleet addition).
5. Messages — success/conflict — OCP inline `Alert`s above the buttons: success, info "This object has been updated."
   + "Click reload to see the new version.", danger with the error list — mirror the copy.
6. YAML key order — ours `apiVersion` first — OCP shows the object as returned (`kind` first) — don't reorder keys.

## Context pack
- Docs: `UX.md` §7.
- Touch points: `web/src/features/resources/yaml/ResourceYamlTab.tsx`, `YamlEditor.tsx`, `monacoSetup.ts`,
  `yamlObject.ts`, `ResourceYamlTab.test.tsx`.
- PF: `CodeEditor` (`customControls`, `isCopyEnabled`, `isFullScreen`?, `shortcutsPopoverProps`), `ActionGroup`, `Alert isInline`.

## Acceptance criteria
- [x] Side-by-side `/c/dev-1/k8s/ns/shop/pods/<pod>/yaml` vs OCP route matches at 1280 in light and dark.
- [x] managedFields folded on load and saved unchanged; Cancel returns to Details; Download saves `<name>.yaml`
  (as OCP `downloadYaml`: `<kind>-<name>.yaml`).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-22 frontend-engineer: started; read edit-yaml.tsx, CodeEditor/Toolbar/Shortcuts, settings modal, registerAutoFold.
- 2026-11-22 frontend-engineer: done. EditYAML layout/toolbar/settings modal/shortcuts/fullscreen, auto-fold, OCP button
  bar + inline alerts; compared at 1280 light+dark vs `/k8s/ns/openshift-console/deployments/console/yaml`. check-fe green.
- 2026-11-22 frontend-engineer: round 1 fixes. Reload hint also on 409 (+ test), ADR-0024 §5 amended, settings Color
  scheme row (Default/Dark/Light, wired to Monaco) + OCP icons, scrollable error alert; re-checked 1280 light+dark.

## Review
### Code (frontend-architect)
CHANGES_REQUESTED (round 1). check-fe green (783 tests). Structure, PF usage and OCP mirroring are good.
- `web/src/features/resources/yaml/ResourceYamlTab.tsx:71` — after a 409 (`Kubernetes.Conflict`) the "Click reload to see the new version." info shows only if the watch already delivered the newer rv; with a lagging/reconnecting watch the user just sees the raw K8s message and no reload hint — also show the stale alert on conflict: `isStale = isDirty && (rv differs || isApiError(update.error, 'Kubernetes.Conflict'))`, plus a test where the PUT 409s without a watch event.
- `docs/adr/0024-yaml-editor-bundled-monaco.md:23-24` — §5 still says managedFields are hidden/toggled and omitted from the PUT; `yamlObject.ts` cites it — add an "Amended (CP3.6, T-0123)" note: shown folded, sent as edited (OCP), rv still pinned to the edit's base.
Decisions on the questions asked:
- `useFullscreen` allow-list: accepted. It is already ref-based (`requestFullscreen` on the element); only state/exit/`fullscreenchange` are document-level by spec, no lookups. A library (`screenfull`, `react-use`) for ~30 lines is not worth a dependency; narrow per-file exemption is the right shape.
- managedFields in PUT: safe. Body is pinned to the base `resourceVersion`, so the sent managedFields match that version (no stale ownership); omitted → kept, `[]` → reset, invalid → 4xx shown in the error alert. Same as OCP.
- Errors/success: the OCP parity directive overrides CP2 UI-7 toast/conflict copy; read-only hides Save and shows the UI-9 reason in an info alert (OCP `!readOnly`), acceptable. Only gap is the 409 reload hint above.
- Outside paths: `ResourceDetailsPage.tsx` unpadded filled `PageSection` for YAML and fixture reordering/managedFields are in scope and minimal.
Round 2: APPROVE. 409 now sets stale (`ResourceYamlTab.tsx:72-75`) + test; ADR-0024 §5 amended; colour scheme via `useStoredValue` + PF `Select` (inline popper, works in full screen), editor bg keyed on resolved editor theme; scrollable alert CSS mirrors OCP. check-fe green (785). Nit: `EditorSettingsModal.tsx:129` and `YamlEditor.tsx:32` exceed 120 cols — wrap.
Nits (optional): `YamlEditor.tsx` fold `setTimeout` has no cleanup on unmount (harmless); CP2-acceptance UI-6 row cites a test name that no longer exists.

### Visual (ux-designer)
CHANGES_REQUESTED (round 1). Compared `/c/dev-1/k8s/ns/shop/deployments/web/yaml` with OCP `/k8s/ns/openshift-console/deployments/console/yaml` at 1280 and 1920, light and dark, plus a 1300px-tall pair, shortcuts popover, settings modal, success, error, read-only (alice on prod-eu-1) and full screen. Matches OCP: tab inset, toolbar band, editor height, folded managedFields with the fold background, Save · Reload · Cancel · Download bar, alert placement, shortcuts popover (exact), full screen (no Shortcuts, page background).
- Editor settings modal — no "Color scheme" row (Default / Dark / Light, "Select the code editor color scheme", `RhUiAutoLightDarkModeIcon`; descriptions "Follow your user preference" / "Always use dark mode" / "Always use light mode") — OCP `public/components/modals/edit-yaml-settings-modal.tsx` L148-200, `edit-yaml.tsx` L877 `isDarkTheme` — add it as the first row, persisted like the other settings. Not waivable: the modal visibly has 3 rows instead of 4.
- Editor settings modal — Font size / Sticky scroll icons are `RhUiFontIcon` / `RhUiMouseIcon`; OCP uses `FontIcon` / `MouseIcon` (edit-yaml-settings-modal.tsx L16-19, L209, L263) — switch the two icons.
- Error alert — description grows without limit, so a long 422 list pushes the editor off screen — OCP `co-alert--scrollable` (`public/components/utils/_alerts.scss` L20-26: description `max-height: 100px`, `200px` at `min-height: $screen-sm-min`, `overflow-y: auto`, word break) — reproduce on the danger alert.
- Read-only — OCP hides Save with no explanation (`edit-yaml.tsx` L933 `!readOnly`); ours hides Save and adds the info alert "Your access to prod-eu-1 is read-only." — accept as a fleet addition (a disabled Save would not match OCP).
- Waived: schema sidebar toggle (toolbar icon right of the controls, `edit-yaml.tsx` L813-821) needs OpenAPI definitions from the cluster — follow-up task, keep listed as a gap in `ocp-parity.md`. Lightspeed button: permanent waiver (product plugin, not shown on the reference either).
- Nit (optional): on load the word `kind` under the cursor gets Monaco's occurrence highlight; the OCP screenshot shows only the cursor.

APPROVE (round 2). Re-checked at 1280, light and dark, against OCP's settings modal (opened and closed only).
- Color scheme row — first row, Default/Dark/Light with OCP descriptions, 200px select — matches `edit-yaml-settings-modal.tsx` L148-200 and the OCP modal screenshot exactly.
- Font size / Sticky scroll icons are now `FontIcon` / `MouseIcon` — identical to OCP (L209, L263).
- Danger alert description: `max-height` 200px at 800px height, 100px at 700px, `overflow-y: auto`, break-word — matches `_alerts.scss` L20-26.
- Override background: Light on a dark page has a dark 8px inset around the light Monaco, as in OCP (`BasicCodeEditor.scss` keys gray-90 on the page theme). Dark on a light page fills the inset dark, where OCP would leave it light. Accepted: deliberate, cleaner, only visible after a non-default setting.

## Handover notes
- `YamlEditor` = OCP `CodeEditor`: PF `CodeEditor` (`isFullHeight`, theme from `useTheme`), controls Editor settings
  (`EditorSettingsModal` + `useEditorSettings`, localStorage `fleetconsole.yamlEditor.*`) and fullscreen
  (`useFullscreen`, allow-listed for `document` in `eslint.config.js`), `useShortcutsPopover`; folds managedFields via
  `managedFieldsLine` + `editor.fold`; Ctrl/Cmd+S saves.
- `toEditorText` = OCP `safeDump` style; PUT now sends managedFields as edited (like OCP). Save always enabled (OCP).
- Success is OCP's inline alert "<name> has been updated to version <rv>"; the CP2 UI-7 toast was dropped (parity).
- Errors (client, 409, 422) are one danger alert "An error occurred" and stay until Save/Reload (OCP), no alert action.
- Outside paths: `details/ResourceDetailsPage.tsx` (YAML tab in an unpadded filled `PageSection`) + its test,
  `eslint.config.js`, `mocks/k8s/fixtures.ts` (kind before apiVersion; managedFields on deployment `web`).
- Not mirrored: schema sidebar toggle (follow-up gap), Lightspeed button (waived); fullscreen not e2e-tested.
- Editor colour scheme in localStorage `fleetconsole.yamlEditor.colorScheme`; dark background keyed on the editor's theme.
