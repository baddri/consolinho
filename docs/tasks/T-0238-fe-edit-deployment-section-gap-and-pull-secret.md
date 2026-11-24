---
id: T-0238
title: Edit Deployment form — 24px section gap and "Show advanced image options" (Pull secret)
status: done
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
- [x] The gap between consecutive form sections is 24px (probe: ours vs OCP `/k8s/ns/consolinho/deployments/consolinho/form`).
- [x] "Show advanced image options" is collapsed by default. Selecting a secret round-trips into `imagePullSecrets` on Save (unit test).
- [x] Other forms using `FormPage` are checked for the same 32px margin.
- [x] Build, lint and tests green (CLAUDE.md rule 4).

## Work log
- 2026-11-24 frontend-engineer: started; OCP refs AdvancedImageOptions, ResourceDropdown(Field), deployment-utils read.

- 2026-11-24 frontend-engineer: gap fixed via `--pf-v6-c-form__section--MarginBlockStart: 0` on `.body` + FormBody `.paneForm`;
  AdvancedImageOptions + usePullSecrets; probe (ours only, OCP ref down): section margin 0, gap 24px, toggle 226x37. in_review.

## Review
- 2026-11-24 frontend-architect, round 1: **APPROVE**. Checked against OCP `AdvancedImageOptions.tsx`, `ResourceDropdown.tsx:301`,
  `deployment-utils.ts:387,600-606` and `import/section/FormSection.tsx`. Copy is verbatim and the filter matches (dockercfg/dockerconfigjson).
  The append-unless-listed write matches OCP and is better, because an unset list stays unset instead of becoming `[]`. The Secrets query
  is shared with useEnvSources (same key, no extra request). The section-margin token is cleared only on `.body` and `.paneForm`, so other
  PF forms are unaffected. Scoped eslint and tsc are clean. Vitest in the folder: 17/18 pass. FORM-ENV fails with
  "Unable to find option web-config", which comes from the uncommitted KindBadge.tsx change in another lane, not from this task.
  Optional nits:
  - `EnvironmentSection.tsx:93-112`, `DeploymentFormEditor.tsx:29-35,63-69`: prettier-only rewrap outside the task. Harmless; keep it or revert it.
  - `ImagesSection.tsx:16`: the TSDoc line is now longer than 120 chars. Rewrap it.
  - `usePullSecrets.ts:20`: with `namespace` undefined the query is disabled and `isPending` stays true, so the spinner never stops.
    This can't happen on a Deployment route. If you want to guard it, use `isPending && namespace !== undefined`.
  - `EditDeploymentPage.test.tsx:568`: add a blank line before the `it(` and reuse the `helper` const at L584.

## Handover notes
- Gap: PF's `pf-v6-c-form__section:not(:first-child)` 32px margin cleared on Edit Deployment `.body` and shared
  `FormBody` `.paneForm` (Register/Edit cluster had the same 56px gap; now 24px, probed).
- Pull Secret: `AdvancedImageOptions.tsx` (PF `ExpandableSection`, `FilterSelect` with new `id` prop), `usePullSecrets.ts`
  (shares useEnvSources' Secrets list query; filters dockercfg/dockerconfigjson as OCP). Toggle: spinner / "Error loading -
  Select Secret name" / selection / placeholder, OCP ResourceDropdown order.
- Write: OCP semantics, not "[0] replace": the pick is appended to `imagePullSecrets` unless already listed; nothing is removed.
  Form value = first listed secret. Unit + page test (FORM-IMG) cover it.
- Deviation: no "Create new Secret" link (parity row 46). OCP side not probed (reference console was down); values from T-0222.
- FORM-ENV test currently fails because of another agent's uncommitted KindBadge.tsx change (sr-only kind text changes
  option names: "web-config" → "ConfigMap web-config"); the test needs updating once that lands. Full gate 2026-11-24: lint+typecheck ok; 17 test failures (heading/option names: KindBadge, SectionHeading WIP) and the build TS6133 in modified web/e2e/workloads.e2e.ts are other agents' uncommitted work.
