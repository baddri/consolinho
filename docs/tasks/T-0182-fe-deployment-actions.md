---
id: T-0182
title: Deployment actions — Edit Pod count, Pause/Resume rollouts, Restart rollout, paused alert
status: done
owner: frontend-engineer
checkpoint: 4a
depends_on: [T-0176]
paths: [web/src/features/resources/workloads/deployments, web/src/features/resources/registry/kinds/deployments.tsx]
review_rounds: 0
---

## Goal
DEP-3/4/6/7/11: the Deployment kind actions (ADR-0037 §3) in OCP order and the paused-rollout alert on details.

## Scope
- In: `useDeploymentActions.tsx` (descriptor `useKindActions`), `ConfigureCountModal.tsx`, `useScaleDeployment.ts`
  (shared with T-0184), `DeploymentPausedAlert.tsx`, tests; descriptor wiring.
- Out: Edit update strategy (T-0183, adds its item to the same hook), ring buttons (T-0184), Rollback (T-0185).

## Contract / design notes
- Items, OCP `useDeploymentActions.ts` L92-165 order and copy: "Edit Pod count", "Pause rollouts" / "Resume rollouts",
  "Restart rollout" (disabled while paused, OCP), then T-0183 adds "Edit update strategy" after Pod count. Gating:
  count → `patch deployments/scale`; others → `patch deployments` via `useActionAccess`.
- `useScaleDeployment(cluster)` → `useResourceMutation` + `k8sPatch(..., { subresource: 'scale' }, [{ op: 'replace', path: '/spec/replicas', value }])`,
  message "<name> scaled to <n>".
- `ConfigureCountModal` (OCP `configure-count-modal.tsx`): title "Edit Pod count", PF `NumberInput` (min 0), help
  "Deployments maintain the desired number of healthy pods." (verify OCP copy), on `ResourceMutationModal`.
- Pause/Resume: JSON Patch `/spec/paused` (add/replace true|false), no modal, `toastErrors`.
- Restart rollout: patch `/spec/template/metadata/annotations/kubectl.kubernetes.io~1restartedAt` = ISO now (create
  `/spec/template/metadata/annotations` first when missing — OCP L21-31), no modal, message "Rollout restarted for <name>".
- `DeploymentPausedAlert` (OCP `workload-pause.tsx` L33-41): info inline `Alert isInline` title "<name> is paused",
  body "This will stop any new rollouts or triggers from running until resumed.", action link "Resume rollouts"
  (same mutation, gated). Rendered in the details page above the summary (descriptor `DetailsTop` composition with the ring).
- Mock: `useScaleDeployment` relies on T-0174 `scale`; mock controller should reconcile `status.replicas` /
  pods on scale if cheap (else note it; QA uses real BE).

## Context pack
- Exemplars: T-0176 `useResourceMutation`, `ResourceMutationModal`; `registry/kinds/deployments.tsx` `DeploymentPodRing` L60, `DetailsTop` L135.
- OCP reference: `/home/bad/works/openshift-console/frontend/packages/console-app/src/actions/hooks/useDeploymentActions.ts`
  L21-31 restart patch, L92-165 items; `packages/console-app/src/actions/providers/deployment-provider.ts` L23-36;
  `public/components/modals/configure-count-modal.tsx` (L54 patch); `public/components/utils/workload-pause.tsx` L33-41;
  `public/components/deployment.tsx` L102.

## Acceptance criteria
- [x] DEP-3: Edit Pod count modal names cluster + env; Save PATCHes `…/scale`; ring/details update live (MSW test).
- [x] DEP-4 (kind part; Edit labels/annotations arrive with T-0177): kebab order matches OCP: kind items, then Edit labels, Edit annotations, Edit Deployment, Delete Deployment.
- [x] DEP-6: Pause/Resume toggles `spec.paused`; paused alert with Resume link shown/hidden.
- [x] DEP-7: Restart rollout sets `restartedAt` (also when the template has no annotations); disabled while paused.
- [x] DEP-11 / ACT-4: RO grant → every item aria-disabled with reason; RBAC on `deployments/scale` only disables Edit Pod count.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23 frontend-engineer: implemented hooks, modal, alert, descriptor wiring and 8 tests; full gate green (931 tests).
- 2026-11-23 frontend-engineer: round-1 UX F1/F2: `ResourceMutationModal` gains optional `description` (ModalHeader,
  aria-describedby) and `elementToFocus`; count modal uses both; tests added.

## Review
- Round 1 UX (ux-designer, 2026-11-23): **CHANGES_REQUESTED**. Checked in mock UI 1280 light (admin dev-1, alice prod-eu-1) against OCP source; ref console API returned 401, so no OCP screenshots.
  - OK: menu order/copy = OCP `deployment-provider.ts` L45-60 (Edit Pod count, Pause/Resume rollouts, Restart rollout, Edit Deployment, Delete Deployment); Restart aria-disabled with OCP tooltip while paused (`useDeploymentActions.ts` L136-137); alice sees kind items + Delete disabled with "Your access to prod-eu-1 is read-only." (Edit Deployment enabled is T-0176 design).
  - OK: paused alert = OCP `workload-pause.tsx` L33-52 (info, isInline, title/body/"Resume rollouts"), under "Deployment details" above the ring like `deployment.tsx` L102, 24px below = `.co-alert` (`_alerts.scss` L2); Resume hides it; Save on scale updates the ring ("Scaling to 4").
  - F1 Edit Pod count modal — "Deployments maintain the desired number of healthy pods." is a body form row (24px form gap + p margin, ~40px above and below) — OCP `configure-count-modal.tsx` puts it in `ModalHeader description`, body holds only the spinner — add an optional `description` prop to `ResourceMutationModal` passed to `ModalHeader description` and use it here.
  - F2 Edit Pod count modal — on open, focus lands on the Close button, `inputProps.autoFocus` loses to the modal focus trap — OCP `NumberSpinner autoFocus` (`configure-count-modal.tsx` FormGroup) — focus the count input on open (PF `Modal elementToFocus` via `ResourceMutationModal`, or equivalent).
- Round 2 UX (ux-designer, 2026-11-23): **APPROVE** (F1, F2 only; mock UI 1280 light).
  - F1 fixed: help text renders in `.pf-v6-c-modal-box__description` under the title, body holds cluster line + spinner (OCP `configure-count-modal.tsx` ModalHeader `description`).
  - F2 fixed: on open, focus is on the "Pod count" input with its value selected (OCP NumberSpinner `autoFocus`).
- Round 1 (frontend-architect, 2026-11-23): **APPROVE**. check-fe green (81 files / 931 tests).
- Deviation 1 (DEP-4 caveat): accepted; T-0177 owns extending the order test with Edit labels/annotations.
- Deviation 2 (restart key): confirmed `kubectl.kubernetes.io/restartedAt`; it is what `kubectl`/`oc rollout restart` write and works on vanilla K8s too.
- Deviation 3 (help text in body): accepted; follow-up: add a `description` prop to `ResourceMutationModal` (OCP `ModalHeader description`).
- Deviation 4: confirmed; OCP `deployment-provider.ts` L48-52 puts UpdateStrategy after Restart rollout (and AddStorage). T-0183 must insert it there.
- Deviation 5 (mock scales spec only): accepted per task note; QA verifies status/pods on real BE.
- Nit (optional, follow-up): OCP hides Edit Pod count when HPAs target the deployment (provider L45); add it with HPA support.
- Round 2 (frontend-architect, 2026-11-23): **APPROVE**. `ResourceMutationModal` `description` (ModalHeader `descriptorId` + `aria-describedby`) and `elementToFocus` match the PF 6 API; Count modal uses both; tested in KindActions.test + DEP-3. No regressions; check-fe green (81 files / 932 tests, no timeouts).

## Handover notes
- New in `workloads/deployments/`: `useScaleDeployment` (scale subresource, optional `toastErrors` for T-0184's ring),
  `useDeploymentRollout.ts` (`useTogglePaused`, `useRestartRollout`, `restartRolloutPatch`), `ConfigureCountModal`,
  `useDeploymentActions` (descriptor `useKindActions`), `DeploymentPausedAlert`; tests in `useDeploymentActions.test.tsx`.
- Order: Edit Pod count, Pause/Resume rollouts, Restart rollout (OCP provider order). T-0183 should insert
  "Edit update strategy" after Restart rollout to match OCP `deployment-provider.ts` (the task said "after Pod count").
- DEP-4: "Edit labels"/"Edit annotations" are not in `useResourceActions` yet (T-0177); the test asserts the current
  common items and needs those two added once T-0177 lands.
- Restart annotation is `kubectl.kubernetes.io/restartedAt` per the contract; OCP uses `openshift.openshift.io/restartedAt`.
  Both trigger a rollout; switch the constant if parity on the key is wanted.
- `ResourceMutationModal` now has optional `description` (header) and `elementToFocus` (initial focus, CSS selector).
- Mock: scale updates `spec.replicas` only (ring shows "Scaling to N"); no status/pod reconciliation (mocks outside paths).
- Style probe not run: it never clicks, and menu/modal/paused alert need clicks or a paused fixture (RTL-tested).
