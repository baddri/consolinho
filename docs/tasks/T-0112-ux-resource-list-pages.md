---
id: T-0112
title: Resource list pages look like OCP list pages (project bar, heading, compact table, status icons)
status: done
owner: frontend-engineer
checkpoint: CP3.5
depends_on: [T-0110]
paths: [web/src/features/resources/list, web/src/features/resources/components, web/src/features/resources/registry, web/src/features/cluster-context/NamespaceSelector.tsx]
review_rounds: 0
---

## Goal
`/c/:cluster/k8s/...` list pages (Projects, Pods, Deployments, ConfigMaps, …) match OCP's list pages.

## Scope
- In: `ResourceListPage`, `ResourceListToolbar`, `ResourceTable`, registry column definitions, status rendering in lists.
- Out: details pages (T-0113), admin lists (T-0114), new columns/data.

## Contract / design notes
Structure: `ResourceList` (L121+) renders `PageHeading` (T-0110) with `title={model.labelPlural}`, `status=` paused
indicator, `actions=` (none today); the table/toolbar go into `PageBody`. Move `ProjectBar` (L231-259) to
`features/resources/components/ProjectBar.tsx` (props `{ descriptor, cluster, namespace }` unchanged; it already
navigates to the list of the chosen project) so T-0113 reuses it; it renders `PageSection` + `NamespaceSelector` + `Divider`, **above** `PageHeading`.
`LiveIndicator` returns `null` for `live`.

Findings (screen — problem — OCP — fix):
- Pods list — project bar is inside the padded content, same weight as the title — OCP `namespace-bar.tsx` is the
  first row with a bottom divider — render it as its own row (`PageSection` with `Divider` below) above the heading.
- All lists — kind badge before the h1 ("P Pods", "PR Projects") — OCP list titles have no badge — remove.
- All lists — green "Live" label next to the title — not in OCP — show nothing while live; keep only the paused/retrying
  state as `StatusIconText status="warning" text="Paused — retrying"` in the `PageHeading status` slot. **Decided**
  (orchestrator). Supersedes CP2 spec §5 "Live indicator" (`docs/specs/CP2-proxy-and-resource-browser.md` L247) and the
  DATA-3 evidence in `docs/specs/CP2-acceptance.md` L83 (note in the Work log; don't edit specs).
- Pods/Projects — headers truncated ("R…", "Cr…", "Display…", "Reques…") at 1280 — OCP headers are full words — no
  truncation: compact table, column widths, hide low-priority columns below `xl` (`visibility`).
- All lists — status as filled coloured `Label` ("Running", "CrashLoopBackOff", "Active") — OCP `Status` is icon + text —
  **Decided**: icon + text. Keep `ResourceStatusLabel` as the one adapter (registry cells and `ResourceHeader` already
  use it) and change it to `ResourceStatusLabel({ status, asLabel? })` → `StatusIconText`; map red/orange/green/grey →
  danger/pending/success/neutral in `statusColor`'s file (`toStatusKind(color)`). Don't change the `ResourceStatus`
  descriptor type. `asLabel` is used by T-0113 for the title.
- All lists — table `variant` default — OCP lists are compact — `variant="compact"`.
- Lists with create rights — create button absent/in toolbar — OCP `ListPageCreate` in the heading — heading action
  slot (only where a create flow exists; none today is fine).
- Empty list — check copy "No <plural> found" (OCP `EmptyBox`), filtered-to-nothing "No results match the filter
  criteria" + "Clear all filters".

## Context pack
- Docs: `docs/architecture/UX.md` §2 (namespace bar), §3, §5.
- Touch points: `web/src/features/resources/list/ResourceListPage.tsx` (`ResourceList` L121, heading L175-187, `ProjectBar` L231-259,
  `ListEmptyRow` L264+), `web/src/features/resources/list/LiveIndicator.tsx`, `web/src/features/resources/list/ResourceTable.tsx:ResourceTable`,
  `web/src/features/resources/list/ResourceListToolbar.tsx:ResourceListToolbar`,
  `web/src/features/resources/components/ResourceStatusLabel.tsx:statusColor` (keep the mapping, change rendering),
  registry kinds `web/src/features/resources/registry/kinds/{pods,deployments,namespaces}.tsx` (columns, status).
- Tests: `web/src/features/resources/list/ResourceListPage.test.tsx` L121 and L381 (`findByText('Live')` used as the
  "watch is up" signal → wait on a row instead and assert `queryByText('Live')` is absent), L399 (paused case stays,
  now icon + text), "live updates (DATA-3)" cases; `projectSelector.test.tsx`; `registry/kinds/*.test.tsx` if they
  query a status `Label`; `web/e2e/browse.e2e.ts`. Convention (FRONTEND.md § "Testing"): `renderApp(path)` from
  `src/test/render.tsx`, k8s data via `mockK8s.*`, first `findBy*` with `COLD_START_TIMEOUT_MS`.
- Conflicts: `resources/components` + `resources/registry` with T-0113 (runs after this). `cluster-context/NamespaceSelector.tsx`
  only here (T-0111 stays out of it). Parallel-safe with T-0111, T-0114, T-0115, T-0116.
- OCP: `public/components/namespace-bar.tsx`, `public/components/factory/ListPage/ListPageHeader.tsx`,
  `public/components/pod-list.tsx` (column set/visibility), `packages/console-shared/src/components/empty-state/EmptyBox.tsx`.

## Acceptance criteria
- [x] `/c/dev-1/k8s/ns/shop/pods` at 1280: project bar row with divider, then "Pods" h1 without badge, no "Live" label.
- [x] No truncated column header on Pods, Deployments, Projects, ConfigMaps at 1280; no horizontal scroll.
- [x] Status cells: icon + text (green check Running/Active, red exclamation CrashLoopBackOff), both themes.
- [x] Compact rows; kebab aligned right; name cell = kind badge + link on one line where it fits.
- [x] Empty and filtered-empty states use OCP copy.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-21 frontend-engineer: PageHeading/PageBody + ProjectBar row (plain-text toggle, divider), no badge/Live label,
  status icon+text via ResourceStatusLabel/toStatusKind, nowrap headers + column visibility, OCP empty copy. Live label
  removal supersedes CP2 spec §5 "Live indicator" (L247) and DATA-3 evidence in CP2-acceptance L83 (specs not edited).
  Screenshots light+dark 1280: no truncated headers, no horizontal scroll on Pods/Deployments/Projects/ConfigMaps.
- 2026-11-21 frontend-engineer: review polish — Ready/Restarts widths dropped; Namespace (NS) and Owner (RS for
  unregistered kinds, `BadgedName` + `kindAbbr`) cells badged; empty list = EmptyState only (no headers/pagination);
  Pods Owner hidden below 2xl in all projects (`ColumnDef.allNamespacesVisibility`) to avoid 9px scroll; TSDoc rewraps.
  Touched `details/ResourceDetailsPage.test.tsx` (owner assertion). Screenshots 1280 light+dark: no wrap/scroll.

## Review
- 2026-11-21 frontend-architect: **APPROVE** (code; visuals by ux-designer). check-fe: lint/typecheck/build ok; 705/708
  under load avg 21 — the 3 failures (ResourceDetailsPage YAML tab, projectSelector NS-2 timeout, ClusterForm edit)
  are files this diff doesn't touch, and they pass in isolation (33/33), so it's load flakiness.
  Optional nits: `ResourceStatusLabel.test.tsx:19-25` asserts PF class names (`.pf-v6-c-label`/`.pf-v6-c-icon`), which
  is brittle across PF upgrades — prefer `pageBlocks.test.tsx`-style `svg` checks or leave it to the StatusIconText
  tests; `NamespaceSelector.tsx:54` TSDoc line >120 chars, rewrap; `ResourceTable.tsx:29-30` same.

### Visual review (ux-designer, 2026-11-21) — APPROVE
Mock UI, Pods (shop + all projects), Deployments, Projects, ConfigMaps, empty (payments Pods), filter no-match; light+dark, 1280+1920.
All ACs met: project bar row + divider above a plain "Pods" h1, no badge/Live; no truncated headers or horizontal scroll at 1280;
icon+text status readable in both themes; compact rows, kebab right; "No Pods found" / "No results match the filter criteria" + "Clear all filters".
Non-blocking follow-ups (new task, not this one):
- Pods all projects 1280 — names wrap to 3 lines at hyphens while Ready/Restarts take 10% each for "1/1" — OCP `pod-list.tsx` gives Ready/Restarts no width — drop `width: 10` (or `modifier="fitContent"`) so names wrap at most once.
- Pods Owner / all-projects Namespace — plain text "ReplicaSet web-…" and plain link — OCP renders both as `ResourceLink` (RS / NS badge + link) — use `ResourceLink`/`ObjectReferenceLink` in those cells.
- Empty list — column headers + "0 - 0 of 0" pagination shown around "No Pods found" — OCP `EmptyBox` replaces the table, no pagination (UX §5: pagination only when paged) — hide pagination when total ≤ page size / empty.

## Handover notes
- `ProjectBar` now in `resources/components/ProjectBar.tsx` (props unchanged) for T-0113; `NamespaceSelector` toggle is `variant="plainText"`.
- `ColumnDef.visibility` (PF `ThProps['visibility']`) applies to Th and Td; all Th are `modifier="nowrap"` (headers never truncate).
- Pods follow OCP `pod-list.tsx`: Owner hidden below lg, Created hidden below 2xl (absent at 1280); Ready/Restarts width 10.
  Without hiding Created, all-namespaces Pods overflowed by ~105px at 1280.
- `nameColumn` width 25; `ResourceLink` is a nowrap Flex with gapSm (badge `flexNone`), name wraps only when narrow
  (all-namespaces Pods at 1280 still wraps generated names).
- `ResourceStatusLabel({ status, asLabel? })` → `StatusIconText`; `toStatusKind(color)` red/orange/green → danger/pending/success, else neutral.
  `ResourceHeader` (details) now shows icon+text until T-0113 passes `asLabel`.
- Empty copy: "No <Plural> found" (namespace suffix dropped), filtered "No results match the filter criteria" + "Clear all filters".
- Tests: "watch is up" signal is now the first row (mock watch replays from the list resourceVersion).
