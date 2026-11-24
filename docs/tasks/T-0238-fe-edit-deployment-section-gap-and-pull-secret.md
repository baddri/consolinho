---
id: T-0238
title: Edit Deployment form — 24px section gap and "Show advanced image options" (Pull secret)
status: todo
owner: frontend-engineer
checkpoint: 4c
depends_on: []
paths: [web/src/features/resources/workloads/deployments/form, web/src/shared/ui/form-page]
review_rounds: 0
---

## Goal
Live side-by-side (T-0222) of `/deployments/<name>/form`: every section's fields, copy and widths match, but our
sections are 56px apart where OCP's are 24px. The Images section also lacks OCP's collapsed "Show advanced image options" (Pull Secret).

## Scope
- In: section spacing; the advanced image options ExpandableSection with the Pull Secret dropdown (Secrets in the namespace) writing
  `spec.template.spec.imagePullSecrets[0].name`.
- Out: the "Create new Secret" link inside it (it needs the create-image-secret modal, which we don't have). Record the
  deviation in parity row 46. The image-stream checkbox is already an accepted omission (T-0215).

## Contract / design notes
- Measured at 1280 (ours vs OCP): Name section ends y403, next starts y459 (**56px**), vs OCP 451 → 475 (**24px**). The cause:
  ours uses `pf-v6-c-form__section`, which carries PF `margin-block-start: 32px` (measured `m=32px 0 0`), on top of the
  `.body` flex gap of 24px. OCP uses nested `pf-v6-c-form` divs with margin 0 in a 24px-gap column
  (`form-utils/FormBody.tsx`, `import/section/FormSection.tsx`). Fix: set `--pf-v6-c-form__section--MarginBlockStart: 0`
  on `.section` / `.paneForm` (in a comment, cite FormSection.tsx), or render the sections as OCP does. Check whether
  `shared/ui/form-page/FormPage.module.css .paneForm` has the same issue on other form pages.
- OCP `dev-console/src/components/deployments/images/AdvancedImageOptions.tsx`: `ExpandableSection` collapsed by
  default, toggle "Show advanced image options" / "Hide advanced image options" (link 226x37). Inside: FormGroup
  "Pull Secret", a full-width select with placeholder "Select Secret name", helper "Secret for authentication when pulling
  image from a secured registry.". Copy verbatim, including the "Pull Secret" capitalisation.
- Other measured values already match: h1 24px/600, section h2 20px/600 (26px high), pane max-width 50%/650px, menu toggles
  650x37, helper text 12px, Save/Reload/Cancel. The Save padding 24 vs 28px is a PF version delta, so ignore it.

## Context pack
- Touch points: `EditDeployment.module.css` (`.section` L48, `.paneForm` L63-80), `DeploymentFormSection.tsx`,
  `ImagesSection.tsx`, `deploymentFormValues.ts` / `deploymentFormSchema.ts` (the imagePullSecret round-trip), `useEnvSources.ts`
  (an exemplar for listing Secrets), `FilterSelect.tsx` / `DropdownField.tsx`.
- OCP: `deployments/images/{ImagesSection,AdvancedImageOptions}.tsx`, `deployments/utils/deployment-utils.ts` (imagePullSecret mapping).

## Acceptance criteria
- [ ] The gap between consecutive form sections is 24px (probe: ours vs OCP `/k8s/ns/consolinho/deployments/consolinho/form`).
- [ ] "Show advanced image options" is collapsed by default. Selecting a secret round-trips into `imagePullSecrets` on Save (unit test).
- [ ] Other forms using `FormPage` are checked for the same 32px margin.
- [ ] Build, lint and tests green (CLAUDE.md rule 4).

## Work log

## Review

## Handover notes
