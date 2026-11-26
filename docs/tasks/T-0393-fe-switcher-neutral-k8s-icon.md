---
id: T-0393
title: Neutral cluster switcher, Kubernetes logo icon, no K8s tag on the toggle
status: done
owner: orchestrator
checkpoint: 5.5
depends_on: [T-0392]
paths: [web/src/app/layout, web/src/shared/ui/cluster-type, web/src/features/cluster-context, web/package.json, docs/architecture/UX.md]
review_rounds: 0
---

## Goal
Human directive 2026-11-26: the sidebar cluster switcher must not turn blue for Kubernetes clusters (keep the page
background), use the Kubernetes logo instead of `CubesIcon`, and drop the `K8s` tag from the toggle.

## Fix
- `clusterTheme.module.css`: removed the `.navHeader` frame and its toggle overrides; only the masthead stays navy.
- `ClusterTypeIcon`: Kubernetes = `simple-icons` `siKubernetes` (CC0) via PF `createIcon` (currentColor).
- `ClusterSwitcher`: `K8s` tag only in menu items; the toggle's accessible name still says `K8s`.

## Acceptance criteria
- [x] Switcher has no navy frame/edge on Kubernetes clusters; masthead unchanged.
- [x] Kubernetes icon is the Kubernetes logo in switcher and fleet overview.
- [x] Toggle shows no `K8s` tag; menu items keep it. `scripts/check-fe.sh` green.

## Work log
- 2026-11-26 orchestrator: fixed directly at the human's request; tests updated (toggle, icon), UX.md §2a updated.
