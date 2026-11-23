---
id: T-0182
title: Deployment actions — Edit Pod count, Pause/Resume rollouts, Restart rollout, paused alert
status: todo
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
- [ ] DEP-3: Edit Pod count modal names cluster + env; Save PATCHes `…/scale`; ring/details update live (MSW test).
- [ ] DEP-4: kebab order matches OCP: kind items, then Edit labels, Edit annotations, Edit Deployment, Delete Deployment.
- [ ] DEP-6: Pause/Resume toggles `spec.paused`; paused alert with Resume link shown/hidden.
- [ ] DEP-7: Restart rollout sets `restartedAt` (also when the template has no annotations); disabled while paused.
- [ ] DEP-11 / ACT-4: RO grant → every item aria-disabled with reason; RBAC on `deployments/scale` only disables Edit Pod count.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
