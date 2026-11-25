---
id: T-0345
title: Mutation modal body — context/intro before the form (16px) and the Create Project Name help popover
status: done
owner: frontend-engineer
checkpoint: 5a
depends_on: [T-0308, T-0309]
paths: [web/src/features/resources/actions/, web/src/features/resources/storage/pvcs/, web/src/features/resources/projects/, web/src/shared/forms/]
review_rounds: 0
---

## Goal
Expand PVC and Create Project (and every other `ResourceMutationModal`) space their body like OCP: the cluster
context line and the intro paragraph sit before the `<Form>`, 16px apart, and Create Project's Name rules live in
OCP's label help popover instead of helper text. Found by T-0310.

## Scope
- In: `ResourceMutationModal` body layout, an `intro` slot, shared `TextField` `labelHelp`, Expand PVC and Create Project.
- Out: copy changes other than OCP's second Name sentence; the "Learn more about working with projects" link stays
  omitted (T-0310 decision).

## Contract / design notes
Measured (T-0310, mock 1280, light):
| Modal | Ours | OCP (source) |
|---|---|---|
| Create Project | context p → **40px** → intro p → **40px** → Name | intro p → **16px** (Content p margin-bottom) → Form |
| Expand PVC | context p → **40px** → description p (`mb-0`) → 24px → Total size | description p → **16px** → Form |
The 40px = Content p `margin-bottom` 16 + Form row gap 24, because both p's are children of the shell's `<Form>`.

Fix (exact):
1. `actions/ResourceMutationModal.tsx` L92-100: render `ClusterContextText` and a new optional `intro?: ReactNode`
   prop as **`ModalBody` children before `<Form>`** (siblings, not inside it); `children` stay inside the Form.
   TSDoc: "OCP puts explanatory `Content` paragraphs in `ModalBody` before the `Form` (expand-pvc-modal.tsx L72-84)".
   Result: context → 16 → intro → 16 → first field; without `intro`, context → 16 → first field.
2. `storage/pvcs/ExpandPVCModal.tsx` ~L147-152: pass the description `Content p` as `intro`, drop `pf-v6-u-mb-0` and
   its comment.
3. `projects/CreateProjectModal.tsx` ~L58-61: pass the "An OpenShift project is…" `Content p` as `intro`.
4. `shared/forms/TextField.tsx`: add optional `labelHelp?: ReactElement` passed to PF `FormGroup labelHelp`.
   Add a small shared `FieldLevelHelp` (`shared/forms/FieldLevelHelp.tsx`) reproducing OCP
   `public/components/utils/field-level-help.tsx`: PF `Popover aria-label="Help" bodyContent={children}` around a
   `Button variant="link" isInline aria-label="Help" icon={<RhUiQuestionMarkCircleIcon/>}`, icon 12px and 5px left
   margin (OCP `_field-level-help.scss`; prefer PF `FormGroupLabelHelp` if it renders the same, then note it).
5. Create Project Name: remove `helperText={PROJECT_NAME_HELP}`; `labelHelp` = two `Content p` (OCP
   `CreateProjectModal.tsx` L136-151, verbatim): the existing rule sentence, then "You must create a Namespace to be
   able to create projects that begin with 'openshift-', 'kubernetes-', or 'kube-'." Validation errors still show
   under the field.

## Context pack
- Touch points: `features/resources/actions/ResourceMutationModal.tsx` (L85-110), `actions/ClusterContextText.tsx`,
  `storage/pvcs/ExpandPVCModal.tsx` (L140-155), `projects/CreateProjectModal.tsx` (L44-65), `shared/forms/TextField.tsx`
  (L29-60), tests `storage/pvcs/expandPVC.test.tsx`, projects tests, `shared/forms/forms.test.tsx`.
- OCP: `public/components/modals/expand-pvc-modal.tsx` L70-95; `packages/console-shared/src/components/modals/CreateProjectModal.tsx`
  L119-160; `public/components/utils/field-level-help.tsx`, `_field-level-help.scss`.
- Check with the probe/a modal script: gap context→intro 16px, intro→first FormGroup 16px, both modals; Name label
  shows a 12px "?" link button 5px after the required star; popover opens on click with both sentences.

## Acceptance criteria
- [x] Both modals measure 16px between context line, intro and first field (Work log: numbers).
- [x] Other `ResourceMutationModal` users (scale, count modals…) show context → 16px → first field; no visual regression.
- [x] Create Project Name has the Help popover with OCP's two sentences; no helper text under the field when valid.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-25 frontend-engineer: context line + new `intro` slot rendered in `ModalBody` before `<Form>`; Expand PVC/Create Project pass their paragraph as `intro`; `TextField labelHelp` + shared `FieldLevelHelp` (OCP link button, 12px icon, 5px margin; PF `FormGroupLabelHelp` is a plain grey button, so not used).
- Gaps: context → 16 → intro → 16 → Form (PF Content p `MarginBlockEnd` spacer--md, same DOM as OCP); measured structurally, ui-probe never clicks so it cannot open modals. Full check-fe.sh green (1518 tests).

## Review
- 2026-11-25 ux-designer: **APPROVE**. Modals opened via a Playwright script on mock :5199 (ui-probe never clicks), 1280 light.
- Create Project: context p → 16 → intro p → 16 → Form (first FormGroup at Form top, row gap 24) = OCP `CreateProjectModal.tsx` L120-123 (Content p mb 16, then Form).
- Expand PVC: context → 16 → description (42px, 2 lines) → 16 → Total size = OCP `expand-pvc-modal.tsx` L72-84. Edit Pod count (no intro): context → 16 → Form, no regression.
- Name help: PF link inline button, `aria-label="Help"`, margin-left 5px, icon 12x12, link colour; popover `aria-label="Help"` with OCP's two sentences verbatim, no header (OCP `field-level-help.tsx`, `_field-level-help.scss`). No helper text when valid; validation error still under the field.
- 2026-11-25 frontend-architect, round 1: **APPROVE**. Context + `intro` before `<Form>` match OCP `expand-pvc-modal.tsx` L72-84 (both `Content p`, 16px); `FieldLevelHelp` reproduces OCP `field-level-help.tsx` (link/isInline, aria-label Help, 12px icon, 5px margin); Name popover text verbatim; new popover test. check-fe (resources+shared) green.
- Nit (optional): `projects/CreateProjectModal.tsx:27` TSDoc line exceeds the 110-col width; rewrap.

## Handover notes
- `ResourceMutationModal` now takes `intro?: ReactNode`; children stay inside the Form. All other modals get context → 16px → fields.
- `FieldLevelHelp` exported from `@/shared/forms`; `TextField` accepts `labelHelp`. `PROJECT_NAME_PREFIX_HELP` added in `createProjectSchema.ts`.
- Not pixel-probed (probe can't open modals); reviewer may want a visual check of both modals.
