---
id: T-0171
title: Switcher item labels wrap under the name instead of squeezing it
status: done
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
- [x] FND-2: test renders `prod-k8s-1` (long display name, K8s + production + Read only) and asserts the label group wraps under the name.
- [x] Probe/clipped screenshot at 1280: ≥ 12 visible characters of the name (ux-designer).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23 frontend-engineer: ClusterBadges now a wrapping Flex; name item flex_1 + 12ch min width (CSS module, PF has no valued min-width), labels in one nested nowrap Flex item. FND-2 structure test added. Gate green (892 tests).

## Review
- Round 1 (frontend-architect, 2026-11-23): **APPROVE**. Gate green (lint, typecheck, 892 tests, build).
- CSS module justified: PF `Flex`/`FlexItem` have no flex-basis/min-width prop; the only PF route is overriding `--pf-v6-u-min-width--MinWidth` via inline `style` (needs a TS cast for the custom property), which is worse than one commented, colocated rule (FRONTEND.md §UI).
- Toggle unchanged: `ClusterLabels placement="toggle"` (ClusterSwitcher.tsx:123) is outside the diff; only `ClusterBadges` (menu) changed, so T-0147 one-line toggle holds.
- Test asserts the contracted structure (wrap modifier on row, `flex-1` name item, labels in a separate nested Flex) for `prod-k8s-1` with all three labels.
- Nit (optional): ClusterSwitcher.module.css:3 — "`pf-v6-u-min-width` is 0 only" is imprecise; it defaults to 0 and is overridable via `--pf-v6-u-min-width--MinWidth`. Reword to "0 unless its CSS variable is set inline".
- Open AC: probe/clipped screenshot at 1280 stays with ux-designer.
- 2026-11-23 ux-designer round 1: **APPROVE**. Playwright, alice, `/c/prod-k8s-1/`, 1280x900, light, menu open (256 px, popper = trigger width).
  - prod-k8s-1 "Production Kubernetes Frankfurt 1": name item 164 px, truncates to 22 visible chars ("Production Kubernetes …") ≥ 12; labels K8s/prod/Read only wrap as one group 27 px below the name. AC met.
  - All items (prod-eu-1, staging-eu-1, lab-1) render name line, label line, cluster-name line; no name below 12 chars, no label split across lines.
  - OCP `console-app/src/components/nav/NavHeader.tsx` `PerspectiveDropdownItem` L23-43: SelectOption, icon + `Title h2 md` name; our name line keeps that, labels/second line are the fleet invention (UX.md). No colour change, dark not re-checked.
  - Note (no change): short names (Lab 1) also wrap labels because the 12ch min width exceeds the name; gives a uniform row layout, acceptable.

- Orchestrator: applied the CSS comment nit; both reviews APPROVE.

## Handover notes
- `ClusterSwitcher.module.css` `.name { min-width: 12ch }` replaces `pf-v6-u-min-width` on the menu name item; with flex basis 0 the label group wraps only when the name would drop below 12ch. Toggle untouched.
- Label group wraps as a whole (nested `Flex` nowrap), row gap `rowGapXs`.
- Probe AC not ticked: `ui-probe.mjs` never clicks, so it cannot open the menu; ux-designer to verify at 1280 with a clipped screenshot of the open menu (alice, `/c/prod-k8s-1/...`, readOnly grant).
