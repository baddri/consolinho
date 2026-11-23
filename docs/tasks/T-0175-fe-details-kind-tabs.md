---
id: T-0175
title: Details pages get kind tabs (ReplicaSets, Logs, Terminal) and a shared container select
status: done
owner: frontend-engineer
checkpoint: 4a
depends_on: []
paths: [web/src/features/resources/paths.ts, web/src/features/resources/paths.test.ts, web/src/features/resources/routes.tsx, web/src/features/resources/details/useResourceTab.ts, web/src/features/resources/details/ResourceDetailsPage.tsx, web/src/features/resources/details/ResourceDetailsPage.test.tsx, web/src/features/resources/registry/types.ts, web/src/features/resources/registry/kinds/pods.tsx, web/src/features/resources/registry/kinds/deployments.tsx, web/src/features/resources/workloads]
review_rounds: 2
---

## Goal
ADR-0037 §1-2, LOG-1 (tab half), DEP-9 (tab half): URL-segment tabs `replicasets`, `logs`, `terminal` in OCP order,
opted in per kind, each a lazy module under `features/resources/workloads/`, plus the `ContainerSelect` both the Logs
and Terminal toolbars use. Later tasks fill the panels (T-0179, T-0180, T-0185).

## Scope
- In: tab list/order, `DetailsTab`, routes, `hasTab`, `TAB_TITLES`, descriptor `extraTabs`; Pod `['logs','terminal']`,
  Deployment `['replicasets']`; panel modules with a minimal body (PF `EmptyState` "Coming soon" is **not** OCP copy —
  render nothing but the tabpanel; the owning task replaces the file); `workloads/ContainerSelect.tsx` + test;
  `?container=` read/write helper `useSelectedContainer(pod)`.
- Out: panel content.

## Contract / design notes
- `RESOURCE_TABS = ['details','yaml','replicasets','pods','logs','events','terminal']`; titles "Details", "YAML",
  "ReplicaSets", "Pods", "Logs", "Events", "Terminal". `hasTab`: kind tabs only when in `descriptor.extraTabs`.
- Routes: `detailsTabs` gains `replicasets: () => import('./workloads/replicasets/DeploymentReplicaSetsTab')`,
  `logs: () => import('./workloads/logs/PodLogsTab')`, `terminal: () => import('./workloads/terminal/PodTerminalTab')`.
  Logs and Terminal panels are full height (`PageBody isFilled`-like, as the YAML tab branch in `ResourceTabs`); add
  them to that branch.
- `ContainerSelect({ pod, value, onChange, includeInit? })`: PF `Select` + `MenuToggle`, OCP `pod-logs.tsx`
  `containersToStatuses` look: each option = container name + status icon/text (`Status`); init containers in a
  `SelectGroup label="Init containers"`. `useSelectedContainer(pod): [name, set]` = `?container=` (replace, keeps
  other params), default = first non-init container; an unknown name falls back to the default.
- `resourcePath(..., { tab: 'logs', search: { container } })` keeps `?container=` deep-linkable (LOG-1).

## Context pack
- Docs: `FRONTEND.md` § Routing (details line, ADR-0037); `UX.md` §4 Tabs.
- Exemplars: `details/useResourceTab.ts` L4-24; `routes.tsx:detailsRoutes` L27-48 and the `detailsTabs` map L18-25;
  `ResourceDetailsPage.tsx:hasTab` L36-40, `TAB_TITLES` L28-34, `ResourceTabs` L196-235 (YAML full-height branch L218-229);
  `details/ResourcePodsTab.tsx` (lazy tab module shape, `useResourceDetails()`).
- OCP reference: `public/components/pod.tsx` L510-516 (Pod tab order), `public/components/deployment.tsx` L198-208
  (Deployment tab order); `public/components/pod-logs.tsx:containersToStatuses` L18-60 (container options).

## Acceptance criteria
- [x] LOG-1: Pod tabs Details, YAML, Logs, Events, Terminal; `/…/pods/<name>/logs?container=c` deep-links and keeps `container`.
- [x] DEP-9: Deployment tabs Details, YAML, ReplicaSets, Pods, Events; other kinds unchanged (tests).
- [x] `ContainerSelect` groups init containers; options are badge + name only, as OCP (test). *(Was "shows per-container status": contract error, see Review round 1.)*
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23 frontend-engineer: tabs/order/`extraTabs`/routes, placeholder panels, `ContainerSelect` + `useSelectedContainer`,
  `resourcePath` `search` accepts a params object. Tests: kind tabs (pod/deployment/configmap), container select, paths.
  `scripts/check-fe.sh` green (900 tests). ui-probe not run: port 5199 serves another agent's worktree (shared PID file).
- 2026-11-23 fix round 1: options drop the status line (contract was wrong: OCP shows status in the log toolbar, not the
  menu); owner tasks fixed (ReplicaSets T-0185, Terminal T-0180); `isOptionDisabled`, `useSelectedContainer({ includeInit })`
  + tests; `ContainerOptions` TSDoc. Ran `npm install` (T-0174's committed `fast-json-patch` was missing from node_modules).

## Review
- 2026-11-23 frontend-architect, round 1: **CHANGES_REQUESTED** (`scripts/check-fe.sh` green, 900 tests). Tabs, order, `hasTab`, routes, `resourcePath` search record, full-height branch all match ADR-0037 §1-2.
  - `web/src/features/resources/workloads/replicasets/DeploymentReplicaSetsTab.tsx:3` and `terminal/PodTerminalTab.tsx:3` — owner tasks swapped (ReplicaSets is T-0185, Terminal is T-0180); the Handover notes repeat the swap — fix all three.
  - `web/src/features/resources/workloads/ContainerSelect.tsx:18-25,39` — T-0180 needs "running only enabled" options but its `paths` exclude this file — add `isOptionDisabled?: (name: string) => boolean` mapped to `SelectOption isDisabled`, plus a test.
  - `web/src/features/resources/workloads/useSelectedContainer.ts:14-19` — counts init containers as known even when the Terminal hides them (`?container=<init>` on Terminal selects a container not in the list and would exec into it); T-0180 can't edit this file — take `{ includeInit = true }` (same meaning as the select) and only accept init names when it is true, plus a test.
  - Nit (optional): `ContainerSelect.tsx:37` `ContainerOptions` has no TSDoc.
- 2026-11-23 ux-designer round 1: CHANGES_REQUESTED
- OK: Pod tabs Details · YAML · Logs · Events · Terminal and Deployment tabs Details · YAML · ReplicaSets · Pods · Events match OCP order and copy (`public/components/pod.tsx` L510-516, `deployment.tsx` L198-208, minus Metrics/Environment); mock UI at 1280 confirms, PageTabs unchanged.
- OK: Logs/Terminal tabpanel is a filled `PageBody` (reaches the page bottom, same 16px/23px padding as other tabs) = OCP `PaneBody fullHeight`; unknown `?container=` keeps the tab.
- ContainerSelect options — each option has a `description={<Status/>}` line; OCP options are badge + name only (`public/components/utils/container-select.tsx` `ContainerSelectOptions`; status is shown by `ResourceLog` beside the dropdown, not in the menu) — drop the `description` and adjust the AC/test "shows per-container status" (contract error: `containersToStatuses` only feeds data).
- Note for T-0185 (not this task): OCP Terminal toolbar shows "Connecting to" + plain `ContainerLabel` for a one-container pod, `ContainerSelect` only for >1 (`public/components/pod-connect.tsx` L256-268).
- 2026-11-23 frontend-architect, round 2: **APPROVE** (`scripts/check-fe.sh` green, 911 tests). All round-1 findings fixed: owner tasks corrected (stubs + Handover), `isOptionDisabled` + test, `useSelectedContainer(pod, { includeInit })` + test, `ContainerOptions` TSDoc. Dropping the status line matches OCP `ContainerSelectOptions`, and the AC was updated.
  - Nit (optional): the ux-designer's "Note for T-0185" about the Terminal toolbar belongs to T-0180.

## Handover notes
- Tab panels are `workloads/{replicasets/DeploymentReplicaSetsTab,logs/PodLogsTab,terminal/PodTerminalTab}.tsx`,
  each `return null`; T-0185 / T-0179 / T-0180 replace them. The Logs/Terminal tabpanel is `PageBody isFilled`.
- `workloads/ContainerSelect.tsx`: OCP look (kind badge "C" + name only, "Containers"/"Init containers" groups + Divider,
  `appendTo: 'inline'`). Toggle `aria-label="Container <name>"`. `includeInit` defaults true; Terminal (T-0180) passes
  `false` to both the select and `useSelectedContainer(pod, { includeInit })`, and `isOptionDisabled` for non-running.
- `workloads/useSelectedContainer.ts`: `?container=` (replace, keeps params); default honours the
  `kubectl.kubernetes.io/default-container` annotation (OCP), else first container. Helpers in `workloads/containers.ts`.
- `resourcePath(..., { search: { container } })` now accepts a record (URLSearchParams-encoded).
- `KindTab` type lives in `registry/types.ts`. Unknown kind tab for a kind → redirect to Details (test).
- Probe gap: `scripts/ui-probe.mjs` keeps one PID file in /tmp across worktrees, so a worktree's server answers for all;
  follow-up for the probe owner. Visuals unchanged apart from new tab titles (existing `PageTabs`).
