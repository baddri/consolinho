---
id: T-0172
title: UX pass — production band under the navy (Kubernetes) masthead, light and dark
status: todo
owner: ux-designer
checkpoint: 4a
depends_on: [T-0170]
paths: [docs/tasks/T-0172-ux-production-band-navy-masthead.md]
review_rounds: 0
---

## Goal
FND-3 (CP3.7 F2): record that the production band under the navy masthead meets contrast (band vs masthead ≥ 3:1,
band text ≥ 4.5:1) in light and dark, with clipped screenshots. Review only: if it fails, file a bug task with the
token change instead of editing code here.

## Scope
- In: `npm run dev:mock`, `/c/prod-k8s-1/k8s/ns/default/pods?mockUser=alice`, 1280 wide, light + dark; measure with
  `scripts/ui-probe.mjs` (computed colours), clip masthead + band only.
- Out: code changes (follow-up task if needed).

## Context pack
- Docs: `UX.md` §2a (cluster type and Kubernetes theme), §12 contrast.
- Touch points: `features/cluster-context/EnvironmentBanner.tsx`, `shared/theme` (Kubernetes masthead tokens, T-0149).

## Acceptance criteria
- [ ] FND-3: measured ratios for band/masthead and band text in both themes written below, with two clipped screenshots.
- [ ] Pass, or a bug task filed and linked.

## Work log

## Review

## Handover notes
