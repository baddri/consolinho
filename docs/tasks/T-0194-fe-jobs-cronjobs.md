---
id: T-0194
title: Jobs and CronJobs — details, Edit parallelism, Jobs tab, Start Job, Suspend/Resume
status: todo
owner: frontend-engineer
checkpoint: 4b
depends_on: [T-0189, T-0190]
paths: [web/src/features/resources/registry/kinds/jobs.tsx, web/src/features/resources/registry/kinds/cronjobs.tsx, web/src/features/resources/workloads/jobs, web/src/features/resources/workloads/cronjobs]
review_rounds: 0
---

## Goal
JOB-1 and CJ-1..3: Job and CronJob pages with OCP's details and actions, the CronJob Jobs tab, "Start Job" and the
fleet-only Suspend/Resume.

## Contract / design notes
- **Job** descriptor (OCP `job.tsx`): columns Name, Namespace, Labels, Completions (`<succeeded> of <completions>`,
  OCP `Completions` L61), Type (Non-parallel / Fixed completion count / Work queue — OCP `getJobTypeAndCompletions`),
  Created; status Complete/Failed/Running from conditions. `podsSelector` = `spec.selector.matchLabels`
  (`controller-uid`/`batch.kubernetes.io/controller-uid`). `DetailsSection` "Job details" (OCP `JobDetails` L118):
  Desired completions, Parallelism, Active deadline seconds, Status, Start time, Completion time, Succeeded / Active /
  Failed pods. Tabs: Details, YAML, Pods, Events (spec JOB-1; OCP puts Pods before YAML, but our `RESOURCE_TABS`
  order is shared by every kind). Actions: [Edit parallelism] (T-0190
  `useEditCountAction(args, { field: 'parallelism' })`, OCP `useJobActions.ts` L43) then common.
- **CronJob** descriptor (OCP `cron-job.tsx`): columns Name, Namespace, Schedule, Suspend, Concurrency policy,
  Starting deadline seconds, Last schedule time, Created; status "Suspended" (`spec.suspend`) else none (CJ-3).
  `DetailsSection` "CronJob details" (OCP `CronJobDetails` L129). Pods tab: pods of the CronJob's Jobs — `podsSelector`
  can't express that, so use the existing Pods tab with a `rowFilter` that keeps pods whose `job-name` label is one of
  the CronJob's owned Jobs (OCP L205 does the same join); if `ResourcePodsTab` can't take a rowFilter, a
  `CronJobPodsTab` in `workloads/cronjobs/` (do not edit `ResourcePodsTab`). Tabs: Details, YAML, Pods, Jobs, Events
  (`extraTabs: ['jobs']`).
- `CronJobJobsTab` (replaces the T-0189 stub): `useResourceDataView` on jobs with `rowFilter` owner uid = CronJob uid;
  columns Name, Status, Completions, Created; default Created desc (exemplar `DeploymentReplicaSetsTab`).
- **Start Job** (CJ-2, OCP `useCronJobActions.ts` L28-92): `k8sCreate(JobModel)` with name
  `${cj.name}-${Math.floor(Date.now()/1000)}` truncated to 63 chars, annotations = CronJob annotations +
  `cronjob.kubernetes.io/instantiate: manual`, labels from `jobTemplate.metadata.labels`, spec =
  `jobTemplate.spec`, `ownerReferences: [{ apiVersion, kind, name, uid, controller: true, blockOwnerDeletion: true }]`.
  Success → navigate to the new Job's details (no toast, OCP); failure → `toast.warning('Failed to start a Job.',
  message)`. Gating `create jobs` in the namespace.
- **Suspend / Resume** (CJ-3, fleet): JSON patch `replace /spec/suspend` true/false via `useResourceMutation`; label
  "Suspend"/"Resume" from current state; gating `patch cronjobs`; toast "Suspended <n>" / "Resumed <n>".
- Kind items order: CronJob [Start Job, Suspend|Resume] then common.

## Context pack
- Exemplars: `workloads/replicasets/DeploymentReplicaSetsTab.tsx` (`rowFilter` tab), `details/ResourcePodsTab.tsx`,
  `workloads/deployments/useDeploymentRollout.ts:useTogglePaused` (toggle pattern), `shared/ui/useToast.ts`.
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/job.tsx` (L61, L118);
  `public/components/cron-job.tsx` (L129, L205, L270, tabs L407-411);
  `packages/console-app/src/actions/hooks/useJobActions.ts` L43; `useCronJobActions.ts` L28, L82, L92;
  `packages/console-app/src/actions/providers/job-provider.ts`, `cronjob-provider.ts`.

## Acceptance criteria
- [ ] JOB-1: `migrate-db` details show Completions, Parallelism, Active deadline, Succeeded/Failed/Active; "Edit parallelism" sends `replace /spec/parallelism` (tests).
- [ ] CJ-1: CronJob tabs in OCP order; details show Schedule, Concurrency policy, Starting deadline, Last schedule time, Suspend; Jobs tab lists the 2 owned Jobs; Pods tab lists their pods (tests).
- [ ] CJ-2: Start Job POSTs a Job with the name pattern, `instantiate: manual` annotation and controller ownerRef, then lands on its details; a 403/500 shows the warning toast "Failed to start a Job." (tests).
- [ ] CJ-3: Suspend/Resume toggle `spec.suspend`; list shows "Suspended" (test).
- [ ] ACT-4: RO → all kind items aria-disabled with reason.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
