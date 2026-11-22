---
id: T-0123
title: OCP parity — YAML tab (editor toolbar, auto-folded managedFields, button bar)
status: todo
owner: frontend-engineer
checkpoint: 3.6
depends_on: [T-0119]
paths: [web/src/features/resources/yaml]
review_rounds: 0
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
- [ ] Side-by-side `/c/dev-1/k8s/ns/shop/pods/<pod>/yaml` vs OCP route matches at 1280 in light and dark.
- [ ] managedFields folded on load and saved unchanged; Cancel returns to Details; Download saves `<name>.yaml`.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
