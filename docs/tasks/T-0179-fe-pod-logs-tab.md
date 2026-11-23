---
id: T-0179
title: Pod Logs tab — OCP log viewer and toolbar
status: done
owner: frontend-engineer
checkpoint: 4a
depends_on: [T-0175, T-0178]
paths: [web/src/features/resources/workloads/logs]
review_rounds: 0
---

## Goal
LOG-2/5/7/8/9/10 (UI half): the Pod Logs tab rendered like OCP `ResourceLog`, built on `@patternfly/react-log-viewer`
and `usePodLog` (T-0178).

## Scope
- In: replace the `PodLogsTab.tsx` stub; `LogToolbar.tsx`, `LogStatusBanner.tsx`, `LogFooter.tsx` (resume), tests.
- Out: data layer (T-0178); multi-pod/workload logs (CP4b).

## Contract / design notes
- Layout (OCP `resource-log.tsx` `LogControls` L180+): PF `LogViewer` (`hasLineNumbers={false}` as OCP, `height="100%"`,
  `theme` dark per OCP, `scrollToRow` follows tail unless paused, `onScroll` scrolled-up → `paused`), header toolbar:
  - Left: status icon + text from `status` — "Log stream ended." / "Log stream paused." / "Log streaming..." /
    "Loading log..." (OCP `STREAM_*` copy L80-92); `ContainerSelect`; Current/Previous log `ToggleGroup`
    (Previous disabled with OCP tooltip "Only the current log is available for this container." when
    `restartCount === 0`, L280).
  - Right: `LogViewerSearch` (placeholder "Search"); "Wrap lines" `Checkbox` (persist in `localStorage`
    via the existing user-settings helper if one exists, else component state); "Show full log" `Checkbox`;
    "Raw" and "Download" as `Button variant="link" component="a"` (raw `target="_blank" rel="noopener noreferrer"`,
    download `download="<pod>-<container>.log"`; href = `podLogPath` without `timestamps`, no `follow`);
    "Expand"/"Collapse" full-screen = PF `Button` toggling a CSS class on our own wrapper (no Fullscreen API DOM calls).
- Banner (`HeaderBanner` L131): "<n> lines" or "<n> lines (last 1000 shown)" — mirror OCP copy exactly.
- Footer (`FooterButton` L144): when paused and `linesBehind > 0`, `Button` "Resume stream and show <n> new lines"
  else "Resume stream" → `paused=false`, scroll to end.
- Text shown = `LogLine.text` (timestamps stripped).
- Errors (LOG-10): `ApiError` → inline danger `Alert` title "An error occurred while retrieving the requested logs."
  (OCP) with `detail` as body; waiting container → info `Alert` with the cluster message; empty log → "No log
  messages" (OCP parity — grep the clone for the exact empty copy).
- No polling; reuse `useResourceDetails()` for the pod and `isContainerRunning` from `pod.status.containerStatuses`.

## Context pack
- Docs: ADR-0037 §6; `UX.md` §4, §12 if present (full-height panels).
- Exemplars: `details/ResourceYamlTab.tsx` (full-height tab + toolbar); `@patternfly/react-log-viewer` `LogViewer.d.ts`
  props (`grep -n` for `scrollToRow`, `onScroll`, `toolbar`, `isTextWrapped`).
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/utils/resource-log.tsx` L80-92 (status copy),
  L131 `HeaderBanner`, L144 `FooterButton`, L180 `LogControls`, L280 previous tooltip, L488 `ResourceLog`, L884
  "Preparing log..."; `public/components/pod-logs.tsx` L136 `PodLogs`.

## Acceptance criteria
- [x] LOG-2: toolbar has container select, Current/Previous, Search, Wrap lines, Show full log, Raw, Download, Expand (test by role/name).
- [x] LOG-5: Previous disabled with tooltip when no restarts; enabled → previous log shown.
- [x] LOG-7/8: scrolling up pauses; footer "Resume stream and show <n> new lines" resumes and scrolls to end (test).
- [x] LOG-9: Download/Raw hrefs point at the proxy `log` path with the container and without `follow`.
- [x] LOG-10: 403 → error alert with cluster message; waiting container → info alert; empty → empty copy.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23 frontend-engineer: built PodLogsTab (LogViewer + LogToolbar/LogStatusBanner/LogFooter, useLogPreferences) on
  usePodLog/ContainerSelect, mirroring OCP main `resource-log.tsx`/`pod-logs.tsx` (live :9000 down, source used).
  8 Vitest/RTL/MSW tests cover LOG-2/5/7-8/9/10. Hooks, mocks and tab registration untouched.
- 2026-11-23 frontend-engineer: fix round 1: U1 Expand via Fullscreen API (`useFullscreen` moved yaml → `shared/hooks`), U2 alert `pf-v6-u-mb-sm`, no line copy.
- 2026-11-23 frontend-engineer: fix U1a: window `resize` on full screen change (OCP) so the viewer re-measures after Collapse; test.
- 2026-11-23 frontend-engineer: U1a round 3: `.log` `contain: size` + overflow hidden so stale content can't grow the filled section; Chromium 1280×800 mock: 467 → Expand 784 → Collapse 467, page__main 693/693.

## Review
- 2026-11-23 ux-designer round 1: **CHANGES_REQUESTED** (mock :5244, 1280×800 + 1920×1080, light/dark; OCP source only, :9000 down)
  - U1 (blocking) Expand — overlay is confined to the page main panel (viewer y=98 w=924 at 1280; masthead + nav stay visible) because an ancestor makes `position: fixed` relative to it — OCP `resource-log.tsx` L54/L840 `useFullscreen` covers the whole screen (`.co-fullscreen pf-v6-u-p-sm`, Esc exits) — render the expanded wrapper via `createPortal` to `document.body` (or the Fullscreen API through a ref-based hook; architect's call), Esc collapses.
  - U2 (minor) Logs header — error/info alert sits flush on the line-count banner — OCP alerts use `co-alert--margin-bottom-sm` (`_alerts.scss` L11, 8px) — add `pf-v6-u-mb-sm` to the Alert.
  - OK: toolbar order/variants/gaps match `LogControls` L412-471 (37px play ring, Options isSettings, Search logs, disabled "Current log" + tooltip, plain raw/download/expand); viewer fills the pane, no page overflow at 1280×800 or 1920; banner "10 lines" / info "- Log stream ended."; footer reserved hidden (vis hidden, 37px) and "Resume stream" on pause; dark theme via PF tokens. Error alert body with the cluster message is a contract (LOG-10) addition to OCP, accepted.
- 2026-11-23 frontend-architect, round 1: **APPROVE**. Gate green (lint/typecheck/955 tests/build).
  Deviations match OCP main `resource-log.tsx` (Options settings select, Log type select L251, icon actions, banner,
  `onScroll` L710-716 identical, search `onFocus` pause L429, `TogglePlay` copy). Pause/resume correct (effect re-fires
  on `following` false→true); no object URLs (plain hrefs); `useStoredValue` already try/catches localStorage; no DOM
  access; reconnect-in-render only calls `setAttempt` (allowed state-adjust pattern). Tests cover LOG-2/5/7-8/9/10.
  Optional nits / follow-ups:
  - PodLogsTab.tsx:80 — `[...log.lines]` copies the whole buffer per flush (unbounded with "Show full log") — a
    `log.lines as string[]` pass-through would avoid the second copy.
  - LogToolbar.tsx:62 — `TogglePlay` duplicated from events → extract to `shared/ui` (follow-up task).
  - PodLogsTab.module.css:420 — Expand overlay has no Escape-to-collapse (Fullscreen API had it); ux-designer to
    check overlay vs masthead stacking and run ui-probe (not run by engineer).
- 2026-11-23 ux-designer round 2: **CHANGES_REQUESTED** (mock :5244, 1280×800, headless Chromium with the real Fullscreen API)
  - U1 fixed: Expand calls `requestFullscreen` on the log wrapper (viewer 8,8 1264×784, 8px padding, secondary background), and the button switches to "Collapse". Collapse exits. Esc can't be synthesized headless, but the browser handles it natively.
  - U1a (regression, blocking) Collapse: the viewer keeps its full-screen height (894×800 instead of 467), so `.pf-v6-c-page__main` overflows (1026/693) and the page scrolls until the window is resized. OCP dispatches `window` `resize` in an effect on `isFullscreen` (`resource-log.tsx` ~L815). Fix: do the same (or re-measure the viewer) when `isFullscreen` changes. A `resize` event in the probe restores 467.
  - U2 fixed: `pf-v6-u-mb-sm` is on both the danger and info Alerts (`LogStatusBanner.tsx` L43/L53, checked in code; the mock can't produce the alert).

- 2026-11-23 frontend-architect, round 2: **APPROVE**. (a) hook in `shared/hooks/useFullscreen.ts`, YAML imports
  updated, eslint allowlist swaps exactly one file; (b) Expand gated on `isSupported`; (c) `log.lines as string[]`, no
  copy; (d) tests cover enter/Esc/Collapse. U1a: `resize` dispatched on `isFullscreen` change (PF LogViewer listens on
  window resize; OCP `resource-log.tsx` L816 does the same) + `.log` `contain: size; overflow: hidden` — OK.
  `EditorSettingsModal.tsx` diff is exact prettier output → accepted. Gate: full run 84/956 green, lint/typecheck/build
  OK; after the 16:19 CSS edit the logs folder (16 tests) and lint were rerun, both green.
- 2026-11-23 ux-designer round 3: **CHANGES_REQUESTED** (mock :5244, 1280×800, headless Chromium)
  - U1a still reproduces. The tab height is 467 before Expand; after Collapse the viewer is 784 and `.pf-v6-c-page__main` scrolls (1010/693). A later `resize` (rAF or 2s) does not bring it back. The `resize` now fires, and PF re-measures `.pf-v6-c-log-viewer__main`, but nothing caps that height: the filled `pf-v6-c-page__main-section pf-m-fill` grew to 816 and the `.log` wrapper is `height: 100%` of it, so the viewer keeps the height it had in full screen. OCP sizes the log with flexbox inside a filled `PaneBody` (`_resource-log.scss`, `PaneBody.tsx` `isFilled`). Fix: limit the tab's flex chain to the space it has (`min-height: 0` / `overflow: hidden` on the filled section and its flex parents, the architect's call). Re-check: 467 → Expand → Collapse → 467, with `page__main` scrollHeight equal to clientHeight.
- 2026-11-23 ux-designer round 4: **APPROVE** (mock :5244, headless Chromium)
  - U1a fixed. At 1280×800 the viewer is 467px, 784px when expanded (8,8), and 467px again after Collapse; at 1920×1080 it is 747 → 1064 → 747. `page__main` scrollHeight equals clientHeight in every state.
  - The `contain: size` change causes no regression in the normal view: at 768×800 the viewer is 467px, at 1024×600 it is 267px, and at 640×800 the toolbar wraps to 82px and the viewer is 445px. There is no page scroll and the last line stays visible in the log at every size.

## Handover notes
- Files: `web/src/features/resources/workloads/logs/{PodLogsTab,LogToolbar,LogStatusBanner,LogFooter}.tsx`,
  `useLogPreferences.ts`, `PodLogsTab.module.css`, `PodLogsTab.test.tsx`. Routes/details registration unchanged.
- Deviations from the contract, all following OCP main source: "Options" settings Select (checkbox options "Show full
  log", "Wrap lines", persisted in localStorage) instead of loose checkboxes; "Log type" Select instead of a toggle
  group; plain icon buttons "View raw logs"/"Download"/"Expand"; banner "N lines" (+ " - Log stream ended." at EOF);
  empty log shows "0 lines" (OCP has no "No log messages" copy); theme follows the user theme, not forced dark.
- Waiting container (400 "waiting to start") → info alert with the cluster message; stream reconnects once the pod
  shows the container running. Other errors → OCP danger alert + Retry.
- Expand = browser Fullscreen API via `shared/hooks/useFullscreen` (moved from yaml; eslint document allowlist updated).
- Follow-up: `TogglePlay` is duplicated from the events feature (features can't import each other) → extract to
  `shared/ui`.
- Outside paths: new `web/src/test/logViewer.ts` (`stubLogViewerLayout`: canvas + log-viewer line metrics; jsdom's
  lineHeight 'normal' hangs react-window), called in `ResourceDetailsPage.test.tsx` beforeEach (LOG-1 now mounts it).
- ui-probe not run (port 5199 busy, per orchestrator) — run it at review.
