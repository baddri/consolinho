---
id: T-0212
title: YAML tab schema sidebar (OCP "View sidebar" / ExploreTypeSidebar)
status: todo
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
- [ ] OAPI-3 (sidebar part): the toggle opens the sidebar. It shows the Deployment description and fields; "View details" on `spec` → `template` → `spec` → `containers` drills down; a breadcrumb click goes back.
- [ ] With no schema, there is no toggle. RTL tests cover drill-down/back, required marks, and the hidden toggle.
- [ ] Measure (ui-probe at 1280 wide) against OCP source values: drawer width and padding, title sizes. Results go in the Work log.
- [ ] `ocp-parity.md`: row 40 → `match`, and W1 is marked closed.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
