---
id: T-0212
title: YAML tab schema sidebar (OCP "View sidebar" / ExploreTypeSidebar)
status: done
owner: frontend-engineer
checkpoint: CP4c
depends_on: [T-0211]
paths: [web/src/features/resources/yaml/, docs/architecture/ocp-parity.md]
review_rounds: 0
---

## Goal
OCP's schema sidebar next to the YAML editor: the kind's description and fields, with breadcrumbs into nested fields (OAPI-3, second half). Closes parity waiver W1.

## Scope
- In:
  - `ExploreTypeSidebar` (new, `features/resources/yaml/ExploreTypeSidebar.tsx`).
  - The editor toggle button in `YamlEditor`'s `customControls`.
  - A PF `Drawer` (`isInline`, panel at the end) in `ResourceYamlTab`.
  - Updates to parity row 40 and waiver W1.
- Out: OCP's Samples/Snippets tabs (we have no samples).

## Contract / design notes
- `ExploreTypeSidebar({ schema: OpenApiSchema; kindLabel: string })`:
  - Local state holds the breadcrumb path (`string[]`).
  - It resolves via `resolveSchemaPath`.
  - Header: the kind label (or the current field name), then the description.
  - Then a list of fields. Each shows its name, type and description, and a "View details" link button when the field has properties. Required fields show the OCP "required" label.
  - Breadcrumb: PF `Breadcrumb` of link buttons, with the root = kind.
  - Copy and structure follow OCP.
- Toggle: OCP `ToggleSidebarButton`: a plain icon button in the editor toolbar with the label "View sidebar"/"Hide sidebar" (check OCP's current copy and use it).
  - Render it only when the schema has properties (OCP `edit-yaml.tsx` L805-830); otherwise hide it.
  - The open state is component state, closed by default (OCP opens it by default only on create; we have no create).
- The fullscreen mode keeps working with the drawer open.

## Context pack
- Touch points:
  - `web/src/features/resources/yaml/YamlEditor.tsx` `customControls` (where the settings/fullscreen buttons live).
  - `web/src/features/resources/yaml/ResourceYamlTab.tsx` L114-122 and `ResourceYamlTab.module.css`.
  - `web/src/shared/k8s/openapi.ts:resolveSchemaPath` / `useOpenApiSchema` (T-0210).
- OCP reference (`/home/bad/works/openshift-console/frontend/`):
  - `public/components/sidebars/explore-type-sidebar.tsx` (whole, 203 lines).
  - `packages/console-shared/src/components/editor/ToggleSidebarButton.tsx`.
  - `packages/console-shared/src/components/editor/CodeEditorSidebar.tsx`.
  - `public/components/edit-yaml.tsx` L805-830 and L982-990 (when the sidebar shows, the Drawer layout).
- Parity: `docs/architecture/ocp-parity.md` row 40 (YAML tab) and waiver W1.

## Acceptance criteria
- [x] OAPI-3 (sidebar part): the toggle opens the sidebar. It shows the Deployment description and fields; "View details" on `spec` → `template` → `spec` → `containers` drills down; a breadcrumb click goes back.
- [x] With no schema, there is no toggle. RTL tests cover drill-down/back, required marks, and the hidden toggle.
- [~] Measure (ui-probe at 1280 wide) against OCP source values: drawer width and padding, title sizes. Results go in the Work log.
- [x] `ocp-parity.md`: row 40 → `match`, and W1 is marked closed.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-24 frontend-engineer: in_progress → in_review. `ExploreTypeSidebar.tsx` (+ module css), toggle in `YamlEditor`, layout in `ResourceYamlTab`; 4 RTL tests. Followed OCP's real structure instead of a PF `Drawer`: OCP has none (`.co-p-has-sidebar` flex: body 66% / sidebar 34%, bordered, `PaneBody`, h2 + Close, "Schema" tab). Toggle copy is OCP's "Show sidebar"/"Hide sidebar".
- Probe @1280 (ours only; OCP ref on :9000 was down, and the probe never clicks, so the closed-by-default sidebar can't be measured): toggle 37x37, padding 8px, margin-right 4px (= OCP `pf-v6-u-mr-xs`), spacer flex-grow 1 puts it at the toolbar end. Sidebar values come from OCP source tokens (34%, 1px divider border, PageSection padding, h2/h5 Titles); still need a measurement with clicks.
- Gate: lint ok; typecheck/test/build fail only in `workloads/deployments/form/` (lane B T-0214 WIP: `EditDeploymentPage.test.tsx`, `useDeploymentEditor.ts`). All yaml tests pass (28/28).

## Review
- 2026-11-24 ux-designer, round 1 (source comparison; sidebar can't be probed): **CHANGES_REQUESTED**
  - ExploreTypeSidebar.module.css:25 `.sidebarBody` — the `PageSection` (`hasBodyWrapper={false}`) is a flex column with PF `--main-section--RowGap` (24px) between the title row and the tabs; OCP `PaneBody` adds `.co-m-pane__body { gap: 0 }` (`public/style/_common.scss:6-7`) — add `gap: 0` with an OCP comment (as `FormPage.module.css` does).
  - Checked and matching OCP (no change): copy ("Show sidebar"/"Hide sidebar", "Close", "Schema", "– required", "View details", "Allowed values: ", "No Properties found"); breadcrumbs (root = kind, shown only once drilled down, last item active); field rows (h5 `pf-v6-u-mb-sm` + small type, plain bordered List); h2 title + CloseButton in a nowrap Flex; Tabs no inset + `pf-v6-u-mb-md`; 66%/34% from 768px, bordered left/top, hidden below `lg`; EmptyState sm + `pf-v6-u-pt-xl-on-md`; toggle `pf-v6-u-mr-xs` + end spacer. Refs: `public/components/sidebars/{resource-sidebar,explore-type-sidebar}.tsx`, `public/style/_layout.scss:55-98`, `public/components/utils/simple-tab-nav.tsx:39-44`, `packages/console-shared/src/components/{editor/ToggleSidebarButton.tsx,empty-state/ConsoleEmptyState.tsx}`.
- Round 1 (frontend-architect, 2026-11-24): **APPROVE**. Scoped vitest `resources/yaml` 31/31, eslint clean, no tsc errors under `resources/yaml`.
- Deviation accepted: OCP `edit-yaml.tsx` + `resource-sidebar.tsx` use `.co-p-has-sidebar` flex (66/34, `display-none`/`block-on-lg`), not a PF Drawer; the north star wins over the contract. The sidebar sits inside the fullscreen element, so fullscreen keeps it.
- Nit (optional): `ExploreTypeSidebar.tsx` breadcrumb uses a `render` `<button>` where OCP uses `BreadcrumbItem onClick`+`to`. It is better a11y without a fake route, so keep it.
- Nit (optional): between 768 and 991px the editor is capped at 66% while the sidebar is hidden. OCP has the same quirk, so it is parity, not a bug.
- Follow-up: the open AC (probe sidebar width/padding/titles against OCP `~new`) and `LinkifyExternal` in descriptions. Track both in the CP4c audit, not this task.

## Handover notes
- Files: `web/src/features/resources/yaml/{ExploreTypeSidebar.tsx,ExploreTypeSidebar.module.css,YamlEditor.tsx,YamlEditor.module.css,ResourceYamlTab.tsx,ResourceYamlTab.module.css,ResourceYamlTab.test.tsx,__mocks__/YamlEditor.tsx}`, `docs/architecture/ocp-parity.md`.
- Deviation from Contract: no PF `Drawer`. OCP uses a plain flex column (`edit-yaml.tsx` + `_layout.scss .co-p-has-sidebar*`), and the north star says match OCP. The title is the kind label all the time; breadcrumbs show the path (OCP), not a field-name header.
- `YamlEditor` gets an optional `sidebar` prop. The toggle shows only when the root schema has properties (OCP `showSchema`).
- Each drill-down remounts the sidebar's scroll container (it is keyed on the path), so the scroll goes back to the top with no DOM access (OCP `sidebarScrollTop`).
- Not ported: OCP `LinkifyExternal` (URLs in descriptions are plain text). Possible follow-up.
- Open AC: sidebar width/padding/title sizes still need a probe once the probe can click (or the OCP create page `~new`, where the sidebar opens by default) and the OCP ref is running.

- 2026-11-24 orchestrator round 2: UX finding applied (`gap: 0` on `.sidebarBody`) → APPROVE. Open: measure sidebar vs running OCP (T-0222).
