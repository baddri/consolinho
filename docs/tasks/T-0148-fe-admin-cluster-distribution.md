---
id: T-0148
title: Distribution field, Type column and Distribution detail in admin cluster pages
status: todo
owner: frontend-engineer
checkpoint: 3.7
depends_on: [T-0144, T-0146]
paths: [web/src/features/admin/clusters]
review_rounds: 0
---

## Goal
DIST-2/3: admins declare and see a cluster's distribution — a required radio in Register/Edit, a "Type" column in the
Clusters list, "Distribution" on the cluster details tab.

## Scope
- In: cluster form schema + Identity section, list column, details item, their tests.
- Out: connection-test mismatch warning — it arrives as a server step result and the existing `TestStepList`
  renders it (no FE change; verify only).

## Contract / design notes
- `form/clusterForm.schema.ts`: `distribution: z.enum(CLUSTER_DISTRIBUTIONS)` with `CLUSTER_DISTRIBUTIONS = ['openShift', 'kubernetes'] as const`
  (order = radio order); create default `'openShift'` (DIST-2: preselected, unlike environment); edit defaults from
  `cluster.distribution`; request mapping sends it on create and update. It is **not** a connection setting: keep
  it out of whatever drives the "stored test results become stale" info (`ConnectionSection` `isEdit` note).
- `form/ClusterFormSections.tsx:IdentitySection`: `RadioGroupField name="distribution" label="Distribution" isRequired isInline`
  after Environment, options "OpenShift" / "Kubernetes" (`clusterTypeText(d).word`), helper text
  "Changes how the console presents the cluster. Available pages come from the cluster's APIs." (spec §5).
- `clusterColumns.tsx:CLUSTER_COLUMNS`: `{ id: 'type', title: 'Type', cell: c => <ClusterTypeLabel distribution={c.distribution} /> }`
  after Display name (UX.md §5 column rules; sortable only if the neighbours are).
- `ClusterDetailsTab.tsx`: `<DetailsItem label="Distribution">{clusterTypeText(d).word}</DetailsItem>` after Environment.
- Admin screens may name the distribution (DIST-6).

## Context pack
- Docs: `FRONTEND.md` § Forms (ADR-0015), § Admin list pages; `UX.md` §5 (lists), §8 (forms).
- Exemplars: `form/ClusterFormSections.tsx` Environment radio L70-77 + `ENVIRONMENT_CHOICES` L25-39;
  `form/clusterForm.schema.ts` environment L78, defaults L119, edit L134, request L153;
  `clusterColumns.tsx` `environment` column L37-42; `ClusterDetailsTab.tsx` L49-56.
- Touch points: `shared/ui` `ClusterTypeLabel`, `clusterTypeText` (T-0146); tests `form/ClusterForm.test.tsx`,
  `ClustersListPage.test.tsx`, `ClusterDetailPage.test.tsx`; server field errors via `applyServerErrors` (already generic).
- OCP reference: inline radio `/home/bad/works/openshift-console/frontend/packages/console-shared/src/components/formik-fields/RadioGroupField.tsx:RadioGroupField`
  (`isInline`); list column = plain `Label` cell as in our `environment` column.

## Acceptance criteria
- [ ] Register: Distribution required, "OpenShift" preselected, sent on create; Edit shows and changes it, sent on update;
      a server 400 on `distribution` shows on the field (DIST-2).
- [ ] Changing only the distribution in Edit shows no "test results become stale" note.
- [ ] Clusters list "Type" column shows `OCP`/`K8s`; details tab shows "Distribution: OpenShift|Kubernetes" (DIST-3).
- [ ] Build, lint and tests green (CLAUDE.md rule 4).
- [ ] Probe pages (ux review): `/fleet/admin/clusters/new` (radio row), `/fleet/admin/clusters` (Type column),
      `/fleet/admin/clusters/lab-1` vs OCP `/k8s/cluster/nodes` table header for column spacing.

## Work log

## Review

## Handover notes
