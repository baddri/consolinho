---
id: T-0214
title: Edit Deployment page — route, Form/YAML toggle, sync, Save/Reload/Cancel, Pause rollouts + Scaling
status: done
owner: frontend-engineer
checkpoint: CP4c
depends_on: []
paths: [web/src/features/resources/workloads/deployments/form/, web/src/features/resources/routes.tsx, web/src/features/resources/paths.ts, web/src/features/resources/registry/types.ts, web/src/features/resources/registry/kinds/deployments.tsx, web/src/features/resources/actions/useResourceActions.tsx, web/src/features/resources/actions/useResourceActions.test.tsx]
review_rounds: 1
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
- [x] FORM-1: Edit Deployment (actions menu and kebab) opens `/form`. The toggle restores the last choice after a reload (test).
- [x] FORM-3: an edit in Form view is visible in YAML view and back; invalid YAML shows OCP's alert. Save sends one PUT with `resourceVersion` and preserves unknown fields (`toFormValues`/`applyFormValues` unit test round-trips a full fixture unchanged). 409 → the stale alert + Reload. Cancel → details with the guard. RO → disabled fields + reason, no Save.
- [x] FORM-4: Edit on every other kind still opens its YAML tab (test).
- [x] Advanced options: Pause rollouts and Replicas edit `spec.paused`/`spec.replicas` (tests).
- [x] Layout measured against OCP (ui-probe at 1280 wide: toggle row, section spacing, sticky footer); note it in the Work log.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-24 frontend-engineer: started; read OCP EditDeployment/SyncedEditorField/ProgressiveList/FormFooter, exemplars ClusterForm + ResourceYamlTab.
- 2026-11-24 frontend-engineer: built page, synced editor (`useDeploymentEditor`), Advanced options, route/path/flag/action; tests in `form/EditDeploymentPage.test.tsx` + `actions/useResourceActions.test.tsx`. Following OCP: checkbox copy is "Pause rollouts for this deployment" (lowercase), and the Name (read-only) and "Some fields might not be displayed" hint are added.
- 2026-11-24 frontend-engineer: ui-probe at 1280 (ours only; the OCP ref on :9000 wasn't running): sticky footer `position: sticky; bottom 0`, padding 16/23 like other form pages; section/alert gap 24px (form grid gap); radios inline. Re-probe against OCP when the ref is up. Mid-run, the gate briefly showed errors in others' WIP (`yaml/monacoSetup.ts` typecheck, a `ResourceYamlTab.test.tsx` lint); both were gone on re-run.
- 2026-11-24 frontend-engineer: fix round 1. Removed the project bar. Invalid-YAML buttons are now in the alert body after the `pf-v6-u-mb-sm` paragraph. The advanced items and footer sentence share one div. Revealed items smooth-scroll into view (ref). Download is hidden below sm. Save is disabled on form errors (`mode: 'onChange'`; no current field can be invalid, so there's no UI test until T-0215).

## Review
- 2026-11-24 ux-designer, round 1: **CHANGES_REQUESTED** (from source; the OCP ref server was down). OK: toggle row (SyncedEditorField.scss `noMargin`: −gutter-x inline, sm/gutter-x padding, dividers), body flex + 24px gap (FormBody.tsx `flexLayout` on `pf-v6-c-form`), section order + Name disabled (DeploymentFormEditor.tsx, NameSection.tsx), section titles h2 xl, 650px cap, copy (Pause/Scaling/SwitchToYAMLAlert/stale/footer order Save·Reload·Cancel·Download).
  - EditDeploymentPage.tsx:54 — renders `ProjectBar`; OCP `dev-console/.../deployments/DeploymentPage.tsx` has no namespace bar (DocumentTitle + StatusBox + EditDeployment only), and UX.md limits it to list/details pages; switching projects mid-edit would also drop the edit — remove it.
  - DeploymentForm.tsx:65-74 — "Switch and delete"/"Cancel" are in `actionLinks` (alert action group) — OCP `console-shared/.../formik-fields/SyncedEditorField.tsx:186-195` puts the danger + secondary `Button`s in the alert body after `<p className="pf-v6-u-mb-sm">`, separated by a space — move them into the children.
  - AdvancedSection.tsx:105-134 — the revealed items and the footer sentence are direct children of the section grid, so you get a 24px gap + 16px item margin = 40px between them — OCP `deployments/AdvancedSection.tsx:54` wraps the whole `ProgressiveList` in one `<div>`, so only `.ocs-progressive-list-section { margin-bottom: spacer--md }` (16px) separates them — wrap the items and the footer in one div.
  - AdvancedSection.tsx:109 (minor) — OCP `progressive-list/ProgressiveListItem.tsx:13-15` smooth-scrolls a revealed section into view on mount — add a ref + `scrollIntoView({ behavior: 'smooth' })` effect on the item wrapper.
  - DeploymentForm.tsx:130 (minor) — OCP `form-utils/FormFooter.tsx:97` hides Download below sm (`pf-v6-u-display-none pf-v6-u-display-flex-on-sm`) — add the same utilities.
- 2026-11-24 frontend-architect, round 1: **APPROVE**. Scoped vitest (form/ + useResourceActions, 12/12) and eslint clean. Matches §4c/OCP `EditDeployment` (toggle + stored view, invalid-YAML alert, base-rv PUT, stale/409 + Reload, RO, ProgressiveList). `useDeploymentEditor` fits T-0215/T-0216: sections take `control`, values/`applyFormValues` extend per field, `{...toFormValues(working), ...values}` keeps YAML-only edits.
  Optional nits / follow-ups (not blocking):
  - `form/DeploymentForm.tsx:93` — OCP also disables Save in form view while there are errors (`!dirty || !isEmpty(errors)`); add `|| (view === 'form' && !form.formState.isValid)`-style check when T-0215 adds the required Image field.
  - `form/DeploymentForm.tsx:20,107-116` — `yamlDataUrl` and the "Saving to <cluster>" + `EnvironmentLabel` cue duplicate `yaml/ResourceYamlTab.tsx:27,~190`; lift both into `yaml/` (e.g. `SaveTargetCue`) as a follow-up alongside the FormPage CSS one.
  - `form/useDeploymentEditor.ts:confirmSwitchToForm` — keeps the invalid `yamlText` in state; harmless (overwritten on the next switch to YAML), but clearing it to `formText` would match "delete any invalid YAML" literally.
  - Already noted: CSS duplication with `shared/ui/form-page/FormPage.module.css`; lowercase "deployment" copy.
- 2026-11-24 ux-designer, round 2: **APPROVE**. All 5 round-1 findings are fixed: no ProjectBar; the alert buttons are in the body with an nbsp; items and footer are in one div (16px item margin); smooth scrollIntoView on reveal; Download has `pf-v6-u-display-none pf-v6-u-display-flex-on-sm`. Re-probe against the OCP ref when it is up (Work log note).

## Handover notes
- Route `k8s/ns/:namespace/deployments/:name/form` (static `deployments` segment outranks `:plural`), handle `{scope:'ns'}`; `resourcePath(..., { page: 'form' })`; `ResourceDescriptor.hasEditForm` decides the Edit action target.
- `form/useDeploymentEditor.ts` holds all state. Base = the version at mount/Reload (its rv goes into the PUT). Working object = base, or the last YAML parsed back into the form, so YAML-only edits survive form round-trips. Form↔YAML conversion = `applyFormValues`/`toFormValues`/`parseEdited`.
- Dirty = current view's text ≠ base text, so Save is disabled until something changed. Stale = live rv ≠ base rv, or a 409.
- T-0215/T-0216: extend `deploymentFormSchema` + `toFormValues`/`applyFormValues` (write only changed fields), and add sections in `DeploymentFormEditor` between Name and Advanced options. Wire `YamlEditor`'s schema prop when T-0211 lands.
- Follow-up: the `paneForm`/section CSS in `EditDeployment.module.css` duplicates `shared/ui/form-page/FormPage.module.css`. A shared `FormBody` variant (flex layout, uncapped) would remove the duplicate.
