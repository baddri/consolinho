---
id: T-0179
title: Pod Logs tab — OCP log viewer and toolbar
status: todo
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
- [ ] LOG-2: toolbar has container select, Current/Previous, Search, Wrap lines, Show full log, Raw, Download, Expand (test by role/name).
- [ ] LOG-5: Previous disabled with tooltip when no restarts; enabled → previous log shown.
- [ ] LOG-7/8: scrolling up pauses; footer "Resume stream and show <n> new lines" resumes and scrolls to end (test).
- [ ] LOG-9: Download/Raw hrefs point at the proxy `log` path with the container and without `follow`.
- [ ] LOG-10: 403 → error alert with cluster message; waiting container → info alert; empty → empty copy.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
