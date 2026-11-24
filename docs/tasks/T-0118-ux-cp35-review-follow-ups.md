---
id: T-0118
title: CP3.5 review follow-ups (small OCP look & feel polish)
status: done
owner: frontend-engineer
checkpoint: CP4
depends_on: []
paths: [web/src/features/cluster-context, web/src/features/resources, web/src/features/admin, web/src/shared]
review_rounds: 0
superseded_by: [T-0119, T-0121, T-0122, T-0126]
---

## Goal
Collect the minor, non-blocking findings of the CP3.5 visual reviews and the PO acceptance (2026-11-22) in one tracked
task so they are not lost. Each item is small; architect may split or fold items into CP4 tasks that touch the same screen.

## Scope
- In: the items below. Out: anything that needs backend change (see ROADMAP backlog "(CP3.5 ACCEPT)").

## Items (source in brackets)
1. Switcher search shows a PF "→" submit button; OCP has none. Keep Enter-opens-first-match via `onKeyDown`. [T-0111]
2. Switcher: hide "Recent" when it repeats the only cluster; bob: no divider under the toggle when no nav follows. [T-0111]
3. Pods list: Ready/Restarts without fixed width so generated names wrap at most once (OCP `pod-list.tsx`). [T-0112]
4. Lists: hide pagination when everything fits on one page or the list is empty; empty state replaces the table (OCP `EmptyBox`). Today Pods with 3 rows shows pagination top and bottom. [T-0112, PO]
5. Deployment/Pod details: the Namespace field shows a `PR` badge; OCP shows `NS` there (Projects nav keeps `PR`). [PO]
6. Clusters list: hide API URL below 2xl instead of middle-truncating it; Credentials list: clamp the legacy-token description to 2 lines. [T-0114]
7. Cluster Credentials tab: "Add credential" right-aligned like "Grant access" on the Access tabs. [T-0115]
8. Grant wizard / admin tables: cluster status "Disabled" as icon + text like "Enabled" (UX.md §5). [PO]
9. User details: one grant flow. Actions menu "Grant access to clusters" (wizard) and toolbar "Grant access" (single modal) are two entry points with two wordings; recommended: toolbar "Grant access" opens the wizard (works for 1..n clusters), drop the Actions item. [PO]
10. Code nits: rename `WorstExpiryIcon` (renders text now); move `Timestamp`/`DetailsSubsection` to `shared/ui` with a unit test. [T-0113, T-0114]

## Acceptance criteria
- [x] Items 1–9 visible in the mock UI at 1280 (light + dark); item 10 done or split into its own task.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-24 qa-engineer (T-0223, POL-1): closed per item; every absorbing task is `done`.
  #1 no `onSearch` on the switcher search, #2 "Recent" hidden → T-0119 items 7–8. #3 column widths, #4 pagination and
  the empty state → T-0121 items 3–4 (no CP4c UX task re-files pagination). #5 `NS` badge → T-0122 item 6.
  #6 API URL hidden below 2xl and the 2-line clamp, #7 Add credential, #8 Disabled icon, #9 one grant flow → T-0126.
  #10 `WorstExpiryIcon` rename → T-0126 (no references left); `Timestamp`/`DetailsSubsection` → T-0122 item 9
  (`web/src/shared/ui/details.test.tsx`).
