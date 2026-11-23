---
id: T-0215
title: Deployment form — Deployment strategy and Images sections
status: done
owner: frontend-engineer
checkpoint: CP4c
depends_on: [T-0214]
paths: [web/src/features/resources/workloads/deployments/form/]
review_rounds: 2
---

## Goal
Add OCP's "Deployment strategy" and "Images" sections to the Edit Deployment form (FORM-2, part 1).

## Scope
- In:
  - Strategy type (Rolling Update / Recreate) and its fields.
  - Per-container image name: a container select when there is more than one container (OCP `ContainerField`) + "Image Name".
  - Form value mapping and zod rules for both.
- Out:
  - "Deploy image from an image stream tag" and the auto-deploy trigger checkboxes. They need ImageStream pages we don't have; record the omission in the parity row note.

## Contract / design notes
- `DeploymentStrategySection.tsx`:
  - "Strategy type" select with OCP's items and help text (`getDeploymentStrategyItems`/`getDeploymentStrategyHelpText`).
  - Rolling Update fields "Maximum unavailable" / "Maximum surge" (number or %), with OCP's help copy.
  - Recreate has no fields for Deployments.
  - Reuse the value parsing from `ConfigureUpdateStrategyModal` (lift a pure helper into `form/` or import it from the same feature folder, without duplicating it).
- `ImagesSection.tsx`:
  - `ContainerField` = PF select "Container" (shown only with > 1 container).
  - "Image Name" text input, required, with the help "Container image name".
  - Values keyed by container name; `applyFormValues` writes `spec.template.spec.containers[i].image` only.
- Section order follows OCP `DeploymentFormEditor`: Strategy, Images, (Env, T-0216), Advanced options.

## Context pack
- Exemplar: `web/src/features/resources/workloads/deployments/ConfigureUpdateStrategyModal.tsx` (strategy fields, validation, copy).
- Touch points: the T-0214 files in `form/` (`deploymentFormValues.ts`, `deploymentFormSchema.ts`, `DeploymentForm.tsx`).
- OCP reference (`/home/bad/works/openshift-console/frontend/packages/dev-console/src/components/deployments/`):
  - `deployment-strategy/DeploymentStrategySection.tsx` (L60-84) and its `RollingUpdateStrategy`/`utils`.
  - `images/ImagesSection.tsx`, `images/ContainerImageField.tsx` L21-35, `ContainerField.tsx`.
  - Mapping: `utils/deployment-utils.ts` L375/L555.

## Acceptance criteria
- [x] FORM-2 (strategy, images): changing the strategy type and the rolling params, and one container's image, is reflected in YAML view and in the PUT body. Other containers are untouched (tests).
- [x] zod: an empty image name and invalid maxSurge/maxUnavailable show OCP-style inline errors; Save stays disabled.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-24 (frontend-engineer): `DeploymentStrategySection` + `ImagesSection` (OCP copy/order), shared `DeploymentFormSection`
  and a local PF `DropdownField`; schema/mapping for strategy + images (bounds parsed by the modal's `toDeploymentStrategy`,
  images matched by container name). `formText` now reads `getValues()`. 4 new tests (2 unit, 2 UI) incl. Save disabled
  on empty image / invalid bound; `scripts/check-fe.sh` green. ui-probe: ours only (OCP ref on :9000 not running).
- 2026-11-24 fix round 1: new pure `deployments/deploymentStrategy.ts` (regex, message, `DEFAULT_BOUND`,
  `toDeploymentStrategy`, `isValidBound`) imported by the modal (+ its test) and the form; bounds in one plain `<div>`;
  DropdownField gets `shouldFocusToggleOnSelect`, `onOpenChangeKeys`, `aria-describedby` to `${id}-helper`. Nit on
  zod skipping `superRefine` left as accepted.

## Review
- Round 1 (frontend-architect, 2026-11-24): **CHANGES_REQUESTED**. Scoped vitest (13) + eslint green.
  - `form/deploymentFormSchema.ts:4,33` — int-or-percent regex and message duplicated from `ConfigureUpdateStrategyModal.tsx:26-27`, against the contract ("without duplicating it") — lift `INT_OR_PERCENT`, its message and `toDeploymentStrategy` into a pure `deployments/deploymentStrategy.ts` that the modal and the form import (you may edit the modal for this; `deploymentFormValues.ts:2` then stops importing a component module).
  - Accepted: the "Container" dropdown for >1 container (per contract) and the ImageStream/trigger omission; orchestrator adds the parity-row note to `ocp-parity.md` on commit.
  - Nit (optional): zod 4 skips the object `superRefine` while any field fails, so bound errors show only once the image is valid; acceptable since Save is disabled either way.
  - Nit (optional): `useDeploymentEditor.ts:77-81` eslint-disable is justified; OK as is.
- Round 2 (frontend-architect, 2026-11-24): **APPROVE**. Duplication fixed: `deployments/deploymentStrategy.ts` owns the bound regex/message/default, `isValidBound` and `toDeploymentStrategy`; the modal, its test, `deploymentFormSchema.ts` and `deploymentFormValues.ts` import it. Scoped vitest (26) + eslint for `deployments/` green.
- 2026-11-24 ux-designer, round 1: **CHANGES_REQUESTED** (source compare only; OCP ref not running, no screenshots).
  Copy, help text, item order (Recreate, Rolling Update), field order and types match OCP `deployment-strategy-utils.ts` L5-36, `RollingStrategy.tsx`, `ContainerImageField.tsx` L32-37, `ContainerField.tsx`.
- DeploymentStrategySection.tsx:52-63 — the two bounds are direct grid items (24px form gap between them); OCP `RollingStrategy.tsx` L97 wraps them in one plain `<div data-test="rollingUpdate">`, so they stack with 0 gap — wrap both TextFields in one `<div>` and verify with ui-probe.
- DropdownField.tsx:166 — Select lacks `shouldFocusToggleOnSelect` and `onOpenChangeKeys={['Escape','Tab']}` (OCP `public/components/utils/console-select.tsx` L264-270), so focus is lost after picking an item — add both.
- DropdownField.tsx:175 — help text isn't tied to the toggle; OCP passes `aria-describedby={`${fieldId}-helper`}` (formik-fields/DropdownField.tsx) — give the HelperText an id `${id}-helper` and set `aria-describedby` on the MenuToggle when helperText is set.
- 2026-11-24 ux-designer, round 2: **APPROVE** — all 3 fixed (source check). Bounds wrapped in one `<div>` (DeploymentStrategySection.tsx:52); Select has `onOpenChangeKeys`/`shouldFocusToggleOnSelect` (DropdownField.tsx:54-55); `HelperText id={helperId}` + toggle `aria-describedby` (DropdownField.tsx:67,84).

## Handover notes
- Parity row note (ocp-parity.md is outside paths): "Deploy image from an image stream tag" and the auto-deploy trigger
  checkboxes are omitted (no ImageStream pages).
- Deviation: OCP edits only `containers[0]` and shows "Container: [C] name". We show that line for one container and a
  "Container" dropdown for several (per contract); each container keeps its own image, written by name.
- Switching to Recreate keeps the typed bounds in form state (hidden), so switching back restores them; `deps` re-validates
  them on a type change so hidden errors never block Save.
- Strategy parsing/validation is shared via `deployments/deploymentStrategy.ts` (modal + form).
- `DropdownField.tsx` (form/) is a generic PF Select field; promote to `shared/forms` if a second form needs it.
