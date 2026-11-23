---
id: T-0171
title: Switcher item labels wrap under the name instead of squeezing it
status: todo
owner: frontend-engineer
checkpoint: 4a
depends_on: [T-0170]
paths: [web/src/features/cluster-context/ClusterSwitcher.tsx, web/src/features/cluster-context/ClusterSwitcher.module.css, web/src/features/cluster-context/clusterContext.test.tsx]
review_rounds: 0
---

## Goal
FND-2 (CP3.7 F1): with type tag + environment label + "Read only", a menu item must keep ≥ 12 characters of the
display name at 1280 px; the label group wraps onto its own line under the name.

## Scope
- In: `ClusterBadges` layout (PF `Flex` wrap / `flexWrap={{ default: 'wrap' }}`, name item `flex_1` with a min width),
  test. Toggle unchanged (stays one line, T-0147).
- Out: column alignment of tags (T-0147 review: no OCP counterpart, leave).

## Contract / design notes
- PF layout props only; a CSS module rule only if PF can't express the min width (comment the reason). The test can't
  measure layout in jsdom: assert the structure (labels in a wrapping flex item separate from the `Truncate` item, wrap
  modifier class present) for `prod-k8s-1` with its long display name and all three labels.
- Verify visually with the probe at 1280 (ux-designer AC).

## Context pack
- Exemplars: `ClusterSwitcher.tsx` `ClusterLabels` (~L57-75), `ClusterBadges` (~L79-90), `ClusterItem` (~L150-155).
- Touch points: `clusterContext.test.tsx` switcher item assertions; fixture from T-0170.
- OCP reference: `/home/bad/works/openshift-console/frontend/packages/console-app/src/components/nav/NavHeader.tsx` `PerspectiveDropdownItem` L23-43.

## Acceptance criteria
- [ ] FND-2: test renders `prod-k8s-1` (long display name, K8s + production + Read only) and asserts the label group wraps under the name.
- [ ] Probe/clipped screenshot at 1280: ≥ 12 visible characters of the name (ux-designer).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
