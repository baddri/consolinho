---
id: T-0193
title: DeploymentConfigs — start/pause rollout, count, ReplicationControllers tab with Rollback, deprecation alert
status: todo
owner: frontend-engineer
checkpoint: 4b
depends_on: [T-0192]
paths: [web/src/features/resources/registry/kinds/deploymentconfigs.tsx, web/src/features/resources/workloads/deploymentconfigs, web/src/features/resources/workloads/replicationcontrollers, web/src/features/resources/registry/types.ts, web/src/features/resources/list/ResourceListPage.tsx, web/src/mocks/k8s/subresources.ts]
review_rounds: 0
---

## Goal
WL-6: DeploymentConfigs (OpenShift clusters only) with OCP's actions, details, ReplicationControllers tab and RC
rollback, plus OCP's deprecation alert on the list page.

## Contract / design notes
- Descriptor: columns as Deployments (Name, Namespace, Status `<ready> of <desired> pods`, Labels, Pod selector);
  `podsSelector` = `spec.selector`; summary `WorkloadPodRing` (scalable, HPA-aware via T-0190); `DetailsSection`
  "DeploymentConfig details" (OCP `deployment-config.tsx` L72: Latest version, Message, Update strategy, Timeout,
  Update period, Interval, Max unavailable, Max surge, Min ready seconds, Triggers); `DeploymentPausedAlert` reused
  when `spec.paused`. Tabs: Details, YAML, ReplicationControllers, Pods, Events (`extraTabs:
  ['replicationcontrollers']`).
- Actions (OCP `deploymentconfig-provider.ts` order, kind items first): Edit Pod count (hidden with HPA), **Start
  rollout** (POST `deploymentconfigs/<n>/instantiate` body `{kind:'DeploymentRequest', apiVersion:'apps.openshift.io/v1',
  name, latest:true, force:true}`, OCP `useDeploymentActions.ts` L150-159; success toast "Started rollout of <n>";
  gating `create deploymentconfigs/instantiate`), Pause/Resume rollouts (`useTogglePaused(cluster, model)` from T-0190),
  then common. Add a `k8sCreateSubresource`-style call only if `k8sPatch`/`k8sCreate` can't target a subresource —
  check `shared/k8s/` first and extend minimally (note it in Handover).
- `DeploymentConfigRCsTab` (replaces the T-0189 stub): `useResourceDataView` on RCs with `fixedSelector`
  `{ 'openshift.io/deployment-config.name': dc.name }` and `rowFilter` owner uid (exemplar
  `DeploymentReplicaSetsTab`); columns Name, Status, Phase, Revision (`openshift.io/deployment-config.latest-version`),
  Created; default sort Revision desc.
- RC kind items (extends T-0192 `useReplicationControllerActions`): **Rollback** (OCP
  `useReplicationControllerActions.ts` L73) for DC-owned RCs that are not the latest version; gating `update
  deploymentconfigs` on the owner; modal reuses `RollbackModal` copy. Mutation (OCP `rollback-modal.tsx` L57-90): POST
  `deploymentconfigs/<dc>/rollback` with `DeploymentConfigRollback` `{kind, apiVersion, name, spec:{from:{name: rc},
  revision, includeTemplate:true, includeReplicationMeta:false, includeStrategy:false, includeTriggers:false}}`, then
  PUT the returned DC. **Cancel rollout**: out (no spec item) — note for PO.
- Deprecation alert: new optional descriptor field `ListAlert?: ComponentType<{ cluster: string }>` rendered by
  `ResourceListPage` above the toolbar; DC's is a PF inline `info` Alert with OCP copy (`deployment-config.tsx` L141;
  shown regardless of cluster version, as in OCP). List page only, as in OCP.
- Mocks: `subresources.ts` handles POST `instantiate` (bumps `status.latestVersion`, adds RC `frontend-<n>`) and POST
  `rollback` (returns the DC with the RC's template).

## Context pack
- Exemplars: `workloads/replicasets/DeploymentReplicaSetsTab.tsx`, `RollbackModal.tsx`, `useRollbackDeployment.ts`;
  `workloads/deployments/DeploymentPausedAlert.tsx`; `mocks/k8s/subresources.ts:SUBRESOURCES`.
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/deployment-config.tsx` (L72, L141,
  L226-248, L280); `public/components/modals/rollback-modal.tsx` L57-90;
  `packages/console-app/src/actions/hooks/useDeploymentActions.ts` L150-159;
  `packages/console-app/src/actions/hooks/useReplicationControllerActions.ts` L73;
  `packages/console-app/src/actions/providers/deploymentconfig-provider.ts`.

## Acceptance criteria
- [ ] WL-1/6: DC list on an OpenShift mock cluster shows the deprecation alert; absent from nav on `lab-1` (covered by T-0189).
- [ ] WL-6: "Start rollout" sends POST `…/frontend/instantiate` and toasts; Pause/Resume patch `spec.paused` (tests).
- [ ] WL-6: ReplicationControllers tab lists `frontend-1/2` newest first; Rollback on `frontend-1` → POST `rollback` then PUT; hidden on latest (tests).
- [ ] ACT-4: RO → Start rollout, Pause, Rollback aria-disabled with reason.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
