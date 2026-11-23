---
id: T-0215
title: Deployment form — Deployment strategy and Images sections
status: todo
owner: frontend-engineer
checkpoint: CP4c
depends_on: [T-0214]
paths: [web/src/features/resources/workloads/deployments/form/]
review_rounds: 0
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
- [ ] FORM-2 (strategy, images): changing the strategy type and the rolling params, and one container's image, is reflected in YAML view and in the PUT body. Other containers are untouched (tests).
- [ ] zod: an empty image name and invalid maxSurge/maxUnavailable show OCP-style inline errors; Save stays disabled.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
