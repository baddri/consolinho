---
id: T-0147
title: Switcher shows display name, cluster type icon and OCP/K8s tag
status: todo
owner: frontend-engineer
checkpoint: 3.7
depends_on: [T-0145, T-0146]
paths: [web/src/features/cluster-context, web/e2e/switcher.e2e.ts]
review_rounds: 0
---

## Goal
SW-1..7: the switcher names clusters the way admins named them (display name first, cluster name as description /
tooltip) and shows what kind of cluster it is (type icon + `OCP`/`K8s` tag), with a one-line toggle (SW-2, decided).

## Scope
- In: `ClusterSwitcher.tsx` item, toggle, labels, accessible name, search; tests; e2e text updates.
- Out: theme (T-0149), fleet entry (done in T-0145 — keep it).

## Contract / design notes
- Labels (`ClusterLabels`, L34-47) take a `placement: 'menu' | 'toggle'`: order `ClusterTypeLabel`, `EnvironmentLabel`,
  and `Read only` **only** for `menu` (SW-4, SW-5). Pieces from `shared/ui` (T-0146).
- Menu item (`ClusterItem`): `icon={<ClusterTypeIcon distribution />}`, main text `Truncate content={displayName}` +
  labels in the existing `ClusterBadges` flex, `description={name}` only when `displayName !== name` (SW-1). Keep PF
  `MenuItem` + `description` (spec §5: no custom two-line layout). `itemId` stays `name`.
- Toggle: `icon={<ClusterTypeIcon distribution />}` replaces `ClusterIcon` (SW-3); `ToggleContent` renders
  `displayName` in the existing truncating `Title h2 md` + toggle labels. Tooltip with the cluster name when it
  differs: PF `Tooltip content={name} triggerRef={toggleRef}` (no wrapper element, the toggle keeps its ref).
- `toggleLabel(cluster)`: `Cluster <displayName> (<name if different>, <tag>, <env text>[, read only]), switch cluster`
  — e.g. "Cluster Prod EU West (prod-eu-1, OCP, prod, read only), switch cluster" (SW-4).
- `matchesSearch` adds `clusterTypeText(d).tag` and `.word` (SW-6).
- Empty-state toggle ("No clusters") keeps `ClusterIcon`. Update the component TSDoc (L120-134).

## Context pack
- Docs: `UX.md` §2 (L44-47) and §2a icons/tag/order (L82-85); spec §5 "Switcher menu", "Toggle".
- Exemplars: `web/src/features/cluster-context/ClusterSwitcher.tsx` `ClusterLabels` L34-47, `ClusterBadges` L50-59,
  `ToggleContent` L66-82, `toggleLabel` L88-92, `matchesSearch` L98-106, `ClusterItem` L109-118, toggle L271-282.
- Touch points: `shared/ui` `ClusterTypeLabel`, `ClusterTypeIcon`, `clusterTypeText` (T-0146);
  `features/cluster-context/clusterContext.test.tsx` (switcher assertions by name/label); `web/e2e/switcher.e2e.ts`.
  Fixture display names: `web/src/mocks/fixtures/clusters.ts:clusterFixtures`.
- OCP reference: `/home/bad/works/openshift-console/frontend/packages/console-app/src/components/nav/NavHeader.tsx`
  `PerspectiveDropdownItem` L23-43 (item = icon + `Title h2 md`), toggle L98-115.

## Acceptance criteria
- [ ] Item: display name main text, name as description only when different (SW-1); type icon; labels type, env, Read only (SW-3, SW-5).
- [ ] Toggle: one line, display name truncates without pushing tags out; type icon in `icon` slot; type + env tags, no Read only;
      tooltip = name when different; accessible name as above (SW-2..5).
- [ ] Search matches `ocp`, `k8s`, `openshift`, `kubernetes` (SW-6); Recent/All, keyboard and focus unchanged (SW-7).
- [ ] Icons `aria-hidden`; OpenShift and Kubernetes icons differ in shape (UX.md §2a). Build, lint and tests green (CLAUDE.md rule 4).
- [ ] Probe pages (ux review): `node scripts/ui-probe.mjs /c/prod-eu-1/k8s/ns/default/pods /k8s/ns/default/pods --pair '.pf-v6-c-nav .pf-v6-c-menu-toggle=[data-test-id="perspective-switcher-toggle"]'`
      (toggle height/padding/title font must match), plus `/c/lab-1/...` for the K8s tag; long-name truncation clipped screenshot.

## Work log

## Review

## Handover notes
