---
id: T-0148
title: Distribution field, Type column and Distribution detail in admin cluster pages
status: done
owner: frontend-engineer
checkpoint: 3.7
depends_on: [T-0144, T-0146]
paths: [web/src/features/admin/clusters, web/src/shared/forms/RadioGroupField.tsx]
review_rounds: 1
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
- [x] Register: Distribution required, "OpenShift" preselected, sent on create; Edit shows and changes it, sent on update;
      a server 400 on `distribution` shows on the field (DIST-2).
- [x] Changing only the distribution in Edit shows no "test results become stale" note.
- [x] Clusters list "Type" column shows `OCP`/`K8s`; details tab shows "Distribution: OpenShift|Kubernetes" (DIST-3).
- [x] Build, lint and tests green (CLAUDE.md rule 4).
- [x] Probe pages (ux review): `/fleet/admin/clusters/new` (radio row), `/fleet/admin/clusters` (Type column),
      `/fleet/admin/clusters/lab-1` vs OCP `/k8s/cluster/nodes` table header for column spacing.

## Work log
- 2026-11-23 frontend-engineer: in_progress. Added `CLUSTER_DISTRIBUTIONS` + required radio (OpenShift preselected), Type
  column (sortable, after Display name), Distribution details item; tests for create/edit/400/list/details. check-fe green.
  Probe: radio row matches Environment row (gap 16px); OCP ref console was down, so no side-by-side. in_review.
- 2026-11-23 fix round 1: paths widened to `shared/forms/RadioGroupField.tsx` (orchestrator). Inline radios now in one
  row with helper below (PF inline control classes on the focus-ref wrapper); `Last test` low-priority, table fits at
  1280 (894/894) and 1920; architect nits fixed. check-fe green. in_review.

## Review
- 2026-11-23 ux-designer, round 1: **CHANGES_REQUESTED** (ref console up; probe + clipped shots, light, 1280/1920)
  1. Register/Edit `Distribution` — `isInline` radios render **stacked**, and the helper text sits to their **right** in the
     same row. `shared/forms/RadioGroupField.tsx` wraps the radios in `<div ref={focusRef}>`, so the flex items of
     `.pf-v6-c-form__group-control.pf-m-inline` are [wrapper div, helper text] rather than the radios. OCP
     `console-shared/.../formik-fields/RadioGroupField.tsx` puts each radio as a direct child of the inline `FormGroup` and
     `FormHelperText` last, which gives one row of radios with `--pf-t--global--spacer--gap--group--horizontal` between
     them and the helper wrapping below. Fix: in inline mode, lay the radios out in a row (no block wrapper in the inline
     flex, keeping the focus ref) and put the helper on its own line under them. The same bug affects Environment and the
     other inline groups in `ClusterFormSections.tsx` (L112/L132). `shared/forms` is outside `paths`: widen `paths`, or
     fix it in a blocking shared task.
  2. Clusters list @1280 (sidebar open) — the new Type column (118px) makes the table 923px wide inside an 894px
     container, so it scrolls horizontally and "Last test" is clipped under the sticky kebab ("Failed 4 days ag…"). Before
     this change it was about 805px and fit. UX.md §5 says to hide low-priority columns rather than overflow. (OCP Nodes
     also scrolls at 1280, but our rule is stricter.) Fix: keep the table at or under the container width at 1280, e.g. make
     `lastTest` (or `credentials`) `LOW_PRIORITY_COLUMN`. Check `scroll-inner-wrapper` scrollWidth ≤ clientWidth at 1280 and 1920.
  - OK: Type column is after Display name and sortable like its neighbours; compact filled `OCP`/`K8s` Label cell
    matches the Environment cell; header not truncated. Details "Distribution: Kubernetes" (plain text, after Environment)
    matches the `DetailsItem` rhythm (UX.md §6). Copy is sentence case, and "OpenShift" is preselected.
- 2026-11-23 frontend-architect, round 1: **APPROVE**. check-fe green (871 tests). All ACs met; create body already
  asserted at `ClusterForm.test.tsx:90`; Type column sortable like its neighbours.
- Ruling, stale note: the engineer's reading stands. The note is static, names only API URL / CA bundle / Skip TLS, and
  the mock keeps `connectionSettingsChangedAt` on a distribution-only save. No change.
- Ruling, mock duplicates (`mocks/handlers/adminClusters.ts` `DISTRIBUTIONS`, fixtures): outside `paths` and mocks
  shouldn't import feature internals; not blocking. Optional follow-up: share one list from `shared/api` if it recurs.
- Nit (optional): `form/ClusterFormSections.tsx:12-15` import formatting is odd (`type ClusterFormInput, type ClusterFormValues } from`); put one name per line.
- Nit (optional): `ClusterDetailsTab.tsx:41` the doc comment line now runs past 120 columns; rewrap.
- Nit (optional): `ClusterForm.test.tsx:315` `queryByText(...).not.toHaveTextContent` throws if the note is missing; `getByText` says what is meant.
- 2026-11-23 ux-designer, round 2: **APPROVE**
  1. Fixed. The Distribution and Environment radios now sit on one row (equal tops) in `.pf-v6-c-form__group-control.pf-m-inline`,
     with a 16px gap = `--pf-t--global--spacer--gap--group--horizontal` (1rem, the same value on the reference console;
     the OCP inline `FormGroup` uses this PF gap, so 16px, not 8px, is parity). Helper text is below, 4px under the radios, left-aligned.
  2. Fixed. Clusters list at 1280: scrollWidth 894 = clientWidth 894, no horizontal scroll, Last test hidden. At 1920: 1534 = 1534, all columns shown.

## Handover notes
- `CLUSTER_DISTRIBUTIONS` lives in `form/clusterForm.schema.ts`; it was the only hard-coded list inside this task's
  paths. The other copies are in `mocks/handlers/adminClusters.ts` (`DISTRIBUTIONS`) and `mocks/fixtures`. They are
  outside `paths` and left unchanged (possible follow-up).
- The edit-mode stale note is static and names only API URL / CA bundle / Skip TLS. Distribution stays out of it.
  The test checks that `connectionSettingsChangedAt` is unchanged after a distribution-only save.
- The mismatch warning (DIST-7) is already covered by `mocks/clusters.test.ts` and rendered by `TestStepList`; no FE change.
- Inline `RadioGroupField`: the `FormGroup` is no longer `isInline`; its focus-ref wrapper carries
  `pf-v6-c-form__group-control pf-m-inline` (string, since importing react-styles CSS breaks Vitest). Affects every inline group.
- UX review: rerun the probe against OCP `/k8s/cluster/nodes` once `scripts/ocp-ref/run-console.sh` is up.
