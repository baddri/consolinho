---
id: T-0392
title: Fix stretched sidebar nav items and the Kubernetes navy clashing with the glass theme
status: done
owner: orchestrator
checkpoint: 5.5
depends_on: [T-0371]
paths: [web/src/app/layout/AppShell.module.css, web/src/app/layout/clusterTheme.module.css, docs/architecture/UX.md]
review_rounds: 0
---

## Goal
Human report 2026-11-26 (kind cluster, dark glass): every nav group took ~110px and the hovered group became a
tall pill; the opaque navy masthead/switcher frame clashed with the translucent purple-tinted glass page.

## Fix
- PF's `.pf-v6-c-nav__list` is a grid; T-0371 gave it the Nav's `1fr` row, so its auto rows stretched to share the
  height → `align-content: start` on the list (all items 37px, measured).
- Glass theme: masthead and nav header use `--fc-k8s--glass-bg` — light 85% navy (white text stays > 7:1), dark
  45% navy mixed into PF's glass primary surface (keeps the blur, matches sidebar/cards). Non-glass themes unchanged.

## Acceptance criteria
- [x] Nav items keep content height when the list is shorter than the sidebar (Playwright: 37px each, dark + light).
- [x] Dark glass K8s masthead is a translucent tint; accent edge and K8s tag unchanged.
- [x] `scripts/check-fe.sh` green (1677 tests).

## Work log
- 2026-11-26 orchestrator: fixed directly at the human's request; verified on the local kind cluster `kind-dev`.
