---
id: T-0193
title: DeploymentConfigs — start/pause rollout, count, ReplicationControllers tab with Rollback, deprecation alert
status: done
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
- [x] WL-1/6: DC list on an OpenShift mock cluster shows the deprecation alert; absent from nav on `lab-1` (covered by T-0189).
- [x] WL-6: "Start rollout" sends POST `…/frontend/instantiate` and toasts; Pause/Resume patch `spec.paused` (tests).
- [x] WL-6: ReplicationControllers tab lists `frontend-1/2` newest first; Rollback on `frontend-1` → POST `rollback` then PUT; hidden on latest (tests).
- [x] ACT-4: RO → Start rollout, Pause, Rollback aria-disabled with reason.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23 frontend-engineer: in_progress. DC descriptor/details/actions, RCs tab, RC Rollback + DC rollback modal,
  `ListAlert` descriptor field, mock `instantiate`/`rollback`, `k8sCreateSubresource`. 10 new tests in
  `deploymentConfigs.test.tsx`; full `check-fe.sh` green (105 files / 1107 tests). UI probe not run (see Handover). in_review.
- 2026-11-23 frontend-engineer, round-1 fixes: `ListAlert` -> `HeadingAlert` (list + details headings); DC "Retry rollout"
  (OCP patch on latest RC, disabled with OCP tooltip unless it failed) + 2 tests. in_review.

## Review
- 2026-11-23 frontend-architect, round 1: **APPROVE**. `check-fe.sh` green (105 files / 1107 tests, lint/typecheck/build ok).
- Matches OCP: `instantiate` body + `create deploymentconfigs/instantiate` gate (`useDeploymentActions.ts` L42-56, L150-159);
  rollback = POST `rollback` then PUT the answer, gated `update deploymentconfigs` on the owner, visibility (phase set,
  `status.replicas` 0, DC owner) and New/Pending/Running disable as `replication-controllers-provider.ts` L36-45. OCP
  sends `from: {}` + stray `latest/force`; our `from.name` is ignored by the v1 endpoint (revision wins) — fine.
- Accepted outside paths: `shared/k8s/client.ts:k8sCreateSubresource` (minimal, `k8sCreate` targets collections only);
  `mocks/k8s/apiServer.ts:475` POST-on-named-subresource = `create` (handlers still 405 unsupported verbs).
- Accepted deviations: RC-branch Rollback copy + 3 checkboxes is OCP's actual `rollback-modal.tsx` RC branch (correct,
  the contract's "RS copy" hint was wrong); `DeploymentConfigPausedAlert` duplication → follow-up `WorkloadPausedAlert`.
- Follow-up (design gap in this contract, not the engineer's): OCP also shows the deprecation alert on the DC *details*
  page header (`deployment-config.tsx` L280 `helpAlert`) — generalise `ListAlert` into a heading alert used by
  `ResourceDetailsPage` too. RC "Cancel rollout" / DC "Retry rollout": follow-up task (no spec AC; PO to schedule).
- Merge note: `registry/types.ts` `ListAlert` hunk is appended after `deleteRequiresName`; T-0194's `detailsTitle`/
  `PodsTab` sit earlier, so it applies cleanly — keep both.
- Nit (optional): `deploymentConfigDetails.tsx:68` strips `spec.selector` to feed `WorkloadPodRing`; a ring
  `selector` override already exists, so the `{...obj, spec}` copy only needs the comment it has.
- 2026-11-23 ux-designer round 1: **CHANGES_REQUESTED** (mock :5197 probe + clipped shots, 1280 light; OCP ref down, judged from source)
  - DC details — deprecation alert missing (all tabs) — OCP `public/components/deployment-config.tsx` L280 `helpAlert` on `DetailsPage` — render `DeploymentConfigDeprecationAlert` in the details `PageHeading` `alert` slot (e.g. descriptor `DetailsAlert`, or reuse `ListAlert` there).
  - DC Actions — "Retry rollout" missing between Start rollout and Pause rollouts — OCP `actions/providers/deploymentconfig-provider.ts` + `actions/hooks/useRetryRolloutAction.ts` L12-94 — always listed; aria-disabled with tooltip "This action is only enabled when the latest revision of the ReplicationController resource is in a failed state." unless latest RC (`<dc>-<status.latestVersion>`) phase is Failed, DC not paused and latestVersion ≠ 0; gated `patch deploymentconfigs`; JSON-patches the RC (`deployment.phase`=New, remove `deployment.cancelled` / `deployment.status-reason`); error → toast.
  - OK (no action): list alert copy/variant/link (`deployment-config.tsx` L141-167; inline link + `pf-v6-u-mt-md` as OCP `ExternalLink`); details sections/terms (L72-138, L170-205); paused alert copy, 16px under h2, 24px above ring (`utils/workload-pause.tsx`); Rollback modal small, one close, Form, copy + 3 unchecked checkboxes (`modals/rollback-modal.tsx`); RC menu order and Rollback visibility (`replication-controllers-provider.ts`); Start rollout toast.
  - Deferred, not blocking: RC "Cancel rollout" (only for New/Pending/Running RCs, OCP `useReplicationControllerActions.ts` L44-95) → follow-up task. RCs tab Revision column/sort instead of OCP's plain RC list (Owner, `deployment-config.tsx` L226) is accepted as the `DeploymentReplicaSetsTab` precedent.
- 2026-11-23 frontend-architect, round 2 (delta only): **APPROVE**. `HeadingAlert` rename is complete (list + details,
  `ResourceHeader` `alert` → `PageHeading`, no stale `ListAlert`). `useRetryRollout.ts`: one namespace RC list keyed by
  `DC_NAME_LABEL` (shared with the RCs tab, disabled when paused / latestVersion 0), name `<dc>-<latestVersion>`, OCP's
  JSON patch, toast on error; menu order and `patch deploymentconfigs` gate match OCP's provider. Gate not re-run (engineer's 1109 green).
  Nit (optional): `useDeploymentConfigActions.tsx:32` TSDoc line exceeds the wrap width.
- 2026-11-23 ux-designer round 2: **APPROVE** (mock :5196 probe + clipped shot, 1280 light; OCP ref down, judged from source)
  - Fixed: DC details deprecation alert — in the `PageHeading` alert slot below the h1 (22px), above tabs (16px), on every tab, same slot/copy as the list — matches OCP `deployment-config.tsx` L280 `helpAlert` → `console-shared/.../heading/PageHeading.tsx` L88 (child of PageHeader).
  - Fixed: "Retry rollout" between Start rollout and Pause rollouts (OCP `deploymentconfig-provider.ts` L45-47), aria-disabled with OCP's exact tooltip, patch = OCP `useRetryRolloutAction.ts` L12-36, gated `patch deploymentconfigs`. Error toast instead of OCP's ErrorModal and a success toast are the project's modal-less action convention (accepted round 1).

## Handover notes
- Outside `paths` (both minimal, allowed by the contract): `shared/k8s/client.ts` + `index.ts` gain
  `k8sCreateSubresource` (POST to a named object's subresource; `k8sCreate` can't target one); mock `apiServer.ts` maps
  POST on a named subresource to verb `create` (it answered 405 before).
- `DeploymentConfigPausedAlert` duplicates `DeploymentPausedAlert` (typed to Deployment; `workloads/deployments` not in
  paths). Follow-up: generalise into one `WorkloadPausedAlert(model, workload)`.
- Rollback modal follows OCP's RC branch (copy "Use the following settings from <rc> when rolling back:" + 3 checkboxes,
  all unchecked = contract's `false` flags), not the RS "Are you sure…" copy. Rollback visibility follows OCP's provider
  (phase set, `status.replicas` 0, DC owner; disabled without tooltip while New/Pending/Running), gated `update deploymentconfigs`.
- `HeadingAlert` (types.ts, one optional field at the end) renders in `PageHeading`'s `alert` slot on list and details
  (`details/ResourceHeader.tsx` `alert` prop + `ResourceDetailsPage.tsx`, small edits outside paths, per review).
- Retry rollout (`useRetryRollout.ts`): latest RC = `<dc>-<latestVersion>` from one shared namespace RC list (no per-row GET).
- Deviations for PO: OCP hides "Learn more" on managed clusters; RC "Cancel rollout" not implemented (follow-up).
- UI probe not run: :5199 was served from another worktree (`agent-a5da301ca563f791e`) and the OCP ref (:9000) was down;
  reviewer should probe `/c/dev-1/k8s/ns/shop/deploymentconfigs` (alert) and the DC details page.
