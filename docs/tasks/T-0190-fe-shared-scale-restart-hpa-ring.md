---
id: T-0190
title: Shared scale / Edit Pod count / restart for any scalable kind, HPA-aware ring
status: todo
owner: frontend-engineer
checkpoint: 4b
depends_on: [T-0189]
paths: [web/src/features/resources/workloads/scale, web/src/features/resources/workloads/deployments, web/src/features/resources/registry/kinds/deployments.tsx, web/src/features/resources/components/PodRing.tsx, web/src/features/resources/components/podRing.ts, web/src/features/resources/components/PodRing.test.tsx, web/src/features/resources/components/podRing.test.ts]
review_rounds: 0
---

## Goal
Lift the Deployment-only CP4a pieces (scale hook, count modal, ring with arrows, restart rollout) into
`workloads/scale/` so StatefulSets, ReplicaSets, ReplicationControllers, DeploymentConfigs and Jobs reuse them, and make
the ring and "Edit Pod count" HPA-aware as OCP does (second sentence of HPA-1). Behaviour for Deployments must not
change (CP4a e2e stays green).

## Contract / design notes
- `workloads/scale/useScaleWorkload.ts` — `useScaleWorkload(cluster, model, { toastErrors? })`: PATCH `<plural>/<n>/scale`
  (generalises `useScaleDeployment`; same vars, same toast "Scaled <name> to <n> pods on <cluster>"). Delete
  `useScaleDeployment.ts`; Deployments import the new hook.
- `workloads/scale/ConfigureCountModal.tsx` — `ConfigureCountModal({ cluster, model, obj, field?, onClose })` where
  `field: 'replicas' | 'parallelism'` (default `replicas`). `replicas` → scale subresource; `parallelism` → JSON patch
  `replace /spec/parallelism`. Copy from OCP `public/components/modals/configure-count-modal.tsx`: title "Edit Pod
  count" / "Edit parallelism", description "<labelPlural> maintain the desired number of healthy pods." / L169-170 Job
  text, button "Save". Moves from `workloads/deployments/`.
- `workloads/scale/useEditCountAction.ts` — `useEditCountAction(args: KindActionArgs, opts?: { field? })` → `{ item,
  dialog }`, the "Edit Pod count" / "Edit parallelism" `KindActionItem` gated by `useActionAccess` on
  `patch <plural>/scale` (replicas) or `patch <plural>` (parallelism); **returns no item when `useRelatedHPA` finds an
  HPA** (OCP `deploymentconfig-provider.ts` / Deployment provider hide ModifyCount when HPAs exist).
- `workloads/scale/useRelatedHPA.ts` — `useRelatedHPA(cluster, obj)`: `useK8sList(HorizontalPodAutoscalerModel,
  namespace)` filtered on `spec.scaleTargetRef` {apiVersion group, kind, name} (OCP `packages/console-shared/src/hooks/useRelatedHPA.ts`).
  One watch per namespace, shared by key with the HPA list page.
- `workloads/scale/WorkloadPodRing.tsx` — `WorkloadPodRing({ cluster, model, obj })` replaces `DeploymentPodRing`
  (`kinds/deployments.tsx` L81): arrows gated on `patch <plural>/scale`; with an HPA → no arrows, label
  "Autoscaled"/"Autoscaling" and sub-label "to N Pod(s)" (OCP `pod-ring-utils.ts` L191-209); `PodRing` gains the props
  needed for that label (keep its public API otherwise).
- `workloads/scale/useRestartRollout.ts` — `useRestartRollout(cluster, model)` + `restartRolloutPatch(obj, now)` moved
  from `useDeploymentRollout.ts` (same `kubectl.kubernetes.io/restartedAt` template annotation, CP4a accepted); a
  `useRestartAction(args)` item helper gated on `patch <plural>`. `useTogglePaused` stays Deployment/DC-specific in
  `useDeploymentRollout.ts` but takes `model` so T-0193 can reuse it.
- HPA hint: Deployments details show OCP's PodRing "Autoscaled" state; no separate alert (OCP has none). HPA-1's
  "count modal warns" becomes "count action hidden" (OCP) — PO rewording noted in §4b.7.

## Context pack
- Docs: ADR-0037 §3 (action order/gating), FRONTEND.md § "Actions".
- Exemplars: `workloads/deployments/useScaleDeployment.ts`, `ConfigureCountModal.tsx` (L11-60),
  `useDeploymentRollout.ts` (L22-58), `kinds/deployments.tsx:DeploymentPodRing` (L81), `useDeploymentActions.tsx`
  (item order), `components/PodRing.tsx:PodRingScale` (L77).
- Touch points: `useDeploymentActions.test.tsx`, `PodRing.test.tsx`, `web/e2e/workloads.e2e.ts` (scale on `web`
  must still pass — HPA fixture targets `worker`).
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/modals/configure-count-modal.tsx`;
  `packages/console-shared/src/utils/pod-ring-utils.ts` L191-209; `packages/console-shared/src/hooks/useRelatedHPA.ts`;
  `packages/console-shared/src/components/pod/PodRingSet.tsx`; `packages/console-app/src/actions/providers/deploymentconfig-provider.ts`.

## Acceptance criteria
- [ ] Deployments behave as in CP4a: existing Deployment action/ring tests pass unchanged apart from imports.
- [ ] HPA-1 (part 2): Deployment `worker` (HPA) shows ring "Autoscaled to 2 Pods" without arrows and no "Edit Pod count" item; `web` still has both (test).
- [ ] `ConfigureCountModal` with `field="parallelism"` sends one `replace /spec/parallelism` PATCH (test).
- [ ] ACT-4: RO → Edit count / restart aria-disabled with reason (one test on a non-Deployment model, e.g. StatefulSet).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
