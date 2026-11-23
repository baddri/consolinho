---
id: T-0203
title: Cluster switcher — OpenshiftIcon for OpenShift clusters, drop the "OCP" tag
status: todo
owner: frontend-engineer
checkpoint: 4c
depends_on: []
paths: [web/src/features/cluster-context/ClusterSwitcher.tsx, web/src/features/cluster-context/ClusterSwitcher.module.css, web/src/features/cluster-context/clusterContext.test.tsx, web/src/features/cluster-context/switcherRows.ts, web/src/shared/ui/cluster-type/]
review_rounds: 0
---

## Goal
Human report 2026-11-24 #1: each cluster in the switcher menu shows a generic server icon, the name, then `OCP` and
`prod`. Human directive: OpenShift clusters get PatternFly's `OpenshiftIcon` (ships in `@patternfly/react-icons`, not
a copied asset) and no `OCP` tag; the environment label stays. Kubernetes keeps the generic `CubesIcon` + `K8s` tag
until CP5.5 (PF has no Kubernetes logo icon). The logo exception is already recorded in `UX.md` §2a (switcher only).

## Scope
- In: switcher menu items and the switcher toggle (both use `ClusterTypeIcon` / `ClusterLabels`).
- Out: admin clusters table Type column (`clusterColumns.tsx:39` keeps `OCP`/`K8s`), masthead, any other logo use;
  the no-cluster fallback toggle icon (`ClusterIcon`, `ClusterSwitcher.tsx` ~L432) and Fleet `GlobeIcon` stay.

## Contract / design notes
- `ClusterTypeIcon`: `distribution === 'kubernetes' ? <CubesIcon aria-hidden /> : <OpenshiftIcon aria-hidden />`.
  Add `// TODO(CP5.5): Kubernetes logo icon` at the Kubernetes branch. Update its TSDoc (no longer "never logos").
- `ClusterLabels` (menu and toggle): render `ClusterTypeLabel` only when `distribution === 'kubernetes'`. Order stays
  `[K8s] [environment] [Read only]` (menu) / `[K8s] [environment]` (toggle). For an OpenShift cluster with no
  environment label nothing is rendered after the name (no empty `FlexItem`, so no stray 8px gap).
- Accessible names unchanged (`toggleLabel` may keep the type cue; screen readers lose nothing). Search by type
  (`ocp`, `kubernetes`) unchanged (`switcherRows.ts`).
- Icon size/colour: PF default (`1em`, `currentColor`) inside `MenuItem` `icon` / `MenuToggle` `icon` — no custom CSS.
  On the Kubernetes navy theme the icon still takes `--fc-k8s--icon` via the toggle icon variable (UX.md §2a).

## Context pack
- Docs: `docs/architecture/UX.md` §2a bullets "Icons" and "Type tag" (already updated for this task).
- Touch points: `web/src/shared/ui/cluster-type/ClusterType.tsx:ClusterTypeIcon` (L38-45), `:ClusterTypeLabel`
  (L30-36, unchanged); `web/src/features/cluster-context/ClusterSwitcher.tsx:ClusterLabels` (L56-76),
  `:ClusterItem` icon (L164), toggle `icon` (L424-434); tests `clusterContext.test.tsx`,
  `shared/ui/cluster-type/clusterType.test.tsx` assert the `OCP` tag today.
- Icon: `import { OpenshiftIcon } from '@patternfly/react-icons'` (`dist/esm/icons/index.d.ts:960`).
- OCP reference: `frontend/packages/console-app/src/components/nav/NavHeader.tsx` (perspective switcher: icon + title,
  no extra tag for the default perspective).

## Acceptance criteria
- [ ] Menu item and toggle of an OpenShift cluster: `OpenshiftIcon`, name, environment label only (no `OCP`).
- [ ] Kubernetes cluster: `CubesIcon` + `K8s` + environment, unchanged; TODO(CP5.5) comment present.
- [ ] Admin clusters table Type column still shows `OCP`/`K8s`.
- [ ] Probe/clip (dark, 1280): menu row of `prod-eu-1` and `prod-k8s-1`; icon `aria-hidden`, 8px gap icon→name as before.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
