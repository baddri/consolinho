---
id: T-0194
title: Jobs and CronJobs — details, Edit parallelism, Jobs tab, Start Job, Suspend/Resume
status: done
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
- [x] JOB-1: `migrate-db` details show Completions, Parallelism, Active deadline, Succeeded/Failed/Active; "Edit parallelism" sends `replace /spec/parallelism` (tests).
- [x] CJ-1: CronJob tabs in OCP order; details show Schedule, Concurrency policy, Starting deadline, Last schedule time, Suspend; Jobs tab lists the 2 owned Jobs; Pods tab lists their pods (tests).
- [x] CJ-2: Start Job POSTs a Job with the name pattern, `instantiate: manual` annotation and controller ownerRef, then lands on its details; a 403/500 shows the warning toast "Failed to start a Job." (tests).
- [x] CJ-3: Suspend/Resume toggle `spec.suspend`; list shows "Suspended" (test). — toggle tested; "Suspended" shows as the details heading status, list keeps OCP Suspend True/False (see Handover).
- [x] ACT-4: RO → all kind items aria-disabled with reason.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23 frontend-engineer: Job/CronJob descriptors, details, Edit parallelism, Start Job, Suspend/Resume, Jobs tab,
  CronJob Pods tab (owner-uid join via new descriptor `PodsTab`); 16 tests in `workloads/jobs`, `workloads/cronjobs`.
  Full `check-fe.sh` green (1101 tests). UI probe not run: OCP ref (9000) down, 5199 served another worktree.
- 2026-11-23 frontend-engineer round-1 fixes: CronJob list drops Last schedule time/Created; Jobs tab reuses Job columns
  (Created desc); descriptor `detailsTitle` → "Job status"/"Job details"; Job status = first condition or "In progress";
  shared `deadlineText`; `PodsTab` gets `{cluster, obj}` props. Full `check-fe.sh` green (1104 tests).

## Review
- 2026-11-23 frontend-architect, round 1: **APPROVE**. `check-fe.sh` green (104 files, 1101 tests).
- Deviation 1 accepted: descriptor `PodsTab` (`registry/types.ts:129`) + `ResourcePodsTab` hand-off is the right extension point (same shape as `DetailsSection`, no route change); T-0193 merges next to it trivially.
- Deviations 2-3 accepted: Suspend True/False column (OCP parity); owner-uid join is stricter than `job-name`; truncating the CronJob name keeps the unique timestamp suffix.
- Nit (optional): `workloads/jobs/jobDetails.tsx:50` `deadlineText` duplicates `cronjobs/cronJobDetails.tsx:18` `startingDeadlineText` — export one.
- Nit (optional): `cronjobs/CronJobPodsTab.tsx:17` takes `obj` as a prop but reads `cluster` from `useResourceDetails()` — fine, just mixed sourcing.
- Follow-up (not this task): generic Details grid has no right-column heading, so OCP "Job status" (`job.tsx` L140) is missing; needs a descriptor `detailsSectionTitle`-style option in `ResourceDetailsTab`.
- 2026-11-23 ux-designer round 1: **CHANGES_REQUESTED** (mock UI on own port, this worktree; OCP :9000 down → judged against source).
  1. CronJob list — extra "Last schedule time" and "Created" columns — OCP `public/components/cron-job.tsx` L69-77 `tableColumnInfo` has only Name, Namespace, Schedule, Suspend, Concurrency policy, Starting deadline seconds — drop both columns (the contract added them; spec CJ-1 does not ask for them).
  2. CronJob Jobs tab — columns Name, Status, Completions, Created — OCP `CronJobJobsComponent` (cron-job.tsx ~L270) renders the plain `JobsList` (Name, Namespace, Labels, Completions, Type, Created, `job.tsx` L52-58) — reuse `jobDescriptor.columns` unchanged; keep the Created-desc default sort.
  3. Job and CronJob details — right column has no heading — OCP `job.tsx` L121/L134 ("Job details" left, "Job status" right) and `cron-job.tsx` L134/L168 ("CronJob details" left, "Job details" right) — add an optional descriptor title for the `DetailsSection` column rendered as a `SectionHeading` over it (aligned with the left column's first row).
  4. Job details Status row — shows "Running" for an unfinished Job — OCP `job.tsx` L139 shows `conditions[0].type` or "In progress" — use "In progress" for the details row (list/heading status may stay per spec JOB-1).
  OK: Job list columns/Completions link to Pods tab (job.tsx L61); Job/CronJob summary order (Pod selector, Annotations, kind rows, Created at, Owner = `utils/details-page.tsx` L97-157); "Not configured"/"N seconds" copy; tabs Details, YAML, Pods, Jobs, Events (cron-job.tsx L407-411); menus "Edit parallelism | common" and "Start Job | Suspend | common" (job-provider.ts L16, cronjob-provider.ts L16; PDB items out of scope as T-0191); CronJob Pods tab via owned Jobs.
- 2026-11-23 ux-designer round 2: **APPROVE** (port-shifted mock UI, this worktree). 1 CronJob list = Name, Schedule, Suspend, Concurrency policy, Starting deadline seconds (Namespace hidden in ns scope) — fixed. 2 Jobs tab = Name, Labels, Completions, Type, Created, newest first — fixed. 3 "Job status" / "Job details" right-column h2 at 18px/600 like the section headings, top aligned with the left "Name" row (y 339) — fixed. 4 Status = `conditions[0].type` else "In progress" (`jobDetails.tsx` L38) — fixed. No regressions.
- 2026-11-23 frontend-architect, round 2: **APPROVE**. Fixes verified: `detailsTitle` (`registry/types.ts:115`, `ResourceDetailsTab.tsx:25`), `PodsTab({ cluster, obj })`, `jobStatus` = first condition or "In progress", Jobs tab = `jobDescriptor` + Created desc, shared `deadlineText`. Targeted `check-fe.sh src/features/resources` green (351 tests).
- Nit (optional): `details/ResourceDetailsTab.tsx:8` TSDoc line exceeds 120 cols; `registry/types.ts:129` "same component shape as DetailsSection" no longer exact (adds `cluster`).

## Handover notes
- Files: `registry/kinds/{jobs,cronjobs}.tsx`; `workloads/jobs/jobDetails.tsx`; `workloads/cronjobs/{cronJobDetails.tsx,
  CronJobJobsTab.tsx, CronJobPodsTab.tsx, useStartJob.ts, useToggleSuspend.ts, useOwnedJobs.ts}` + tests.
- **Outside `paths` (needed to route the CronJob Pods tab without a selector):** `registry/types.ts` new optional
  `PodsTab` component; `details/ResourceDetailsPage.tsx` `hasTab('pods')` also true for `PodsTab`;
  `details/ResourcePodsTab.tsx` delegates to `descriptor.PodsTab` (selector body moved to `SelectorPodsTab`, unchanged).
- CronJob Pods join is by pod `ownerReferences[].uid` ∈ owned Job uids (stricter than the `job-name` label).
- CJ-3 "Suspended": shown as the details heading status; list keeps OCP's Suspend True/False column (no Status
  column in OCP's CronJob list). Reviewer: add a Status column if the spec wording must be literal.
- Right-column headings via optional descriptor `detailsTitle` ("Job status" on Jobs, "Job details" on CronJobs).
- Start Job name keeps the `-<unix seconds>` suffix and shortens the CronJob name to fit 63 chars; no success toast.
- Start Job gated `create jobs` in the namespace (no name in the review).
