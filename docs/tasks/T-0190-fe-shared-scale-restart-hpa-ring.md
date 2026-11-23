---
id: T-0190
title: Shared scale / Edit Pod count / restart for any scalable kind, HPA-aware ring
status: done
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
- [x] Deployments behave as in CP4a: existing Deployment action/ring tests pass unchanged apart from imports.
- [x] HPA-1 (part 2): Deployment `worker` (HPA) shows ring "Autoscaled to 2 Pods" without arrows and no "Edit Pod count" item; `web` still has both (test).
- [x] `ConfigureCountModal` with `field="parallelism"` sends one `replace /spec/parallelism` PATCH (test).
- [x] ACT-4: RO → Edit count / restart aria-disabled with reason (one test on a non-Deployment model, e.g. StatefulSet).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23 frontend-engineer: lifted scale hook, count modal (+ `parallelism`), Edit count / Restart items, HPA lookup
  and `WorkloadPodRing` into `workloads/scale/`; Deployments use them; `PodRing` gains `hpa` (OCP `hpaPodRingLabel`).
  New `scale/scale.test.tsx` (HPA worker/web, parallelism PATCH, StatefulSet RO). Gate green.
- 2026-11-23 frontend-engineer (round 1 fix): `useRelatedHPA` takes `{ enabled }`; `useEditCountAction` enables it
  only for `reviewByName && field === 'replicas'`, so list-row kebabs open no HPA watch and keep the access-gated
  item. New test: row kebab on `worker` sends no HPA request (fails without the fix). Targeted check-fe green.

## Review
- 2026-11-23 ux-designer round 1: **APPROVE** (mock :5241, dev-1/shop, admin, 1280 light).
- worker ring: "Autoscaled" / "to 2 Pods", no arrows, aria "Autoscaled to 2 Pods 2 Running" — OCP `pod-ring-utils.ts:hpaPodRingLabel` L191-209, `PodRing.tsx` L82-85 — OK.
- worker Actions: no "Edit Pod count"; web keeps it first and keeps its arrows — OCP `deployment-provider.ts` L46 — OK.
- Edit Pod count modal: PF small (560 px), title, description "Deployments maintain the desired number of healthy pods.", NumberInput focused, Save/Cancel — OCP `configure-count-modal.tsx` — unchanged from CP4a, OK. Parallelism variant not reachable yet (Jobs); copy checked against OCP `configureJobParallelismModal` in source only.
- Note (no change): OCP hides Edit Pod count until the HPA list loads (`relatedHPAs?.length === 0`); ours shows it until loaded (handover note). Accepted for stable menu order.

## Handover notes
- Signatures differ slightly from the contract: `useEditCountAction(args, model, { field })` and
  `useRestartAction(args, model, { blockedReason })` take the model explicitly (args carry none);
  `useEditCountAction` lives in a `.tsx` (it returns the dialog). `useTogglePaused(cluster, model, workload)`.
- `WorkloadPodRing` takes an optional `selector` (DCs/RCs use `spec.selector`, not `matchLabels`).
- Edit Pod count is shown until the HPA list loads, hidden only once an HPA matches (keeps menu order stable);
  HPA match compares the group of `scaleTargetRef.apiVersion`, not the version.
- New `useSetParallelism` (JSON patch `replace /spec/parallelism`, toast "<name> parallelism set to N").
- `restartRolloutPatch` is generic (lint-disable with reason) so the unchanged DEP-7 test literal still compiles.
- UI probe not run: it hardcodes port 5199, which this run was told not to use; only ring label text changed
  (existing styles), copy per OCP `pod-ring-utils.ts` ("Autoscaled"/"Autoscaling", "to N Pod(s)").
- 2026-11-23 frontend-architect, round 1: **CHANGES_REQUESTED**
  - web/src/features/resources/workloads/scale/useEditCountAction.tsx:33 — `useRelatedHPA` runs in every mounted row kebab (`ResourceRowActions` mounts `useResourceActions` per rendered row), so an all-namespaces Deployments page opens one HPA list+watch per distinct namespace; FRONTEND.md L141-143 forbids N live watches (6 HTTP/1.1 connections per origin) — required fix: add `{ enabled }` to `useRelatedHPA` (pass through to `useK8sList`) and enable it only when `reviewByName` (details Actions menu); rows keep the item (gated by access as today). Note the row/details divergence in the TSDoc and add one test that a row kebab on `worker` triggers no HPA list request.
  - Deviations accepted: explicit `model` arg on `useEditCountAction`/`useRestartAction`, `.tsx`, optional `selector` on `WorkloadPodRing`, `useSetParallelism`, `useTogglePaused(cluster, model, workload)`, group-only HPA match (= OCP `doesHpaMatch`).
  - Nit (optional): "shown until HPA list loads" differs from OCP (`relatedHPAs?.length === 0` hides until loaded); acceptable, keep the TSDoc note.
  - Nit (optional): useRestartRollout.ts:25 — the generic + eslint-disable exists only for a test literal; prefer a plain `TemplatedWorkload` param and a typed fixture variable in the test in a later touch.
- 2026-11-23 frontend-architect, round 2: **APPROVE**
  - Round-1 finding fixed: `useRelatedHPA` takes `{ enabled }` → `useK8sList`; `useEditCountAction.tsx:33` enables it only for `reviewByName && field === 'replicas'`; TSDoc documents row/details divergence; `scale.test.tsx:97` asserts no HPA request from a `worker` row kebab. `check-fe.sh src/features/resources/workloads/scale` green (lint, typecheck, 5 tests).
  - Nit (optional): scale.test.tsx:99 — `server.events.on` listener is never removed (global setup does not call `server.events.removeAllListeners()`); add `afterEach(() => server.events.removeAllListeners())` as in `ClusterActions.test.tsx:48`.
