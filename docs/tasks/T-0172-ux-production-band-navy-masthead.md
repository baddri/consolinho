---
id: T-0172
title: UX pass — production band under the navy (Kubernetes) masthead, light and dark
status: done
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
- [x] FND-3: measured ratios for band/masthead and band text in both themes written below, with two clipped screenshots.
- [x] Pass, or a bug task filed and linked.

## Findings (FND-3, measured 2026-11-23)
Route `/c/prod-k8s-1/k8s/ns/default/pods?mockUser=alice`, 1280 wide, computed colours via Playwright, WCAG 2.x ratios.

| Theme | Masthead bg | Band bg (`Banner color="red"`) | Band text | Band vs navy (≥ 3:1) | Band text (≥ 4.5:1) |
|---|---|---|---|---|---|
| Light | #003366 (+ #4394e5 3px edge) | #fbc5c5 | #151515, 14px/400 | **8.34:1** pass | **12.08:1** pass |
| Dark  | #003366 (+ #4394e5 3px edge) | #f9a8a8 | #1f1f1f, 14px/400 | **6.72:1** pass | **8.79:1** pass |

- Verdict: PASS in both themes; no bug task needed. Copy "Production cluster prod-k8s-1", centred, sentence case.
- Screenshots (clipped masthead + band, scratchpad, not committed): `/tmp/claude-1000/-home-bad-works-console/331ec5aa-2ff3-49f7-8381-784186462bd0/scratchpad/t172/band-light.png` and `band-dark.png`.
- Note for UX.md §2a (owner follow-up, outside this task's paths): the band is not flush under the masthead; with the
  PF6 glass/felt page it is the first row of the main card (y=90 vs masthead bottom 73, x=323), separated by the page
  background, so band-vs-accent-edge (2.10 / 1.69) is not an adjacency and doesn't apply. §2a's "red-20 vs navy 8.3:1"
  holds for light only; dark uses #f9a8a8 (6.72:1). Reword §2a next time UX.md is touched.

## Work log
- 2026-11-23 ux-designer: measured masthead/band/text computed colours on own mock server (:5234), light + dark,
  computed WCAG ratios, took two clipped screenshots. All pass (8.34/12.08 light, 6.72/8.79 dark). No code change.

## Review

## Handover notes
- FND-3 passes in both themes; nothing to fix. Only open item: UX.md §2a wording (band position, dark ratio 6.72:1),
  to fold into the next UX.md edit. Measurement script: scratchpad `t172/measure.mjs` (not committed).
