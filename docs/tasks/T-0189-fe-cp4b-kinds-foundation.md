---
id: T-0189
title: CP4b foundation — models, mock fixtures, nav order, new tab slots, minimal descriptors
status: done
owner: frontend-engineer
checkpoint: 4b
depends_on: []
paths: [web/src/shared/k8s/models.ts, web/src/shared/k8s/types.ts, web/src/shared/k8s/index.ts, web/src/mocks/k8s, web/src/features/resources/registry/registry.ts, web/src/features/resources/registry/types.ts, web/src/features/resources/registry/kinds, web/src/features/resources/paths.ts, web/src/features/resources/routes.tsx, web/src/features/resources/details/useResourceTab.ts, web/src/features/resources/workloads/cronjobs/CronJobJobsTab.tsx, web/src/features/resources/workloads/deploymentconfigs/DeploymentConfigRCsTab.tsx]
review_rounds: 0
---

## Goal
Plumbing every CP4b kind task needs, done once so that later tasks own disjoint files: the eight new models, the
mock API server data for them, WL-1's nav order, the two new details tab slots, and a **minimal** descriptor per new
kind (model + nav + Name/Namespace/Created columns). The kind tasks (T-0191…T-0196) then fill in their own
`kinds/<plural>.tsx` without touching `registry.ts`, `models.ts` or the mocks' seed.

## Scope
- In: models + types, `K8S_MODELS`, registry lines, nav order (WL-1), `KindTab`/`DetailsTab`/`RESOURCE_TABS`/routes
  for `jobs` and `replicationcontrollers` (stub tab modules), mock fixtures + discovery + `scale` for the new kinds.
- Out: kind-specific columns, details, actions (later tasks); DC `instantiate`/`rollback` mock (T-0193); Search.

## Contract / design notes
- **Models** (`shared/k8s/models.ts`, same shape as `ReplicaSetModel`; `abbr` = OCP's badge): StatefulSet (`apps/v1`,
  `statefulsets`, SS), DaemonSet (`apps/v1`, `daemonsets`, DS), ReplicationController (`v1`, `replicationcontrollers`,
  RC), DeploymentConfig (`apps.openshift.io/v1`, `deploymentconfigs`, DC), Job (`batch/v1`, `jobs`, J), CronJob
  (`batch/v1`, `cronjobs`, CJ), HorizontalPodAutoscaler (`autoscaling/v2`, `horizontalpodautoscalers`, HPA), Secret
  (`v1`, `secrets`, S). Add all to `K8S_MODELS`. OCP labels: `public/models/index.ts` (grep the model names).
- **Types** (`shared/k8s/types.ts`): re-export `StatefulSet`, `DaemonSet` (apps/v1), `ReplicationController`, `Secret`
  (core/v1), `Job`, `CronJob` (batch/v1), `HorizontalPodAutoscaler` (autoscaling/v2) from `kubernetes-types`; hand-write
  a minimal `DeploymentConfig` interface (spec: replicas, selector `Record<string,string>`, template `PodTemplateSpec`,
  strategy {type, rollingParams?, recreateParams?}, triggers?, paused?, minReadySeconds?; status: latestVersion,
  replicas, readyReplicas, availableReplicas, updatedReplicas, conditions, details?.message) with a TSDoc pointing at
  OCP's `DeploymentConfigKind`.
- **Nav order (WL-1, OCP `packages/console-app/console-extensions.json` Workloads section):** Pods 10, Deployments 20,
  DeploymentConfigs 30, StatefulSets 40, Secrets 50, ConfigMaps 60, CronJobs 70, Jobs 80, DaemonSets 90,
  ReplicaSets 100, ReplicationControllers 110, HorizontalPodAutoscalers 120 (edit the `order` of the existing
  ConfigMaps/ReplicaSets descriptors only). Discovery already hides unserved groups (`useClusterNav`) — DCs vanish on
  vanilla clusters with no new code.
- **Minimal descriptors** `registry/kinds/{statefulsets,daemonsets,replicationcontrollers,deploymentconfigs,jobs,cronjobs,horizontalpodautoscalers,secrets}.tsx`:
  `model`, `nav`, columns `nameColumn`, `namespaceColumn`, `ageColumn` (kind-specific flags such as Secret's
  `hasEventsTab: false` belong to the kind task, here T-0196). Each exports `<Kind>Resource` type and the descriptor;
  register them in `registry.ts` in the order above. TSDoc says "filled in by T-01xx".
- **Tabs:** `KindTab` += `'jobs' | 'replicationcontrollers'`; `DetailsTab` += same; `RESOURCE_TABS` becomes
  `details, yaml, replicasets, replicationcontrollers, pods, jobs, logs, events, terminal` (OCP DC: Details·YAML·
  ReplicationControllers·Pods·Events; CronJob: Details·YAML·Pods·Jobs·Events). `routes.tsx` `detailsTabs` gets lazy
  stubs `workloads/cronjobs/CronJobJobsTab.tsx` and `workloads/deploymentconfigs/DeploymentConfigRCsTab.tsx` (render
  `null`, TSDoc "stub, filled in by T-0194 / T-0193" — T-0175 precedent).
- **Mocks** (new file `mocks/k8s/workloadFixtures.ts`, called from `seedClusterObjects`; keep `fixtures.ts` growth to
  the call): in namespace `shop` — StatefulSet `db` (3/3, pods `db-0..2` owned by it), DaemonSet `node-agent` (2
  desired/2 current, pods owned), standalone ReplicaSet `legacy-rs` (no owner, 1 replica), standalone RC `legacy-rc`,
  DeploymentConfig `frontend` (replicas 2, `latestVersion` 2) with RCs `frontend-1` (0 replicas, annotations
  `openshift.io/deployment-config.name`, `openshift.io/deployment-config.latest-version: "1"`,
  `openshift.io/deployment.phase: Complete`) and `frontend-2` (2 replicas, owned by the DC, pods) **only on clusters
  that serve OpenShift groups** (`servesProjects`), CronJob `nightly-report` (`0 2 * * *`, 2 owned Jobs
  `nightly-report-29100000`/`-29101440` complete, pods), standalone Job `migrate-db` (completions 1, succeeded 1),
  Deployment `worker` + HPA `worker` (autoscaling/v2, min 2 max 5, CPU 80 % target / 35 % current,
  `scaleTargetRef` → Deployment `worker`) — **never** target `web` (CP4a scale e2e), Secrets `db-credentials` (Opaque,
  keys `username`/`password`, obviously fake) and `registry-pull` (`kubernetes.io/dockerconfigjson`), plus
  `binaryData` on one existing ConfigMap. Discovery in `apiServer.ts` (`servedModels`, L58) also hides
  `apps.openshift.io` on vanilla clusters. `subresources.ts` `SCALABLE` += `/replicationcontrollers` and
  `apps.openshift.io/deploymentconfigs` (Jobs have no scale subresource; parallelism is a plain PATCH).
- **CP4a follow-up "audit fixtures for `prod-k8s-1`"** (§4a.9): while adding the seed, check that `prod-k8s-1`
  (vanilla, RO for alice) gets the same `shop` objects minus DCs/Projects and that no fixture assumes OpenShift
  groups there; fix in place, note findings in the Work log.

## Context pack
- Docs: FRONTEND.md § "The resource registry", § Routing (CP4b rows); ADR-0037 §1-2.
- Exemplars: `shared/k8s/models.ts:ReplicaSetModel` (L76); `registry/kinds/configmaps.tsx` (minimal descriptor);
  T-0175 tab stubs (`git show 159c25d --stat`); `mocks/k8s/fixtures.ts:seedClusterObjects` (L527),
  `podObject` (L158), `servesProjects` (L26).
- Touch points: `registry/registry.ts:resourceDescriptors`; `registry/types.ts:KindTab`; `paths.ts:DetailsTab`;
  `details/useResourceTab.ts:RESOURCE_TABS`; `routes.tsx:detailsTabs`, `detailsRoutes` tab list;
  `mocks/k8s/apiServer.ts:servedModels` (L58); `mocks/k8s/subresources.ts:SCALABLE` (L124);
  `registry/kinds/kinds.test.tsx` (registry uniqueness tests).
- OCP reference: `/home/bad/works/openshift-console/frontend/packages/console-app/console-extensions.json` (nav
  `console.navigation/resource-ns` items of section `workloads`), `public/models/index.ts`.

## Acceptance criteria
- [x] WL-1: on a mock OpenShift cluster the Workloads nav lists the 12 kinds in the order above; on `lab-1`/`prod-k8s-1` DeploymentConfigs is absent (test in `useClusterNav` tests).
- [x] Every new kind's list renders its mock objects at `/k8s/ns/shop/<plural>` and its details page opens (one parameterised test).
- [x] `/k8s/ns/shop/cronjobs/nightly-report/jobs` and `/deploymentconfigs/frontend/replicationcontrollers` resolve for those kinds; the same tabs on a Pod redirect to Details (existing `hasTab` rule).
- [x] Mock `PATCH …/statefulsets/db/scale` and `…/replicationcontrollers/legacy-rc/scale` work (mock test).
- [x] `prod-k8s-1` fixture audit done (Work log lists what changed or "nothing").
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23 frontend-engineer: 8 models/types, minimal descriptors (+ `extraTabs` on DC/CronJob so the stub tabs
  resolve), WL-1 orders, tabs `replicationcontrollers`/`jobs` (also `ResourceDetailsPage.tsx` TAB_TITLES + `hasTab`:
  required by the `Record<ResourceTab>` type and the redirect AC), `workloadFixtures.ts`, scale for RC/DC.
- Mock discovery fix: `/apis` hard-coded `<group>/v1`; now per-model version (`autoscaling/v2`), `apps.openshift.io`
  hidden on vanilla. Paging test in `mocks/k8s.test.ts` scoped to `app=web` (more pods in `shop` now).
- prod-k8s-1 audit: already in `VANILLA_CLUSTERS`; same `shop` objects minus Projects/DCs; nothing else assumed OCP.

## Review
- ux-designer r1: **APPROVE** (dev:mock :5243, DOM probe; OCP `packages/console-app/console-extensions.json` L1110-1300).
- Nav: dev-1 lists Pods…HorizontalPodAutoscalers in exactly OCP's `insertAfter` chain; labels match `%console-app~*%` names.
- Visibility: DeploymentConfigs absent on prod-k8s-1 and lab-1 (OCP flag `OPENSHIFT_DEPLOYMENTCONFIG`); direct URL shows "aren't available" state.
- Lists: 8 titles = labelPlural, columns Name/Created in a project (all-ns view not probed), badges SS/DS/RC/DC/J/CJ/HPA/S, mock rows present.
- Tabs: CronJob Details·YAML·Jobs·Events, DC Details·YAML·ReplicationControllers·Events; Pods tab missing on both is lane-owned (T-0193/T-0194).
- Follow-up (non-blocking, not T-0189 scope): OCP has `console.navigation/separator` `WorkloadsSeparator` after ConfigMaps (L1200); our nav has no divider there — needs a nav-model change, file a task.
- 2026-11-23 frontend-architect, round 1: **APPROVE**. Targeted check-fe (registry, nav, mocks) green (66 tests).
  Deviations accepted: (a) `ResourceDetailsPage.tsx` TAB_TITLES/`hasTab` are forced by `Record<ResourceTab>` + the
  redirect AC; test edits only narrow to `app=web`/`/Deployment$/`. (b) `extraTabs` on DC/CronJob is needed for the AC,
  and T-0193/T-0194 own those files. (c) per-group discovery version is the right fix for `autoscaling/v2`. (d) new file as designed.
  Base for lanes OK: models/types match the contract, registry order = WL-1, tab slots in place, no lane path touched.
- Nit (optional): `kinds/{cronjobs,deploymentconfigs,secrets,…}.tsx` TSDoc first lines run past 120 cols; rewrap when the lane fills them in.

## Handover notes
- Outside `paths` (needed): `details/ResourceDetailsPage.tsx` (TAB_TITLES/`hasTab`), tests adapted to the bigger
  `shop` seed: `mocks/k8s.test.ts`, `list/ResourceListPage.test.tsx`, `events/EventsPage.test.tsx` (`/Deployment$/`,
  DeploymentConfig now also matches), `registry/registry.test.ts` (StatefulSet → ControllerRevision as "unknown").
- New tests: `nav/useClusterNav.test.tsx` (WL-1 order; no DC on lab-1/prod-k8s-1), `kinds.test.tsx` "CP4b kinds".
- Kind tasks: DC and CronJob descriptors already set `extraTabs`; Job pods carry `batch.kubernetes.io/controller-uid`
  and `job-name` labels; DC RCs carry `openshift.io/deployment-config.*` annotations; uids of new objects are
  allocated after the CP2 seed, DC graph last (other uids identical on OpenShift and vanilla).
- `scaleOf` reads both selector shapes (LabelSelector / plain map). Style probe not run: no styled screen changed
  (new lists use the generic page; kind tasks probe their pages).
