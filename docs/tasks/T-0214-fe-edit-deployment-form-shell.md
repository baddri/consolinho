---
id: T-0214
title: Edit Deployment page — route, Form/YAML toggle, sync, Save/Reload/Cancel, Pause rollouts + Scaling
status: todo
owner: frontend-engineer
checkpoint: CP4c
depends_on: []
paths: [web/src/features/resources/workloads/deployments/form/, web/src/features/resources/routes.tsx, web/src/features/resources/paths.ts, web/src/features/resources/registry/types.ts, web/src/features/resources/registry/kinds/deployments.tsx, web/src/features/resources/actions/useResourceActions.tsx, web/src/features/resources/actions/useResourceActions.test.tsx]
review_rounds: 0
---

## Goal
"Edit Deployment" opens OCP's edit page at `…/deployments/<name>/form`. The page has the "Configure via:" Form view / YAML view toggle, keeps edits when switching, and has one Save with conflict handling (FORM-1, FORM-3, FORM-4). This task builds the page and the form framework plus the first sections (Pause rollouts and Scaling under "Advanced options"). T-0215/T-0216 add the remaining sections.

## Scope
- In:
  - Route, path option, descriptor flag, action target.
  - `EditDeploymentPage`, `DeploymentForm` (RHF + zod), `EditorToggle` with remembered choice, and Form↔YAML sync.
  - Footer Save · Reload · Cancel (Download in YAML view).
  - Stale alert, RO, unsaved guard.
  - "Advanced options" (OCP `AdvancedSection`: Pause rollouts + Scaling).
- Out: Strategy/Images (T-0215), Env (T-0216). DeploymentConfig form (§6, out of scope). Resource limits (Q5: not part of OCP's form, see §4c.6).

## Contract / design notes
- Route `k8s/ns/:namespace/deployments/:name/form`: register it as a full page in `resourceRoutes`, outside the details tabs.
  - `resourcePath(cluster, model, { namespace, name, page: 'form' })` (new option; keep `tab`).
  - `ResourceDescriptor.hasEditForm?: true`; set it on deployments.
  - `useResourceActions` 'edit' navigates to the form when the descriptor has it, else to the YAML tab (FORM-4).
- Folder `features/resources/workloads/deployments/form/`:
  - `EditDeploymentPage.tsx`: watched object, heading "Edit Deployment", loading/error like details.
  - `DeploymentForm.tsx`.
  - `EditorToggle.tsx`.
  - `deploymentFormValues.ts`: `toFormValues(d: Deployment): DeploymentFormValues` and `applyFormValues(d, v): Deployment`. Unknown fields are preserved, because the form only overwrites what it owns (OCP `convertEditFormToDeployment`).
  - `deploymentFormSchema.ts` (zod).
  - `AdvancedSection.tsx`.
- Toggle: OCP `EditorToggle`, "Configure via:" + radios "Form view" / "YAML view". The choice is remembered via `useStoredValue('fleetconsole.editDeploymentForm.editor.lastView', …)`; default is Form.
- Sync:
  - Form→YAML: `toEditorText(applyFormValues(base, values))`.
  - YAML→Form: `toFormValues(parse(text))`. On invalid YAML, show OCP's danger alert "Invalid YAML cannot be persisted" with the error, "Switching to form view will delete any invalid YAML.", and the buttons "Switch and delete" / "Cancel".
  - The YAML view reuses `YamlEditor` unchanged (the schema prop is wired by T-0216, after T-0211).
- Save: one `useUpdateResource(cluster, model)` PUT of the merged object with the base `resourceVersion`.
  - Success navigates to the details page (OCP).
  - A stale base or a 409 shows "This object has been updated." / "Click reload to see the new version." with Reload. Reuse the semantics of `ResourceYamlTab`.
  - Cancel = navigate to details. `UnsavedChangesGuard` is active when the form is dirty.
  - The "Saving to <cluster>" cue + environment label matches the YAML tab.
- RO (`useResourceAccess` update): every field is disabled; show the info alert with the reason and no Save (ACT-4).
- Advanced options: OCP `ProgressiveList` "Advanced options" with the items Pause rollouts (checkbox "Pause rollouts for this Deployment") and Scaling (Replicas number input, help "The number of instances of your Image." is OCP's copy). Build it with PF components (see OCP `ProgressiveList` for the markup: "Click on the names to access advanced options for" + link buttons).
- Sticky footer: `shared/ui/form-page/FormPage.tsx` (`FlexForm`, `FormBody`, `FormFooter`).

## Context pack
- Exemplars:
  - `web/src/features/admin/clusters/form/ClusterForm.tsx` (RHF + zod + `FlexForm`/`FormBody`/`FormFooter`, L97-124).
  - `web/src/features/resources/yaml/ResourceYamlTab.tsx` (stale/409/RO/Saving-to logic to mirror).
  - `web/src/features/cluster-context/useLastCluster.ts` (`useStoredValue` usage).
- Touch points:
  - `web/src/features/resources/routes.tsx:resourceRoutes` (L84-96).
  - `web/src/features/resources/paths.ts:resourcePath` (L47, `objectSuffix`).
  - `web/src/features/resources/registry/types.ts:ResourceDescriptor` (L93+).
  - `web/src/features/resources/registry/kinds/deployments.tsx` (descriptor L131+).
  - `web/src/features/resources/actions/useResourceActions.tsx` L95-100.
  - `web/src/features/resources/yaml/{useUpdateResource.ts,yamlObject.ts:toEditorText/parseEdited,UnsavedChangesGuard.tsx}`.
  - `web/src/features/resources/actions/useResourceAccess.ts:useResourceAccess`.
- OCP reference (`/home/bad/works/openshift-console/frontend/`):
  - `packages/dev-console/src/components/deployments/{DeploymentPage.tsx,EditDeployment.tsx,DeploymentForm.tsx,DeploymentFormEditor.tsx,AdvancedSection.tsx,PauseRolloutsSection.tsx}`.
  - `packages/dev-console/src/components/import/advanced/ScalingSection.tsx`.
  - `packages/dev-console/src/components/deployments/utils/deployment-utils.ts` (`convertDeploymentToEditForm` L375, `convertEditFormToDeployment` L555).
  - `packages/console-shared/src/components/synced-editor/{SyncedEditor.tsx,editor-toggle.tsx}`.
  - `packages/console-app/src/actions/hooks/useDeploymentActions.ts` L92-99.

## Acceptance criteria
- [ ] FORM-1: Edit Deployment (actions menu and kebab) opens `/form`. The toggle restores the last choice after a reload (test).
- [ ] FORM-3: an edit in Form view is visible in YAML view and back; invalid YAML shows OCP's alert. Save sends one PUT with `resourceVersion` and preserves unknown fields (`toFormValues`/`applyFormValues` unit test round-trips a full fixture unchanged). 409 → the stale alert + Reload. Cancel → details with the guard. RO → disabled fields + reason, no Save.
- [ ] FORM-4: Edit on every other kind still opens its YAML tab (test).
- [ ] Advanced options: Pause rollouts and Replicas edit `spec.paused`/`spec.replicas` (tests).
- [ ] Layout measured against OCP (ui-probe at 1280 wide: toggle row, section spacing, sticky footer); note it in the Work log.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
